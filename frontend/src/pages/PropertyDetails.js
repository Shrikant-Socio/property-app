// ------------------------------------------------------------
// PropertyDetails.js
// ------------------------------------------------------------
// SocioDeal - Buyer/User Property Details Page
//
// This page handles:
// 1. Property details display
// 2. Property image gallery + enlarge modal
// 3. Buyer inquiry submission
// 4. Duplicate inquiry prevention
// 5. Inquiry status card if inquiry already exists
// 6. Inline mobile OTP verification before inquiry
//
// Important:
// - Mobile-first UI
// - Existing property details/gallery preserved
// - Buyer privacy preserved: wing_flat_no is NOT shown
// - Frontend does NOT send name/phone in inquiry body
// - Backend uses logged-in JWT user profile
// - OTP UI is rendered ONLY ONCE
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
  // Inquiry states
  // ------------------------------------------------------------
  const [selectedInquiryType, setSelectedInquiryType] = useState('interested');
  const [message, setMessage] = useState('');
  const [responseMsg, setResponseMsg] = useState('');
  const [responseType, setResponseType] = useState('');
  const [sending, setSending] = useState(false);

  // ------------------------------------------------------------
  // Existing inquiry states
  // ------------------------------------------------------------
  const [alreadyInquired, setAlreadyInquired] = useState(false);
  const [existingInquiryData, setExistingInquiryData] = useState(null);

  // ------------------------------------------------------------
  // OTP states
  // OTP message uses responseMsg/responseType only.
  // This prevents duplicate success/error messages.
  // ------------------------------------------------------------
  const [showOtpSection, setShowOtpSection] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [devOtp, setDevOtp] = useState('');

  const token = localStorage.getItem('token');

  // ------------------------------------------------------------
  // Safely read logged-in user from localStorage
  // ------------------------------------------------------------
  let user = null;

  try {
    user = JSON.parse(localStorage.getItem('user'));
  } catch {
    user = null;
  }

  const userRole = user?.role ? user.role.trim().toLowerCase() : '';
  const isBuyerOrTenant = userRole === 'buyer' || userRole === 'tenant';

  // ------------------------------------------------------------
  // Load property, images, and existing inquiry check
  // ------------------------------------------------------------
  useEffect(() => {
    fetchPropertyDetails();
    fetchPropertyImages();
    checkExistingInquiry();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ------------------------------------------------------------
  // Inquiry quick options
  // Backend expects lowercase inquiry_type values.
  // ------------------------------------------------------------
  const inquiryOptions = [
    {
      value: 'interested',
      label: 'Interested',
      icon: '❤️',
      defaultMessage: 'I am interested in this property. Please share more details.'
    },
    {
      value: 'schedule_visit',
      label: 'Schedule Visit',
      icon: '📅',
      defaultMessage: 'I would like to schedule a site visit. Please share available timing.'
    },
    {
      value: 'contact_me',
      label: 'Contact Me',
      icon: '📞',
      defaultMessage: 'Please contact me regarding this property.'
    },
    {
      value: 'price_negotiation',
      label: 'Price Negotiation',
      icon: '💬',
      defaultMessage: 'I am interested in this property and would like to discuss the price.'
    },
    {
      value: 'more_details',
      label: 'More Details',
      icon: 'ℹ️',
      defaultMessage: 'Please share more details about this property.'
    }
  ];

  const formatCurrency = (value) => {
    if (!value) return 'N/A';
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

  const formatInquiryStatus = (status) => {
    if (!status) return 'PENDING';
    return String(status).replaceAll('_', ' ').toUpperCase();
  };

  const getRequestType = () => {
    return String(property?.request_type || property?.a_type || 'SALE').toUpperCase();
  };

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

  const fetchPropertyImages = async () => {
    try {
      const res = await api.get(`/properties/${id}/images`);

      const list = Array.isArray(res.data)
        ? res.data
        : res.data?.images || res.data?.data || [];

      setImages(list);

      const cover = list.find((img) => img.is_cover === true) || list[0];

      setCoverImage(
        cover ? cover.image_url || cover.url || cover.secure_url : null
      );
    } catch (error) {
      console.error('Error fetching images:', error);
      setImages([]);
      setCoverImage(null);
    }
  };

  // ------------------------------------------------------------
  // Check if buyer already sent inquiry for this property
  // ------------------------------------------------------------
  const checkExistingInquiry = async () => {
    try {
      if (!token || !isBuyerOrTenant) return;

      const res = await api.get('/my-inquiries', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const inquiryList = Array.isArray(res.data)
        ? res.data
        : res.data?.data || res.data?.inquiries || [];

      const existingInquiry = inquiryList.find((item) => {
        return Number(item.property_id) === Number(id);
      });

      if (existingInquiry) {
        setAlreadyInquired(true);
        setExistingInquiryData(existingInquiry);
      } else {
        setAlreadyInquired(false);
        setExistingInquiryData(null);
      }
    } catch (error) {
      console.error('Error checking existing inquiry:', error);
      setAlreadyInquired(false);
      setExistingInquiryData(null);
    }
  };

  const handleInquiryTypeSelect = (option) => {
    setSelectedInquiryType(option.value);
    setMessage(option.defaultMessage);
    setResponseMsg('');
    setResponseType('');
  };

  // ------------------------------------------------------------
  // Submit inquiry
  // If backend requires OTP, show OTP section once.
  // ------------------------------------------------------------
  const handleSendInquiry = async () => {
    if (!token) {
      navigate('/login');
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
          message: message.trim()
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setResponseType('success');
      setResponseMsg('Inquiry submitted successfully.');
      setMessage('');
      setShowOtpSection(false);
      setOtp('');
      setDevOtp('');

      await checkExistingInquiry();
    } catch (error) {
      console.error('Error sending inquiry:', error);

      const backendMsg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'Failed to send inquiry. Please try again.';

      const normalizedMsg = backendMsg.toLowerCase();

      const requiresOtp =
        normalizedMsg.includes('verify your mobile number') ||
        normalizedMsg.includes('mobile number before sending inquiry');

      const isDuplicate =
        normalizedMsg.includes('already') ||
        normalizedMsg.includes('duplicate');

      if (requiresOtp) {
        setShowOtpSection(true);
        setResponseType('warning');
        setResponseMsg('Please verify your mobile number before sending inquiry.');
      } else if (isDuplicate) {
        setShowOtpSection(false);
        setResponseType('warning');
        setResponseMsg('You have already sent an inquiry for this property.');
        await checkExistingInquiry();
      } else {
        setResponseType('error');
        setResponseMsg(backendMsg);
      }
    } finally {
      setSending(false);
    }
  };

  // ------------------------------------------------------------
  // Send OTP
  // ------------------------------------------------------------
  const handleSendOtp = async () => {
    try {
      setOtpSending(true);
      setResponseMsg('');
      setResponseType('');

      const res = await api.post(
        '/send-phone-otp',
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (res.data?.dev_otp) {
        setDevOtp(res.data.dev_otp);
      }

      setResponseType('success');
      setResponseMsg('OTP sent successfully. Please enter the OTP below.');
    } catch (error) {
      console.error('OTP send error:', error);

      setResponseType('error');
      setResponseMsg(
        error.response?.data?.message ||
          'Failed to send OTP. Please try again.'
      );
    } finally {
      setOtpSending(false);
    }
  };

  // ------------------------------------------------------------
  // Verify OTP
  // On success:
  // - hide OTP section
  // - clear OTP input
  // - show only one success message
  // ------------------------------------------------------------
  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      setResponseType('error');
      setResponseMsg('Please enter OTP.');
      return;
    }

    try {
      setOtpVerifying(true);
      setResponseMsg('');
      setResponseType('');

      await api.post(
        '/verify-phone-otp',
        {
          otp: otp.trim()
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setShowOtpSection(false);
      setOtp('');
      setDevOtp('');

      setResponseType('success');
      setResponseMsg('Mobile number verified successfully. Please send inquiry again.');
    } catch (error) {
      console.error('OTP verify error:', error);

      setResponseType('error');
      setResponseMsg(
        error.response?.data?.message ||
          'OTP verification failed. Please try again.'
      );
    } finally {
      setOtpVerifying(false);
    }
  };

  if (loading) {
    return <p className="page-container">Loading property...</p>;
  }

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

      <div className="card">
        <h3>Description</h3>
        <p>{property.property_description || 'No description available'}</p>
      </div>

      <div className="card" style={styles.inquiryCard}>
        <h3 style={styles.inquiryTitle}>Send Inquiry</h3>

        <p className="muted" style={styles.inquirySubtitle}>
          Choose a quick option and send your inquiry in minimum time.
        </p>

        {!token ? (
          <button
            className="btn btn-primary full-btn"
            onClick={() => navigate('/login')}
          >
            Login to Continue
          </button>
        ) : isBuyerOrTenant && alreadyInquired ? (
          <div
            style={{
              ...styles.responseBox,
              ...styles.warningBox
            }}
          >
            <div style={styles.responseText}>
              <strong>Inquiry Already Sent</strong>
              <p>You already sent inquiry for this property.</p>
            </div>

            <div style={styles.statusCard}>
              <div style={styles.statusRow}>
                <span style={styles.statusLabel}>Status</span>

                <span style={styles.statusBadge}>
                  {formatInquiryStatus(existingInquiryData?.status)}
                </span>
              </div>

              {existingInquiryData?.visit_date && (
                <div style={styles.statusItem}>
                  📅 Visit Date: {formatDate(existingInquiryData.visit_date)}
                </div>
              )}

              {existingInquiryData?.visit_time && (
                <div style={styles.statusItem}>
                  🕒 Visit Time: {existingInquiryData.visit_time}
                </div>
              )}

              {(existingInquiryData?.notes || existingInquiryData?.admin_note) && (
                <div style={styles.statusItem}>
                  💬 Admin Note: {existingInquiryData.notes || existingInquiryData.admin_note}
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
        ) : isBuyerOrTenant ? (
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

            {/* OTP section rendered only once here */}
            {showOtpSection && (
              <div style={styles.otpSection}>
                <p style={styles.otpTitle}>Mobile Verification Required</p>

                <p style={styles.otpHelpText}>
                  To keep SocioDeal genuine and safe, please verify your mobile
                  number before sending inquiry.
                </p>

                <button
                  type="button"
                  style={styles.otpButton}
                  onClick={handleSendOtp}
                  disabled={otpSending}
                >
                  {otpSending ? 'Sending OTP...' : 'Send OTP'}
                </button>

                <input
                  className="input"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 6-digit OTP"
                  maxLength="6"
                />

                <button
                  type="button"
                  style={styles.verifyOtpButton}
                  onClick={handleVerifyOtp}
                  disabled={otpVerifying}
                >
                  {otpVerifying ? 'Verifying...' : 'Verify OTP'}
                </button>

                {devOtp && (
                  <p style={styles.devOtpText}>
                    Dev OTP: {devOtp}
                  </p>
                )}
              </div>
            )}

            <button
              className="btn btn-primary full-btn"
              onClick={handleSendInquiry}
              disabled={sending}
            >
              {sending ? 'Sending...' : 'Send Inquiry'}
            </button>
          </>
        ) : (
          <p>Only buyer/user can send inquiry.</p>
        )}

        {/* Single common response message area. No OTP UI here. */}
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
                    ? 'Action Required'
                    : 'Error'}
              </strong>

              <p>{responseMsg}</p>
            </div>
          </div>
        )}
      </div>

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
  },

  otpSection: {
    marginTop: '18px',
    padding: '14px',
    borderRadius: '14px',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    display: 'grid',
    gap: '12px'
  },

  otpTitle: {
    margin: 0,
    fontWeight: '900',
    color: '#1e3a8a'
  },

  otpHelpText: {
    margin: 0,
    color: '#1f2937',
    fontSize: '14px',
    lineHeight: '1.5'
  },

  otpButton: {
    width: '100%',
    border: 'none',
    background: '#2563eb',
    color: '#ffffff',
    padding: '12px',
    borderRadius: '12px',
    fontWeight: '800',
    cursor: 'pointer'
  },

  verifyOtpButton: {
    width: '100%',
    border: 'none',
    background: '#16a34a',
    color: '#ffffff',
    padding: '12px',
    borderRadius: '12px',
    fontWeight: '800',
    cursor: 'pointer'
  },

  devOtpText: {
    margin: 0,
    fontSize: '13px',
    color: '#374151',
    fontWeight: '700'
  }
};