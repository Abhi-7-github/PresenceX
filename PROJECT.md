# PresenceX - System Documentation & Architecture (Team-Based Attendance)

PresenceX is a high-concurrency, distributed attendance tracking and verification system designed for hackathons, technical symposiums, and institutional events. It features a modern React client, a load-balanced multi-server Node.js/Express backend, and persistent MongoDB Atlas storage backed by verified team master records.

---

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [How Team Attendance Works (Lifecycle & Workflow)](#how-team-attendance-works-lifecycle--workflow)
   - [1. Master Data Source & Team Normalization](#1-master-data-source--team-normalization)
   - [2. Gatekeeper Status Check](#2-gatekeeper-status-check)
   - [3. Team Verification Step](#3-team-verification-step)
   - [4. Individual Member Status Marking & Submission](#4-individual-member-status-marking--submission)
   - [5. Concurrency & Duplicate Prevention](#5-concurrency--duplicate-prevention)
   - [6. Admin Dashboard & Real-Time Analytics](#6-admin-dashboard--real-time-analytics)
   - [7. Team CSV Exports (No Excel Timestamps)](#7-team-csv-exports-no-excel-timestamps)
3. [Database & Data Schemas](#database--data-schemas)
   - [MongoDB Collection: `presence`](#mongodb-collection-presence)
   - [MongoDB Collection: `settings`](#mongodb-collection-settings)
   - [Master Team Data Model](#master-team-data-model)
4. [Backend Cluster & Load Balancing](#backend-cluster--load-balancing)
5. [API Reference](#api-reference)
6. [Environment Variables & Configuration](#environment-variables--configuration)

---

## System Architecture Overview

```
                               ┌────────────────────────────────┐
                               │     PresenceX Client (React)   │
                               │  (Vite + CSS Micro-Animations) │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                              ┌──────────────────────────────────┐
                              │    Engine Server (Port 5000)     │
                              │      Reverse Proxy & LB          │
                              │  Health Checks (Every 5 seconds) │
                              └────────┬───────────┬─────────────┘
                                       │Round Robin│
                     ┌─────────────────┼───────────┴─────────────────┐
                     ▼                 ▼                             ▼
            ┌─────────────────┐ ┌─────────────────┐        ┌─────────────────┐
            │ Normal Server 1 │ │ Normal Server 2 │        │ Normal Server 3 │
            │   (Port 5001)   │ │   (Port 5002)   │        │   (Port 5003)   │
            └────────┬────────┘ └────────┬────────┘        └────────┬────────┘
                     │                   │                          │
                     └───────────────────┼──────────────────────────┘
                                         ▼
                     ┌───────────────────────────────────────────────┐
                     │              Persistence Layer                │
                     │  • MongoDB Atlas: presence & settings         │
                     │  • Master Data: data.json (Team records)      │
                     └───────────────────────────────────────────────┘
```

---

## How Team Attendance Works (Lifecycle & Workflow)

PresenceX uses **Team Number** as the primary attendance identifier while preserving **individual member attendance** (`present` or `absent`).

### 1. Master Data Source & Team Normalization
- The single source of truth is [server/data.json](file:///c:/Users/hp/Desktop/PresenceX/server/data.json).
- The parser ([server/utils/teamData.js](file:///c:/Users/hp/Desktop/PresenceX/server/utils/teamData.js)) adapts to:
  - Form/Excel export format with columns: `Team Name`, `Team Number`, `Team Leader Name(Member1)`, `College/Institution`, `Problem Statement number`, `Problem Statement Title`, `G-mail`, `Contact Number`, `Euphoria ID`, `Member2` .. `Member5`.
  - Grouped participant format with `teamname`, `regno`, `name`.
- **Timestamp Exclusion**: The old registration `Timestamp` from Google Forms/Excel is completely discarded and never displayed, stored, or exported.
- Only actual registered members are created (if a team has 3 members, Member 4 & 5 are not generated).
- Member 1 is designated as the **Team Leader**.

### 2. Gatekeeper Status Check
- **Gate Control**: Administrators can toggle attendance OPEN or CLOSED from the dashboard.
- State is stored in MongoDB `settings` (`{ key: 'attendance_status', isOpen: boolean }`).
- The client UI ([PresenceXPage.jsx](file:///c:/Users/hp/Desktop/PresenceX/client/src/pages/PresenceXPage.jsx)) polls `/api/attendance/status` every 3.5s. If closed, the portal locks and shows a live "Attendance Closed" notification.

### 3. Team Verification Step
```
Client                          Engine (:5000)               Worker Node                 data.json
  │                                   │                           │                          │
  │── POST /api/verify-team ─────────>│── Forward Round-Robin ───>│                          │
  │   { teamNumber: 1 }               │                           │── Search team ──────────>│
  │                                   │                           │<─ Return verified team ──│
  │                                   │                           │
  │                                   │                           │── Check existing Mongo ──>
  │<── 200 OK: Team & Members ────────│<── Return Team Data ──────│<─ existingAttendance ────
```
1. Participant enters **Team Number** (or Team Name).
2. Backend queries master data and checks if attendance already exists for the current date & session.
3. If an existing record exists, it is sent back in `existingAttendance` so the UI pre-fills previous selections for easy updating.

### 4. Individual Member Status Marking & Submission
- Even though lookup is by Team Number, attendance is **strictly individual**.
- For each member of the team, the user selects:
  - **`present`** (Active green pill)
  - **`absent`** (Active red pill)
- Quick-action buttons allow `All Present` or `All Absent` with one click.
- When submitted via `POST /api/presence`:
  - The backend verifies that every submitted `euphoriaId` actually belongs to that `teamNumber` in `data.json`.
  - Unknown or forged participant IDs are rejected.

### 5. Concurrency & Duplicate Prevention
- To prevent duplicate entries for the same team session, MongoDB enforces a compound unique index:
  ```js
  { teamNumber: 1, date: 1, session: 1 } // unique: true
  ```
- If attendance has already been submitted for that Team, Date, and Session, the system **updates the existing record** (`isUpdate: true`, HTTP 200) instead of creating a second document or throwing an error.

### 6. Admin Dashboard & Real-Time Analytics
Accessed via `/admin` ([AdminPage.jsx](file:///c:/Users/hp/Desktop/PresenceX/client/src/pages/AdminPage.jsx)) with `ADMIN_KEY`:
- **Live Statistics**:
  - `Total Teams`
  - `Total Registered Members`
  - `Present Members`
  - `Absent Members`
  - `Attendance Rate %`
- **Team Breakdown Filters**:
  - `Teams Fully Present` (All registered members present)
  - `Teams Partially Present` (1+ member present, 1+ member absent)
  - `Teams With No Attendance` (0 members present or unsubmitted)
- **Search Capabilities**:
  - Search by Team Number, Team Name, Member Name, or Euphoria ID.
- **Inline Admin Controls**:
  - Expand any team to inspect each member's details and toggle attendance directly.
  - Flush all attendance records (`Clear Data`).
  - Toggle attendance gate globally.

### 7. Team CSV Exports (No Excel Timestamps)
Three downloadable CSV formats (UTF-8 BOM encoded for Microsoft Excel):
1. **Present Members CSV**: `S.No, Team Number, Team Name, Member Name, Euphoria ID, College, Status`
2. **Absent Members CSV**: `S.No, Team Number, Team Name, Member Name, Euphoria ID, College, Status`
3. **Complete Master Sheet CSV**: `Team Number, Team Name, Problem Statement Number, Problem Statement Title, Member Name, Euphoria ID, College, Attendance Status`

---

## Database & Data Schemas

### MongoDB Collection: `presence`
```typescript
interface TeamAttendanceRecord {
  _id?: ObjectId;
  teamNumber: number;          // Primary team numerical identifier
  teamName: string;            // Team name from master data
  members: [
    {
      euphoriaId: string;      // Unique member ID / registration ID
      name: string;            // Member full name
      status: 'present' | 'absent'; // Individual attendance status
    }
  ];
  date: string;                // Attendance date (e.g., "2026-09-25")
  session: string;             // Attendance session (e.g., "Session 1")
  updatedAt: string;           // ISO 8601 UTC timestamp of last update
}
```

#### MongoDB Indexes
| Index Fields | Options | Purpose |
|---|---|---|
| `_id: 1` | Primary Key | Default unique ID |
| `{ teamNumber: 1, date: 1, session: 1 }` | `{ unique: true }` | Prevents duplicate team attendance submissions per session |

---

### MongoDB Collection: `settings`
```typescript
interface SystemSetting {
  _id?: ObjectId;
  key: string;                 // "attendance_status"
  isOpen: boolean;             // Gate status
  updatedAt: string;           // Last toggle timestamp
}
```

---

### Master Team Data Model
Normalized from [server/data.json](file:///c:/Users/hp/Desktop/PresenceX/server/data.json):
```typescript
interface MasterTeam {
  teamNumber: number;
  teamName: string;
  problemStatement: {
    number: number | null;
    title: string;
  };
  members: [
    {
      memberNumber: number;    // 1 = Team Leader, 2..5 = Members
      name: string;
      college: string;
      euphoriaId: string;
      email?: string;          // Team Leader only (if present in master data)
      contactNumber?: string;  // Team Leader only (if present in master data)
    }
  ];
}
```

---

## API Reference

All requests route through the Engine Server (`http://localhost:5000`):

| Endpoint | Method | Description | Request Body / Parameters | Key Response Fields |
|---|---|---|---|---|
| `/health` | `GET` | Health probe | None | `"OK"` |
| `/api/attendance/status` | `GET` | Gatekeeper status | None | `{ success, isOpen }` |
| `/api/verify-team` | `POST` | Verify team by number | `{ "teamNumber": 1 }` | `{ success, team: { teamNumber, teamName, problemStatement, members }, existingAttendance }` |
| `/api/presence` | `POST` | Submit / update team attendance | `{ "teamNumber": 1, "members": [{ "euphoriaId": "...", "status": "present" }] }` | `{ success, isUpdate: boolean, record }` |
| `/api/admin/login` | `POST` | Verify admin key | `{ "key": "admin123" }` | `{ success: true }` |
| `/api/admin/presence` | `GET` | Dashboard stats & roster | None | `{ success, stats, teams: [...] }` |
| `/api/admin/attendance/toggle`| `POST` | Toggle gate status | `{ "isOpen": true \| false }` | `{ success, isOpen }` |
| `/api/admin/clear-db` | `POST` | Flush attendance records | None | `{ success, deletedCount }` |
| `/api/admin/export/csv` | `GET` | Stream CSV export | `?type=present` \| `absent` \| `all` | CSV attachment stream |

---

## Running the Application Locally

1. **Start Backend Cluster (Engine + 3 Workers)**:
   ```bash
   cd server
   npm run start:all
   ```
2. **Start Frontend Client**:
   ```bash
   cd client
   npm run dev
   ```
3. Check-in portal: `http://localhost:5173`
4. Admin portal: `http://localhost:5173/admin`
