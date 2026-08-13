import { useState } from 'react';
import './AdminLogin.css';

const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || 'admin123';

export default function AdminLogin({ onLogin }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!key.trim()) {
      setError('Please enter the admin key');
      return;
    }

    setLoading(true);
    setError('');

    // Validate key
    setTimeout(() => {
      if (key === ADMIN_KEY) {
        onLogin(key);
      } else {
        setError('Invalid admin key');
      }
      setLoading(false);
    }, 300);
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-card">
        <h1>Admin Dashboard</h1>
        <p className="subtitle">Enter the admin key to continue</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <input
              type="password"
              placeholder="Enter Admin Key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={loading}
              className="input-field"
              autoFocus
            />
          </div>

          {error && <p className="error-message">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Verifying...' : 'Access Dashboard'}
          </button>
        </form>

        <button
          onClick={() => window.history.back()}
          className="btn btn-secondary"
        >
          Back
        </button>
      </div>
    </div>
  );
}
