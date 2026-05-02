// Import React Router components for navigation
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Import shared UI component (top navigation bar)
import Navbar from './components/Navbar';

// Import all pages/screens of your application
import Login from './pages/Login';
import Register from './pages/Register';
import Properties from './pages/Properties';
import PropertyDetails from './pages/PropertyDetails';
import Inquiries from './pages/Inquiries';
import AddProperty from './pages/AddProperty';
import MyProperties from './pages/MyProperties';
import EditProperty from './pages/EditProperty';
import SocietyOnboarding from './pages/SocietyOnboarding';
import Societies from './pages/Societies';
import EditSociety from './pages/EditSociety';
import SocietyDetails from './pages/SocietyDetails';
// Import route protection component
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    // BrowserRouter enables routing in the app
    <BrowserRouter>

      {/* Navbar will be visible on all pages */}
      <Navbar />

      {/* Define all application routes here */}
      <Routes>

        {/* Default route → Property listing */}
        <Route path="/" element={<Properties />} />

        {/* Explicit properties route (same as homepage) */}
        <Route path="/properties" element={<Properties />} />

        {/* Login page */}
        <Route path="/login" element={<Login />} />

        {/* Register page (optional if implemented) */}
        <Route path="/register" element={<Register />} />

        {/* Property details page (dynamic ID) */}
        <Route path="/properties/:id" element={<PropertyDetails />} />

        {/* 🔒 ADMIN PROTECTED ROUTES */}

        {/* Inquiries dashboard (only society_admin allowed) */}
        <Route
          path="/inquiries"
          element={
            <ProtectedRoute role="society_admin">
              <Inquiries />
            </ProtectedRoute>
          }
        />
<Route
  path="/societies/:id"
  element={
    <ProtectedRoute role="platform_admin">
      <SocietyDetails />
    </ProtectedRoute>
  }
/>
        {/* Add new property (admin only) */}
        <Route
          path="/add-property"
          element={
            <ProtectedRoute role="society_admin">
              <AddProperty />
            </ProtectedRoute>
          }
        />

        {/* View properties created by logged-in admin */}
        <Route
          path="/my-properties"
          element={
            <ProtectedRoute role="society_admin">
              <MyProperties />
            </ProtectedRoute>
          }
        />

        {/* Edit property (admin only) */}
        <Route
          path="/edit-property/:id"
          element={
            <ProtectedRoute role="society_admin">
              <EditProperty />
            </ProtectedRoute>
          }
        />
        <Route
  path="/society-onboarding"
  element={
    <ProtectedRoute role="platform_admin">
      <SocietyOnboarding />
    </ProtectedRoute>
  }
/>
<Route
  path="/societies"
  element={
    <ProtectedRoute role="platform_admin">
      <Societies />
    </ProtectedRoute>
  }
/>

<Route
  path="/society-onboarding"
  element={
    <ProtectedRoute role="platform_admin">
      <SocietyOnboarding />
    </ProtectedRoute>
  }
/>

<Route
  path="/edit-society/:id"
  element={
    <ProtectedRoute role="platform_admin">
      <EditSociety />
    </ProtectedRoute>
  }
/>

      </Routes>
    </BrowserRouter>
  );
}

export default App;