// ------------------------------------------------------------
// ChangePassword.js
// ------------------------------------------------------------
// SocioDeal - Forced / Self Password Change Page
//
// Purpose:
// - Used when backend returns user.force_password_change = true.
// - User must change password before accessing protected modules.
// - Calls POST /change-password with JWT token.
// ------------------------------------------------------------

 import { useState } from 'react';
 import { useNavigate } from 'react-router-dom';
 import api from '../services/api';

 export default function ChangePassword() {
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  let user = null;

  try {
    user = JSON.parse(localStorage.getItem('user'));
  } catch {
    user = null;
  }

  const [formData, setFormData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    next: false,
    confirm: false
  });

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const getRedirectPath = (role) => {
    if (role === 'society_admin') return '/dashboard';
    if (role === 'platform_admin') return '/platform-dashboard';
    return '/properties';
  };

  const handleChange = (e) => {
    setFormData((current) => ({
      ...current,
      [e.target.name]: e.target.value
    }));

    setMessage('');
    setMessageType('');
  };

  const validateForm = () => {
    if (!formData.current_password.trim()) {
      return 'Current password is required.';
    }

    if (!formData.new_password.trim()) {
      return 'New password is required.';
    }

    if (formData.new_password.length < 8) {
      return 'New password must be at least 8 characters long.';
    }

    if (!formData.confirm_password.trim()) {
      return 'Confirm password is required.';
    }

    if (formData.new_password !== formData.confirm_password) {
      return 'New password and confirm password do not match.';
    }

    if (formData.current_password === formData.new_password) {
      return 'New password must be different from current password.';
    }

    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setMessageType('error');
      setMessage(validationError);
      return;
    }

    if (!token || !user) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/login');
      return;
    }

    try {
      setSubmitting(true);
      setMessage('');
      setMessageType('');

      await api.post(
        '/change-password',
        {
          current_password: formData.current_password,
          new_password: formData.new_password,
          confirm_password: formData.confirm_password
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const updatedUser = {
        ...user,
        force_password_change: false
      };

      localStorage.setItem('user', JSON.stringify(updatedUser));

      setMessageType('success');
      setMessage('Password changed successfully.');

      navigate(getRedirectPath(updatedUser.role));
    } catch (error) {
      console.error('Change password error:', error);

      setMessageType('error');
      setMessage(
        error.response?.data?.message ||
          'Failed to change password. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const togglePassword = (key) => {
    setShowPasswords((current) => ({
      ...current,
      [key]: !current[key]
    }));
  };

  return (
    <div className="login-wrapper">
      <div className="card" style={styles.card}>
        <h2 style={styles.title}>🔐 Change Password</h2>

        <p className="muted" style={styles.subtitle}>
          For your account security, please change your temporary password before continuing.
        </p>

        <form onSubmit={handleSubmit}>
          <PasswordField
            label="Current Password"
            name="current_password"
            value={formData.current_password}
            show={showPasswords.current}
            onChange={handleChange}
            onToggle={() => togglePassword('current')}
          />

          <PasswordField
            label="New Password"
            name="new_password"
            value={formData.new_password}
            show={showPasswords.next}
            onChange={handleChange}
            onToggle={() => togglePassword('next')}
          />

          <PasswordField
            label="Confirm Password"
            name="confirm_password"
            value={formData.confirm_password}
            show={showPasswords.confirm}
            onChange={handleChange}
            onToggle={() => togglePassword('confirm')}
          />

          <button
            className="btn btn-primary full-btn"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Updating Password...' : 'Update Password'}
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
      </div>
    </div>
  );
}

function PasswordField({ label, name, value, show, onChange, onToggle }) {
  return (
    <div style={styles.fieldBlock}>
      <label style={styles.label}>{label}</label>

      <div style={styles.passwordWrap}>
        <input
          className="input"
          type={show ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          required
          style={styles.passwordInput}
        />

        <button
          type="button"
          onClick={onToggle}
          style={styles.toggleButton}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  card: {
    maxWidth: '460px',
    width: '100%',
    margin: '0 auto'
  },

  title: {
    marginBottom: '8px'
  },

  subtitle: {
    marginTop: 0,
    marginBottom: '18px'
  },

  fieldBlock: {
    marginBottom: '8px'
  },

  label: {
    fontWeight: '800',
    color: '#111827'
  },

  passwordWrap: {
    position: 'relative'
  },

  passwordInput: {
    paddingRight: '72px'
  },

  toggleButton: {
    position: 'absolute',
    right: '8px',
    top: '12px',
    border: 'none',
    background: '#f3f4f6',
    color: '#111827',
    padding: '6px 10px',
    borderRadius: '8px',
    fontWeight: '800',
    cursor: 'pointer'
  },

  messageBox: {
    marginTop: '14px',
    padding: '12px 14px',
    borderRadius: '12px',
    fontWeight: '800'
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
  }
};