import express from 'express';
import { BountyService } from '../services/bounty-service';
import { GitHubIdentityService } from '../services/github-identity-service';
import { WalletInterface } from '@bsv/sdk';

/**
 * Create API routes for the Bounty system
 */
export function createBountyRouter(
  bountyService: BountyService,
  githubIdentityService: GitHubIdentityService
) {
  const router = express.Router();

  /**
   * GET /api/bounties
   * Get a list of bounties with optional filters
   */
  router.get('/bounties', async (req, res) => {
    try {
      const { status, issueId, repoOwner, funder } = req.query;
      
      let bounties;
      if (status === 'active') {
        bounties = await bountyService.getActiveBounties();
      } else if (issueId) {
        bounties = await bountyService.getBountiesByIssue(String(issueId));
      } else if (repoOwner) {
        bounties = await bountyService.getBountiesByRepoOwner(String(repoOwner));
      } else if (funder) {
        bounties = await bountyService.getBountiesByFunder(String(funder));
      } else {
        bounties = await bountyService.getActiveBounties();
      }
      
      res.json(bounties);
    } catch (error) {
      console.error('Error fetching bounties:', error);
      res.status(500).json({ error: 'Failed to fetch bounties' });
    }
  });

  /**
   * POST /api/bounties
   * Create a new bounty
   */
  router.post('/bounties', async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { issueId, repoOwner, amount, deadlineDays } = req.body;
      
      // Validate inputs
      if (!issueId || !repoOwner || !amount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Verify GitHub identity
      const user = req.user as any;
      const identity = await githubIdentityService.getGitHubIdentityByUsername(user.username);
      
      if (!identity) {
        return res.status(403).json({ 
          error: 'GitHub identity certificate required',
          message: 'Please get a GitHub identity certificate first'
        });
      }
      
      // Create the bounty
      const result = await bountyService.createBounty(
        issueId,
        repoOwner,
        repoOwner, // repoOwnerGithubUsername (same as repoOwner for simplicity)
        Number(amount),
        Number(deadlineDays || 30)
      );
      
      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating bounty:', error);
      res.status(500).json({ 
        error: 'Failed to create bounty',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/bounties/:txid/:outputIndex/claim
   * Claim a bounty by submitting a pull request
   */
  router.post('/bounties/:txid/:outputIndex/claim', async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { txid, outputIndex } = req.params;
      const { prId } = req.body;
      
      // Validate inputs
      if (!txid || !outputIndex || !prId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Verify GitHub identity
      const user = req.user as any;
      const identity = await githubIdentityService.getGitHubIdentityByUsername(user.username);
      
      if (!identity) {
        return res.status(403).json({ 
          error: 'GitHub identity certificate required',
          message: 'Please get a GitHub identity certificate first'
        });
      }
      
      // Pay the bounty
      const payTxid = await bountyService.payBounty(
        txid,
        Number(outputIndex),
        user.username,
        prId
      );
      
      res.json({ txid: payTxid });
    } catch (error) {
      console.error('Error claiming bounty:', error);
      res.status(500).json({ 
        error: 'Failed to claim bounty',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/bounties/:txid/:outputIndex/refund
   * Refund an expired bounty
   */
  router.post('/bounties/:txid/:outputIndex/refund', async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { txid, outputIndex } = req.params;
      
      // Refund the expired bounty
      const refundTxid = await bountyService.refundExpiredBounty(
        txid,
        Number(outputIndex)
      );
      
      res.json({ txid: refundTxid });
    } catch (error) {
      console.error('Error refunding bounty:', error);
      res.status(500).json({ 
        error: 'Failed to refund bounty',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/bounties/:txid/:outputIndex/cancel
   * Cancel a bounty with approval from repo owner and funder
   */
  router.post('/bounties/:txid/:outputIndex/cancel', async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { txid, outputIndex } = req.params;
      
      // Cancel the bounty
      const cancelTxid = await bountyService.cancelBounty(
        txid,
        Number(outputIndex)
      );
      
      res.json({ txid: cancelTxid });
    } catch (error) {
      console.error('Error canceling bounty:', error);
      res.status(500).json({ 
        error: 'Failed to cancel bounty',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}