// ------------------------------------------------------------
// PropertyDetails.js
// ------------------------------------------------------------
// SocioDeal - Public Property Details Page
//
// Purpose:
// - Buyer / Guest can view full public property details
// - Uploaded property images are visible publicly
// - Buyer / Tenant can send inquiry after login
//
// Important:
// - This page now uses NEW property fields:
//   request_type, expected_price, expected_rent, expected_deposit,
//   wing_flat_no, floor_no, carpet_area_sqft, parking_type,
//   monthly_maintenance, property_description, available_from, etc.
//
// - Internal/sensitive fields are intentionally NOT shown:
//   bottom_price, bottom_rent_price, bottom_deposit_price, admin_notes
// ------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function PropertyDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [property, setProperty] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [responseMsg, setResponseMsg] = useState('');

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    fetchPropertyDetails();
    fetchPropertyImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return 'N/A';

    return `₹${Number(value).toLocaleString('en-IN')}`;
  };

  const formatDate = (value) => {
    if (!value) return 'N/A';

    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getDisplayPrice = () => {
    if (!property) return 'N/A';

    if (property.request_type === 'RENT') {
      return formatCurrency(property.expected_rent);
    }

    return formatCurrency(property.expected_price);
  };

  const fetchPropertyDetails = async () => {
    try {
      const res = await api.get(`/properties/${id}`);
      setProperty(res.data);
    } catch (error) {
      console.error('Error fetching property details:', error);
      setProperty(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchPropertyImages = async () => {
    try {
      const res = await api.get(`/properties/${id}/images`);
      setImages(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error fetching property images:', error);
      setImages([]);
    }
  };

  const handleSendInquiry = async () => {
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      await api.post(
        '/inquiry',
        {
          property_id: Number(id),
          message
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setResponseMsg('Inquiry sent successfully ✅');
      setMessage('');
    } catch (error) {
      console.error('Error sending inquiry:', error);

      setResponseMsg(
        error.response?.data?.message || 'Failed to send inquiry'
      );
    }
  };

  if (loading) {
    return <p className="page-container">Loading property details...</p>;
  }

  if (!property) {
    return (
      <div className="page-container">
        <h2>Property not found</h2>
        <Link to="/properties">⬅ Back to Properties</Link>
      </div>
    );
  }

  return (
    <div className="page-container">
      <Link to="/properties">⬅ Back to Properties</Link>

      {/* Main property summary */}
      <div className="card" style={{ marginTop: '16px' }}>
        <h2>
          {property.c_type} {property.request_type === 'RENT' ? 'for Rent' : 'for Sale'}
        </h2>

        <h3>{property.society_name || property.so_name}</h3>

        <p>
          <b>Society Code:</b>{' '}
          {property.society_code || property.society_cd || 'N/A'}
        </p>

        <p>
          <b>Location:</b>{' '}
          {property.society_address || property.so_location || 'N/A'}
        </p>

        <p>
          <b>Request Type:</b> {property.request_type || 'N/A'}
        </p>

        <p>
          <b>{property.request_type === 'RENT' ? 'Expected Rent' : 'Expected Price'}:</b>{' '}
          {getDisplayPrice()}
        </p>

        {property.request_type === 'RENT' && (
          <p>
            <b>Expected Deposit:</b> {formatCurrency(property.expected_deposit)}
          </p>
        )}

        <p>
          <b>Negotiable:</b>{' '}
          {property.negotiable || (property.negotiate ? 'Yes' : 'No')}
        </p>

        <p>
          <b>Status:</b> {property.property_status || 'AVAILABLE'}
        </p>
      </div>

      {/* Image gallery */}
      <div className="card">
        <h3>🖼 Property Images</h3>

        {images.length === 0 ? (
          <p className="muted">No images available</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '12px'
            }}
          >
            {images.map((img) => (
              <img
                key={img.image_id || img.image_url}
                src={img.image_url}
                alt="Property"
                style={{
                  width: '100%',
                  height: '180px',
                  objectFit: 'cover',
                  borderRadius: '10px',
                  border: '1px solid #ddd'
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Property configuration details */}
      <div className="card">
        <h3>🏠 Property Details</h3>

        <p>
          <b>Floor No:</b> {property.floor_no ?? 'N/A'}
        </p>

        <p>
          <b>Configuration:</b> {property.c_type || 'N/A'}
        </p>

        <p>
          <b>Carpet Area:</b>{' '}
          {property.carpet_area_sqft
            ? `${property.carpet_area_sqft} Sq.Ft`
            : 'N/A'}
        </p>

        <p>
          <b>Furnishing:</b> {property.f_type || 'N/A'}
        </p>

        <p>
          <b>Furniture Details:</b> {property.furniture_details || 'N/A'}
        </p>

        <p>
          <b>Parking Type:</b> {property.parking_type || 'N/A'}
        </p>

        <p>
          <b>Parking Count:</b> {property.parking_count ?? 'N/A'}
        </p>

        <p>
          <b>Monthly Maintenance:</b>{' '}
          {formatCurrency(property.monthly_maintenance)}
        </p>

        <p>
          <b>Available From:</b> {formatDate(property.available_from)}
        </p>

        <p>
          <b>Description:</b>{' '}
          {property.property_description || 'No description available'}
        </p>
      </div>

      {/* Public contact note */}
      <div className="card">
        <h3>📞 Contact / Inquiry</h3>

        <p>
          This property is managed by the society admin. Please send an inquiry
          to get more details or schedule a visit.
        </p>
      </div>

      {/* Inquiry section */}
      <div className="card">
        <h3>Send Inquiry</h3>

        {!token ? (
          <div>
            <p>Please login to send inquiry.</p>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/login')}
            >
              Login
            </button>
          </div>
        ) : user?.role === 'buyer' || user?.role === 'tenant' ? (
          <div>
            <textarea
              rows="4"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your inquiry message here..."
              className="textarea"
            />

            <button className="btn btn-primary" onClick={handleSendInquiry}>
              Send Inquiry
            </button>
          </div>
        ) : (
          <p>Only buyer/tenant can send inquiry.</p>
        )}

        {responseMsg && <p style={{ marginTop: '12px' }}>{responseMsg}</p>}
      </div>
    </div>
  );
}