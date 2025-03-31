import { MongoClient } from 'mongodb';
import { WalletInterface, P2PKH, PublicKey, Transaction, PrivateKey } from '@bsv/sdk';
import { BountyContract } from '../contracts/BountyContract';
import { compileContract } from 'scrypt-ts';
import { Bounty } from './models';
import { GitHubIdentityService } from './github-identity-service';

/**
 * Service for managing GitHub issue bounties
 */
export class BountyService {
  private db: any;
  private wallet: WalletInterface;
  private githubIdentityService: GitHubIdentityService;
  private certifierPublicKey: string;
  private static isInitialized = false;

  constructor(
    mongoClient: MongoClient, 
    wallet: WalletInterface, 
    githubIdentityService: GitHubIdentityService,
    certifierPublicKey: string
  ) {
    this.db = mongoClient.db('bounty-overlay');
    this.wallet = wallet;
    this.githubIdentityService = githubIdentityService;
    this.certifierPublicKey = certifierPublicKey;
    this.initializeContract();
  }

  private async initializeContract() {
    if (!BountyService.isInitialized) {
      await compileContract(BountyContract);
      BountyService.isInitialized = true;
    }
  }

  /**
   * Create a new bounty for a GitHub issue
   */
  async createBounty(
    issueId: string,
    repoOwner: string,
    repoOwnerGithubUsername: string,
    amountSatoshis: number,
    deadlineDays: number = 30
  ): Promise<{ txid: string; outputIndex: number }> {
    try {
      // Get repo owner's identity key from GitHub username
      const repoOwnerIdentity = await this.githubIdentityService.getGitHubIdentityByUsername(repoOwnerGithubUsername);
      if (!repoOwnerIdentity) {
        throw new Error(`Repository owner ${repoOwnerGithubUsername} is not registered`);
      }
      
      // Get funder identity (the wallet user)
      const { publicKey: funderKey } = await this.wallet.getPublicKey({ identityKey: true });
      
      // Calculate deadline (current time + days)
      const deadline = Math.floor(Date.now() / 1000) + (deadlineDays * 24 * 60 * 60);
      
      // Create a new instance of the BountyContract
      const instance = new BountyContract(
        funderKey.toAddress().toByteString(),    // funderAddr
        BigInt(issueId.replace(/\D/g, '')),      // issueId (numeric part only)
        PublicKey.fromString(repoOwnerIdentity.identityKey), // repoOwner
        PublicKey.fromString(this.certifierPublicKey),      // certifierPubKey
        BigInt(deadline)                          // deadline
      );

      // Connect to the wallet signer
      await instance.connect(this.wallet);
      
      // Deploy the contract (create bounty transaction)
      const deployTx = await instance.deploy(amountSatoshis);
      
      // Store bounty info in MongoDB
      const bountyDoc: Bounty = {
        txid: deployTx.id,
        outputIndex: 0, // Assuming it's the first output
        script: Array.from(instance.lockingScript.toBinary()),
        topic: 'tm_bounty',
        issueId,
        repoOwner,
        funderIdentityKey: funderKey.toString(),
        status: 'active',
        amount: amountSatoshis,
        deadline: new Date(deadline * 1000),
        createdAt: new Date()
      };
      
      await this.db.collection('bounties').insertOne(bountyDoc);
      
      return {
        txid: deployTx.id,
        outputIndex: 0
      };
    } catch (error) {
      console.error('Failed to create bounty:', error);
      throw new Error('Failed to create bounty');
    }
  }

