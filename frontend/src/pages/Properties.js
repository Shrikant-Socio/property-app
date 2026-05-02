// ------------------------------------------------------------
// Properties.js
// ------------------------------------------------------------
// Shows property listing.
// Rules:
// - platform_admin: cannot view marketplace; only onboarding.
// - society_admin: sees only own society properties via /my-properties.
// - buyer/guest: sees public properties via /properties.
// ------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function Properties() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  // Read logged-in user info once
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    fetchProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProperties = async () => {
    try {
      // Platform admin should not load property marketplace
      if (user?.role === 'platform_admin') {
        setProperties([]);
        return;
      }

      let res;

      if (token && user?.role === 'society_admin') {
        // Society admin sees only own society/admin properties
        res = await api.get('/my-properties', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      } else {
        // Buyer/guest sees public properties
        res = await api.get('/properties');
      }

      if (Array.isArray(res.data)) {
        setProperties(res.data);
      } else if (res.data && Array.isArray(res.data.data)) {
        setProperties(res.data.data);
      } else {
        setProperties([]);
      }
    } catch (error) {
      console.error('Error fetching properties:', error);
      setProperties([]);
    } finally {
      setLoading(false);
    }
  };

  if (user?.role === 'platform_admin') {
    return (
      <div className="page-container">
        <div className="card">
          <h2>Platform Admin Access</h2>
          <p>
            Platform admin is only allowed to onboard societies and create society admins.
          </p>
          <p>
            Please use the <b>Society Onboarding</b> menu.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <p className="page-container">Loading properties...</p>;
  }

  return (
    <div className="page-container">
      <h2>🏠 Properties</h2>

      {user?.role === 'society_admin' ? (
        <p className="muted">Showing properties from your society only.</p>
      ) : (
        <p className="muted">Browse available society-managed properties.</p>
      )}

      {properties.length === 0 ? (
        <p>No properties found</p>
      ) : (
        <div className="property-grid">
          {properties.map((property) => (
            <div key={property.prop_id} className="card">
              <h3>{property.so_name}</h3>
              <p><b>Location:</b> {property.so_location}</p>
              <p><b>Config:</b> {property.c_type}</p>
              <p><b>Type:</b> {property.a_type}</p>
              <p><b>Furnishing:</b> {property.f_type}</p>
              <p><b>Price:</b> ₹{property.price}</p>

              <Link to={`/properties/${property.prop_id}`}>
                <button className="btn btn-primary">
                  View Details
                </button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}