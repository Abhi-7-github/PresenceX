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
      setError('Failed to connect to server');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      onLogout();
    }
  };

  if (loading) {
    return <div className="admin-page"><p>Loading...</p></div>;
  }

  if (error) {
    return <div className="admin-page"><p className="error">Error: {error}</p></div>;
  }

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

  return (
    <div className="admin-container">
      <nav className="admin-nav">
        <h3>PresenceX Admin</h3>
        <button onClick={handleLogout} className="nav-btn">Logout</button>
      </nav>

      <div className="admin-page">
        <h1>Admin Dashboard</h1>

        <div className="stats-container">
          <div className="stat-card">
            <h2>{data?.stats?.totalRegistered || 0}</h2>
            <p>Total Registered Students</p>
          </div>
          <div className="stat-card">
            <h2>{data?.stats?.totalPresent || 0}</h2>
            <p>Students Present</p>
          </div>
        </div>

        <div className="presence-list">
          <div className="presence-header">
            <h2>Students Who Marked Presence ({filteredStudents.length})</h2>
            <div className="filter-controls">
              <input
                type="text"
                placeholder="Search by name, regno, or team..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {teams.length > 0 && (
                <select
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="team-select"
                >
                  <option value="all">All Teams</option>
                  {teams.map((team) => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {filteredStudents.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Registration Number</th>
                  <th>Student Name</th>
                  <th>Team</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td><code>{student.regno}</code></td>
                    <td><strong>{student.name}</strong></td>
                    <td>
                      {student.teamname ? (
                        <span className="team-badge">{student.teamname}</span>
                      ) : (
                        <span className="no-team">-</span>
                      )}
                    </td>
                    <td>{new Date(student.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="no-data">
              {data?.presentStudents?.length === 0
                ? 'No students have marked presence yet.'
                : 'No students matching your filter.'}
            </p>
          )}
        </div>

        <button onClick={fetchAdminData} className="refresh-btn">Refresh</button>
      </div>
    </div>
  );
}
