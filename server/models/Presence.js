const { MongoClient } = require('mongodb');
const { getMasterTeams } = require('../utils/teamData.js');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

let client = null;
let db = null;
let presenceCollection = null;
let settingsCollection = null;
let isConnected = false;
let cachedAttendanceOpen = true;

/**
 * Connect to MongoDB and initialize collections, indexes, and migrations
 */
async function connectDB() {
  if (db && isConnected) {
    return presenceCollection;
  }

  if (!MONGO_URI) {
    console.error('MONGO_URI is not defined in environment variables.');
    return null;
  }

  try {
    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db();
    presenceCollection = db.collection('presence');
    settingsCollection = db.collection('settings');
    isConnected = true;

    // Drop legacy index if present
    try {
      const existingIndexes = await presenceCollection.indexes();
      const hasOldRegnoIndex = existingIndexes.some((idx) => idx.name === 'regno_1');
      if (hasOldRegnoIndex) {
        try {
          await presenceCollection.dropIndex('regno_1');
          console.log('✓ Dropped legacy regno_1 unique index');
        } catch (e) {
          console.warn('Note on dropping legacy regno_1 index:', e.message);
        }
      }
    } catch (idxErr) {
      console.warn('Index check note:', idxErr.message);
    }

    // Run safe migration of legacy records if any exist
    await migrateLegacyRecords();

    // Create compound unique index on { teamNumber: 1, date: 1, session: 1 }
    try {
      await presenceCollection.createIndex(
        { teamNumber: 1, date: 1, session: 1 },
        { unique: true, name: 'team_date_session_unique' }
      );
      console.log('✓ Verified compound unique index { teamNumber: 1, date: 1, session: 1 }');
    } catch (idxErr) {
      console.warn('Compound index creation note:', idxErr.message);
    }

    console.log(`✓ Connected to MongoDB Presence collection`);
    return presenceCollection;
  } catch (err) {
    console.error(`MongoDB Connection Error: ${err.message}`);
    isConnected = false;
    db = null;
    presenceCollection = null;
    settingsCollection = null;
    return null;
  }
}

/**
 * Safely migrate old student-based presence records to team-based session records
 */
async function migrateLegacyRecords() {
  if (!presenceCollection) return;
  try {
    const oldRecords = await presenceCollection.find({ teamNumber: { $exists: false } }).toArray();
    if (!oldRecords || oldRecords.length === 0) {
      return;
    }

    console.log(`ℹ Found ${oldRecords.length} legacy student attendance records. Commencing migration...`);
    const masterTeams = getMasterTeams();

    // Map each euphoriaId (lowercase) to its parent team and member
    const studentToTeam = new Map();
    for (const team of masterTeams) {
      for (const m of team.members) {
        if (m.euphoriaId) {
          studentToTeam.set(m.euphoriaId.toLowerCase(), { team, member: m });
        }
      }
    }

    // Group old records by team
    const teamPresenceMap = new Map();
    const unmappedRecords = [];

    for (const record of oldRecords) {
      const key = String(record.regno || '').trim().toLowerCase();
      if (studentToTeam.has(key)) {
        const { team } = studentToTeam.get(key);
        if (!teamPresenceMap.has(team.teamNumber)) {
          teamPresenceMap.set(team.teamNumber, {
            team,
            presentEuphoriaIds: new Set(),
            date: record.timestamp ? String(record.timestamp).split('T')[0] : '2026-08-15',
          });
        }
        teamPresenceMap.get(team.teamNumber).presentEuphoriaIds.add(key);
      } else {
        unmappedRecords.push(record);
      }
    }

    if (unmappedRecords.length > 0) {
      console.warn(`⚠ ${unmappedRecords.length} legacy records could not be mapped to master teams and were kept as-is.`);
    }

    // Upsert migrated team records
    for (const [teamNum, data] of teamPresenceMap.entries()) {
      const team = data.team;
      const membersStatus = team.members.map((m) => ({
        euphoriaId: m.euphoriaId,
        name: m.name,
        status: data.presentEuphoriaIds.has(m.euphoriaId.toLowerCase()) ? 'present' : 'absent',
      }));

      await presenceCollection.updateOne(
        { teamNumber: team.teamNumber, date: data.date, session: 'Session 1' },
        {
          $set: {
            teamNumber: team.teamNumber,
            teamName: team.teamName,
            members: membersStatus,
            date: data.date,
            session: 'Session 1',
            updatedAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    }

    // Delete migrated legacy records so the collection only contains clean team records
    const migratedIds = oldRecords
      .filter((r) => studentToTeam.has(String(r.regno || '').trim().toLowerCase()))
      .map((r) => r._id);

    if (migratedIds.length > 0) {
      await presenceCollection.deleteMany({ _id: { $in: migratedIds } });
      console.log(`✓ Successfully migrated ${migratedIds.length} legacy student records into ${teamPresenceMap.size} team session records.`);
    }
  } catch (err) {
    console.error('Error during legacy presence migration:', err.message);
  }
}

/**
 * Get the presence collection if connected
 */
function getPresenceCollection() {
  return isConnected ? presenceCollection : null;
}

/**
 * Get the settings collection if connected
 */
function getSettingsCollection() {
  return isConnected ? settingsCollection : null;
}

/**
 * Get current attendance status (isOpen: true/false)
 */
async function getAttendanceStatus() {
  try {
    let col = getSettingsCollection();
    if (!col) {
      await connectDB();
      col = getSettingsCollection();
    }

    if (col) {
      const setting = await col.findOne({ key: 'attendance_status' });
      if (setting && typeof setting.isOpen === 'boolean') {
        cachedAttendanceOpen = setting.isOpen;
        return setting.isOpen;
      }
    }
  } catch (err) {
    console.error('Error getting attendance status from DB:', err.message);
  }
  return cachedAttendanceOpen;
}

/**
 * Set attendance status (isOpen: true/false)
 */
async function setAttendanceStatus(isOpen) {
  cachedAttendanceOpen = Boolean(isOpen);
  try {
    let col = getSettingsCollection();
    if (!col) {
      await connectDB();
      col = getSettingsCollection();
    }

    if (col) {
      await col.updateOne(
        { key: 'attendance_status' },
        {
          $set: {
            key: 'attendance_status',
            isOpen: Boolean(isOpen),
            updatedAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error('Error saving attendance status to DB:', err.message);
  }
  return cachedAttendanceOpen;
}

/**
 * Clear all presence records from MongoDB
 */
async function clearAllPresenceRecords() {
  try {
    let col = getPresenceCollection();
    if (!col) {
      await connectDB();
      col = getPresenceCollection();
    }

    if (!col) {
      throw new Error('Database collection is unavailable');
    }

    const result = await col.deleteMany({});
    console.log(`✓ Cleared ${result.deletedCount} presence records from MongoDB`);
    return { success: true, deletedCount: result.deletedCount };
  } catch (err) {
    console.error('Error clearing presence records:', err.message);
    throw err;
  }
}

module.exports = {
  connectDB,
  getPresenceCollection,
  getSettingsCollection,
  getAttendanceStatus,
  setAttendanceStatus,
  clearAllPresenceRecords,
};
