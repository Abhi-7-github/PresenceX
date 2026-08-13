require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { connectDB, getPresenceCollection } = require('./models/Presence.js');

const app = express();

// Initialize MongoDB connection on startup
connectDB().catch((err) => {
  console.error('Initial MongoDB connection error:', err.message);
});

// CORS configuration - allow localhost and 127.0.0.1 on any local port
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:')
    ) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

const PORT = parseInt(process.env.PORT, 10) || 5001;
const HEALTH_CHECK_PATH = process.env.HEALTH_CHECK_PATH || '/health';

// Request logger
app.use((req, res, next) => {
  if (req.path !== HEALTH_CHECK_PATH) {
    console.log(`[Server ${PORT}] ${req.method} ${req.originalUrl || req.url}`);
  }
  next();
});

// Health check endpoint
app.get(HEALTH_CHECK_PATH, (req, res) => {
  res.status(200).send('OK');
});

// Presence status endpoint
app.get('/presence/status', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
  });
});

// Update presence endpoint
app.post('/presence/update', (req, res) => {
  const { userId, status } = req.body;

  if (!userId || !status) {
    return res.status(400).json({ error: 'userId and status are required' });
  }

  res.json({
    userId,
    status,
    timestamp: new Date().toISOString(),
  });
});

// Get user presence endpoint
app.get('/presence/:userId', (req, res) => {
  const { userId } = req.params;

  res.json({
    userId,
    timestamp: new Date().toISOString(),
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
  });
});

// Helper: Read student master data from server/data.json ONLY
function getStudentMasterData() {
  const dataPath = path.join(__dirname, 'data.json');
  if (!fs.existsSync(dataPath)) return [];
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  return Array.isArray(data) ? data : (data.students || []);
}

// Step 3: Student Verification endpoint - Uses server/data.json ONLY
app.post('/api/verify', (req, res) => {
  const { regno } = req.body;

  if (!regno || typeof regno !== 'string') {
    return res.status(400).json({ 
      success: false, 
      message: 'Registration number is required.' 
    });
  }

  const queryReg = regno.trim().toLowerCase();

  try {
    const students = getStudentMasterData();
    const student = students.find(s => String(s.regno).trim().toLowerCase() === queryReg);

    if (student) {
      return res.json({
        success: true,
        student: {
          regno: student.regno,
          name: student.name,
          teamname: student.teamname || '',
        },
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Registration number not found.',
      });
    }
  } catch (error) {
    console.error('Error verifying student in data.json:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});

// Step 4: Mark Presence endpoint - Confirms in data.json, stores in MongoDB
app.post('/api/presence', async (req, res) => {
  const { regno } = req.body;

  if (!regno || typeof regno !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Registration number is required.',
    });
  }

  const queryReg = regno.trim().toLowerCase();

  try {
    // 1. Search data.json to confirm student exists & retrieve verified name
    const students = getStudentMasterData();
    const student = students.find(s => String(s.regno).trim().toLowerCase() === queryReg);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Registration number not found.',
      });
    }

    // 2. Ensure MongoDB connection is available
    let collection = getPresenceCollection();
    if (!collection) {
      collection = await connectDB();
    }

    if (!collection) {
      return res.status(503).json({
        success: false,
        message: 'Presence service is currently unavailable.',
      });
    }

    // 3. Check MongoDB for an existing presence record
    const existingRecord = await collection.findOne({
      regno: { $regex: new RegExp(`^${queryReg}$`, 'i') }
    });

    if (existingRecord) {
      return res.status(409).json({
        success: false,
        message: 'You have already marked your presence.',
      });
    }

    // 4. Create and store the new presence record in MongoDB
    const record = {
      regno: student.regno,
      name: student.name,
      teamname: student.teamname || '',
      timestamp: new Date().toISOString(),
    };

    await collection.insertOne({ ...record });
    console.log(`[Server ${PORT}] Saved presence to MongoDB for ${student.name} (${student.regno})`);

    return res.status(201).json({
      success: true,
      message: 'Presence marked successfully.',
      record,
    });
  } catch (error) {
    console.error('Error marking presence in MongoDB:', error.message);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'You have already marked your presence.',
      });
    }
    return res.status(503).json({
      success: false,
      message: 'Presence service is currently unavailable.',
    });
  }
});

// Step 7: Admin endpoint - Retrieves presence records from MongoDB and stats
app.get('/api/admin/presence', async (req, res) => {
  try {
    let collection = getPresenceCollection();
    if (!collection) {
      collection = await connectDB();
    }

    if (!collection) {
      return res.status(503).json({
        success: false,
        message: 'Presence service is currently unavailable.',
      });
    }

    const students = getStudentMasterData();
    const presentStudents = await collection
      .find({}, { projection: { _id: 0 } })
      .sort({ timestamp: -1 })
      .toArray();

    return res.json({
      success: true,
      stats: {
        totalRegistered: students.length,
        totalPresent: presentStudents.length,
      },
      presentStudents,
    });
  } catch (error) {
    console.error('Error retrieving admin presence data from MongoDB:', error.message);
    return res.status(503).json({
      success: false,
      message: 'Presence service is currently unavailable.',
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Normal Server running on port ${PORT}`);
});