  /**
   * Pay out a bounty to a solver
   */
  async payBounty(
    txid: string,
    outputIndex: number,
    solverGithubUsername: string,
    solutionPullRequestId: string
  ): Promise<string> {
    try {
      // Get the bounty from MongoDB
      const bounty = await this.db.collection('bounties').findOne({ txid, outputIndex });
      if (!bounty || bounty.status !== 'active') {
        throw new Error('Bounty not found or not active');
      }
      
      // Get solver's identity key
      const solverIdentity = await this.githubIdentityService.getGitHubIdentityByUsername(solverGithubUsername);
      if (!solverIdentity) {
        throw new Error(`Solver ${solverGithubUsername} is not registered`);
      }
      
      // Get repo owner's identity
      const repoOwnerIdentity = await this.githubIdentityService.getGitHubIdentityByUsername(bounty.repoOwner);
      if (!repoOwnerIdentity) {
        throw new Error(`Repository owner ${bounty.repoOwner} is not registered`);
      }
      
      // Restore the BountyContract instance
      const instance = new BountyContract(
        bounty.funderAddress,
        BigInt(bounty.issueId.replace(/\D/g, '')),
        PublicKey.fromString(repoOwnerIdentity.identityKey),
        PublicKey.fromString(this.certifierPublicKey),
        BigInt(Math.floor(bounty.deadline.getTime() / 1000))
      );
      
      // Load the contract from the UTXO
      const utxo = {
        txId: txid,
        outputIndex,
        script: bounty.script,
        satoshis: bounty.amount
      };
      await instance.connect(this.wallet);
      await instance.bind(utxo);
      
      // Get signatures from solver, repo owner, and certifier (the backend wallet acts as the certifier)
      // Note: In a real system, you would verify the repo owner's approval separately
      // and have a proper signature process. This is simplified for demonstration.
      const solverSig = await this.wallet.signMessage(`I solved issue ${bounty.issueId} with PR ${solutionPullRequestId}`, solverIdentity.identityKey);
      const ownerSig = await this.wallet.signMessage(`I approve PR ${solutionPullRequestId} for issue ${bounty.issueId}`, repoOwnerIdentity.identityKey);
      const certifierSig = await this.wallet.signMessage(`Certified payout for ${bounty.issueId} to ${solverGithubUsername}`, this.certifierPublicKey);
      
      // Call contract method to pay the solver
      const payTx = await instance.methods.paySolver(
        solverSig,
        PublicKey.fromString(solverIdentity.identityKey),
        ownerSig,
        certifierSig
      );
      
      // Update bounty status in MongoDB
      await this.db.collection('bounties').updateOne(
        { txid, outputIndex },
        { 
          $set: {
            status: 'completed',
            solverIdentityKey: solverIdentity.identityKey,
            solutionPullRequestId,
            completedAt: new Date()
          }
        }
      );
      
      return payTx.id;
    } catch (error) {
      console.error('Failed to pay bounty:', error);
      throw new Error('Failed to pay bounty');
    }
  }

