const fs = require('fs');
const path = require('path');

/**
 * Normalizes and parses team data from server/data.json
 * Adapts to:
 * 1. Google Form / Excel flat row export with fields:
 *    - "Team Name", "Team Number", "Team Leader Name(Member1)", "College/Institution",
 *      "Problem Statement number", "Problem Statement Title", "G-mail", "Contact Number", "Euphoria ID",
 *      "Member2", "College/Institution", "Euphoria ID 2", etc.
 * 2. Grouped student records with { teamname, regno, name }
 * 3. Pre-normalized team objects with { teamNumber, teamName, problemStatement, members }
 *
 * Strips registration 'Timestamp' entirely as per system requirements.
 */
function getMasterTeams() {
  const dataPath = path.join(__dirname, '..', 'data.json');
  if (!fs.existsSync(dataPath)) {
    return [];
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch (err) {
    console.error('Error reading data.json:', err.message);
    return [];
  }

  const items = Array.isArray(raw) ? raw : (raw.teams || raw.students || []);
  if (!items || items.length === 0) {
    return [];
  }

  const first = items[0];

  // Case 1: Already normalized Team objects
  if (first.teamNumber !== undefined && Array.isArray(first.members)) {
    return items.map((t) => ({
      teamNumber: Number(t.teamNumber) || t.teamNumber,
      teamName: String(t.teamName || '').trim(),
      problemStatement: {
        number: t.problemStatement?.number !== undefined && t.problemStatement?.number !== null && String(t.problemStatement.number).trim() !== ''
          ? (isNaN(Number(t.problemStatement.number)) ? String(t.problemStatement.number).trim() : Number(t.problemStatement.number))
          : null,
        title: String(t.problemStatement?.title || '').trim(),
      },
      members: (t.members || []).map((m, idx) => ({
        memberNumber: Number(m.memberNumber) || idx + 1,
        name: String(m.name || '').trim(),
        college: String(m.college || '').trim(),
        euphoriaId: String(m.euphoriaId || '').trim(),
        ...(m.email ? { email: String(m.email).trim() } : {}),
        ...(m.contactNumber ? { contactNumber: String(m.contactNumber).trim() } : {}),
      })),
    }));
  }

  // Case 2: Flat Google Form / Excel export format
  const hasFlatKeys =
    'Team Name' in first ||
    'Team Number' in first ||
    'Team Leader Name(Member1)' in first ||
    'Team Leader Name' in first ||
    'Euphoria ID' in first;

  if (hasFlatKeys) {
    return items.map((row, index) => {
      const teamNumber = Number(row['Team Number'] || row['teamNumber'] || index + 1);
      const teamName = String(row['Team Name'] || row['teamName'] || `Team ${teamNumber}`).trim();
      const psNum = row['Problem Statement number'] || row['Problem Statement Number'] || row['problemStatementNumber'] || null;
      const psTitle = row['Problem Statement Title'] || row['Problem Statement title'] || row['problemStatementTitle'] || '';

      const members = [];

      // Member 1 (Team Leader)
      const leaderName = row['Team Leader Name(Member1)'] || row['Team Leader Name'] || row['Leader Name'] || row['Member1'] || '';
      if (leaderName && String(leaderName).trim()) {
        members.push({
          memberNumber: 1,
          name: String(leaderName).trim(),
          college: String(row['College/Institution'] || row['College'] || row['Institution'] || '').trim(),
          euphoriaId: String(row['Euphoria ID'] || row['Euphoria Id'] || row['EuphoriaID'] || '').trim(),
          ...(row['G-mail'] || row['Gmail'] || row['Email'] ? { email: String(row['G-mail'] || row['Gmail'] || row['Email']).trim() } : {}),
          ...(row['Contact Number'] || row['Phone'] || row['Mobile'] ? { contactNumber: String(row['Contact Number'] || row['Phone'] || row['Mobile']).trim() } : {}),
        });
      }

      // Member 2
      const m2Name = row['Member2'] || row['Member 2'] || '';
      if (m2Name && String(m2Name).trim()) {
        members.push({
          memberNumber: 2,
          name: String(m2Name).trim(),
          college: String(row['College/Institution_1'] || row['College/Institution 1'] || row['College/Institution'] || '').trim(),
          euphoriaId: String(row['Euphoria ID 2'] || row['Euphoria ID_1'] || row['EuphoriaID 2'] || '').trim(),
        });
      }

      // Member 3
      const m3Name = row['Member3'] || row['Member 3'] || '';
      if (m3Name && String(m3Name).trim()) {
        members.push({
          memberNumber: 3,
          name: String(m3Name).trim(),
          college: String(row['College/Institution 2'] || row['College/Institution_2'] || '').trim(),
          euphoriaId: String(row['Euphoria ID 3'] || row['Euphoria ID_2'] || row['EuphoriaID 3'] || '').trim(),
        });
      }

      // Member 4
      const m4Name = row['Member4'] || row['Member 4'] || '';
      if (m4Name && String(m4Name).trim()) {
        members.push({
          memberNumber: 4,
          name: String(m4Name).trim(),
          college: String(row['College/Institution 3'] || row['College/Institution_3'] || '').trim(),
          euphoriaId: String(row['Euphoria ID 4'] || row['Euphoria ID_3'] || row['EuphoriaID 4'] || '').trim(),
        });
      }

      // Member 5
      const m5Name = row['Member5'] || row['Member 5'] || '';
      if (m5Name && String(m5Name).trim()) {
        members.push({
          memberNumber: 5,
          name: String(m5Name).trim(),
          college: String(row['College/Institution 4'] || row['College/Institution_4'] || '').trim(),
          euphoriaId: String(row['Euphoria ID 5'] || row['Euphoria ID_4'] || row['EuphoriaID 5'] || '').trim(),
        });
      }

      return {
        teamNumber,
        teamName,
        problemStatement: {
          number: psNum ? Number(psNum) || psNum : null,
          title: String(psTitle).trim(),
        },
        members,
      };
    });
  }

  // Case 3: Grouped student records with { teamname, regno, name }
  const teamMap = new Map();
  let currentTeamId = 1;

  for (const item of items) {
    const rawTeamName = String(item.teamname || item.teamName || 'Unknown Team').trim();
    if (!teamMap.has(rawTeamName)) {
      teamMap.set(rawTeamName, {
        teamNumber: item.teamNumber ? Number(item.teamNumber) : currentTeamId++,
        teamName: rawTeamName,
        problemStatement: {
          number: item.problemStatementNumber ? Number(item.problemStatementNumber) : null,
          title: String(item.problemStatementTitle || '').trim(),
        },
        members: [],
      });
    }

    const teamObj = teamMap.get(rawTeamName);
    const memberNum = teamObj.members.length + 1;
    const member = {
      memberNumber: memberNum,
      name: String(item.name || '').trim(),
      college: String(item.college || item['College/Institution'] || '').trim(),
      euphoriaId: String(item.euphoriaId || item.regno || '').trim(),
    };

    if (memberNum === 1) {
      if (item.email || item['G-mail'] || item.gmail) {
        member.email = String(item.email || item['G-mail'] || item.gmail).trim();
      }
      if (item.contactNumber || item['Contact Number'] || item.phone) {
        member.contactNumber = String(item.contactNumber || item['Contact Number'] || item.phone).trim();
      }
    }

    teamObj.members.push(member);
  }

  return Array.from(teamMap.values());
}

/**
 * Find a team by its Team Number, Team Name, or member Euphoria ID
 */
function findTeamByQuery(query) {
  if (query === undefined || query === null) return null;
  const cleanQuery = String(query).trim().toLowerCase();
  if (!cleanQuery) return null;

  const teams = getMasterTeams();

  // Try matching numeric team number first
  const queryNum = Number(cleanQuery);
  if (!isNaN(queryNum)) {
    const match = teams.find((t) => Number(t.teamNumber) === queryNum);
    if (match) return match;
  }

  // Try matching exact team name (case-insensitive)
  const nameMatch = teams.find((t) => t.teamName.toLowerCase() === cleanQuery);
  if (nameMatch) return nameMatch;

  // Try matching any member's Euphoria ID or regno
  const memberMatch = teams.find((t) =>
    t.members.some((m) => m.euphoriaId.toLowerCase() === cleanQuery)
  );
  if (memberMatch) return memberMatch;

  return null;
}

module.exports = {
  getMasterTeams,
  findTeamByQuery,
};
