import { LookupService, LookupFormula } from '@bsv/overlay';
import { LookupQuestion, LookupAnswer, Script } from '@bsv/sdk';
import { MongoClient } from 'mongodb';

/**
 * A factory for creating Bounty Lookup Services that use MongoDB
 */
export default function BountyLookupServiceFactory(mongoClient: MongoClient) {
  const db = mongoClient.db('bounty-overlay');
  const bounties = db.collection('bounties');
  const githubIdentities = db.collection('github-identities');
  
  return class BountyLookupService implements LookupService {
    /**
     * Process a new bounty when it's added to the topic
     */
    async outputAdded(txid: string, outputIndex: number, outputScript: Script, topic: string): Promise<void> {
      try {
        // Store this new bounty in MongoDB
        await bounties.insertOne({
          txid,
          outputIndex,
          script: Array.from(outputScript.toBinary()),
          topic,
          status: 'active',
          createdAt: new Date()
        });
      } catch (error) {
        console.error('Failed to add bounty to MongoDB:', error);
      }
    }

    /**
     * Process a bounty when it's spent (paid out or refunded)
     */
    async outputSpent(txid: string, outputIndex: number, topic: string): Promise<void> {
      try {
        // Mark the bounty as completed in MongoDB
        await bounties.updateOne(
          { txid, outputIndex, topic },
          { $set: { status: 'completed', completedAt: new Date() } }
        );
      } catch (error) {
        console.error('Failed to update spent bounty in MongoDB:', error);
      }
    }

    /**
     * Process a bounty that's been deleted (e.g., due to reorg)
     */
    async outputDeleted(txid: string, outputIndex: number, topic: string): Promise<void> {
      try {
        // Delete the bounty from MongoDB
        await bounties.deleteOne({ txid, outputIndex, topic });
      } catch (error) {
        console.error('Failed to delete bounty from MongoDB:', error);
      }
    }

    /**
     * Look up bounties based on various queries
     */
    async lookup(question: LookupQuestion): Promise<LookupAnswer | LookupFormula> {
      const query = question.query || {};
      const { issueId, repoOwner, githubUsername, status } = query;
      
      const mongoQuery: any = { topic: 'tm_bounty' };
      
      // Add search filters based on the query
      if (issueId) mongoQuery.issueId = issueId;
      if (repoOwner) mongoQuery.repoOwner = repoOwner;
      if (status) mongoQuery.status = status;
      
      // If looking up by GitHub username, first get their identity key
      if (githubUsername) {
        const userIdentity = await githubIdentities.findOne({ username: githubUsername });
        if (userIdentity) {
          mongoQuery.identityKey = userIdentity.identityKey;
        } else {
          return { type: 'output-list', outputs: [] }; // User not found
        }
      }
      
      // Find the matching bounties
      const results = await bounties.find(mongoQuery).toArray();
      
      // Format for LookupFormula (txid & outputIndex for each result)
      const formula: LookupFormula = results.map(result => ({
        txid: result.txid,
        outputIndex: result.outputIndex
      }));
      
      return formula;
    }

    /**
     * Documentation for this lookup service
     */
    async getDocumentation(): Promise<string> {
      return `
# GitHub Bounty Lookup Service

This service allows you to find and query bounties for GitHub issues.

## Query Parameters:

- \`issueId\`: Find bounties for a specific GitHub issue
- \`repoOwner\`: Find bounties for repositories owned by a specific user
- \`githubUsername\`: Find bounties associated with a specific GitHub user
- \`status\`: Filter by bounty status ('active', 'completed', etc.)

## Example:

\`\`\`json
{
  "service": "ls_bounty",
  "query": {
    "status": "active",
    "repoOwner": "bitcoin-sv"
  }
}
\`\`\`
`;
    }

    /**
     * Metadata for this lookup service
     */
    async getMetaData(): Promise<{
      name: string;
      shortDescription: string;
      iconURL?: string;
      version?: string;
      informationURL?: string;
    }> {
      return {
        name: 'GitHub Bounty Lookup Service',
        shortDescription: 'Query and find bounties for GitHub issues',
        version: '0.1.0'
      };
    }
  };
}