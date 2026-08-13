const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

let client = null;
let db = null;
let presenceCollection = null;
let isConnected = false;

/**
 * Connect to MongoDB and initialize the presence collection and indexes
 */
async function connectDB() {
  if (db && isConnected) {
    return presenceCollection;
  }

  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not defined in environment variables.');
    return null;
  }

  try {
    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db(); // Uses the database specified in connection string or default
    presenceCollection = db.collection('presence');
    isConnected = true;

    // Create unique index on regno to prevent duplicate check-ins
    try {
      await presenceCollection.createIndex({ regno: 1 }, { unique: true });
    } catch (idxErr) {
      // Index might already exist
    }

    console.log(`✓ Connected to MongoDB Presence collection`);
    return presenceCollection;
  } catch (err) {
    console.error(`❌ MongoDB Connection Error: ${err.message}`);
    isConnected = false;
    db = null;
    presenceCollection = null;
    return null;
  }
}

/**
 * Get the presence collection if connected
 */
function getPresenceCollection() {
  return isConnected ? presenceCollection : null;
}

module.exports = {
  connectDB,
  getPresenceCollection,
};
