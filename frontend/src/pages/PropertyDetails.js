// ------------------------------------------------------------
// PropertyDetails.js
// ------------------------------------------------------------
// SocioDeal - Buyer/Tenant Property Details Page
//
// This page handles:
// 1. Property details display
// 2. Property image gallery + enlarge modal
// 3. Buyer/Tenant inquiry submission
// 4. Duplicate inquiry handling with "Go to My Inquiries"
// 5. Better success/error/warning UI
//
// Important:
// - Mobile-first UI
// - Existing APIs are preserved
// - Role-based inquiry access is preserved
// - Buyer privacy is preserved: wing/flat number is NOT shown
// ------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function PropertyDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ------------------------------------------------------------
  // Property and image states
  // ------------------------------------------------------------
  const [property, setProperty] = useState(null);
  const [images, setImages] = useState([]);
  const [coverImage, setCoverImage] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(true);

  // ------------------------------------------------------------
  // Inquiry form states
  // ------------------------------------------------------------
  const [selectedInquiryType, setSelectedInquiryType] = useState('INTERESTED');
  const [message, setMessage] = useState('');
  const [responseMsg, setResponseMsg] = useState('');
  const [responseType, setResponseType] = useState('');
  const [sending, setSending] = useState(false);
// ------------------------------------------------------------
// Existing inquiry detection
// If buyer already sent inquiry for this property,
// we will disable the inquiry form.
// ------------------------------------------------------------
const [alreadyInquired, setAlreadyInquired] = useState(false);
// ------------------------------------------------------------
// Store existing inquiry details.
// This will help us show status card directly
// on Property Details page.
// ------------------------------------------------------------
const [existingInquiryData, setExistingInquiryData] = useState(null);
  const token = localStorage.getItem('token');

  // ------------------------------------------------------------
  // Read logged-in user safely from localStorage
  // ------------------------------------------------------------
  let user = null;

  try {
    user = JSON.parse(localStorage.getItem('user'));
  } catch {
    user = null;
  }

  // ------------------------------------------------------------
  // Buyer profile fields
  // Defensive mapping is used because login response may store
  // name/phone with different keys.
  // ------------------------------------------------------------
  const [buyerName, setBuyerName] = useState(
    user?.full_name || user?.name || user?.username || ''
  );

  const [buyerPhone, setBuyerPhone] = useState(
    user?.phone || user?.mobile || user?.contact || user?.phone_number || ''
  );

  // ------------------------------------------------------------
  // Load property and images when page opens
  // ------------------------------------------------------------
 useEffect(() => {
  fetchPropertyDetails();
  fetchPropertyImages();
  checkExistingInquiry();

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [id]);

  // ------------------------------------------------------------
  // Quick inquiry options
  // These reduce typing effort for buyer/tenant.
  // ------------------------------------------------------------
  const inquiryOptions = [
    {
      value: 'INTERESTED',
      label: 'Interested',
      icon: '❤️',
      defaultMessage: 'I am interested in this property. Please share more details.'
    },
    {
      value: 'PRICE_NEGOTIATION',
      label: 'Price Negotiation',
      icon: '💬',
      defaultMessage: 'I am interested in this property and would like to discuss the price.'
    },
    {
      value: 'MORE_DETAILS',
      label: 'More Details',
      icon: 'ℹ️',
      defaultMessage: 'Please share more details about this property.'
    },
    {
      value: 'SCHEDULE_VISIT',
      label: 'Schedule Visit',
      icon: '📅',
      defaultMessage: 'I would like to schedule a site visit. Please share available timing.'
   },
   {
      value: 'CONTACT_ME',
      label: 'Contact Me',
      icon: '📞',
      defaultMessage: 'Please contact me regarding this property.'
   }
  ];

  // ------------------------------------------------------------
  // Currency formatter
  // ------------------------------------------------------------
  const formatCurrency = (value) => {
    if (!value) return 'N/A';
    return `₹${Number(value).toLocaleString('en-IN')}`;
  };

  // ------------------------------------------------------------
  // Date formatter
  // ------------------------------------------------------------
  const formatDate = (value) => {
    if (!value) return 'N/A';
    return new Date(value).toLocaleDateString('en-IN');
  };
// ------------------------------------------------------------
// Convert inquiry status into readable label.
// ------------------------------------------------------------
const formatInquiryStatus = (status) => {
  if (!status) return 'PENDING';

  return status
    .replaceAll('_', ' ')
    .toUpperCase();
};
  // ------------------------------------------------------------
  // Request type fallback logic
  // Supports new request_type and old a_type for backward compatibility.
  // ------------------------------------------------------------
  const getRequestType = () => {
    return String(property?.request_type || property?.a_type || 'SALE').toUpperCase();
  };

  // ------------------------------------------------------------
  // Price display logic
  // RENT uses expected_rent.
  // SALE uses expected_price or old price field.
  // ------------------------------------------------------------
  const getDisplayPrice = () => {
    if (!property) return 'N/A';

    const requestType = getRequestType();

    if (requestType === 'RENT') {
      return property.expected_rent
        ? `${formatCurrency(property.expected_rent)} / month`
        : 'Rent on request';
    }

    return property.expected_price || property.price
      ? formatCurrency(property.expected_price || property.price)
      : 'Price on request';
  };

  // ------------------------------------------------------------
  // Fetch property details
  // ------------------------------------------------------------
  const fetchPropertyDetails = async () => {
    try {
      const res = await api.get(`/properties/${id}`);
      setProperty(res.data);
    } catch (error) {
      console.error('Error fetching property:', error);
      setProperty(null);
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // Fetch property images
  // Supports multiple possible backend response shapes safely.
  // ------------------------------------------------------------
  const fetchPropertyImages = async () => {
    try {
      const res = await api.get(`/properties/${id}/images`);

      const list = Array.isArray(res.data)
        ? res.data
        : res.data?.images || res.data?.data || [];

      setImages(list);

      const cover = list.find((img) => img.is_cover === true) || list[0];

      if (cover) {
        setCoverImage(cover.image_url || cover.url || cover.secure_url);
      } else {
        setCoverImage(null);
      }
    } catch (error) {
      console.error('Error fetching images:', error);
      setImages([]);
      setCoverImage(null);
    }
  };
  // ------------------------------------------------------------
// Check whether buyer already sent inquiry
// for current property.
//
// UX improvement:
// Prevent duplicate inquiry before submit.
// ------------------------------------------------------------
const checkExistingInquiry = async () => {
  try {
    // Only logged-in buyer/tenant should check inquiries.
    if (!token) return;

    if (
      user?.role !== 'buyer' &&
      user?.role !== 'tenant'
    ) {
      return;
    }

    const res = await api.get('/my-inquiries', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    // Defensive handling for different API response shapes.
    const inquiryList = Array.isArray(res.data)
      ? res.data
      : res.data?.data || res.data?.inquiries || [];

    // Match current property.
    const existingInquiry = inquiryList.find((item) => {
      return Number(item.property_id) === Number(id);
    });

    // If found, disable inquiry form.
    if (existingInquiry) {
  setAlreadyInquired(true);

  // Save inquiry details for status card UI.
  setExistingInquiryData(existingInquiry);
} else {
  setAlreadyInquired(false);
  setExistingInquiryData(null);
}
  } catch (error) {
    console.error('Error checking existing inquiry:', error);

    // Do NOT block user if API fails.
    setAlreadyInquired(false);
  }
};

  // ------------------------------------------------------------
  // Handle quick option select
  // ------------------------------------------------------------
  const handleInquiryTypeSelect = (option) => {
    setSelectedInquiryType(option.value);

    // Auto-fill helpful message.
    // Buyer can edit or clear because message is optional.
    setMessage(option.defaultMessage);

    // Clear previous response when buyer changes option.
    setResponseMsg('');
    setResponseType('');
  };

  // ------------------------------------------------------------
  // Submit inquiry
  // ------------------------------------------------------------
  const handleSendInquiry = async () => {
    if (!token) {
      navigate('/login');
      return;
    }

    if (!buyerName.trim()) {
      setResponseType('error');
      setResponseMsg('Please enter your name before sending inquiry.');
      return;
    }

    if (!buyerPhone.trim()) {
      setResponseType('error');
      setResponseMsg('Please enter your mobile number before sending inquiry.');
      return;
    }

    try {
      setSending(true);
      setResponseMsg('');
      setResponseType('');

      await api.post(
        '/inquiry',
        {
          property_id: Number(id),
          inquiry_type: selectedInquiryType,
          message: message.trim(),
          buyer_name: buyerName.trim(),
          buyer_phone: buyerPhone.trim()
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setResponseType('success');
      setResponseMsg('Inquiry sent successfully. Society admin will review and respond.');
      setMessage('');
    } catch (error) {
      console.error('Error sending inquiry:', error);

      const backendMsg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'Failed to send inquiry. Please try again.';

      const isDuplicate =
        backendMsg.toLowerCase().includes('already') ||
        backendMsg.toLowerCase().includes('duplicate');

      setResponseType(isDuplicate ? 'warning' : 'error');

      setResponseMsg(
        isDuplicate
          ? 'You have already sent inquiry for this property.'
          : backendMsg
      );
    } finally {
      setSending(false);
    }
  };

  // ------------------------------------------------------------
  // Loading state
  // ------------------------------------------------------------
  if (loading) {
    return <p className="page-container">Loading property...</p>;
  }

  // ------------------------------------------------------------
  // Property not found state
  // ------------------------------------------------------------
  if (!property) {
    return (
      <div className="page-container">
        <h2>Property not found</h2>
        <Link to="/properties">⬅ Back</Link>
      </div>
    );
  }

  const requestType = getRequestType();

  return (
    <div className="page-container property-details-page">
      <Link to="/properties">⬅ Back</Link>

      {/* --------------------------------------------------------
          Image section
      -------------------------------------------------------- */}
      <div className="details-image-section">
        <div
          className="details-cover-image"
          onClick={() => coverImage && setSelectedImage(coverImage)}
        >
          {coverImage ? (
            <img src={coverImage} alt="Property" />
          ) : (
            <div className="details-placeholder">No Image</div>
          )}

          <span className="details-badge">{requestType}</span>
        </div>

        {images.length > 1 && (
          <div className="details-gallery">
            {images.map((img) => {
              const imageUrl = img.image_url || img.url || img.secure_url;

              return (
                <img
                  key={img.image_id || imageUrl}
                  src={imageUrl}
                  alt="Property"
                  onClick={() => setSelectedImage(imageUrl)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* --------------------------------------------------------
          Basic property summary
      -------------------------------------------------------- */}
      <div className="card" style={{ marginTop: '16px' }}>
        <h2>
          {property.c_type} {requestType === 'RENT' ? 'for Rent' : 'for Sale'}
        </h2>

        <h3>{property.society_name || property.so_name || 'Society N/A'}</h3>

        <p className="details-price">{getDisplayPrice()}</p>

        <p className="muted">
          📍 {property.society_address || property.so_location || 'Location N/A'}
        </p>
      </div>

      {/* --------------------------------------------------------
          Property details grid
      -------------------------------------------------------- */}
      <div className="card details-grid">
        <div>
          <b>Configuration</b>
          <p>{property.c_type || 'N/A'}</p>
        </div>

        <div>
          <b>Carpet Area</b>
          <p>{property.carpet_area_sqft ? `${property.carpet_area_sqft} Sq.Ft` : 'N/A'}</p>
        </div>

        <div>
          <b>Furnishing</b>
          <p>{property.f_type || 'N/A'}</p>
        </div>

        <div>
          <b>Parking</b>
          <p>
            {property.parking_type
              ? `${property.parking_type} (${property.parking_count || 0})`
              : 'N/A'}
          </p>
        </div>

        <div>
          <b>Maintenance</b>
          <p>{formatCurrency(property.monthly_maintenance)}</p>
        </div>

        <div>
          <b>Available</b>
          <p>{formatDate(property.available_from)}</p>
        </div>
      </div>

      {/* --------------------------------------------------------
          Description
      -------------------------------------------------------- */}
      <div className="card">
        <h3>Description</h3>
        <p>{property.property_description || 'No description available'}</p>
      </div>

      {/* --------------------------------------------------------
          Inquiry section
      -------------------------------------------------------- */}
      <div className="card" style={styles.inquiryCard}>
        <h3 style={styles.inquiryTitle}>Send Inquiry</h3>

        <p className="muted" style={styles.inquirySubtitle}>
          Choose a quick option, confirm your details, and send inquiry.
        </p>

       {!token ? (
  <button
    className="btn btn-primary full-btn"
    onClick={() => navigate('/login')}
  >
    Login to Continue
  </button>
) : (user?.role === 'buyer' || user?.role === 'tenant') && alreadyInquired ? (
 <div
  style={{
    ...styles.responseBox,
    ...styles.warningBox
  }}
>
  <div style={styles.responseText}>
    <strong>Inquiry Already Sent</strong>

    <p>
      You already sent inquiry for this property.
    </p>
  </div>

  {/* --------------------------------------------------------
      Inquiry status details
  -------------------------------------------------------- */}
  <div style={styles.statusCard}>
    <div style={styles.statusRow}>
      <span style={styles.statusLabel}>Status</span>

      <span style={styles.statusBadge}>
        {formatInquiryStatus(existingInquiryData?.status)}
      </span>
    </div>

    {existingInquiryData?.visit_date && (
      <div style={styles.statusItem}>
        📅 Visit Date:
        {' '}
        {formatDate(existingInquiryData.visit_date)}
      </div>
    )}

    {existingInquiryData?.visit_time && (
      <div style={styles.statusItem}>
        🕒 Visit Time:
        {' '}
        {existingInquiryData.visit_time}
      </div>
    )}

    {existingInquiryData?.admin_note && (
      <div style={styles.statusItem}>
        💬 Admin Note:
        {' '}
        {existingInquiryData.admin_note}
      </div>
    )}
  </div>

  <button
    type="button"
    style={styles.secondaryActionButton}
    onClick={() => navigate('/my-inquiries')}
  >
    Go to My Inquiries
  </button>
</div>
) : user?.role === 'buyer' || user?.role === 'tenant' ? (
  <>
            <div style={styles.quickOptions}>
              {inquiryOptions.map((option) => {
                const isActive = selectedInquiryType === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleInquiryTypeSelect(option)}
                    style={{
                      ...styles.quickOptionButton,
                      ...(isActive ? styles.quickOptionButtonActive : {})
                    }}
                  >
                    <span>{option.icon}</span>
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div style={styles.profileGrid}>
              <div>
                <label style={styles.label}>Your Name</label>
                <input
                  className="input"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Enter your name"
                />
              </div>

              <div>
                <label style={styles.label}>Mobile Number</label>
                <input
                  className="input"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  placeholder="Enter mobile number"
                />
              </div>
            </div>

            <div style={styles.messageBlock}>
              <label style={styles.label}>Message Optional</label>
              <textarea
                className="textarea"
                rows="4"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add any specific question or requirement..."
              />
            </div>

            <button
              className="btn btn-primary full-btn"
              onClick={handleSendInquiry}
              disabled={sending}
            >
              {sending ? 'Sending...' : 'Send Inquiry'}
            </button>
          </>
        ) : (
          <p>Only buyer/tenant can send inquiry.</p>
        )}

        {responseMsg && (
          <div
            style={{
              ...styles.responseBox,
              ...(responseType === 'success'
                ? styles.successBox
                : responseType === 'warning'
                  ? styles.warningBox
                  : styles.errorBox)
            }}
          >
            <div style={styles.responseText}>
              <strong>
                {responseType === 'success'
                  ? 'Success'
                  : responseType === 'warning'
                    ? 'Already Sent'
                    : 'Action Required'}
              </strong>

              <p>{responseMsg}</p>
            </div>

            {(responseType === 'success' || responseType === 'warning') && (
              <button
                type="button"
                style={styles.secondaryActionButton}
                onClick={() => navigate('/my-inquiries')}
              >
                Go to My Inquiries
              </button>
            )}
          </div>
        )}
      </div>

      {/* --------------------------------------------------------
          Image enlarge modal
      -------------------------------------------------------- */}
      {selectedImage && (
        <div
          className="image-modal-backdrop"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="image-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="image-modal-close"
              onClick={() => setSelectedImage(null)}
            >
              ×
            </button>

            <img src={selectedImage} alt="Enlarged" />
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Local styles
// Kept inside this file so you can replace only PropertyDetails.js.
// Existing global CSS classes are still reused.
// ------------------------------------------------------------
const styles = {
  inquiryCard: {
    marginTop: '16px'
  },

  inquiryTitle: {
    marginBottom: '6px'
  },

  inquirySubtitle: {
    marginBottom: '14px'
  },

  quickOptions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
    gap: '10px',
    margin: '14px 0 18px'
  },

  quickOptionButton: {
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#111827',
    padding: '12px 14px',
    borderRadius: '14px',
    fontWeight: '800',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    minHeight: '46px',
    textAlign: 'center'
  },

  quickOptionButtonActive: {
    background: '#111827',
    color: '#ffffff',
    borderColor: '#111827',
    boxShadow: '0 8px 20px rgba(17, 24, 39, 0.18)'
  },

  profileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
    marginTop: '6px'
  },

  label: {
    display: 'block',
    fontWeight: '800',
    marginBottom: '6px',
    color: '#111827'
  },

  messageBlock: {
    marginTop: '14px'
  },

  responseBox: {
    marginTop: '14px',
    padding: '14px',
    borderRadius: '16px',
    display: 'grid',
    gap: '12px'
  },

  responseText: {
    lineHeight: '1.45'
  },

  successBox: {
    background: '#dcfce7',
    color: '#166534',
    border: '1px solid #bbf7d0'
  },

  warningBox: {
    background: '#fff7ed',
    color: '#9a3412',
    border: '1px solid #fed7aa'
  },

  errorBox: {
    background: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #fecaca'
  },

  secondaryActionButton: {
    width: '100%',
    border: 'none',
    background: '#111827',
    color: '#ffffff',
    padding: '12px 14px',
    borderRadius: '12px',
    fontWeight: '800',
    cursor: 'pointer',
    fontSize: '14px'
  },
  statusCard: {
  background: '#ffffff',
  borderRadius: '12px',
  padding: '12px',
  border: '1px solid #fed7aa',
  display: 'grid',
  gap: '10px'
},

statusRow: {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '10px'
},

statusLabel: {
  fontWeight: '800',
  color: '#111827'
},

statusBadge: {
  background: '#111827',
  color: '#ffffff',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: '800'
},

statusItem: {
  fontSize: '14px',
  color: '#374151',
  lineHeight: '1.5'
}
};