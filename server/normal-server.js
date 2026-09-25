require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const {
  connectDB,
  getPresenceCollection,
  getSettingsCollection,
  getAttendanceStatus,
  setAttendanceStatus,
  clearAllPresenceRecords,
} = require('./models/Presence.js');
const { getMasterTeams, findTeamByQuery } = require('./utils/teamData.js');

const app = express();

// Initialize MongoDB connection on startup
connectDB().catch((err) => {
  console.error('Initial MongoDB connection error:', err.message);
});

// CORS configuration - allow localhost and 127.0.0.1 on any local port
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim());
app.use(
  cors({
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
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
  })
);

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

// Presence / Attendance status endpoint
app.get(['/api/attendance/status', '/presence/status'], async (req, res) => {
  const isOpen = await getAttendanceStatus();
  res.json({
    success: true,
    isOpen,
    timestamp: new Date().toISOString(),
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    serverPort: PORT,
  });
});

/**
 * Team Verification endpoint
 * POST /api/verify-team
 * Body: { teamNumber: string | number, date?: string, session?: string }
 */
app.post(['/api/verify-team', '/api/verify'], async (req, res) => {
  const isAttendanceOpen = await getAttendanceStatus();
  if (!isAttendanceOpen) {
    return res.status(403).json({
      success: false,
      isClosed: true,
      message: 'Attendance is currently closed.',
    });
  }

  const query = req.body.teamNumber || req.body.regno || req.body.euphoriaId || req.body.teamName;

  if (query === undefined || query === null || String(query).trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Team number is required.',
    });
  }

  try {
    const team = findTeamByQuery(query);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: `Team "${query}" not found in registered master data.`,
      });
    }

    // Check if team already has attendance recorded for today / session
    const targetDate = req.body.date || new Date().toISOString().split('T')[0];
    const targetSession = req.body.session || 'Session 1';

    let existingAttendance = null;
    let collection = getPresenceCollection();
    if (!collection) {
      collection = await connectDB();
    }

    if (collection) {
      // Find latest record for this team (prefer matching date & session, or most recent)
      const exactRecord = await collection.findOne(
        { teamNumber: team.teamNumber, date: targetDate, session: targetSession },
        { projection: { _id: 0 } }
      );

      if (exactRecord) {
        existingAttendance = exactRecord;
      } else {
        const anyRecord = await collection
          .find({ teamNumber: team.teamNumber }, { projection: { _id: 0 } })
          .sort({ date: -1, updatedAt: -1 })
          .limit(1)
          .toArray();
        if (anyRecord.length > 0) {
          existingAttendance = anyRecord[0];
        }
      }
    }

    return res.json({
      success: true,
      team: {
        teamNumber: team.teamNumber,
        teamName: team.teamName,
        problemStatement: team.problemStatement,
        members: team.members,
      },
      existingAttendance,
    });
  } catch (error) {
    console.error('Error verifying team:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while verifying team.',
    });
  }
});

/**
 * Team Attendance Submission endpoint
 * POST /api/presence or POST /api/team-attendance
 * Body: {
 *   teamNumber: number | string,
 *   members: [ { euphoriaId: string, status: "present" | "absent" } ],
 *   date?: string,
 *   session?: string
 * }
 */
