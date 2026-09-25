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
      setError('Please enter the admin security key');
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
    <div className="tara-login-page">
      <div className="tara-login-container">
        {/* Editorial Wordmark Header */}
        <div className="tara-brand-center">
          <span className="tara-wordmark">TARA</span>
          <span className="tara-brand-sub">OPERATIONS & ATTENDANCE PLATFORM</span>
        </div>

        {/* Solid Panel */}
        <div className="tara-login-panel">
          <div className="tara-panel-header">
            <h2 className="tara-panel-title">ADMIN ACCESS</h2>
            <p className="tara-panel-desc">Enter your administrative security key to access the control dashboard.</p>
          </div>

          <form onSubmit={handleSubmit} className="tara-login-form">
            <div className="tara-form-group">
              <label htmlFor="admin-key-input" className="tara-form-label">
                SECURITY KEY
              </label>
              <div className="tara-input-row">
                <input
                  id="admin-key-input"
                  type={showKey ? 'text' : 'password'}
                  placeholder="Enter administrator key..."
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  disabled={loading}
                  className="tara-solid-input"
                  autoFocus
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="tara-input-addon-btn"
                  title={showKey ? 'Hide key' : 'Show key'}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>

            {error && (
              <div className="tara-error-banner" role="alert">
                <span className="tara-error-tag">ERROR</span>
                <span className="tara-error-text">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="tara-btn-primary"
            >
              {loading ? 'AUTHENTICATING...' : 'ENTER DASHBOARD'}
            </button>

            <button
              type="button"
              onClick={handleBackToMain}
              className="tara-btn-secondary"
            >
              ← RETURN TO ATTENDANCE
            </button>
          </form>

          <div className="tara-panel-footer">
            <span>TARA &bull; SECURE ATTENDANCE INFRASTRUCTURE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
