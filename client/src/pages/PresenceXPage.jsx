import { useState } from 'react';
import { presenceAPI } from '../services/presenceAPI.js';
import './PresenceXPage.css';

export default function PresenceXPage() {
  const [step, setStep] = useState('input'); // input, verified, success, error
  const [registration, setRegistration] = useState('');
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();

    if (!registration.trim()) {
      setError('Please enter your registration number');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const result = await presenceAPI.verifyStudent(registration.trim());

      if (result.success) {
        setStudent(result.student);
        setStep('verified');
      } else {
        setError(result.message || 'Registration number not found');
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

  const handleMarkPresence = async () => {
    try {
      setLoading(true);
      setError('');

      const result = await presenceAPI.markPresence(student.regno);

      if (result.success) {
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
  };

  const navigateToAdmin = () => {
    window.history.pushState({}, '', '/hero/master');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="presencex-page">
      <div className="presencex-card">
        {step === 'input' && (
          <div className="step-input">
            <h1 className="title">PresenceX</h1>
            <p className="tagline">Mark your presence quickly and securely.</p>

            <form onSubmit={handleVerify} className="form">
              <div className="form-group">
                <input
                  type="text"
                  placeholder="Enter your Registration Number"
                  value={registration}
                  onChange={(e) => setRegistration(e.target.value)}
                  disabled={loading}
                  className="input-field"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            </form>

            <button onClick={navigateToAdmin} className="admin-link">
              Admin
            </button>
          </div>
        )}

        {step === 'verified' && (
          <div className="step-verified">
            <div className="success-icon">✓</div>
            <h2>Student Verified</h2>

            <div className="student-info">
              <div className="info-row">
                <span className="label">Name:</span>
                <span className="value">{student.name}</span>
              </div>
              {student.teamname && (
                <div className="info-row">
                  <span className="label">Team:</span>
                  <span className="value">{student.teamname}</span>
                </div>
              )}
              <div className="info-row">
                <span className="label">Registration Number:</span>
                <span className="value">{student.regno}</span>
              </div>
            </div>

            <button
              onClick={handleMarkPresence}
              disabled={loading}
              className="btn btn-present"
            >
              {loading ? 'Recording...' : "I'm Present"}
            </button>

            <button
              onClick={handleReset}
              disabled={loading}
              className="btn btn-secondary"
            >
              Back
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="step-success">
            <div className="success-icon">✓</div>
            <h2>Presence Recorded</h2>
            <p className="message">Your presence has been successfully recorded.</p>

            <button onClick={handleReset} className="btn btn-primary">
              Mark Another
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="step-error">
            <div className="error-icon">✕</div>
            <h2>Error</h2>
            <p className="message">{error}</p>

            <button onClick={handleReset} className="btn btn-primary">
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
