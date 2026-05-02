// ------------------------------------------------------------
// Properties.js
// ------------------------------------------------------------
// SocioDeal - Property Listing Page
//
// Purpose:
// - Guest / buyer can view all AVAILABLE society-managed properties
// - Society admin can view own society properties only
// - Platform admin cannot access marketplace listing
//
// Important:
// - This page now displays NEW property fields
// - Old compatibility fields like price, a_type, so_name, so_location
//   are used only as fallback, not primary display fields
// - Wing / Flat No is intentionally hidden from buyer/guest listing
// ------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function Properties() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    fetchProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------
  // Format currency in Indian number format
  // ------------------------------------------------------------
  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return 'N/A';
    return `₹${Number(value).toLocaleString('en-IN')}`;
  };

  // ------------------------------------------------------------
  // Get display price based on SALE / RENT
  // ------------------------------------------------------------
  const getDisplayPrice = (property) => {
    const requestType = property.request_type || property.a_type || 'SALE';

    if (requestType === 'RENT') {
      return formatCurrency(property.expected_rent);
    }

    return formatCurrency(property.expected_price || property.price);
  };

  // ------------------------------------------------------------
  // Fetch properties based on logged-in role
  // ------------------------------------------------------------
  const fetchProperties = async () => {
    try {
      setLoading(true);

      // Platform admin should not view property marketplace
      if (user?.role === 'platform_admin') {
        setProperties([]);
        return;
      }

      let res;

      if (token && user?.role === 'society_admin') {
        // Society admin sees only own society properties
        res = await api.get('/my-properties', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      } else {
        // Guest / buyer sees all public available properties
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

  // ------------------------------------------------------------
  // Platform admin restricted message
  // ------------------------------------------------------------
  if (user?.role === 'platform_admin') {
    return (
      <div className="page-container">
        <div className="card">
          <h2>Platform Admin Access</h2>
          <p>
            Platform admin is only allowed to onboard societies and create
            society admins.
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
          {properties.map((property) => {
            const requestType = property.request_type || property.a_type || 'SALE';

            return (
              <div key={property.prop_id} className="card">
                <h3>
                  {property.c_type || 'Property'}{' '}
                  {requestType === 'RENT' ? 'for Rent' : 'for Sale'}
                </h3>

                <p>
                  <b>Society:</b>{' '}
                  {property.society_name || property.so_name || 'N/A'}
                </p>

                <p>
                  <b>Location:</b>{' '}
                  {property.society_address || property.so_location || 'N/A'}
                </p>

                <p>
                  <b>Configuration:</b> {property.c_type || 'N/A'}
                </p>

                <p>
                  <b>Type:</b> {requestType}
                </p>

                <p>
                  <b>Furnishing:</b> {property.f_type || 'N/A'}
                </p>

                <p>
                  <b>Carpet Area:</b>{' '}
                  {property.carpet_area_sqft
                    ? `${property.carpet_area_sqft} Sq.Ft`
                    : 'N/A'}
                </p>

                <p>
                  <b>Parking:</b>{' '}
                  {property.parking_type
                    ? `${property.parking_type} (${property.parking_count || 0})`
                    : 'N/A'}
                </p>

                <p>
                  <b>
                    {requestType === 'RENT'
                      ? 'Expected Rent'
                      : 'Expected Price'}
                    :
                  </b>{' '}
                  {getDisplayPrice(property)}
                </p>

                {requestType === 'RENT' && (
                  <p>
                    <b>Expected Deposit:</b>{' '}
                    {formatCurrency(property.expected_deposit)}
                  </p>
                )}

                <p>
                  <b>Negotiable:</b>{' '}
                  {property.negotiable ||
                    (property.negotiate ? 'Yes' : 'No')}
                </p>

                <p>
                  <b>Status:</b> {property.property_status || 'AVAILABLE'}
                </p>

                <Link to={`/properties/${property.prop_id}`}>
                  <button className="btn btn-primary">View Details</button>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}