app.post(['/api/presence', '/api/team-attendance'], async (req, res) => {
  const isAttendanceOpen = await getAttendanceStatus();
  if (!isAttendanceOpen) {
    return res.status(403).json({
      success: false,
      isClosed: true,
      message: 'Attendance is currently closed.',
    });
  }

  const { teamNumber, members, date, session } = req.body;

  if (teamNumber === undefined || teamNumber === null || String(teamNumber).trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Team number is required.',
    });
  }

  try {
    // 1. Verify team exists in master data
    const team = findTeamByQuery(teamNumber);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team number not found in registered master data.',
      });
    }

    // 2. Validate member IDs: every submitted Euphoria ID must belong to this team
    const validMemberMap = new Map();
    team.members.forEach((m) => {
      validMemberMap.set(m.euphoriaId.toLowerCase(), m);
    });

    const submittedMap = new Map();
    if (Array.isArray(members)) {
      for (const m of members) {
        if (!m || !m.euphoriaId) continue;
        const cleanId = String(m.euphoriaId).trim().toLowerCase();
        if (!validMemberMap.has(cleanId)) {
          return res.status(400).json({
            success: false,
            message: `Participant ID "${m.euphoriaId}" does not belong to Team ${team.teamNumber}.`,
          });
        }
        const status = String(m.status || '').trim().toLowerCase() === 'present' ? 'present' : 'absent';
        submittedMap.set(cleanId, status);
      }
    }

    // 3. Construct verified member records using master names
    const finalMembers = team.members.map((m) => {
      const key = m.euphoriaId.toLowerCase();
      const status = submittedMap.has(key) ? submittedMap.get(key) : 'absent';
      return {
        euphoriaId: m.euphoriaId,
        name: m.name,
        status,
      };
    });

    // 4. Ensure MongoDB connection
    let collection = getPresenceCollection();
    if (!collection) {
      collection = await connectDB();
    }

    if (!collection) {
      return res.status(503).json({
        success: false,
        message: 'Presence database is temporarily unavailable.',
      });
    }

    const attendanceDate = date && String(date).trim() ? String(date).trim() : new Date().toISOString().split('T')[0];
    const attendanceSession = session && String(session).trim() ? String(session).trim() : 'Session 1';

    // 5. Check if existing attendance record exists for this team, date, and session
    const existingRecord = await collection.findOne({
      teamNumber: team.teamNumber,
      date: attendanceDate,
      session: attendanceSession,
    });

    const isUpdate = Boolean(existingRecord);

    await collection.updateOne(
      { teamNumber: team.teamNumber, date: attendanceDate, session: attendanceSession },
      {
        $set: {
          teamNumber: team.teamNumber,
          teamName: team.teamName,
          members: finalMembers,
          date: attendanceDate,
          session: attendanceSession,
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    const savedRecord = await collection.findOne(
      { teamNumber: team.teamNumber, date: attendanceDate, session: attendanceSession },
      { projection: { _id: 0 } }
    );

    console.log(
      `[Server ${PORT}] ${isUpdate ? 'Updated' : 'Recorded'} attendance for Team ${team.teamNumber} (${team.teamName}) - ${finalMembers.filter((m) => m.status === 'present').length}/${finalMembers.length} present`
    );

    return res.status(isUpdate ? 200 : 201).json({
      success: true,
      isUpdate,
      message: isUpdate
        ? `Attendance updated successfully for Team ${team.teamNumber}.`
        : `Attendance recorded successfully for Team ${team.teamNumber}.`,
      record: savedRecord,
    });
  } catch (error) {
    console.error('Error submitting team attendance:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to record team attendance.',
    });
  }
});

// Admin Login Validation endpoint
app.post('/api/admin/login', (req, res) => {
  const { key } = req.body || {};
  const expectedKey = process.env.ADMIN_KEY || process.env.VITE_ADMIN_KEY;

  if (!key || !key.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Admin key is required.',
    });
  }

  if (!expectedKey) {
    return res.status(500).json({
      success: false,
      message: 'ADMIN_KEY is not configured in server environment variables.',
    });
  }

  if (key.trim() === expectedKey.trim()) {
    return res.json({
      success: true,
      message: 'Admin authentication successful.',
    });
  } else {
    return res.status(401).json({
      success: false,
      message: 'Invalid admin security key.',
    });
  }
});

// Admin Toggle Attendance Status Endpoint
app.post(['/api/admin/attendance/toggle', '/api/admin/attendance-toggle'], async (req, res) => {
  try {
    const { isOpen } = req.body;
    const targetState = typeof isOpen === 'boolean' ? isOpen : true;
    const updatedStatus = await setAttendanceStatus(targetState);
    console.log(`[Server ${PORT}] Attendance status set to: ${updatedStatus ? 'OPEN' : 'CLOSED'}`);
    return res.json({
      success: true,
      isOpen: updatedStatus,
      message: `Attendance is now ${updatedStatus ? 'OPEN' : 'CLOSED'}.`,
    });
  } catch (error) {
    console.error('Error toggling attendance status:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update attendance status.',
    });
  }
});

// Admin Clear Database Endpoint
app.post(['/api/admin/clear-db', '/api/admin/presence/clear'], async (req, res) => {
  try {
    const result = await clearAllPresenceRecords();

    // Reset local JSON cache if exists
    const jsonPath = path.join(__dirname, 'presence.json');
    if (fs.existsSync(jsonPath)) {
      try {
        fs.writeFileSync(jsonPath, JSON.stringify({ records: [] }, null, 2));
      } catch (e) {}
    }

    return res.json({
      success: true,
      message: 'All attendance records have been cleared successfully.',
      deletedCount: result.deletedCount || 0,
    });
  } catch (error) {
    console.error('Error clearing presence database:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear attendance database.',
    });
  }
});

