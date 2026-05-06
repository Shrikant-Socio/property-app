// ------------------------------------------------------------
// Navbar.js
// ------------------------------------------------------------
// SocioDeal Navigation Bar
//
// Purpose:
// - Show navigation links based on logged-in user role.
// - Keep buyer/guest, society_admin, and platform_admin flows separate.
//
// Buyer / Guest:
// - Properties
// - My Inquiries only for logged-in buyer/tenant
//
// Society Admin:
// - My Properties
// - Add Property
// - Inquiries
//
// Platform Admin:
// - Societies
// - Onboard Society
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

  // Public marketplace should be visible only to guest / buyer / tenant
  const canViewPublicProperties = isGuest || isBuyer || isTenant;

  // Buyer inquiry tracking should be visible only to buyer / tenant
  const canViewMyInquiries = isLoggedIn && (isBuyer || isTenant);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const getHomeRoute = () => {
    if (isPlatformAdmin) return '/societies';
    if (isSocietyAdmin) return '/my-properties';
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

        {canViewPublicProperties && (
          <Link
            to="/properties"
            style={{ color: '#d1d5db', textDecoration: 'none' }}
          >
            Properties
          </Link>
        )}

        {canViewMyInquiries && (
          <Link
            to="/my-inquiries"
            style={{ color: '#d1d5db', textDecoration: 'none' }}
          >
            My Inquiries
          </Link>
        )}

        {isSocietyAdmin && (
          <>
            <Link to="/my-properties" style={{ color: '#d1d5db', textDecoration: 'none' }}>
              My Properties
            </Link>

            <Link to="/add-property" style={{ color: '#d1d5db', textDecoration: 'none' }}>
              Add Property
            </Link>

            <Link to="/inquiries" style={{ color: '#d1d5db', textDecoration: 'none' }}>
              Inquiries
            </Link>
          </>
        )}

        {isPlatformAdmin && (
          <>
            <Link to="/societies" style={{ color: '#d1d5db', textDecoration: 'none' }}>
              Societies
            </Link>

            <Link to="/society-onboarding" style={{ color: '#d1d5db', textDecoration: 'none' }}>
              Onboard Society
            </Link>
          </>
        )}

        {!isLoggedIn && (
          <Link to="/login" style={{ color: '#d1d5db', textDecoration: 'none' }}>
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