  /**
   * Get a list of active bounties
   */
  async getActiveBounties(limit: number = 20): Promise<Bounty[]> {
    return await this.db.collection('bounties')
      .find({ status: 'active' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Get bounties by GitHub issue ID
   */
  async getBountiesByIssue(issueId: string): Promise<Bounty[]> {
    return await this.db.collection('bounties')
      .find({ issueId })
      .sort({ createdAt: -1 })
      .toArray();
  }
  
  /**
   * Get bounties created by a specific user
   */
  async getBountiesByFunder(funderIdentityKey: string): Promise<Bounty[]> {
    return await this.db.collection('bounties')
      .find({ funderIdentityKey })
      .sort({ createdAt: -1 })
      .toArray();
  }
  
  /**
   * Get bounties for repositories owned by a specific user
   */
  async getBountiesByRepoOwner(repoOwner: string): Promise<Bounty[]> {
    return await this.db.collection('bounties')
      .find({ repoOwner })
      .sort({ createdAt: -1 })
      .toArray();
  }
  
  /**
   * Handle a bounty refund after deadline expiration
   */
  async refundExpiredBounty(txid: string, outputIndex: number): Promise<string> {
    try {
      // Get the bounty from MongoDB
      const bounty = await this.db.collection('bounties').findOne({ txid, outputIndex });
      if (!bounty || bounty.status !== 'active') {
        throw new Error('Bounty not found or not active');
      }
      
      // Check if bounty is expired
      if (new Date() < bounty.deadline) {
        throw new Error('Bounty deadline has not passed yet');
      }
      
      // Get funder's identity key
      const { publicKey: funderKey } = await this.wallet.getPublicKey({ 
        identityKey: true, 
        hdKey: bounty.funderIdentityKey 
      });
      
      // Restore the BountyContract instance
      const instance = new BountyContract(
        funderKey.toAddress().toByteString(),
        BigInt(bounty.issueId.replace(/\D/g, '')),
        PublicKey.fromString(bounty.repoOwnerIdentityKey),
        PublicKey.fromString(this.certifierPublicKey),
        BigInt(Math.floor(bounty.deadline.getTime() / 1000))
      );
      
      // Load the contract from the UTXO
      const utxo = {
        txId: txid,
        outputIndex,
        script: bounty.script,
        satoshis: bounty.amount
      };
      await instance.connect(this.wallet);
      await instance.bind(utxo);
      
      // Call contract method to refund the expired bounty
      const funderSig = await this.wallet.signMessage(`Refunding expired bounty for ${bounty.issueId}`, bounty.funderIdentityKey);
      const refundTx = await instance.methods.refundExpired(
        funderSig,
        PublicKey.fromString(bounty.funderIdentityKey)
      );
      
      // Update bounty status in MongoDB
      await this.db.collection('bounties').updateOne(
        { txid, outputIndex },
        { 
          $set: {
            status: 'expired',
            completedAt: new Date()
          }
        }
      );
      
      return refundTx.id;
    } catch (error) {
      console.error('Failed to refund expired bounty:', error);
      throw new Error('Failed to refund expired bounty');
    }
  }
  
  /**
   * Cancel a bounty with approval from both funder and repo owner
   */
  async cancelBounty(txid: string, outputIndex: number): Promise<string> {
    try {
      // Get the bounty from MongoDB
      const bounty = await this.db.collection('bounties').findOne({ txid, outputIndex });
      if (!bounty || bounty.status !== 'active') {
        throw new Error('Bounty not found or not active');
      }
      
      // Get repo owner's identity
      const repoOwnerIdentity = await this.githubIdentityService.getGitHubIdentityByUsername(bounty.repoOwner);
      if (!repoOwnerIdentity) {
        throw new Error(`Repository owner ${bounty.repoOwner} is not registered`);
      }
      
      // Restore the BountyContract instance
      const instance = new BountyContract(
        bounty.funderAddress,
        BigInt(bounty.issueId.replace(/\D/g, '')),
        PublicKey.fromString(repoOwnerIdentity.identityKey),
        PublicKey.fromString(this.certifierPublicKey),
        BigInt(Math.floor(bounty.deadline.getTime() / 1000))
      );
      
      // Load the contract from the UTXO
      const utxo = {
        txId: txid,
        outputIndex,
        script: bounty.script,
        satoshis: bounty.amount
      };
      await instance.connect(this.wallet);
      await instance.bind(utxo);
      
      // Get signatures from funder and repo owner
      // Note: In a real system, you would verify both signatures separately
      const funderSig = await this.wallet.signMessage(`I cancel bounty for ${bounty.issueId}`, bounty.funderIdentityKey);
      const ownerSig = await this.wallet.signMessage(`I approve cancellation of bounty for ${bounty.issueId}`, repoOwnerIdentity.identityKey);
      
      // Call contract method to cancel the bounty
      const cancelTx = await instance.methods.cancelBounty(
        funderSig,
        PublicKey.fromString(bounty.funderIdentityKey),
        ownerSig
      );
      
      // Update bounty status in MongoDB
      await this.db.collection('bounties').updateOne(
        { txid, outputIndex },
        { 
          $set: {
            status: 'canceled',
            completedAt: new Date()
          }
        }
      );
      
      return cancelTx.id;
    } catch (error) {
      console.error('Failed to cancel bounty:', error);
      throw new Error('Failed to cancel bounty');
    }
  }
}