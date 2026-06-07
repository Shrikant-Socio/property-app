// ------------------------------------------------------------
// Login.js
// ------------------------------------------------------------
// SocioDeal Login Page
//
// Purpose:
// - Handles login for platform_admin, society_admin, buyer, tenant.
// - Stores JWT token and user object.
// - If backend returns user.force_password_change = true,
//   redirects immediately to /change-password before any dashboard.
// - Adds Forgot Password link.
// ------------------------------------------------------------

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

export default function Login() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const getRedirectPath = (role) => {
    const normalizedRole = String(role || '').trim().toLowerCase();

    if (normalizedRole === 'platform_admin') return '/platform-dashboard';
    if (normalizedRole === 'society_admin') return '/dashboard';

    return '/properties';
  };

  const handleChange = (e) => {
    setFormData((current) => ({
      ...current,
      [e.target.name]: e.target.value
    }));

    setMessage('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      setSubmitting(true);
      setMessage('');

      const res = await api.post('/login', formData);

      const token = res.data?.token;
      const user = res.data?.user;

      if (!token || !user) {
        setMessage('Invalid login response received from server.');
        return;
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      const forcePasswordChange =
        user.force_password_change === true ||
        user.force_password_change === 'true';

      if (forcePasswordChange) {
        navigate('/change-password', { replace: true });
        return;
      }

      navigate(getRedirectPath(user.role), { replace: true });
    } catch (error) {
      console.error('Login error:', error);
      setMessage(error.response?.data?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="card" style={{ maxWidth: '420px', margin: '0 auto' }}>
        <h2>🔐 Login</h2>

        <form onSubmit={handleLogin}>
          <label>Email</label>
          <input
            className="input"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
          />

          <label>Password</label>
          <input
            className="input"
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
          />

          <div style={{ textAlign: 'right', marginTop: '-8px', marginBottom: '14px' }}>
            <Link
              to="/forgot-password"
              style={{
                fontSize: '14px',
                fontWeight: '800'
              }}
            >
              Forgot Password?
            </Link>
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {message && <p style={{ marginTop: '15px' }}>{message}</p>}

        <p style={{ marginTop: '20px' }}>
          Don’t have an account? <Link to="/register">Register here</Link>
        </p>
      </div>
    </div>
  );
}