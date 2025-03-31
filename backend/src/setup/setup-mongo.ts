import { MongoClient } from 'mongodb';
import { createMongoDBIndexes } from './models';

/**
 * Setup script to initialize MongoDB for Bounty Overlay
 */
async function setupMongoDB() {
  console.log('Setting up MongoDB for Bounty Overlay...');
  
  // Connect to MongoDB (using LARS default mongo URL)
  const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/bounty-overlay';
  const client = new MongoClient(mongoUrl);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('bounty-overlay');
    
    // Create collections
    await db.createCollection('github-identities');
    console.log('Created github-identities collection');
    
    await db.createCollection('bounties');
    console.log('Created bounties collection');
    
    // Create indexes
    await createMongoDBIndexes(db);
    console.log('Created indexes');
    
    console.log('MongoDB setup complete');
  } catch (error) {
    console.error('Error setting up MongoDB:', error);
  } finally {
    await client.close();
  }
}

// Run the setup script if this file is executed directly
if (require.main === module) {
  setupMongoDB()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

export { setupMongoDB };