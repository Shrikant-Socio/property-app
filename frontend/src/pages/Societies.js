// ------------------------------------------------------------
// Societies.js
// ------------------------------------------------------------
// Platform Admin Page
//
// Purpose:
// 1. Display all onboarded societies
// 2. Allow platform admin to:
//    - View Society Dashboard
//    - Edit Society details
//    - Onboard new society
//
// Notes:
// - Only accessible to platform_admin role
// - Uses protected API: GET /societies
// ------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function Societies() {
  // -------------------------------
  // State Variables
  // -------------------------------

  // Stores list of societies fetched from backend
  const [societies, setSocieties] = useState([]);

  // Controls loading UI while API is fetching data
  const [loading, setLoading] = useState(true);

  // JWT token required for authenticated API calls
  const token = localStorage.getItem('token');

  // -------------------------------
  // Load societies on page load
  // -------------------------------
  useEffect(() => {
    fetchSocieties();
  }, []);

  // -------------------------------
  // Fetch societies from backend
  // API: GET /societies
  // -------------------------------
  const fetchSocieties = async () => {
    try {
      const res = await api.get('/societies', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setSocieties(res.data);
    } catch (error) {
      console.error('Error fetching societies:', error);
      setSocieties([]);
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------
  // Loading state UI
  // -------------------------------
  if (loading) {
    return <p className="page-container">Loading societies...</p>;
  }

  // -------------------------------
  // Main UI
  // -------------------------------
  return (
    <div className="page-container">
      <h2>🏢 Onboarded Societies</h2>

      <p className="muted">
        View and manage all societies onboarded on the platform.
      </p>

      {/* -------------------------------
          Onboard New Society Button
      -------------------------------- */}
      <div style={{ marginBottom: '16px' }}>
        <Link to="/society-onboarding">
          <button className="btn btn-primary">
            + Onboard New Society
          </button>
        </Link>
      </div>

      {/* -------------------------------
          No Data Case
      -------------------------------- */}
      {societies.length === 0 ? (
        <p>No societies onboarded yet.</p>
      ) : (
        <div className="property-grid">

          {/* -------------------------------
              Loop through each society
          -------------------------------- */}
          {societies.map((society) => (
            <div key={society.society_id} className="card">

              {/* Society Basic Info */}
              <h3>{society.society_name}</h3>

              <p><b>Society Code:</b> {society.society_code}</p>
              <p><b>City:</b> {society.city || 'N/A'}</p>
              <p><b>Status:</b> {society.status}</p>

              {/* -------------------------------
                  Action Buttons
              -------------------------------- */}
              <div style={{ marginTop: '10px' }}>

                {/* View Dashboard Button */}
                <Link to={`/societies/${society.society_id}`}>
                  <button
                    className="btn btn-primary"
                    style={{ marginRight: '10px' }}
                  >
                    View Dashboard
                  </button>
                </Link>

                {/* Edit Society Button */}
                <Link to={`/edit-society/${society.society_id}`}>
                  <button className="btn btn-secondary">
                    Edit Society
                  </button>
                </Link>

              </div>

            </div>
          ))}

        </div>
      )}
    </div>
  );
}