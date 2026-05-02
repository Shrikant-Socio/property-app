// Import React hooks
import { useEffect, useState } from 'react';

// Import route helpers
import { useParams, Link, useNavigate } from 'react-router-dom';

// Import axios instance for backend API calls
import api from '../services/api';

export default function PropertyDetails() {
  // Get property ID from route parameter
  const { id } = useParams();

  // Used for redirecting user to login if needed
  const navigate = useNavigate();

  // State for property details
  const [property, setProperty] = useState(null);

  // State for images of property
  const [images, setImages] = useState([]);

  // Loading state
  const [loading, setLoading] = useState(true);

  // Buyer inquiry message input
  const [message, setMessage] = useState('');

  // API response message shown to user
  const [responseMsg, setResponseMsg] = useState('');

  // Get login info from localStorage
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));

  // Load property details and images when page opens
  useEffect(() => {
    fetchPropertyDetails();
    fetchPropertyImages();
  }, [id]);

  // -------------------------------------------
  // Fetch property details
  // -------------------------------------------
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

  // -------------------------------------------
  // Fetch property images
  // -------------------------------------------
  const fetchPropertyImages = async () => {
    try {
      const res = await api.get(`/properties/${id}/images`);
      setImages(res.data);
    } catch (error) {
      console.error('Error fetching property images:', error);
      setImages([]);
    }
  };

  // -------------------------------------------
  // Send inquiry for this property
  // Only buyer/tenant can do this
  // -------------------------------------------
  const handleSendInquiry = async () => {
    // If user is not logged in → send to login page
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      await api.post(
        '/inquiry',
        {
          property_id: Number(id),
          message: message
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

  // Show loading state while data is being fetched
  if (loading) {
    return <p className="page-container">Loading property details...</p>;
  }

  // If no property found
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

      {/* -----------------------
          Property Details Card
      ------------------------ */}
      <div className="card" style={{ marginTop: '16px' }}>
        <h2>{property.so_name}</h2>
        <p><b>Society Code:</b> {property.society_cd}</p>
        <p><b>Location:</b> {property.so_location}</p>
        <p><b>Configuration:</b> {property.c_type}</p>
        <p><b>Furnishing:</b> {property.f_type}</p>
        <p><b>Transaction Type:</b> {property.a_type}</p>
        <p><b>Price:</b> ₹{property.price}</p>
        <p><b>Negotiable:</b> {property.negotiate ? 'Yes' : 'No'}</p>
      </div>

      {/* -----------------------
          Property Image Gallery
      ------------------------ */}
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
                key={img.image_id}
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

      {/* -----------------------
          Society Admin Details
      ------------------------ */}
      <div className="card">
        <h3>Society Admin Details</h3>
        <p><b>Name:</b> {property.owner_name || 'N/A'}</p>
        <p><b>Email:</b> {property.owner_email || 'N/A'}</p>
        <p><b>Phone:</b> {property.owner_phone || 'N/A'}</p>
      </div>

      {/* -----------------------
          Send Inquiry Section
      ------------------------ */}
      <div className="card">
        <h3>Send Inquiry</h3>

        {/* If not logged in */}
        {!token ? (
          <div>
            <p>Please login to send inquiry.</p>
            <button className="btn btn-primary" onClick={() => navigate('/login')}>
              Login
            </button>
          </div>

        /* If buyer or tenant logged in */
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

        /* If admin logged in */
        ) : (
          <p>Only buyer/tenant can send inquiry.</p>
        )}

        {/* Show success/error message */}
        {responseMsg && <p style={{ marginTop: '12px' }}>{responseMsg}</p>}
      </div>
    </div>
  );
}