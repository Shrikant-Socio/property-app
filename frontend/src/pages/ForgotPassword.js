// ------------------------------------------------------------
// ForgotPassword.js
// ------------------------------------------------------------
// SocioDeal - Forgot Password / Reset Password Flow
//
// Purpose:
// - Allows platform_admin, society_admin, buyer, and tenant users
//   to reset their password using OTP verification.
// - Uses a safe 3-step flow inside one page.
//
// Backend APIs used:
// 1. POST /forgot-password/send-otp
// 2. POST /forgot-password/verify-otp
// 3. POST /forgot-password/reset
//
// Security notes:
// - We do not reveal whether account exists.
// - reset_token is kept only in React component state.
// - reset_token is cleared after successful reset.
// - User is redirected to /login after password reset.
// ------------------------------------------------------------

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function ForgotPassword() {
  const navigate = useNavigate();

  // step values:
  // 1 = enter email/mobile
  // 2 = verify OTP
  // 3 = reset password
  const [step, setStep] = useState(1);

  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');

  const [resetToken, setResetToken] = useState('');
  const [devOtp, setDevOtp] = useState('');

  const [passwordData, setPasswordData] = useState({
    new_password: '',
    confirm_password: ''
  });

  const [showPasswords, setShowPasswords] = useState({
    newPassword: false,
    confirmPassword: false
  });

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);

  // ------------------------------------------------------------
  // Helper: show message consistently
  // ------------------------------------------------------------
  const showMessage = (type, text) => {
    setMessageType(type);
    setMessage(text);
  };

  // ------------------------------------------------------------
  // Helper: validate email or 10-digit mobile
  // ------------------------------------------------------------
  const isValidIdentifier = (value) => {
    const cleaned = value.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const mobileRegex = /^[0-9]{10}$/;

    return emailRegex.test(cleaned) || mobileRegex.test(cleaned);
  };

  // ------------------------------------------------------------
  // Step 1: Send OTP
  // ------------------------------------------------------------
  const handleSendOtp = async (e) => {
    e.preventDefault();

    const cleanedIdentifier = identifier.trim();

    if (!cleanedIdentifier) {
      showMessage('error', 'Please enter your registered email or mobile number.');
      return;
    }

    if (!isValidIdentifier(cleanedIdentifier)) {
      showMessage('error', 'Enter a valid email address or 10-digit mobile number.');
      return;
    }

    try {
      setLoading(true);
      setMessage('');
      setMessageType('');
      setDevOtp('');

      const res = await api.post('/forgot-password/send-otp', {
        identifier: cleanedIdentifier
      });

      showMessage(
        'success',
        res.data?.message || 'If account exists, OTP has been sent.'
      );

      // Local development helper only.
      // Backend returns dev_otp only in local/dev environment.
      if (res.data?.dev_otp) {
        setDevOtp(res.data.dev_otp);
      }

      setStep(2);
    } catch (error) {
      console.error('Send reset OTP error:', error);

      showMessage(
        'error',
        error.response?.data?.message ||
          'Failed to send OTP. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // Step 2: Verify OTP
  // ------------------------------------------------------------
  const handleVerifyOtp = async (e) => {
    e.preventDefault();

    const cleanedOtp = otp.trim();

    if (!cleanedOtp) {
      showMessage('error', 'Please enter OTP.');
      return;
    }

    if (!/^[0-9]{6}$/.test(cleanedOtp)) {
      showMessage('error', 'OTP must be 6 digits.');
      return;
    }

    try {
      setLoading(true);
      setMessage('');
      setMessageType('');

      const res = await api.post('/forgot-password/verify-otp', {
        identifier: identifier.trim(),
        otp: cleanedOtp
      });

      if (!res.data?.reset_token) {
        showMessage('error', 'Reset token not received. Please try again.');
        return;
      }

      setResetToken(res.data.reset_token);

      showMessage(
        'success',
        res.data?.message || 'OTP verified successfully.'
      );

      setStep(3);
    } catch (error) {
      console.error('Verify reset OTP error:', error);

      showMessage(
        'error',
        error.response?.data?.message ||
          'Invalid OTP or OTP expired. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // Step 3: Reset Password
  // ------------------------------------------------------------
  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (!resetToken) {
      showMessage('error', 'Reset session expired. Please start again.');
      setStep(1);
      return;
    }

    if (!passwordData.new_password.trim()) {
      showMessage('error', 'New password is required.');
      return;
    }

    if (passwordData.new_password.length < 8) {
      showMessage('error', 'New password must be at least 8 characters long.');
      return;
    }

    if (!passwordData.confirm_password.trim()) {
      showMessage('error', 'Confirm password is required.');
      return;
    }

    if (passwordData.new_password !== passwordData.confirm_password) {
      showMessage('error', 'New password and confirm password do not match.');
      return;
    }

    try {
      setLoading(true);
      setMessage('');
      setMessageType('');

      const res = await api.post('/forgot-password/reset', {
        reset_token: resetToken,
        new_password: passwordData.new_password,
        confirm_password: passwordData.confirm_password
      });

      // Clear sensitive recovery state immediately after success.
      setResetToken('');
      setOtp('');
      setDevOtp('');
      setPasswordData({
        new_password: '',
        confirm_password: ''
      });

      showMessage(
        'success',
        res.data?.message || 'Password reset successfully. Please login.'
      );

      // Small delay so user can read success message.
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1200);
    } catch (error) {
      console.error('Reset password error:', error);

      showMessage(
        'error',
        error.response?.data?.message ||
          'Failed to reset password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = (e) => {
    setPasswordData((current) => ({
      ...current,
      [e.target.name]: e.target.value
    }));

    setMessage('');
    setMessageType('');
  };

  const togglePassword = (key) => {
    setShowPasswords((current) => ({
      ...current,
      [key]: !current[key]
    }));
  };

  const goBackStep = () => {
    setMessage('');
    setMessageType('');

    if (step === 2) {
      setOtp('');
      setStep(1);
    }

    if (step === 3) {
      setPasswordData({
        new_password: '',
        confirm_password: ''
      });
      setResetToken('');
      setStep(2);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="card" style={styles.card}>
        <h2 style={styles.title}>🔑 Forgot Password</h2>

        <p className="muted" style={styles.subtitle}>
          Reset your SocioDeal password using your registered email or mobile number.
        </p>

        <StepIndicator currentStep={step} />

        {step === 1 && (
          <form onSubmit={handleSendOtp}>
            <label style={styles.label}>Registered Email or Mobile</label>

            <input
              className="input"
              type="text"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setMessage('');
                setMessageType('');
              }}
              placeholder="example@test.com or 9999999999"
              required
            />

            <button
              className="btn btn-primary full-btn"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyOtp}>
            <div style={styles.identifierBox}>
              OTP sent for:
              <br />
              <strong>{identifier}</strong>
            </div>

            {devOtp && (
              <div style={styles.devOtpBox}>
                <strong>Local Dev OTP:</strong> {devOtp}
              </div>
            )}

            <label style={styles.label}>Enter OTP</label>

            <input
              className="input"
              type="text"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value);
                setMessage('');
                setMessageType('');
              }}
              placeholder="6-digit OTP"
              maxLength="6"
              required
            />

            <button
              className="btn btn-primary full-btn"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Verifying OTP...' : 'Verify OTP'}
            </button>

            <button
              type="button"
              style={styles.secondaryTextButton}
              onClick={goBackStep}
              disabled={loading}
            >
              Change email/mobile
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleResetPassword}>
            <PasswordField
              label="New Password"
              name="new_password"
              value={passwordData.new_password}
              show={showPasswords.newPassword}
              onChange={handlePasswordChange}
              onToggle={() => togglePassword('newPassword')}
            />

            <PasswordField
              label="Confirm Password"
              name="confirm_password"
              value={passwordData.confirm_password}
              show={showPasswords.confirmPassword}
              onChange={handlePasswordChange}
              onToggle={() => togglePassword('confirmPassword')}
            />

            <button
              className="btn btn-primary full-btn"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Resetting Password...' : 'Reset Password'}
            </button>

            <button
              type="button"
              style={styles.secondaryTextButton}
              onClick={goBackStep}
              disabled={loading}
            >
              Back to OTP
            </button>
          </form>
        )}

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

        <p style={styles.loginText}>
          Remember your password? <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}

