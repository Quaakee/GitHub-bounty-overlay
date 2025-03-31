/**
 * Types for GitHub identity storage in MongoDB
 */
export interface GitHubIdentity {
    // MongoDB ID
    _id?: string;
    
    // GitHub info
    username: string;
    email?: string;
    
    // BSV identity key (public key)
    identityKey: string;
    
    // Reference to the certificate that validated this identity
    certificateSerialNumber?: string;
    certificateType?: string;
    
    // Metadata
    createdAt: Date;
    updatedAt: Date;
  }
  
  /**
   * Types for Bounty storage in MongoDB
   */
  export interface Bounty {
    // MongoDB ID
    _id?: string;
    
    // Blockchain reference
    txid: string;
    outputIndex: number;
    script: number[];  // Binary representation of the output script
    topic: string;     // Should be 'tm_bounty'
    
    // Bounty details
    issueId: string;         // Format: 'owner/repo#issue_number'
    repoOwner: string;       // GitHub username of repo owner
    funderIdentityKey: string; // BSV identity key of the funder
    
    // Status tracking
    status: 'active' | 'completed' | 'expired' | 'canceled';
    amount: number;          // Amount in satoshis
    
    // Solver info (once completed)
    solverIdentityKey?: string;
    solutionPullRequestId?: string;
    
    // Timestamps
    deadline: Date;         // When the bounty expires
    createdAt: Date;
    completedAt?: Date;     // When the bounty was claimed or refunded
  }
  
  /**
   * Index creation for MongoDB collections
   * 
   * Run this when setting up the database for the first time
   */
  export async function createMongoDBIndexes(db: any) {
    // GitHub Identities collection indexes
    await db.collection('github-identities').createIndex({ username: 1 }, { unique: true });
    await db.collection('github-identities').createIndex({ identityKey: 1 }, { unique: true });
    
    // Bounties collection indexes
    await db.collection('bounties').createIndex({ txid: 1, outputIndex: 1, topic: 1 }, { unique: true });
    await db.collection('bounties').createIndex({ issueId: 1 });
    await db.collection('bounties').createIndex({ repoOwner: 1 });
    await db.collection('bounties').createIndex({ funderIdentityKey: 1 });
    await db.collection('bounties').createIndex({ status: 1 });
    await db.collection('bounties').createIndex({ deadline: 1 });
  }