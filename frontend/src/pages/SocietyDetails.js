// ------------------------------------------------------------
// SocietyDetails.js
// ------------------------------------------------------------
// Platform Admin - Society Dashboard Page
//
// Features:
// 1. View society master details
// 2. View summary stats (properties, inquiries, admins)
// 3. View recent inquiries
// 4. Manage society admin:
//    - Update name/email/phone
//    - Reset password
// ------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';

export default function SocietyDetails() {

  // ----------------------------------------------------------
  // Get society ID from URL
  // ----------------------------------------------------------
  const { id } = useParams();

  // Token for API calls
  const token = localStorage.getItem('token');

  // ----------------------------------------------------------
  // State Variables
  // ----------------------------------------------------------
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Society Admin Management state
  const [admin, setAdmin] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  // ----------------------------------------------------------
  // Load data on page load
  // ----------------------------------------------------------
  useEffect(() => {
    fetchSummary();
    fetchAdmin();
  }, [id]);

  // ----------------------------------------------------------
  // Fetch Society Summary
  // API: GET /societies/:id/summary
  // ----------------------------------------------------------
  const fetchSummary = async () => {
    try {
      const res = await api.get(`/societies/${id}/summary`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setSummary(res.data);

    } catch (error) {
      console.error('Error fetching summary:', error);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------------
  // Fetch Society Admin Details
  // API: GET /societies/:id/admin
  // ----------------------------------------------------------
  const fetchAdmin = async () => {
    try {
      const res = await api.get(`/societies/${id}/admin`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setAdmin(res.data);

    } catch (error) {
      console.error('Error fetching admin:', error);
      setAdmin(null);
    }
  };

  // ----------------------------------------------------------
  // Update Admin Details
  // API: PUT /societies/:id/admin
  // ----------------------------------------------------------
  const updateAdmin = async () => {
    try {
      await api.put(`/societies/${id}/admin`, admin, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      alert('Admin updated successfully ✅');

    } catch (error) {
      console.error('Update admin error:', error);
      alert(error.response?.data?.message || 'Update failed');
    }
  };

  // ----------------------------------------------------------
  // Reset Admin Password
  // API: PUT /societies/:id/admin/reset-password
  // ----------------------------------------------------------
  const resetPassword = async () => {
    if (!newPassword) {
      alert('Please enter new password');
      return;
    }

    try {
      await api.put(
        `/societies/${id}/admin/reset-password`,
        { new_password: newPassword },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      alert('Password reset successfully ✅');
      setNewPassword('');

    } catch (error) {
      console.error('Reset password error:', error);
      alert(error.response?.data?.message || 'Reset failed');
    }
  };

  // ----------------------------------------------------------
  // Loading UI
  // ----------------------------------------------------------
  if (loading) {
    return <p className="page-container">Loading society dashboard...</p>;
  }

  // ----------------------------------------------------------
  // If no data found
  // ----------------------------------------------------------
  if (!summary) {
    return (
      <div className="page-container">
        <div className="card">
          <h2>Society not found</h2>
          <Link to="/societies">Back to Societies</Link>
        </div>
      </div>
    );
  }

  // Extract data
  const { society, stats, recent_inquiries } = summary;

  // ----------------------------------------------------------
  // Main UI
  // ----------------------------------------------------------
  return (
    <div className="page-container">

      {/* Back Navigation */}
      <Link to="/societies">⬅ Back to Societies</Link>

      {/* ------------------------------------------------------
          Society Basic Details
      ------------------------------------------------------ */}
      <div className="card" style={{ marginTop: '16px' }}>
        <h2>{society.society_name}</h2>

        <p><b>Society Code:</b> {society.society_code}</p>
        <p><b>Address:</b> {society.address || 'N/A'}</p>
        <p><b>City:</b> {society.city || 'N/A'}</p>
        <p><b>Pincode:</b> {society.pincode || 'N/A'}</p>
        <p><b>Status:</b> {society.status}</p>

        <Link to={`/edit-society/${society.society_id}`}>
          <button className="btn btn-secondary">
            Edit Society
          </button>
        </Link>
      </div>

      {/* ------------------------------------------------------
          Summary Stats
      ------------------------------------------------------ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '12px',
          marginTop: '16px'
        }}
      >
        <div className="card">
          <h3>{stats.total_properties}</h3>
          <p className="muted">Total Properties</p>
        </div>

        <div className="card">
          <h3>{stats.total_inquiries}</h3>
          <p className="muted">Total Inquiries</p>
        </div>

        <div className="card">
          <h3>{stats.total_admins}</h3>
          <p className="muted">Society Admins</p>
        </div>
      </div>

      {/* ------------------------------------------------------
          Recent Inquiries
      ------------------------------------------------------ */}
      <div className="card" style={{ marginTop: '16px' }}>
        <h3>Recent Inquiries</h3>

        {recent_inquiries.length === 0 ? (
          <p>No recent inquiries found.</p>
        ) : (
          recent_inquiries.map((inq) => (
            <div
              key={inq.inquiry_id}
              style={{
                borderBottom: '1px solid #e5e7eb',
                padding: '10px 0'
              }}
            >
              <p><b>Property:</b> {inq.so_name || 'N/A'}</p>
              <p><b>Buyer:</b> {inq.name || 'N/A'} | {inq.phone || 'N/A'}</p>
              <p><b>Status:</b> {inq.status}</p>
              <p className="muted">
                {inq.created_at
                  ? new Date(inq.created_at).toLocaleString()
                  : ''}
              </p>
            </div>
          ))
        )}
      </div>

      {/* ------------------------------------------------------
          Society Admin Management
      ------------------------------------------------------ */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3>👤 Society Admin Management</h3>

        {admin ? (
          <>
            {/* Admin Details */}
            <label>Admin Name</label>
            <input
              className="input"
              value={admin.full_name}
              onChange={(e) =>
                setAdmin({ ...admin, full_name: e.target.value })
              }
            />

            <label>Admin Email</label>
            <input
              className="input"
              value={admin.email}
              onChange={(e) =>
                setAdmin({ ...admin, email: e.target.value })
              }
            />

            <label>Admin Phone</label>
            <input
              className="input"
              value={admin.phone || ''}
              onChange={(e) =>
                setAdmin({ ...admin, phone: e.target.value })
              }
            />

            <button
              className="btn btn-primary"
              onClick={updateAdmin}
              style={{ marginTop: '10px' }}
            >
              Update Admin
            </button>

            {/* Password Reset Section */}
            <hr style={{ margin: '20px 0' }} />

            <h4>🔐 Reset Admin Password</h4>

            <label>New Password</label>
            <input
              className="input"
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <button
              className="btn btn-danger"
              onClick={resetPassword}
              style={{ marginTop: '10px' }}
            >
              Reset Password
            </button>
          </>
        ) : (
          <p>No admin found for this society.</p>
        )}
      </div>

    </div>
  );
}