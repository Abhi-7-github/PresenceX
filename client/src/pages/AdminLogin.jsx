import { useState } from 'react';
import { presenceAPI } from '../services/presenceAPI.js';
import './AdminLogin.css';

export default function AdminLogin({ onLogin }) {
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const cleanKey = key.trim();
    if (!cleanKey) {
      setError('Please enter the admin key');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Check environment variable first if provided
      const clientEnvKey = import.meta.env.VITE_ADMIN_KEY;
      if (clientEnvKey && clientEnvKey.trim() === cleanKey) {
        onLogin(cleanKey);
        return;
      }

      // Backend API validation
      const result = await presenceAPI.loginAdmin(cleanKey);
      if (result.success) {
        onLogin(cleanKey);
      } else {
        setError(result.message || 'Invalid admin authentication key');
      }
    } catch (err) {
      setError('Unable to connect to authentication server. Please check your connection.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToMain = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new Event('popstate'));
  };

  return (
    <div className="admin-login-page">
      {/* Background ambient light mesh */}
      <div className="glow-orb glow-orb-1" aria-hidden="true"></div>
      <div className="glow-orb glow-orb-2" aria-hidden="true"></div>

      <div className="admin-login-container">
        <div className="admin-login-card">
          <div className="admin-brand-header">
            <div className="brand-icon-wrapper">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h1 className="brand-title">Presence<span className="brand-highlight">X</span> Admin</h1>
          </div>

          <p className="subtitle">Enter your security key to access the management dashboard.</p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <label htmlFor="admin-key-input" className="input-label">Admin Security Key</label>
              <div className="input-wrapper">
                <span className="input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 2l-2 2m-2-2l2 2m7 0a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </span>
                <input
                  id="admin-key-input"
                  type={showKey ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  disabled={loading}
                  className="styled-input"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="toggle-key-btn"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? '🔒' : '👁️'}
                </button>
              </div>
            </div>

            {error && (
              <div className="error-alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="btn-glow-primary"
            >
              {loading ? (
                <span className="btn-flex">
                  <span className="spinner"></span>
                  Authenticating...
                </span>
              ) : (
                <span className="btn-flex">
                  Access Admin Dashboard
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleBackToMain}
              className="btn-outline-secondary"
            >
              ← Back to Student Check-in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

