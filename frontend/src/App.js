// Import React Router components for navigation
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Import shared UI component
import Navbar from './components/Navbar';

// Import pages
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
import ManagePropertyImages from './pages/ManagePropertyImages';
import MyInquiries from './pages/MyInquiries';

// Import route protection component
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        {/* Public buyer/guest routes */}
        <Route path="/" element={<Properties />} />
        <Route path="/properties" element={<Properties />} />
        <Route path="/properties/:id" element={<PropertyDetails />} />

        {/* Auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Buyer route */}
        <Route
          path="/my-inquiries"
          element={
            <ProtectedRoute role="buyer">
              <MyInquiries />
            </ProtectedRoute>
          }
        />

        {/* Society admin routes */}
        <Route
          path="/inquiries"
          element={
            <ProtectedRoute role="society_admin">
              <Inquiries />
            </ProtectedRoute>
          }
        />

        <Route
          path="/add-property"
          element={
            <ProtectedRoute role="society_admin">
              <AddProperty />
            </ProtectedRoute>
          }
        />

        <Route
          path="/my-properties"
          element={
            <ProtectedRoute role="society_admin">
              <MyProperties />
            </ProtectedRoute>
          }
        />

        <Route
          path="/edit-property/:id"
          element={
            <ProtectedRoute role="society_admin">
              <EditProperty />
            </ProtectedRoute>
          }
        />

        <Route
          path="/properties/:id/images/manage"
          element={
            <ProtectedRoute role="society_admin">
              <ManagePropertyImages />
            </ProtectedRoute>
          }
        />

        {/* Platform admin routes */}
        <Route
          path="/societies"
          element={
            <ProtectedRoute role="platform_admin">
              <Societies />
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