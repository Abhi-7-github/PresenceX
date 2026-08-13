import { useState, useEffect } from 'react';
import { presenceAPI } from '../services/presenceAPI.js';
import './AdminPage.css';

export default function AdminPage({ onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('all');

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await presenceAPI.getAdminPresence();
      if (result.success) {
        setData(result);
      } else {
        setError(result.message || 'Failed to load admin data');
      }
    } catch (err) {
      setError('Failed to connect to presence server');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout from Admin Dashboard?')) {
      onLogout();
    }
  };

  const handleNavigateCheckin = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new Event('popstate'));
  };

  const getInitials = (name) => {
    if (!name) return 'PX';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  if (loading && !data) {
    return (
      <div className="admin-loading-screen">
        <div className="spinner-large"></div>
        <p>Loading Admin Analytics Dashboard...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="admin-error-screen">
        <div className="error-card">
          <h2>Connection Failure</h2>
          <p>{error}</p>
          <button onClick={fetchAdminData} className="btn-glow-primary">
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const totalRegistered = data?.stats?.totalRegistered || 0;
  const totalPresent = data?.stats?.totalPresent || 0;
  const attendanceRate = totalRegistered > 0 ? Math.round((totalPresent / totalRegistered) * 100) : 0;

  const teams = Array.from(
    new Set((data?.presentStudents || []).map((s) => s.teamname).filter(Boolean))
  ).sort();

  const filteredStudents = (data?.presentStudents || []).filter((s) => {
    const query = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !query ||
      s.name.toLowerCase().includes(query) ||
      String(s.regno).toLowerCase().includes(query) ||
      (s.teamname && s.teamname.toLowerCase().includes(query));
    const matchesTeam = selectedTeam === 'all' || s.teamname === selectedTeam;
    return matchesSearch && matchesTeam;
  });

  const handleExportCSV = () => {
    if (!filteredStudents || filteredStudents.length === 0) {
      alert('No attendance records available to export.');
      return;
    }

    const headers = ['S.No', 'Registration Number', 'Student Name', 'Team Name', 'Timestamp'];
    const rows = filteredStudents.map((s, index) => [
      index + 1,
      `"${String(s.regno || '').replace(/"/g, '""')}"`,
      `"${String(s.name || '').replace(/"/g, '""')}"`,
      `"${String(s.teamname || 'N/A').replace(/"/g, '""')}"`,
      `"${s.timestamp ? new Date(s.timestamp).toLocaleString().replace(/"/g, '""') : 'Recorded'}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `presencex_attendance_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    if (!filteredStudents || filteredStudents.length === 0) {
      alert('No attendance records available to export.');
      return;
    }

    const exportData = filteredStudents.map((s, index) => ({
      sno: index + 1,
      regno: s.regno,
      name: s.name,
      team: s.teamname || null,
      timestamp: s.timestamp ? new Date(s.timestamp).toISOString() : null
    }));

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `presencex_attendance_${dateStr}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-dashboard-page">
      {/* Background Orbs */}
      <div className="glow-orb glow-orb-1" aria-hidden="true"></div>
      <div className="glow-orb glow-orb-2" aria-hidden="true"></div>

      {/* Navigation Header Bar */}
      <nav className="admin-nav-bar">
        <div className="nav-brand">
          <div className="brand-icon-wrapper">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="brand-title">Presence<span className="brand-highlight">X</span></span>
          <span className="admin-pill-badge">ADMIN DASHBOARD</span>
        </div>

        <div className="nav-controls">
          <button onClick={handleNavigateCheckin} className="nav-btn-secondary" title="View Student form">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
            Student Mode
          </button>

          <button onClick={handleLogout} className="nav-btn-danger">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Logout
          </button>
        </div>
      </nav>

      {/* Main Body */}
      <main className="admin-dashboard-body">
        {/* Top Header Summary */}
        <div className="dashboard-title-row">
          <div>
            <h1 className="dash-title">Attendance Overview</h1>
            <p className="dash-subtitle">Real-time check-in metrics and participant tracking</p>
          </div>

          <button 
            onClick={fetchAdminData} 
            disabled={loading} 
            className="refresh-btn-glow"
          >
            <svg 
              className={loading ? 'spin-icon' : ''} 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5"
            >
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>

        {/* Analytics Cards Grid */}
        <div className="stats-grid">
          <div className="stat-card card-blue">
            <div className="stat-card-header">
              <span className="stat-icon-wrapper icon-indigo">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </span>
              <span className="stat-label">Total Registered</span>
            </div>
            <div className="stat-number">{totalRegistered}</div>
            <span className="stat-foot-text">Total enrolled participants</span>
          </div>

          <div className="stat-card card-emerald">
            <div className="stat-card-header">
              <span className="stat-icon-wrapper icon-emerald">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </span>
              <span className="stat-label">Students Present</span>
            </div>
            <div className="stat-number text-emerald">{totalPresent}</div>
            <div className="live-status-chip">
              <span className="dot-green"></span>
              Live Sync Active
            </div>
          </div>

          <div className="stat-card card-purple">
            <div className="stat-card-header">
              <span className="stat-icon-wrapper icon-violet">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
              </span>
              <span className="stat-label">Attendance Rate</span>
            </div>
            <div className="stat-number">{attendanceRate}%</div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${Math.min(100, attendanceRate)}%` }}></div>
            </div>
          </div>
        </div>

        {/* Presence Records Table Section */}
        <div className="table-glass-card">
          <div className="table-controls-header">
            <div className="table-title-group">
              <h2>Check-in Log</h2>
              <span className="records-count-pill">{filteredStudents.length} records</span>
            </div>

            <div className="filter-actions-group">
              <div className="search-box-wrapper">
                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Search name, regno, team..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input-styled"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="clear-search-btn">✕</button>
                )}
              </div>

              {teams.length > 0 && (
                <select
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="select-team-styled"
                >
                  <option value="all">All Teams ({teams.length})</option>
                  {teams.map((team) => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </select>
              )}

              <div className="export-buttons-group">
                <button
                  onClick={handleExportCSV}
                  className="export-btn-glow"
                  title="Export Attendance to CSV spreadsheet"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={handleExportJSON}
                  className="export-btn-outline"
                  title="Export Data as JSON"
                >
                  <span>JSON</span>
                </button>
              </div>
            </div>
          </div>

          {filteredStudents.length > 0 ? (
            <div className="table-responsive-wrapper">
              <table className="custom-dashboard-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>#</th>
                    <th>Student Name</th>
                    <th>Registration No</th>
                    <th>Team Name</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student, index) => (
                    <tr key={student.regno || index}>
                      <td className="col-index">{index + 1}</td>
                      <td className="col-student">
                        <div className="student-flex-cell">
                          <div className="mini-avatar">{getInitials(student.name)}</div>
                          <span className="student-name-text">{student.name}</span>
                        </div>
                      </td>
                      <td className="col-regno">
                        <span className="mono-badge">{student.regno}</span>
                      </td>
                      <td className="col-team">
                        {student.teamname ? (
                          <span className="team-pill-tag">{student.teamname}</span>
                        ) : (
                          <span className="no-team-tag">—</span>
                        )}
                      </td>
                      <td className="col-time font-mono">
                        {student.timestamp 
                          ? new Date(student.timestamp).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })
                          : 'Recorded'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-table-state">
              <div className="empty-icon-circle">📋</div>
              <h3>No Attendance Records Found</h3>
              <p>
                {data?.presentStudents?.length === 0
                  ? 'No students have checked in yet. Attendance records will appear here live as students verify.'
                  : 'No student check-ins match your current search query or team filter.'}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