function StepIndicator({ currentStep }) {
  const steps = [
    { number: 1, label: 'Account' },
    { number: 2, label: 'OTP' },
    { number: 3, label: 'Password' }
  ];

  return (
    <div style={styles.stepWrap}>
      {steps.map((step) => {
        const isActive = currentStep === step.number;
        const isCompleted = currentStep > step.number;

        return (
          <div key={step.number} style={styles.stepItem}>
            <div
              style={{
                ...styles.stepCircle,
                ...(isActive || isCompleted ? styles.stepCircleActive : {})
              }}
            >
              {isCompleted ? '✓' : step.number}
            </div>

            <span
              style={{
                ...styles.stepLabel,
                ...(isActive || isCompleted ? styles.stepLabelActive : {})
              }}
            >
              {step.label}
            </span>
          </div>
        );
      })}
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
    maxWidth: '480px',
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

  label: {
    fontWeight: '800',
    color: '#111827'
  },

  fieldBlock: {
    marginBottom: '8px'
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

  stepWrap: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginBottom: '18px'
  },

  stepItem: {
    textAlign: 'center'
  },

  stepCircle: {
    width: '30px',
    height: '30px',
    borderRadius: '999px',
    background: '#e5e7eb',
    color: '#6b7280',
    margin: '0 auto 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '900',
    fontSize: '13px'
  },

  stepCircleActive: {
    background: '#2563eb',
    color: '#ffffff'
  },

  stepLabel: {
    fontSize: '12px',
    color: '#9ca3af',
    fontWeight: '800'
  },

  stepLabelActive: {
    color: '#111827'
  },

  identifierBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '12px',
    marginBottom: '14px',
    color: '#374151',
    lineHeight: '1.5'
  },

  devOtpBox: {
    background: '#fefce8',
    border: '1px solid #fef08a',
    color: '#854d0e',
    borderRadius: '12px',
    padding: '10px 12px',
    marginBottom: '14px',
    fontWeight: '800'
  },

  secondaryTextButton: {
    border: 'none',
    background: 'transparent',
    color: '#2563eb',
    fontWeight: '800',
    cursor: 'pointer',
    marginTop: '12px',
    width: '100%'
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
  },

  loginText: {
    marginTop: '20px',
    textAlign: 'center'
  }
};