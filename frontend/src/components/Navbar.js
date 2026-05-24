// ------------------------------------------------------------
// Navbar.js
// ------------------------------------------------------------
// SocioDeal Navigation Bar
//
// Purpose:
// - Shows navigation links based on logged-in role.
// - During forced password change, hides all navigation except brand/logout.
// ------------------------------------------------------------

import { Link, useNavigate } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  let user = null;

  try {
    user = JSON.parse(localStorage.getItem('user'));
  } catch (error) {
    console.error('Invalid user object in localStorage:', error);
    user = null;
  }

  const role = user?.role ? user.role.trim().toLowerCase() : '';

  const isLoggedIn = Boolean(token && user);
  const isSocietyAdmin = role === 'society_admin';
  const isPlatformAdmin = role === 'platform_admin';
  const isBuyer = role === 'buyer';
  const isTenant = role === 'tenant';
  const isGuest = !isLoggedIn;

  const mustChangePassword = user?.force_password_change === true;

  const canViewPublicProperties =
    !mustChangePassword && (isGuest || isBuyer || isTenant);

  const canViewMyInquiries =
    !mustChangePassword && isLoggedIn && (isBuyer || isTenant);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const getHomeRoute = () => {
    if (mustChangePassword) return '/change-password';
    if (isPlatformAdmin) return '/platform-dashboard';
    if (isSocietyAdmin) return '/dashboard';
    return '/properties';
  };

  return (
    <div
      style={{
        background: '#111827',
        color: '#fff',
        padding: '14px 28px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '18px',
          flexWrap: 'wrap'
        }}
      >
        <Link
          to={getHomeRoute()}
          style={{
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '20px',
            textDecoration: 'none'
          }}
        >
          SocioDeal
        </Link>

        {mustChangePassword && isLoggedIn && (
          <span style={styles.noticeText}>
            Password change required
          </span>
        )}

        {canViewPublicProperties && (
          <Link to="/properties" style={styles.navLink}>
            Properties
          </Link>
        )}

        {canViewMyInquiries && (
          <Link to="/my-inquiries" style={styles.navLink}>
            My Inquiries
          </Link>
        )}

        {!mustChangePassword && isSocietyAdmin && (
          <>
            <Link to="/dashboard" style={styles.navLink}>
              Dashboard
            </Link>

            <Link to="/my-properties" style={styles.navLink}>
              My Properties
            </Link>

            <Link to="/add-property" style={styles.navLink}>
              Add Property
            </Link>

            <Link to="/inquiries" style={styles.navLink}>
              Inquiries
            </Link>

            <Link to="/reminders" style={styles.navLink}>
              Reminders
            </Link>
          </>
        )}

        {!mustChangePassword && isPlatformAdmin && (
          <>
            <Link to="/platform-dashboard" style={styles.navLink}>
              Platform Dashboard
            </Link>

            <Link to="/societies" style={styles.navLink}>
              Societies
            </Link>

            <Link to="/society-onboarding" style={styles.navLink}>
              Onboard Society
            </Link>
          </>
        )}

        {!isLoggedIn && (
          <Link to="/login" style={styles.navLink}>
            Login
          </Link>
        )}
      </div>

      <div>
        {isLoggedIn ? (
          <>
            <span style={{ marginRight: '12px', color: '#d1d5db' }}>
              {user.full_name || user.email} ({role})
            </span>

            <button className="btn btn-danger" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <span style={{ color: '#d1d5db' }}>Guest</span>
        )}
      </div>
    </div>
  );
}

const styles = {
  navLink: {
    color: '#d1d5db',
    textDecoration: 'none'
  },

  noticeText: {
    color: '#fde68a',
    fontWeight: '800'
  }
};