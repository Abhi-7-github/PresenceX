import { useState, useEffect } from 'react';
import { presenceAPI } from '../services/presenceAPI.js';
import './PresenceXPage.css';

export default function PresenceXPage() {
  const [step, setStep] = useState('input'); // input, verified, success, error
  const [registration, setRegistration] = useState('');
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentRegs, setRecentRegs] = useState([]);
  const [copied, setCopied] = useState(false);
  const [timestamp, setTimestamp] = useState('');

  // Load recent registration numbers on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('presenceX_recent_regs');
      if (saved) {
        setRecentRegs(JSON.parse(saved).slice(0, 4));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const saveRecentReg = (regno) => {
    try {
      const updated = [regno, ...recentRegs.filter((r) => r !== regno)].slice(0, 4);
      setRecentRegs(updated);
      localStorage.setItem('presenceX_recent_regs', JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();

    const cleanReg = registration.trim();
    if (!cleanReg) {
      setError('Please enter your registration number');
      setStep('error');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const result = await presenceAPI.verifyStudent(cleanReg);

      if (result.success) {
        setStudent(result.student);
        saveRecentReg(cleanReg);
        setStep('verified');
      } else {
        setError(result.message || 'Registration number not found in our database');
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

  const handleQuickSelect = (regno) => {
    setRegistration(regno);
  };

  const handleMarkPresence = async () => {
    try {
      setLoading(true);
      setError('');

      const result = await presenceAPI.markPresence(student.regno);

      if (result.success) {
        setTimestamp(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setStep('success');
      } else {
        setError(result.message || 'Failed to mark presence');
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
    setRegistration('');
    setStudent(null);
    setError('');
    setCopied(false);
  };



  const copyTicketDetails = () => {
    if (!student) return;
    const text = `PresenceX Check-in Pass\nName: ${student.name}\nReg No: ${student.regno}\nTeam: ${student.teamname || 'N/A'}\nTime: ${timestamp}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getInitials = (name) => {
    if (!name) return 'PX';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Determine current active step number for visual progress tracker
  const getCurrentStepNum = () => {
    if (step === 'input') return 1;
    if (step === 'verified') return 2;
    if (step === 'success') return 3;
    return 1;
  };

  return (
    <div className="presencex-page">
      <div className="glow-orb glow-orb-1" aria-hidden="true"></div>
      <div className="glow-orb glow-orb-2" aria-hidden="true"></div>
      <div className="glow-orb glow-orb-3" aria-hidden="true"></div>

      <div className="presencex-container">
        <header className="presencex-header">
          <div className="brand-badge">
            <span className="brand-title">Presence<span className="brand-highlight">X</span></span>
          </div>

        </header>

        {step !== 'error' && (
          <div className="step-progress-bar">
            <div className={`step-item ${getCurrentStepNum() >= 1 ? 'active' : ''} ${getCurrentStepNum() > 1 ? 'completed' : ''}`}>
              <div className="step-circle">1</div>
              <span className="step-label">Identify</span>
            </div>
            <div className={`step-connector ${getCurrentStepNum() >= 2 ? 'active' : ''}`}></div>
            <div className={`step-item ${getCurrentStepNum() >= 2 ? 'active' : ''} ${getCurrentStepNum() > 2 ? 'completed' : ''}`}>
              <div className="step-circle">2</div>
              <span className="step-label">Verify</span>
            </div>
            <div className={`step-connector ${getCurrentStepNum() >= 3 ? 'active' : ''}`}></div>
            <div className={`step-item ${getCurrentStepNum() >= 3 ? 'active' : ''}`}>
              <div className="step-circle">3</div>
              <span className="step-label">Complete</span>
            </div>
          </div>
        )}

        <main className="presencex-card">
          {step === 'input' && (
            <div className="step-content step-input-animated">
              <div className="step-header">
                <h1 className="hero-heading">Mark Your Presence</h1>
                <p className="hero-subtext">Enter your registration number to confirm check-in.</p>
              </div>

              <form onSubmit={handleVerify} className="attendance-form">
                <div className="input-container">
                  <label htmlFor="registration-input" className="input-label">
                    Registration Number
                  </label>
                  <div className="input-wrapper">
                    <span className="input-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                    </span>
                    <input
                      id="registration-input"
                      type="text"
                      placeholder="e.g. 992............."
                      value={registration}
                      onChange={(e) => setRegistration(e.target.value)}
                      disabled={loading}
                      className="styled-input"
                      autoFocus
                      autoComplete="off"
                    />
                    {registration && (
                      <button
                        type="button"
                        onClick={() => setRegistration('')}
                        className="clear-input-btn"
                        aria-label="Clear input"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="input-hint">
                    <span>Press <kbd>Enter ↵</kbd> to submit</span>
                  </div>
                </div>

                {recentRegs.length > 0 && (
                  <div className="recent-chips-container">
                    <span className="recent-label">Recent:</span>
                    <div className="chips-wrapper">
                      {recentRegs.map((reg) => (
                        <button
                          key={reg}
                          type="button"
                          className="chip-btn"
                          onClick={() => handleQuickSelect(reg)}
                        >
                          {reg}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !registration.trim()}
                  className="btn-glow-primary"
                >
                  {loading ? (
                    <span className="btn-loading-flex">
                      <span className="spinner"></span>
                      Verifying Identity...
                    </span>
                  ) : (
                    <span className="btn-text-flex">
                      Verify & Continue
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                      </svg>
                    </span>
                  )}
                </button>
              </form>
            </div>
          )}

          {step === 'verified' && student && (
            <div className="step-content step-verified-animated">
              <div className="badge-verified-top">
                <span className="verified-dot">✓</span>
                Identity Verified
              </div>

              <div className="student-profile-header">
                <div className="avatar-ring">
                  <div className="avatar-initials">{getInitials(student.name)}</div>
                </div>
                <h2 className="student-name">{student.name}</h2>
                <span className="student-regno-pill">{student.regno}</span>
              </div>

              <div className="student-card-details">
                <div className="detail-item">
                  <div className="detail-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                  </div>
                  <div className="detail-meta">
                    <span className="meta-label">Team Assignment</span>
                    <span className="meta-value">{student.teamname || 'Individual Participant'}</span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                  </div>
                  <div className="detail-meta">
                    <span className="meta-label">Registration ID</span>
                    <span className="meta-value font-mono">{student.regno}</span>
                  </div>
                </div>
              </div>

              <div className="action-buttons-group">
                <button
                  onClick={handleMarkPresence}
                  disabled={loading}
                  className="btn-glow-success"
                >
                  {loading ? (
                    <span className="btn-loading-flex">
                      <span className="spinner"></span>
                      Recording Attendance...
                    </span>
                  ) : (
                    <span className="btn-text-flex">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                      </svg>
                      Confirm & Mark Present
                    </span>
                  )}
                </button>

                <button
                  onClick={handleReset}
                  disabled={loading}
                  className="btn-outline-secondary"
                >
                  Change Registration No.
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="step-content step-success-animated">
              <div className="success-icon-wrapper">
                <div className="pulse-ring"></div>
                <div className="pulse-ring delay"></div>
                <div className="success-checkmark-circle">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
              </div>

              <h2 className="success-heading">Presence Recorded!</h2>
              <p className="success-subtext">Your attendance has been successfully logged to the database.</p>

              <div className="pass-ticket">
                <div className="pass-header">
                  <span className="pass-title">DIGITAL ATTENDANCE PASS</span>
                  <span className="pass-badge">CONFIRMED</span>
                </div>

                <div className="pass-body">
                  <div className="pass-row">
                    <span className="pass-label">Student Name</span>
                    <span className="pass-val">{student?.name}</span>
                  </div>
                  <div className="pass-row">
                    <span className="pass-label">Registration</span>
                    <span className="pass-val font-mono">{student?.regno}</span>
                  </div>
                  {student?.teamname && (
                    <div className="pass-row">
                      <span className="pass-label">Team</span>
                      <span className="pass-val">{student.teamname}</span>
                    </div>
                  )}
                  <div className="pass-row">
                    <span className="pass-label">Time Logged</span>
                    <span className="pass-val">{timestamp || 'Just now'}</span>
                  </div>
                </div>

                <div className="pass-footer">
                  <button onClick={copyTicketDetails} className="copy-ticket-btn">
                    {copied ? '✓ Copied Pass Info!' : '📋 Copy Pass Details'}
                  </button>
                </div>
              </div>

              <button onClick={handleReset} className="btn-glow-primary margin-top-lg">
                Mark Another Student
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="step-content step-error-animated">
              <div className="error-icon-circle">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              </div>

              <h2 className="error-heading">Verification Failed</h2>
              <div className="error-box">
                <p className="error-message">{error}</p>
              </div>

              <p className="error-help">
                Please verify your registration number format or check with the event coordinator if your details are missing.
              </p>

              <button onClick={handleReset} className="btn-glow-primary margin-top-md">
                Try Again
              </button>
            </div>
          )}
        </main>

        <footer className="presencex-footer">
          <p>© {new Date().getFullYear()} PresenceX • Instant Attendance Verification</p>
        </footer>
      </div>
    </div>
  );
}
