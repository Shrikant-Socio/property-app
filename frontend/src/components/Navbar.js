// Navigation bar shown on all pages

import { Link, useNavigate } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
        <Link
          to={user?.role === 'platform_admin' ? '/societies' : '/properties'}
          style={{ color: '#fff', fontWeight: 'bold', fontSize: '20px' }}
        >
          SocioDeal
        </Link>

        {user?.role !== 'platform_admin' && (
          <Link to="/properties" style={{ color: '#d1d5db' }}>
            Properties
          </Link>
        )}

        {user?.role === 'society_admin' && (
          <>
            <Link to="/my-properties" style={{ color: '#d1d5db' }}>My Properties</Link>
            <Link to="/add-property" style={{ color: '#d1d5db' }}>Add Property</Link>
            <Link to="/inquiries" style={{ color: '#d1d5db' }}>Inquiries</Link>
          </>
        )}

        {/* Platform admin tabs */}
        {user?.role === 'platform_admin' && (
          <>
            <Link to="/societies" style={{ color: '#d1d5db' }}>
              Societies
            </Link>

            <Link to="/society-onboarding" style={{ color: '#d1d5db' }}>
              Onboard Society
            </Link>
          </>
        )}

        {!token && (
          <Link to="/login" style={{ color: '#d1d5db' }}>
            Login
          </Link>
        )}
      </div>

      <div>
        {token && user ? (
          <>
            <span style={{ marginRight: '12px', color: '#d1d5db' }}>
              {user.full_name} ({user.role})
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