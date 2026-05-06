// ------------------------------------------------------------
// Register.js
// ------------------------------------------------------------
// SocioDeal - Public User Registration Page
//
// Important business decision:
// - Public users should NOT choose buyer/tenant.
// - One public user account can browse SALE and RENT properties.
// - Frontend silently sends role = "buyer".
// - society_admin/platform_admin registration must NOT be public.
// ------------------------------------------------------------

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Register() {
  const navigate = useNavigate();

  // ------------------------------------------------------------
  // Form state
  // Backend expects:
  // full_name, email, phone, password, role
  // ------------------------------------------------------------
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ------------------------------------------------------------
  // Update form fields
  // ------------------------------------------------------------
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });

    setMessage('');
    setMessageType('');
  };

  // ------------------------------------------------------------
  // Basic frontend validation
  // ------------------------------------------------------------
  const validateForm = () => {
    if (!formData.full_name.trim()) {
      return 'Please enter your full name.';
    }

    if (!formData.phone.trim()) {
      return 'Please enter your mobile number.';
    }

    if (!/^[6-9]\d{9}$/.test(formData.phone.trim())) {
      return 'Please enter a valid 10-digit Indian mobile number.';
    }

    if (!formData.email.trim()) {
      return 'Please enter your email address.';
    }

    if (!formData.password) {
      return 'Please enter password.';
    }

    if (formData.password.length < 6) {
      return 'Password must be at least 6 characters.';
    }

    if (formData.password !== formData.confirmPassword) {
      return 'Password and Confirm Password do not match.';
    }

    return '';
  };

  // ------------------------------------------------------------
  // Register user
  // ------------------------------------------------------------
  const handleRegister = async (e) => {
    e.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setMessageType('error');
      setMessage(validationError);
      return;
    }

    try {
      setLoading(true);
      setMessage('');
      setMessageType('');

      await api.post('/register', {
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        password: formData.password,

        // Public registration always creates normal user account.
        // Do not expose society_admin/platform_admin from frontend.
        role: 'buyer'
      });

      setMessageType('success');
      setMessage('Registration successful. Please login to continue.');

      // Redirect to login after short delay so user can read success message.
      setTimeout(() => {
        navigate('/login');
      }, 1200);
    } catch (error) {
      console.error('Registration error:', error);

      setMessageType('error');
      setMessage(
        error.response?.data?.message ||
          'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="card" style={styles.card}>
        <h2 style={styles.title}>Create Account</h2>

        <p className="muted" style={styles.subtitle}>
          Register once and inquire for sale or rent properties.
        </p>

        <form onSubmit={handleRegister}>
          <label style={styles.label}>Full Name</label>
          <input
            className="input"
            type="text"
            name="full_name"
            value={formData.full_name}
            onChange={handleChange}
            placeholder="Enter your full name"
            required
          />

          <label style={styles.label}>Mobile Number</label>
          <input
            className="input"
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="Enter 10-digit mobile number"
            maxLength="10"
            required
          />

          <label style={styles.label}>Email</label>
          <input
            className="input"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Enter your email"
            required
          />

          <label style={styles.label}>Password</label>
          <div style={styles.passwordBox}>
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Create password"
              required
            />

            <button
              type="button"
              style={styles.showButton}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <label style={styles.label}>Confirm Password</label>
          <input
            className="input"
            type={showPassword ? 'text' : 'password'}
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            placeholder="Confirm password"
            required
          />

          <button
            className="btn btn-primary full-btn"
            type="submit"
            disabled={loading}
            style={styles.submitButton}
          >
            {loading ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        {message && (
          <div
            style={{
              ...styles.messageBox,
              ...(messageType === 'success'
                ? styles.successBox
                : styles.errorBox)
            }}
          >
            {message}
          </div>
        )}

        <p style={styles.footerText}>
          Already have an account? <Link to="/login">Login here</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  card: {
    maxWidth: '440px',
    margin: '0 auto'
  },

  title: {
    marginBottom: '6px'
  },

  subtitle: {
    marginBottom: '18px'
  },

  label: {
    display: 'block',
    fontWeight: '800',
    marginTop: '12px',
    marginBottom: '6px',
    color: '#111827'
  },

  passwordBox: {
    position: 'relative'
  },

  showButton: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    border: 'none',
    background: 'transparent',
    color: '#111827',
    fontWeight: '800',
    cursor: 'pointer'
  },

  submitButton: {
    marginTop: '18px'
  },

  messageBox: {
    marginTop: '14px',
    padding: '12px',
    borderRadius: '12px',
    fontWeight: '700'
  },

  successBox: {
    background: '#dcfce7',
    color: '#166534',
    border: '1px solid #bbf7d0'
  },

  errorBox: {
    background: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #fecaca'
  },

  footerText: {
    marginTop: '18px',
    textAlign: 'center'
  }
};