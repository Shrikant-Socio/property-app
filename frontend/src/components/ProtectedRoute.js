// Import Navigate for redirection
import { Navigate } from 'react-router-dom';

/*
  ProtectedRoute component

  Purpose:
  - Prevent unauthorized access to certain pages
  - Allow only logged-in users
  - Optionally restrict by role (e.g., society_admin)

  Usage:
  <ProtectedRoute role="society_admin">
      <AddProperty />
  </ProtectedRoute>
*/
export default function ProtectedRoute({ children, role }) {

  // Get token from localStorage
  const token = localStorage.getItem('token');

  // Get user object (contains role, name, etc.)
  const user = JSON.parse(localStorage.getItem('user'));

  // 🔒 If user is NOT logged in → redirect to login page
  if (!token) {
    return <Navigate to="/login" />;
  }

  // 🔒 If role is required AND user role doesn't match → redirect
  if (role && user?.role !== role) {
    return <Navigate to="/properties" />;
  }

  // ✅ If everything is valid → render the requested page
  return children;
}