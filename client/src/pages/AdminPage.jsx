import { useState, useEffect, useRef } from 'react';
import { presenceAPI } from '../services/presenceAPI.js';
import './AdminPage.css';

export default function AdminPage({ onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'attendance', 'teams', 'history'
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'fully_present', 'partially_present', 'no_attendance'
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(true);
  const [togglingAttendance, setTogglingAttendance] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showDeleteConfirmToast, setShowDeleteConfirmToast] = useState(false);
  const [clearingDb, setClearingDb] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState(new Set());
  const [updatingTeamNum, setUpdatingTeamNum] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetchAdminData();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const showToast = (content, type = 'info', icon = '•') => {
    if (typeof content === 'string') {
      setToastMessage({ text: content, type, icon });
    } else {
      setToastMessage(content);
    }
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === (content.text || content) ? null : prev));
    }, 4500);
  };

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await presenceAPI.getAdminPresence();
      if (result.success) {
        setData(result);
        if (typeof result.isAttendanceOpen === 'boolean') {
          setIsAttendanceOpen(result.isAttendanceOpen);
        }
      } else {
        setError(result.message || 'Failed to load TARA admin data');
      }
    } catch (err) {
      setError('Failed to connect to TARA presence server');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAttendance = async () => {
    const targetStatus = !isAttendanceOpen;
    try {
      setTogglingAttendance(true);
      const res = await presenceAPI.toggleAttendance(targetStatus);
      if (res && res.success) {
        setIsAttendanceOpen(res.isOpen);
        showToast(
          res.isOpen ? 'ATTENDANCE GATE IS NOW OPEN' : 'ATTENDANCE GATE IS NOW LOCKED',
          res.isOpen ? 'success' : 'warning',
          '•'
        );
      } else {
        showToast('Failed to update attendance status', 'warning', '!');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to server', 'error', '!');
    } finally {
      setTogglingAttendance(false);
    }
  };

  const handleClearDatabase = async () => {
    try {
      setClearingDb(true);
      const res = await presenceAPI.clearDatabase();
      if (res && res.success) {
        setShowClearModal(false);
        setShowDeleteConfirmToast(false);
        await fetchAdminData();
        showToast(
          `Successfully cleared all ${res.deletedCount || 0} attendance session records!`,
          'danger-confirmed',
          '✓'
        );
      } else {
        alert(res?.message || 'Failed to clear database.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server to clear database.');
    } finally {
      setClearingDb(false);
    }
  };

  const handleMemberStatusToggle = async (teamObj, member, currentStatus) => {
    const newStatus = currentStatus === 'present' ? 'absent' : 'present';
    const updatedMembers = teamObj.members.map((m) => ({
      euphoriaId: m.euphoriaId,
      status: m.euphoriaId === member.euphoriaId ? newStatus : m.status === 'present' ? 'present' : 'absent',
    }));

    try {
      setUpdatingTeamNum(teamObj.teamNumber);
      const res = await presenceAPI.submitTeamAttendance({
        teamNumber: teamObj.teamNumber,
        members: updatedMembers,
      });

      if (res.success) {
        await fetchAdminData();
        showToast(`Team #${teamObj.teamNumber} ${member.name}: ${newStatus.toUpperCase()}`, 'success', '✓');
      } else {
        showToast(res.message || 'Failed to update member status', 'error', '!');
      }
    } catch (err) {
      console.error(err);
      showToast('Error updating member attendance', 'error', '!');
    } finally {
      setUpdatingTeamNum(null);
    }
  };

  const toggleExpandTeam = (teamNum) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamNum)) next.delete(teamNum);
      else next.add(teamNum);
      return next;
    });
  };

  const expandAllTeams = () => {
    if (!data?.teams) return;
    setExpandedTeams(new Set(data.teams.map((t) => t.teamNumber)));
  };

  const collapseAllTeams = () => {
    setExpandedTeams(new Set());
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to sign out from TARA Admin?')) {
      onLogout();
    }
  };

  const handleNavigateCheckin = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new Event('popstate'));
  };

  const downloadCSV = (type = 'present') => {
    const url = presenceAPI.getExportCSVUrl(type);
    window.open(url, '_blank');
    setDropdownOpen(false);
    showToast(`Downloading ${type.toUpperCase()} CSV export...`, 'info', '↓');
  };

  if (loading && !data) {
    return (
      <div className="tara-admin-loading">
        <div className="tara-spinner-solid"></div>
        <p className="loading-text">LOADING TARA ADMIN PLATFORM...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="tara-admin-error">
        <div className="tara-error-panel">
          <h2 className="error-title">CONNECTION ERROR</h2>
          <p className="error-desc">{error}</p>
          <button onClick={fetchAdminData} className="tara-btn-orange">
            RETRY CONNECTION
          </button>
        </div>
      </div>
    );
  }

  const stats = data?.stats || {
    totalTeams: 0,
    totalRegisteredMembers: 0,
    totalPresentMembers: 0,
    totalAbsentMembers: 0,
    attendanceRate: 0,
    teamsFullyPresent: 0,
    teamsPartiallyPresent: 0,
    teamsNoAttendance: 0,
  };

  const allTeams = data?.teams || [];

  // Filter teams by search & status
  const filteredTeams = allTeams.filter((team) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      String(team.teamNumber).toLowerCase().includes(q) ||
      team.teamName.toLowerCase().includes(q) ||
      (team.problemStatement?.title && team.problemStatement.title.toLowerCase().includes(q)) ||
      team.members.some(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          String(m.euphoriaId).toLowerCase().includes(q) ||
          (m.college && m.college.toLowerCase().includes(q))
      );

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'fully_present' && team.attendanceStatus === 'fully_present') ||
      (statusFilter === 'partially_present' && team.attendanceStatus === 'partially_present') ||
      (statusFilter === 'no_attendance' && team.attendanceStatus === 'no_attendance');

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="tara-admin-layout">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="tara-sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* SOLID SIDEBAR */}
      <aside className={`tara-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand-block">
          <div className="sidebar-brand-texts">
            <span className="sidebar-wordmark">TARA</span>
            <span className="sidebar-edition">ADMIN SUITE</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="sidebar-close-btn"
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        <nav className="sidebar-nav">
          <button
            onClick={() => {
              setActiveTab('dashboard');
              setMobileMenuOpen(false);
            }}
            className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            <span className="nav-bullet"></span>
            <span className="nav-text">DASHBOARD</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('attendance');
              setMobileMenuOpen(false);
            }}
            className={`sidebar-nav-item ${activeTab === 'attendance' ? 'active' : ''}`}
          >
            <span className="nav-bullet"></span>
            <span className="nav-text">ATTENDANCE</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('teams');
              setMobileMenuOpen(false);
            }}
            className={`sidebar-nav-item ${activeTab === 'teams' ? 'active' : ''}`}
          >
            <span className="nav-bullet"></span>
            <span className="nav-text">TEAMS ({stats.totalTeams})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('history');
              setMobileMenuOpen(false);
            }}
            className={`sidebar-nav-item ${activeTab === 'history' ? 'active' : ''}`}
          >
            <span className="nav-bullet"></span>
            <span className="nav-text">HISTORY & LOGS</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleNavigateCheckin} className="sidebar-link-btn">
            ↗ STUDENT PORTAL
          </button>
          <button onClick={handleLogout} className="sidebar-logout-btn">
            SIGN OUT
          </button>
        </div>
      </aside>

      {/* MAIN ADMIN CONTENT WRAPPER */}
      <div className="tara-admin-main">
        {/* Solid Top Header */}
        <header className="tara-admin-topbar">
          <div className="topbar-left-cluster">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="tara-mobile-menu-btn"
              aria-label="Open Navigation Menu"
            >
              <span className="menu-bar"></span>
              <span className="menu-bar"></span>
              <span className="menu-bar"></span>
              <span className="menu-text">MENU</span>
            </button>
            <div className="topbar-title-group">
              <h1 className="topbar-heading">
                {activeTab === 'dashboard' && 'SYSTEM DASHBOARD'}
                {activeTab === 'attendance' && 'LIVE ATTENDANCE SESSIONS'}
                {activeTab === 'teams' && 'MASTER TEAM ROSTER'}
                {activeTab === 'history' && 'ATTENDANCE HISTORY & EXPORTS'}
              </h1>
              <span className="topbar-subtitle">TARA &bull; VERIFIED EVENT METRICS</span>
            </div>
          </div>

          <div className="topbar-actions">
            {/* Gate Toggle Button */}
            <button
              onClick={handleToggleAttendance}
              disabled={togglingAttendance}
              className={`tara-gate-toggle-btn ${isAttendanceOpen ? 'is-open' : 'is-closed'}`}
              title={isAttendanceOpen ? 'Lock Gate (Stop check-ins)' : 'Open Gate (Accept check-ins)'}
            >
              <span className={`toggle-dot ${isAttendanceOpen ? 'open' : 'closed'}`}></span>
              <span>{isAttendanceOpen ? 'GATE: OPEN' : 'GATE: LOCKED'}</span>
            </button>

            {/* Clear Database Button */}
            <button
              onClick={() => setShowDeleteConfirmToast(true)}
              className="tara-action-btn-danger"
              title="Clear all recorded attendance sessions"
            >
              CLEAR DATA
            </button>

            {/* Refresh */}
            <button
              onClick={fetchAdminData}
              disabled={loading}
              className="tara-action-btn-dark"
              title="Refresh from server"
            >
              {loading ? 'SYNCING...' : 'SYNC DATA'}
            </button>
          </div>
        </header>

        {/* Confirmation Toast Banner */}
        {showDeleteConfirmToast && (
          <div className="tara-alert-banner danger">
            <div className="alert-content">
              <strong>CONFIRM DATABASE RESET:</strong>
              <span>Are you sure you want to permanently delete all attendance records? (Master team data remains untouched).</span>
            </div>
            <div className="alert-buttons">
              <button
                onClick={() => setShowDeleteConfirmToast(false)}
                disabled={clearingDb}
                className="tara-btn-dark small"
              >
                CANCEL
              </button>
              <button
                onClick={handleClearDatabase}
                disabled={clearingDb}
                className="tara-btn-orange small"
              >
                {clearingDb ? 'CLEARING...' : 'YES, CLEAR DATA'}
              </button>
            </div>
          </div>
        )}

        {/* Status Toast */}
        {toastMessage && (
          <div className={`tara-status-toast ${toastMessage.type || 'info'}`}>
            <span className="toast-bullet">{toastMessage.icon || '•'}</span>
            <span className="toast-msg">{toastMessage.text || toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="toast-dismiss">✕</button>
          </div>
        )}

        <div className="tara-dashboard-content">
          {/* STATS CARDS GRID */}
          <section className="tara-stats-grid">
            <div className="tara-stat-card">
              <span className="stat-card-title">TOTAL TEAMS</span>
              <div className="stat-card-value">{stats.totalTeams}</div>
              <span className="stat-card-sub">Registered event squads</span>
            </div>

            <div className="tara-stat-card">
              <span className="stat-card-title">REGISTERED MEMBERS</span>
              <div className="stat-card-value">{stats.totalRegisteredMembers}</div>
              <span className="stat-card-sub">Enrolled participants</span>
            </div>

            <div className="tara-stat-card highlight-orange">
              <span className="stat-card-title">PRESENT MEMBERS</span>
              <div className="stat-card-value orange">{stats.totalPresentMembers}</div>
              <span className="stat-card-sub">Verified & checked in</span>
            </div>

            <div className="tara-stat-card">
              <span className="stat-card-title">ABSENT MEMBERS</span>
              <div className="stat-card-value">{stats.totalAbsentMembers}</div>
              <span className="stat-card-sub">Pending check-in</span>
            </div>

            <div className="tara-stat-card">
              <span className="stat-card-title">ATTENDANCE RATE</span>
              <div className="stat-card-value">{stats.attendanceRate}%</div>
              <div className="tara-rate-track">
                <div className="tara-rate-fill" style={{ width: `${Math.min(100, stats.attendanceRate)}%` }}></div>
              </div>
            </div>
          </section>

          {/* TEAMS BREAKDOWN RIBBON */}
          <section className="tara-breakdown-bar">
            <div className="breakdown-items-group">
              <button
                onClick={() => setStatusFilter(statusFilter === 'fully_present' ? 'all' : 'fully_present')}
                className={`breakdown-chip ${statusFilter === 'fully_present' ? 'active' : ''}`}
              >
                <span className="status-indicator-box fully-pres"></span>
                <span className="chip-name">TEAMS FULLY PRESENT:</span>
                <strong className="chip-val orange">{stats.teamsFullyPresent}</strong>
              </button>

              <button
                onClick={() => setStatusFilter(statusFilter === 'partially_present' ? 'all' : 'partially_present')}
                className={`breakdown-chip ${statusFilter === 'partially_present' ? 'active' : ''}`}
              >
                <span className="status-indicator-box part-pres"></span>
                <span className="chip-name">TEAMS PARTIALLY PRESENT:</span>
                <strong className="chip-val">{stats.teamsPartiallyPresent}</strong>
              </button>

              <button
                onClick={() => setStatusFilter(statusFilter === 'no_attendance' ? 'all' : 'no_attendance')}
                className={`breakdown-chip ${statusFilter === 'no_attendance' ? 'active' : ''}`}
              >
                <span className="status-indicator-box no-att"></span>
                <span className="chip-name">TEAMS NO ATTENDANCE:</span>
                <strong className="chip-val">{stats.teamsNoAttendance}</strong>
              </button>
            </div>

            {statusFilter !== 'all' && (
              <button onClick={() => setStatusFilter('all')} className="tara-btn-dark small">
                RESET FILTER
              </button>
            )}
          </section>

          {/* MAIN TEAMS ROSTER SECTION */}
          <section className="tara-roster-panel">
            <div className="roster-toolbar">
              <div className="toolbar-left">
                {/* Search Input */}
                <div className="tara-solid-search-box">
                  <input
                    type="text"
                    placeholder="Search Team #, Team Name, Member, ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="solid-search-input"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="search-clear-x">
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Selector */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="tara-solid-select"
                >
                  <option value="all">ALL STATUSES ({allTeams.length})</option>
                  <option value="fully_present">FULLY PRESENT ({stats.teamsFullyPresent})</option>
                  <option value="partially_present">PARTIALLY PRESENT ({stats.teamsPartiallyPresent})</option>
                  <option value="no_attendance">NO ATTENDANCE ({stats.teamsNoAttendance})</option>
                </select>
              </div>

              <div className="toolbar-right">
                {/* Expand / Collapse All */}
                <button onClick={expandAllTeams} className="tara-btn-dark small">
                  EXPAND ALL
                </button>
                <button onClick={collapseAllTeams} className="tara-btn-dark small">
                  COLLAPSE ALL
                </button>

                {/* Export CSV Dropdown */}
                <div className="export-menu-wrapper" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="tara-btn-orange small"
                  >
                    EXPORT CSV ▾
                  </button>

                  {dropdownOpen && (
                    <div className="solid-dropdown-menu">
                      <div className="dropdown-label-head">CSV DOWNLOAD OPTIONS</div>
                      <button onClick={() => downloadCSV('all')} className="dropdown-action-btn">
                        <span className="dot"></span>
                        <div className="btn-text-col">
                          <strong>COMPLETE MASTER SHEET</strong>
                          <span>All teams & members (Present + Absent)</span>
                        </div>
                      </button>
                      <button onClick={() => downloadCSV('present')} className="dropdown-action-btn">
                        <span className="dot orange"></span>
                        <div className="btn-text-col">
                          <strong>PRESENT PARTICIPANTS</strong>
                          <span>{stats.totalPresentMembers} verified present members</span>
                        </div>
                      </button>
                      <button onClick={() => downloadCSV('absent')} className="dropdown-action-btn">
                        <span className="dot"></span>
                        <div className="btn-text-col">
                          <strong>ABSENTEE ROSTER</strong>
                          <span>{stats.totalAbsentMembers} pending / absent members</span>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Teams Roster List */}
            {filteredTeams.length > 0 ? (
              <div className="tara-teams-list">
                {filteredTeams.map((team) => {
                  const isExpanded = expandedTeams.has(team.teamNumber);
                  const isCurrentlyUpdating = updatingTeamNum === team.teamNumber;

                  let badgeClass = 'status-tag-no-attendance';
                  let badgeText = 'NO ATTENDANCE';

                  if (team.attendanceStatus === 'fully_present') {
                    badgeClass = 'status-tag-fully-present';
                    badgeText = 'FULLY PRESENT';
                  } else if (team.attendanceStatus === 'partially_present') {
                    badgeClass = 'status-tag-partially-present';
                    badgeText = 'PARTIALLY PRESENT';
                  }

                  return (
                    <div key={team.teamNumber} className={`tara-team-row-card ${isExpanded ? 'is-expanded' : ''}`}>
                      <div className="team-summary-bar" onClick={() => toggleExpandTeam(team.teamNumber)}>
                        <div className="team-identity-col">
                          <span className="team-index-tag">#{team.teamNumber}</span>
                          <div className="team-names-col">
                            <h3 className="team-display-name">{team.teamName}</h3>
                            {team.problemStatement?.title && (
                              <span className="team-ps-preview">
                                {team.problemStatement.number ? `${team.problemStatement.number}: ` : ''}
                                {team.problemStatement.title}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="team-metrics-col">
                          <span className={`roster-status-badge ${badgeClass}`}>{badgeText}</span>
                          <div className="roster-ratio-pill">
                            <span className="present-count">{team.presentCount}</span>
                            <span className="divider">/</span>
                            <span className="total-count">{team.totalMembers} PRESENT</span>
                          </div>
                          <button className="expand-indicator-btn" aria-label="Expand team">
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Member Table */}
                      {isExpanded && (
                        <div className="team-members-subpanel">
                          <div className="subpanel-table-wrap">
                            <table className="subpanel-table">
                              <thead>
                                <tr>
                                  <th style={{ width: '40px' }}>#</th>
                                  <th>MEMBER</th>
                                  <th>EUPHORIA ID</th>
                                  <th>COLLEGE</th>
                                  <th>STATUS</th>
                                  <th style={{ textAlign: 'right' }}>TOGGLE STATUS</th>
                                </tr>
                              </thead>
                              <tbody>
                                {team.members.map((member) => {
                                  const isMemberPresent = member.status === 'present';
                                  return (
                                    <tr key={member.euphoriaId} className={isMemberPresent ? 'mem-present' : 'mem-absent'}>
                                      <td className="col-num">{member.memberNumber}</td>
                                      <td className="col-name">
                                        <div className="member-name-flex">
                                          <span className="name-text">{member.name}</span>
                                          {member.memberNumber === 1 && (
                                            <span className="tara-leader-tag">LEADER</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="col-euphoria">
                                        <span className="tara-code-badge">{member.euphoriaId}</span>
                                      </td>
                                      <td className="col-college">{member.college || '—'}</td>
                                      <td className="col-status-pill">
                                        <span className={`solid-status-tag ${isMemberPresent ? 'tag-present' : 'tag-absent'}`}>
                                          {isMemberPresent ? 'PRESENT' : 'ABSENT'}
                                        </span>
                                      </td>
                                      <td className="col-toggle-action" style={{ textAlign: 'right' }}>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMemberStatusToggle(team, member, member.status);
                                          }}
                                          disabled={isCurrentlyUpdating}
                                          className={`member-action-toggle ${isMemberPresent ? 'btn-to-absent' : 'btn-to-present'}`}
                                        >
                                          {isMemberPresent ? 'MARK ABSENT' : 'MARK PRESENT'}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="tara-empty-state">
                <span className="empty-title">NO MATCHING TEAMS FOUND</span>
                <p className="empty-sub">Adjust your search term or status filter.</p>
              </div>
            )}
          </section>
        </div>

        <footer className="tara-admin-footer">
          <span>TARA &bull; EDITORIAL EVENT ATTENDANCE ENGINE &bull; {new Date().getFullYear()}</span>
        </footer>
      </div>

      {/* Clear Database Modal */}
      {showClearModal && (
        <div className="tara-modal-backdrop" onClick={() => !clearingDb && setShowClearModal(false)}>
          <div className="tara-solid-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top-accent"></div>
            <h2 className="modal-title">CLEAR ATTENDANCE DATABASE</h2>
            <p className="modal-desc">
              Are you sure you want to permanently clear all recorded attendance sessions from MongoDB? Master team data from data.json will remain untouched.
            </p>
            <div className="modal-actions">
              <button onClick={() => setShowClearModal(false)} disabled={clearingDb} className="tara-btn-dark">
                CANCEL
              </button>
              <button onClick={handleClearDatabase} disabled={clearingDb} className="tara-btn-orange">
                {clearingDb ? 'CLEARING...' : 'YES, PERMANENTLY CLEAR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