/**
 * Admin Dashboard Data Endpoint
 * GET /api/admin/presence
 */
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

    const isAttendanceOpen = await getAttendanceStatus();
    const masterTeams = getMasterTeams();

    // Fetch all attendance records from MongoDB sorted by latest date and update
    const attendanceRecords = await collection
      .find({}, { projection: { _id: 0 } })
      .sort({ date: -1, updatedAt: -1 })
      .toArray();

    // Map latest attendance record for each teamNumber
    const teamAttendanceMap = new Map();
    for (const rec of attendanceRecords) {
      const tNum = Number(rec.teamNumber);
      if (!teamAttendanceMap.has(tNum)) {
        teamAttendanceMap.set(tNum, rec);
      }
    }

    let totalRegisteredMembers = 0;
    let totalPresentMembers = 0;
    let teamsFullyPresent = 0;
    let teamsPartiallyPresent = 0;
    let teamsNoAttendance = 0;

    const enrichedTeams = masterTeams.map((team) => {
      const teamSize = team.members.length;
      totalRegisteredMembers += teamSize;

      const record = teamAttendanceMap.get(Number(team.teamNumber));
      const memberStatusMap = new Map();

      if (record && Array.isArray(record.members)) {
        for (const m of record.members) {
          if (m.euphoriaId) {
            memberStatusMap.set(String(m.euphoriaId).trim().toLowerCase(), m.status);
          }
        }
      }

      let teamPresentCount = 0;
      let teamAbsentCount = 0;

      const membersWithStatus = team.members.map((m) => {
        const key = m.euphoriaId.toLowerCase();
        let status = 'unmarked';
        if (memberStatusMap.has(key)) {
          status = memberStatusMap.get(key) === 'present' ? 'present' : 'absent';
        }
        if (status === 'present') teamPresentCount++;
        else teamAbsentCount++;
        return {
          ...m,
          status,
        };
      });

      totalPresentMembers += teamPresentCount;

      let attendanceStatus = 'no_attendance';
      if (!record) {
        teamsNoAttendance++;
        attendanceStatus = 'no_attendance';
      } else if (teamPresentCount === teamSize && teamSize > 0) {
        teamsFullyPresent++;
        attendanceStatus = 'fully_present';
      } else if (teamPresentCount > 0) {
        teamsPartiallyPresent++;
        attendanceStatus = 'partially_present';
      } else {
        teamsNoAttendance++;
        attendanceStatus = 'no_attendance';
      }

      return {
        teamNumber: team.teamNumber,
        teamName: team.teamName,
        problemStatement: team.problemStatement,
        members: membersWithStatus,
        attendanceStatus,
        presentCount: teamPresentCount,
        absentCount: teamAbsentCount,
        totalMembers: teamSize,
        lastUpdated: record?.updatedAt || null,
        session: record?.session || 'Session 1',
        date: record?.date || null,
      };
    });

    const totalAbsentMembers = Math.max(0, totalRegisteredMembers - totalPresentMembers);
    const attendanceRate =
      totalRegisteredMembers > 0
        ? parseFloat(((totalPresentMembers / totalRegisteredMembers) * 100).toFixed(1))
        : 0;

    return res.json({
      success: true,
      isAttendanceOpen,
      stats: {
        totalTeams: masterTeams.length,
        totalRegisteredMembers,
        totalPresentMembers,
        totalAbsentMembers,
        attendanceRate,
        teamsFullyPresent,
        teamsPartiallyPresent,
        teamsNoAttendance,
      },
      teams: enrichedTeams,
      attendanceRecords,
    });
  } catch (error) {
    console.error('Error retrieving admin presence data:', error.message);
    return res.status(503).json({
      success: false,
      message: 'Failed to retrieve admin presence data.',
    });
  }
});

/**
 * Team-Based CSV Download Endpoint
 * GET /api/admin/export/csv?type=present|absent|all
 */
