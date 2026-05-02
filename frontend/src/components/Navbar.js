// ------------------------------------------------------------
// Navbar.js
// ------------------------------------------------------------
// SocioDeal Navigation Bar
//
// Purpose:
// - Show navigation links based on logged-in user role.
// - Keep buyer/guest, society_admin, and platform_admin flows separate.
//
// Expected visibility:
//
// Guest / Buyer:
// - Properties
// - Login / Logout
//
// Society Admin:
// - My Properties
// - Add Property
// - Inquiries
// - Logout
//
// Platform Admin:
// - Societies
// - Onboard Society
// - Logout
//
// Important rule:
// - society_admin should NOT see public "Properties" tab.
// - platform_admin should NOT see public "Properties" tab.
// ------------------------------------------------------------

import { Link, useNavigate } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();

  // ------------------------------------------------------------
  // Read login session from localStorage.
  // ------------------------------------------------------------
  const token = localStorage.getItem('token');

  let user = null;

  try {
    user = JSON.parse(localStorage.getItem('user'));
  } catch (error) {
    console.error('Invalid user object in localStorage:', error);
    user = null;
  }

  // ------------------------------------------------------------
  // Normalize role to avoid issues like:
  // "society_admin ", " Society_Admin", "SOCIETY_ADMIN"
  // ------------------------------------------------------------
  const role = user?.role ? user.role.trim().toLowerCase() : '';

  const isLoggedIn = Boolean(token && user);
  const isSocietyAdmin = role === 'society_admin';
  const isPlatformAdmin = role === 'platform_admin';
  const isBuyer = role === 'buyer';

  // Guest means no valid logged-in user
  const isGuest = !isLoggedIn;

  // Public properties should be visible only to guest or buyer
  const canViewPublicProperties = isGuest || isBuyer;

  // ------------------------------------------------------------
  // Logout user and clear local session
  // ------------------------------------------------------------
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    // Send user to login after logout
    navigate('/login');
  };

  // ------------------------------------------------------------
  // Decide logo click destination based on role
  // ------------------------------------------------------------
  const getHomeRoute = () => {
    if (isPlatformAdmin) return '/societies';
    if (isSocietyAdmin) return '/my-properties';

    // Buyer / Guest home
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
        alignItems: 'center'
      }}
    >
      {/* --------------------------------------------------------
          Left side navigation
      -------------------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
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

        {/* ------------------------------------------------------
            Guest / Buyer public property marketplace

            This is now strictly hidden for:
            - society_admin
            - platform_admin
        ------------------------------------------------------ */}
        {canViewPublicProperties && (
          <Link
            to="/properties"
            style={{ color: '#d1d5db', textDecoration: 'none' }}
          >
            Properties
          </Link>
        )}

        {/* ------------------------------------------------------
            Society Admin menu
        ------------------------------------------------------ */}
        {isSocietyAdmin && (
          <>
            <Link
              to="/my-properties"
              style={{ color: '#d1d5db', textDecoration: 'none' }}
            >
              My Properties
            </Link>

            <Link
              to="/add-property"
              style={{ color: '#d1d5db', textDecoration: 'none' }}
            >
              Add Property
            </Link>

            <Link
              to="/inquiries"
              style={{ color: '#d1d5db', textDecoration: 'none' }}
            >
              Inquiries
            </Link>
          </>
        )}

        {/* ------------------------------------------------------
            Platform Admin menu
        ------------------------------------------------------ */}
        {isPlatformAdmin && (
          <>
            <Link
              to="/societies"
              style={{ color: '#d1d5db', textDecoration: 'none' }}
            >
              Societies
            </Link>

            <Link
              to="/society-onboarding"
              style={{ color: '#d1d5db', textDecoration: 'none' }}
            >
              Onboard Society
            </Link>
          </>
        )}

        {/* ------------------------------------------------------
            Guest login link
        ------------------------------------------------------ */}
        {!isLoggedIn && (
          <Link
            to="/login"
            style={{ color: '#d1d5db', textDecoration: 'none' }}
          >
            Login
          </Link>
        )}
      </div>

      {/* --------------------------------------------------------
          Right side user info
      -------------------------------------------------------- */}
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