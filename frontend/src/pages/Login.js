// Login page for all users: platform_admin, society_admin, buyer, tenant
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

export default function Login() {
  const navigate = useNavigate();

  // Form state for email/password
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  // Message shown to user after login attempt
  const [message, setMessage] = useState('');

  // Update form fields when user types
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Submit login request to backend
  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const res = await api.post('/login', formData);

      // Store token and user info in browser
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));

      setMessage('Login successful ✅');

      // Redirect by role
      if (res.data.user.role === 'platform_admin') {
        navigate('/society-onboarding');
      } else if (res.data.user.role === 'society_admin') {
        navigate('/my-properties');
      } else {
        navigate('/properties');
      }

    } catch (error) {
      console.error('Login error:', error);
      setMessage(error.response?.data?.message || 'Login failed');
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

          <button className="btn btn-primary" type="submit">
            Login
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