app.get(['/api/admin/export/csv', '/api/export-csv'], async (req, res) => {
  try {
    const type = (req.query.type || 'present').toLowerCase();
    let collection = getPresenceCollection();
    if (!collection) {
      collection = await connectDB();
    }

    const masterTeams = getMasterTeams();
    let attendanceRecords = [];
    if (collection) {
      attendanceRecords = await collection
        .find({}, { projection: { _id: 0 } })
        .sort({ date: -1, updatedAt: -1 })
        .toArray();
    }

    // Build map of teamNumber -> attendanceRecord
    const teamAttendanceMap = new Map();
    for (const rec of attendanceRecords) {
      const tNum = Number(rec.teamNumber);
      if (!teamAttendanceMap.has(tNum)) {
        teamAttendanceMap.set(tNum, rec);
      }
    }

    let headers = [];
    let rows = [];

    if (type === 'all') {
      // Complete export:
      // Team Number, Team Name, Problem Statement Number, Problem Statement Title, Member Name, Euphoria ID, College, Attendance Status
      headers = [
        'Team Number',
        'Team Name',
        'Problem Statement Number',
        'Problem Statement Title',
        'Member Name',
        'Euphoria ID',
        'College',
        'Attendance Status',
      ];

      for (const team of masterTeams) {
        const record = teamAttendanceMap.get(Number(team.teamNumber));
        const statusMap = new Map();
        if (record && Array.isArray(record.members)) {
          record.members.forEach((m) => {
            if (m.euphoriaId) statusMap.set(m.euphoriaId.toLowerCase(), m.status);
          });
        }

        for (const m of team.members) {
          const key = m.euphoriaId.toLowerCase();
          const isPresent = statusMap.get(key) === 'present';
          rows.push([
            team.teamNumber,
            `"${String(team.teamName || '').replace(/"/g, '""')}"`,
            team.problemStatement?.number !== null && team.problemStatement?.number !== undefined
              ? team.problemStatement.number
              : 'N/A',
            `"${String(team.problemStatement?.title || 'N/A').replace(/"/g, '""')}"`,
            `"${String(m.name || '').replace(/"/g, '""')}"`,
            `"${String(m.euphoriaId || '').replace(/"/g, '""')}"`,
            `"${String(m.college || 'N/A').replace(/"/g, '""')}"`,
            isPresent ? 'PRESENT' : 'ABSENT',
          ]);
        }
      }
    } else if (type === 'absent') {
      // Absent export:
      // S.No, Team Number, Team Name, Member Name, Euphoria ID, College, Status
      headers = ['S.No', 'Team Number', 'Team Name', 'Member Name', 'Euphoria ID', 'College', 'Status'];

      let counter = 1;
      for (const team of masterTeams) {
        const record = teamAttendanceMap.get(Number(team.teamNumber));
        const statusMap = new Map();
        if (record && Array.isArray(record.members)) {
          record.members.forEach((m) => {
            if (m.euphoriaId) statusMap.set(m.euphoriaId.toLowerCase(), m.status);
          });
        }

        for (const m of team.members) {
          const key = m.euphoriaId.toLowerCase();
          const isPresent = statusMap.get(key) === 'present';
          if (!isPresent) {
            rows.push([
              counter++,
              team.teamNumber,
              `"${String(team.teamName || '').replace(/"/g, '""')}"`,
              `"${String(m.name || '').replace(/"/g, '""')}"`,
              `"${String(m.euphoriaId || '').replace(/"/g, '""')}"`,
              `"${String(m.college || 'N/A').replace(/"/g, '""')}"`,
              'ABSENT',
            ]);
          }
        }
      }
    } else {
      // Present export:
      // S.No, Team Number, Team Name, Member Name, Euphoria ID, College, Status
      headers = ['S.No', 'Team Number', 'Team Name', 'Member Name', 'Euphoria ID', 'College', 'Status'];

      let counter = 1;
      for (const team of masterTeams) {
        const record = teamAttendanceMap.get(Number(team.teamNumber));
        if (!record || !Array.isArray(record.members)) continue;

        const statusMap = new Map();
        record.members.forEach((m) => {
          if (m.euphoriaId) statusMap.set(m.euphoriaId.toLowerCase(), m.status);
        });

        for (const m of team.members) {
          const key = m.euphoriaId.toLowerCase();
          if (statusMap.get(key) === 'present') {
            rows.push([
              counter++,
              team.teamNumber,
              `"${String(team.teamName || '').replace(/"/g, '""')}"`,
              `"${String(m.name || '').replace(/"/g, '""')}"`,
              `"${String(m.euphoriaId || '').replace(/"/g, '""')}"`,
              `"${String(m.college || 'N/A').replace(/"/g, '""')}"`,
              'PRESENT',
            ]);
          }
        }
      }
    }

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `presencex_${type}_teams_${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('Error generating CSV export:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to generate CSV export.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Normal Server running on port ${PORT}`);
});
