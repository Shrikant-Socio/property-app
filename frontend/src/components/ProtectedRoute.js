// ------------------------------------------------------------
// ProtectedRoute.js
// ------------------------------------------------------------
// SocioDeal Route Guard
//
// Purpose:
// - Prevent unauthenticated access.
// - Enforce role-based access.
// - Enforce force_password_change security rule.
//
// Important:
// If user.force_password_change = true,
// user can access ONLY /change-password.
// ------------------------------------------------------------

import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children, role }) {
  const location = useLocation();

  const token = localStorage.getItem('token');

  let user = null;

  try {
    user = JSON.parse(localStorage.getItem('user'));
  } catch {
    user = null;
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  const currentPath = location.pathname;

  if (
    user.force_password_change === true &&
    currentPath !== '/change-password'
  ) {
    return <Navigate to="/change-password" replace />;
  }

  if (role && user?.role !== role) {
    return <Navigate to="/properties" replace />;
  }

  return children;
}