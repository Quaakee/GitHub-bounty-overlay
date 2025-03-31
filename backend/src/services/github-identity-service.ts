import { MongoClient } from 'mongodb';
import { WalletInterface, Certificate, MasterCertificate } from '@bsv/sdk';
import { GitHubIdentity } from './models';

/**
 * Service for handling GitHub identity verification and certificate management
 */
export class GitHubIdentityService {
  private db: any;
  private wallet: WalletInterface;
  private certifierPublicKey: string;
  private certificateTypeId: string;

  constructor(mongoClient: MongoClient, wallet: WalletInterface, certifierPublicKey: string, certificateTypeId: string) {
    this.db = mongoClient.db('bounty-overlay');
    this.wallet = wallet;
    this.certifierPublicKey = certifierPublicKey;
    this.certificateTypeId = certificateTypeId;
  }

  /**
   * Store a GitHub identity with its BSV identity key
   */
  async storeGitHubIdentity(username: string, email: string, identityKey: string): Promise<GitHubIdentity> {
    const now = new Date();
    
    const identity: GitHubIdentity = {
      username,
      email,
      identityKey,
      createdAt: now,
      updatedAt: now
    };
    
    // Insert or update the identity
    await this.db.collection('github-identities').updateOne(
      { username },
      { $set: identity },
      { upsert: true }
    );
    
    return identity;
  }
  
  /**
   * Get a GitHub identity by username
   */
  async getGitHubIdentityByUsername(username: string): Promise<GitHubIdentity | null> {
    return await this.db.collection('github-identities').findOne({ username });
  }
  
  /**
   * Get a GitHub identity by identity key
   */
  async getGitHubIdentityByKey(identityKey: string): Promise<GitHubIdentity | null> {
    return await this.db.collection('github-identities').findOne({ identityKey });
  }
  
  /**
   * Acquire a GitHub certificate using the certificate server
   */
  async acquireGitHubCertificate(githubToken: string): Promise<{ 
    certificate: Certificate, 
    username: string, 
    email: string 
  }> {
    try {
      // Call the certificate server to get a certificate
      const result = await this.wallet.acquireCertificate({
        certifier: this.certifierPublicKey,
        certifierUrl: 'http://localhost:3002', // GitCert server URL
        type: this.certificateTypeId,
        acquisitionProtocol: 'issuance',
        fields: {
          githubUsername: '',
          githubEmail: '',
          token: githubToken
        }
      });
      
      // Extract GitHub username and email from the certificate
      const username = result.certificate.fields.githubUsername;
      const email = result.certificate.fields.githubEmail || '';
      
      // Store the identity mapping
      await this.storeGitHubIdentity(
        username,
        email,
        result.certificate.subject
      );
      
      return {
        certificate: result.certificate,
        username,
        email
      };
    } catch (error) {
      console.error('Failed to acquire GitHub certificate:', error);
      throw new Error('Failed to verify GitHub identity');
    }
  }
  
  /**
   * Verify a GitHub certificate
   */
  async verifyCertificate(certificate: Certificate): Promise<boolean> {
    try {
      // Verify the certificate signature
      const isValid = await certificate.verify(this.certifierPublicKey);
      
      if (isValid) {
        // Update stored identity with certificate details
        await this.db.collection('github-identities').updateOne(
          { identityKey: certificate.subject },
          { 
            $set: {
              certificateSerialNumber: certificate.serialNumber,
              certificateType: certificate.type,
              updatedAt: new Date()
            }
          }
        );
      }
      
      return isValid;
    } catch (error) {
      console.error('Certificate verification failed:', error);
      return false;
    }
  }
}