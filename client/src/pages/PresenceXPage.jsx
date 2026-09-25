import { useState, useEffect } from 'react';
import { presenceAPI } from '../services/presenceAPI.js';
import './PresenceXPage.css';

export default function PresenceXPage() {
  const [step, setStep] = useState('input'); // 'input', 'verified', 'success', 'error'
  const [teamNumberInput, setTeamNumberInput] = useState('');
  const [team, setTeam] = useState(null);
  const [memberStatuses, setMemberStatuses] = useState({});
  const [isUpdate, setIsUpdate] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentTeams, setRecentTeams] = useState([]);
  const [copied, setCopied] = useState(false);
  const [submissionTime, setSubmissionTime] = useState('');
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(true);
  const [initialChecked, setInitialChecked] = useState(false);

  // Poll attendance open/closed status
  useEffect(() => {
    let isMounted = true;

    const checkStatus = async () => {
      try {
        const res = await presenceAPI.getAttendanceStatus();
        if (isMounted && res && typeof res.isOpen === 'boolean') {
          setIsAttendanceOpen(res.isOpen);
          setInitialChecked(true);
        }
      } catch (err) {
        if (isMounted) setInitialChecked(true);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Load recent team numbers
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tara_recent_teams');
      if (saved) {
        setRecentTeams(JSON.parse(saved).slice(0, 5));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const saveRecentTeam = (teamNum) => {
    try {
      const strVal = String(teamNum).trim();
      const updated = [strVal, ...recentTeams.filter((r) => String(r).trim() !== strVal)].slice(0, 5);
      setRecentTeams(updated);
      localStorage.setItem('tara_recent_teams', JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }
  };

  const handleVerifyTeam = async (e) => {
    if (e) e.preventDefault();

    const cleanInput = String(teamNumberInput).trim();
    if (!cleanInput) {
      setError('Please enter a team number.');
      setStep('error');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const result = await presenceAPI.verifyTeam(cleanInput);

      if (result.success && result.team) {
        setTeam(result.team);
        saveRecentTeam(result.team.teamNumber);

        // Initialize member statuses
        const initialStatusMap = {};
        const existingRec = result.existingAttendance;

        if (existingRec && Array.isArray(existingRec.members)) {
          setIsUpdate(true);
          const existingMap = new Map();
          existingRec.members.forEach((m) => {
            if (m.euphoriaId) existingMap.set(m.euphoriaId.toLowerCase(), m.status);
          });

          result.team.members.forEach((m) => {
            const key = m.euphoriaId.toLowerCase();
            initialStatusMap[m.euphoriaId] = existingMap.get(key) === 'absent' ? 'absent' : 'present';
          });
        } else {
          setIsUpdate(false);
          // Default all to 'present' initially for fast check-in
          result.team.members.forEach((m) => {
            initialStatusMap[m.euphoriaId] = 'present';
          });
        }

        setMemberStatuses(initialStatusMap);
        setStep('verified');
      } else {
        if (result.isClosed) {
          setIsAttendanceOpen(false);
        }
        setError(result.message || 'Team number not found in master records.');
        setStep('error');
      }
    } catch (err) {
      setError('Unable to connect to presence server. Please verify your connection.');
      setStep('error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (teamNum) => {
    setTeamNumberInput(teamNum);
  };

  const toggleMemberStatus = (euphoriaId, newStatus) => {
    setMemberStatuses((prev) => ({
      ...prev,
      [euphoriaId]: newStatus,
    }));
  };

  const markAll = (status) => {
    if (!team || !team.members) return;
    const updated = {};
    team.members.forEach((m) => {
      updated[m.euphoriaId] = status;
    });
    setMemberStatuses(updated);
  };

  const handleSubmitAttendance = async () => {
    if (!team) return;

    try {
      setLoading(true);
      setError('');

      const membersPayload = team.members.map((m) => ({
        euphoriaId: m.euphoriaId,
        status: memberStatuses[m.euphoriaId] || 'absent',
      }));

      const payload = {
        teamNumber: team.teamNumber,
        members: membersPayload,
      };

      const result = await presenceAPI.submitTeamAttendance(payload);

      if (result.success) {
        setSubmissionTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setIsUpdate(Boolean(result.isUpdate));
        setStep('success');
      } else {
        if (result.isClosed) {
          setIsAttendanceOpen(false);
        }
        setError(result.message || 'Failed to submit team attendance.');
        setStep('error');
      }
    } catch (err) {
      setError('Unable to connect to server. Please try again.');
      setStep('error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('input');
    setTeamNumberInput('');
    setTeam(null);
    setMemberStatuses({});
    setError('');
    setCopied(false);
    setIsUpdate(false);
  };

  const copyTicketDetails = () => {
    if (!team) return;
    const presentMembers = team.members.filter((m) => memberStatuses[m.euphoriaId] === 'present');
    const absentMembers = team.members.filter((m) => memberStatuses[m.euphoriaId] === 'absent');
    const text = `TARA Team Attendance Confirmation\nTeam #${team.teamNumber}: ${team.teamName}\nPresent (${presentMembers.length}): ${presentMembers.map((m) => m.name).join(', ')}\nAbsent (${absentMembers.length}): ${absentMembers.map((m) => m.name).join(', ') || 'None'}\nRecorded: ${submissionTime}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="tara-app-wrapper">
      {/* Solid Navbar */}
      <nav className="tara-main-nav">
        <div className="tara-nav-left">
          <span className="tara-nav-wordmark">TARA</span>
          <span className="tara-nav-tag">ATTENDANCE SYSTEM</span>
        </div>
        <div className="tara-nav-right">
          <div className="tara-gate-indicator">
            <span className={`gate-dot ${isAttendanceOpen ? 'open' : 'closed'}`}></span>
            <span className="gate-label">{isAttendanceOpen ? 'SYSTEM ACTIVE' : 'GATE LOCKED'}</span>
          </div>
        </div>
      </nav>

      <div className="tara-content-container">
        {/* ATTENDANCE CLOSED STATE */}
        {!isAttendanceOpen ? (
          <div className="tara-solid-card tara-card-closed">
            <div className="tara-closed-tag">ATTENDANCE GATE LOCKED</div>
            <h1 className="tara-closed-title">Attendance Closed</h1>
            <p className="tara-closed-desc">
              The attendance session is currently closed by the event administrators. Submissions are not being accepted at this time.
            </p>
            <div className="tara-closed-subpanel">
              <span className="subpanel-dot"></span>
              <span>This screen will automatically update when the gate is reopened.</span>
            </div>
          </div>
        ) : (
          <>
            {/* STEP 1: Enter Team Number */}
            {step === 'input' && (
              <div className="tara-solid-card">
                <div className="tara-section-badge">VERIFICATION</div>
                <h1 className="tara-page-heading">TEAM ATTENDANCE</h1>
                <p className="tara-page-subtext">
                  Enter your assigned Team Number to verify registration and record individual member attendance.
                </p>

                <form onSubmit={handleVerifyTeam} className="tara-search-form">
                  <div className="tara-input-block">
                    <label htmlFor="team-number-input" className="tara-field-label">
                      ENTER TEAM NUMBER
                    </label>
                    <div className="tara-search-input-wrap">
                      <input
                        id="team-number-input"
                        type="text"
                        placeholder="e.g. 1, 13, 34, 87..."
                        value={teamNumberInput}
                        onChange={(e) => setTeamNumberInput(e.target.value)}
                        disabled={loading}
                        className="tara-input-solid"
                        autoFocus
                        autoComplete="off"
                      />
                      {teamNumberInput && (
                        <button
                          type="button"
                          onClick={() => setTeamNumberInput('')}
                          className="tara-input-clear"
                          aria-label="Clear team number"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {recentTeams.length > 0 && (
                    <div className="tara-recent-row">
                      <span className="recent-heading">RECENT:</span>
                      <div className="recent-chips">
                        {recentTeams.map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleQuickSelect(num)}
                            className="tara-chip"
                          >
                            TEAM #{num}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !String(teamNumberInput).trim()}
                    className="tara-btn-orange"
                  >
                    {loading ? 'SEARCHING TEAM...' : 'SEARCH'}
                  </button>
                </form>
              </div>
            )}

            {/* STEP 2: Team Details & Member Attendance Table */}
            {step === 'verified' && team && (
              <div className="tara-solid-card tara-card-wide">
                <div className="tara-team-header-block">
                  <div className="tara-team-badge-row">
                    <span className="tara-team-num-badge">TEAM #{team.teamNumber}</span>
                    {isUpdate && (
                      <span className="tara-update-notice">EXISTING RECORD LOADED</span>
                    )}
                  </div>
                  <h1 className="tara-team-name-display">{team.teamName}</h1>

                  {/* Problem Statement Box */}
                  <div className="tara-ps-solid-box">
                    <div className="ps-tag">PROBLEM STATEMENT</div>
                    <div className="ps-content">
                      {team.problemStatement?.number && (
                        <span className="ps-code">{team.problemStatement.number}</span>
                      )}
                      <span className="ps-title-text">
                        {team.problemStatement?.title || 'General Track'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Table Header Controls */}
                <div className="tara-table-actions-header">
                  <div>
                    <h2 className="tara-subheading">REGISTERED MEMBERS ({team.members.length})</h2>
                    <span className="tara-subtext-small">Toggle each member's individual status below</span>
                  </div>

                  <div className="tara-quick-actions">
                    <button
                      type="button"
                      onClick={() => markAll('present')}
                      className="tara-quick-btn mark-present"
                    >
                      ALL PRESENT
                    </button>
                    <button
                      type="button"
                      onClick={() => markAll('absent')}
                      className="tara-quick-btn mark-absent"
                    >
                      ALL ABSENT
                    </button>
                  </div>
                </div>

                {/* Editorial Member Table */}
                <div className="tara-table-wrapper">
                  <table className="tara-editorial-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>#</th>
                        <th>MEMBER</th>
                        <th>COLLEGE</th>
                        <th>EUPHORIA ID</th>
                        <th style={{ textAlign: 'center' }}>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.members.map((member) => {
                        const isPresent = memberStatuses[member.euphoriaId] === 'present';
                        return (
                          <tr
                            key={member.euphoriaId}
                            className={`tara-row ${isPresent ? 'row-active-present' : 'row-active-absent'}`}
                          >
                            <td className="col-idx">{member.memberNumber}</td>
                            <td className="col-member">
                              <div className="member-name-wrap">
                                <span className="member-fullname">{member.name}</span>
                                {member.memberNumber === 1 && (
                                  <span className="tara-leader-tag">TEAM LEADER</span>
                                )}
                              </div>
                            </td>
                            <td className="col-college">{member.college || '—'}</td>
                            <td className="col-id">
                              <span className="tara-code-badge">{member.euphoriaId}</span>
                            </td>
                            <td className="col-status" style={{ textAlign: 'center' }}>
                              <div className="tara-status-toggle">
                                <button
                                  type="button"
                                  onClick={() => toggleMemberStatus(member.euphoriaId, 'present')}
                                  className={`status-btn-present ${isPresent ? 'selected' : ''}`}
                                >
                                  PRESENT
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleMemberStatus(member.euphoriaId, 'absent')}
                                  className={`status-btn-absent ${!isPresent ? 'selected' : ''}`}
                                >
                                  ABSENT
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Submit Action Row */}
                <div className="tara-form-submit-row">
                  <button
                    onClick={handleSubmitAttendance}
                    disabled={loading}
                    className="tara-btn-orange"
                  >
                    {loading
                      ? 'RECORDING ATTENDANCE...'
                      : isUpdate
                      ? 'UPDATE TEAM ATTENDANCE'
                      : 'SUBMIT TEAM ATTENDANCE'}
                  </button>

                  <button
                    onClick={handleReset}
                    disabled={loading}
                    className="tara-btn-dark"
                  >
                    CHANGE TEAM
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Success Confirmation Screen */}
            {step === 'success' && team && (
              <div className="tara-solid-card">
                <div className="tara-success-header">
                  <div className="tara-check-badge">✓</div>
                  <h1 className="tara-page-heading">
                    {isUpdate ? 'ATTENDANCE UPDATED' : 'ATTENDANCE RECORDED'}
                  </h1>
                  <p className="tara-page-subtext">
                    Team attendance session has been logged to the database.
                  </p>
                </div>

                {/* Editorial Summary Pass */}
                <div className="tara-summary-slip">
                  <div className="slip-top-row">
                    <span className="slip-brand">TARA ATTENDANCE LOG</span>
                    <span className="slip-team-num">TEAM #{team.teamNumber}</span>
                  </div>

                  <div className="slip-details">
                    <div className="slip-item">
                      <span className="slip-label">TEAM NAME</span>
                      <span className="slip-value">{team.teamName}</span>
                    </div>

                    {team.problemStatement?.title && (
                      <div className="slip-item">
                        <span className="slip-label">PROBLEM STATEMENT</span>
                        <span className="slip-value">
                          {team.problemStatement.number ? `${team.problemStatement.number} — ` : ''}
                          {team.problemStatement.title}
                        </span>
                      </div>
                    )}

                    <div className="slip-item">
                      <span className="slip-label">ATTENDANCE RATIO</span>
                      <span className="slip-value bold-orange">
                        {team.members.filter((m) => memberStatuses[m.euphoriaId] === 'present').length} / {team.members.length} MEMBERS PRESENT
                      </span>
                    </div>

                    <div className="slip-members-list">
                      <span className="slip-label">MEMBER BREAKDOWN</span>
                      <div className="slip-members-grid">
                        {team.members.map((m) => {
                          const isPresent = memberStatuses[m.euphoriaId] === 'present';
                          return (
                            <div key={m.euphoriaId} className="slip-member-pill">
                              <span className="name">{m.name}</span>
                              <span className={`pill-status ${isPresent ? 'is-pres' : 'is-abs'}`}>
                                {isPresent ? 'PRESENT' : 'ABSENT'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="slip-item">
                      <span className="slip-label">TIMESTAMP</span>
                      <span className="slip-value">{submissionTime || 'Confirmed'}</span>
                    </div>
                  </div>

                  <div className="slip-actions">
                    <button onClick={copyTicketDetails} className="tara-btn-dark small">
                      {copied ? '✓ COPIED TO CLIPBOARD' : 'COPY SUMMARY'}
                    </button>
                  </div>
                </div>

                <div className="tara-form-submit-row">
                  <button onClick={handleReset} className="tara-btn-orange">
                    CHECK IN ANOTHER TEAM
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Error Screen */}
            {step === 'error' && (
              <div className="tara-solid-card">
                <div className="tara-section-badge error">FAILED</div>
                <h1 className="tara-page-heading">VERIFICATION ERROR</h1>
                <div className="tara-error-message-box">
                  <p>{error}</p>
                </div>
                <p className="tara-page-subtext">
                  Please verify the Team Number or check with the helpdesk coordinator if your team registration is missing.
                </p>
                <button onClick={handleReset} className="tara-btn-orange">
                  TRY AGAIN
                </button>
              </div>
            )}
          </>
        )}

        <footer className="tara-footer">
          <span className="footer-brand">TARA</span>
          <span className="footer-sep">&bull;</span>
          <span className="footer-sub">SOLID STATE ATTENDANCE INFRASTRUCTURE</span>
        </footer>
      </div>
    </div>
  );
}
