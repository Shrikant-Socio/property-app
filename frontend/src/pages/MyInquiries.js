// ------------------------------------------------------------
// MyInquiries.js
// ------------------------------------------------------------
// SocioDeal - Buyer / Tenant My Inquiries Page
//
// Purpose:
// - Buyer / tenant can view their own submitted inquiries.
// - Uses backend API: GET /my-inquiries
//
// Mobile-first features:
// 1. Card UI
// 2. Status badge
// 3. Status timeline
// 4. Upcoming visit highlight
// 5. View Property button
// 6. Latest inquiries first
// ------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function MyInquiries() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchMyInquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMyInquiries = async () => {
    try {
      setLoading(true);

      const res = await api.get('/my-inquiries', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setInquiries(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error fetching my inquiries:', error);
      alert(error.response?.data?.message || 'Failed to load inquiries');
      setInquiries([]);
    } finally {
      setLoading(false);
    }
  };

  const sortedInquiries = useMemo(() => {
    return [...inquiries].sort((a, b) => {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [inquiries]);

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return 'N/A';

    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) return 'N/A';

    return `₹${numericValue.toLocaleString('en-IN')}`;
  };

  const formatDate = (value) => {
    if (!value) return 'Not scheduled';

    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDateTime = (value) => {
    if (!value) return 'N/A';

    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTime = (value) => {
    if (!value) return 'Not scheduled';
    return String(value).slice(0, 5);
  };

  const getPriceText = (inq) => {
    const requestType = String(inq.request_type || '').toUpperCase();

    if (requestType === 'RENT') {
      return inq.expected_rent
        ? `${formatCurrency(inq.expected_rent)} / month`
        : 'Rent on request';
    }

    return inq.expected_price
      ? formatCurrency(inq.expected_price)
      : 'Price on request';
  };

  const normalizeStatus = (status) => {
    return String(status || 'requested').toLowerCase();
  };

  const getStatusStyle = (status) => {
    const normalized = normalizeStatus(status);

    const baseStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '6px 10px',
      borderRadius: '999px',
      fontSize: '12px',
      fontWeight: '800',
      textTransform: 'capitalize',
      whiteSpace: 'nowrap'
    };

    if (normalized === 'contacted') {
      return { ...baseStyle, background: '#dbeafe', color: '#1d4ed8' };
    }

    if (normalized === 'visit_scheduled') {
      return { ...baseStyle, background: '#ffedd5', color: '#c2410c' };
    }

    if (normalized === 'visited') {
      return { ...baseStyle, background: '#ede9fe', color: '#6d28d9' };
    }
    if (normalized === 'negotiation') {
      return {...baseStyle, background: '#fef9c3', color: '#a16207' };
   }

    if (normalized === 'deal_closed' || normalized === 'closed') {
      return { ...baseStyle, background: '#dcfce7', color: '#15803d' };
    }

    return { ...baseStyle, background: '#e5e7eb', color: '#374151' };
  };

  const formatStatusLabel = (status) => {
    return normalizeStatus(status).replaceAll('_', ' ');
  };

  const getStatusStepIndex = (status) => {
  const normalized = normalizeStatus(status);

  if (normalized === 'contacted') return 1;

  if (normalized === 'visit_scheduled') {
    return 2;
  }

  if (normalized === 'visited') {
    return 3;
  }

  // IMPORTANT:
  // Negotiation happens AFTER visit.
  // So buyer timeline should stay beyond visited.
  if (normalized === 'negotiation') {
    return 4;
  }

  if (
    normalized === 'deal_closed' ||
    normalized === 'closed'
  ) {
    return 5;
  }

  return 0;
};

  const isUpcomingVisit = (inq) => {
    if (!inq.visit_date) return false;

    const status = normalizeStatus(inq.status);

    if (status === 'deal_closed' || status === 'closed') return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const visitDate = new Date(inq.visit_date);
    visitDate.setHours(0, 0, 0, 0);

    return visitDate >= today;
  };

  const handleViewProperty = (propertyId) => {
    if (!propertyId) {
      alert('Property details are not available for this inquiry.');
      return;
    }

    navigate(`/properties/${propertyId}`);
  };

  const StatusTimeline = ({ status }) => {
    const steps = ['Requested', 'Contacted', 'Visit', 'Visited', 'Negotiation', 'Closed'];
    const activeIndex = getStatusStepIndex(status);

    return (
      <div style={styles.timelineWrapper}>
        {steps.map((step, index) => {
          const isCompleted = index <= activeIndex;

          return (
            <div key={step} style={styles.timelineItem}>
              <div
                style={{
                  ...styles.timelineDot,
                  ...(isCompleted ? styles.timelineDotActive : {})
                }}
              >
                {isCompleted ? '✓' : ''}
              </div>

              <p
                style={{
                  ...styles.timelineText,
                  ...(isCompleted ? styles.timelineTextActive : {})
                }}
              >
                {step}
              </p>

              {index !== steps.length - 1 && (
                <div
                  style={{
                    ...styles.timelineLine,
                    ...(index < activeIndex ? styles.timelineLineActive : {})
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <h2 style={styles.title}>📋 My Inquiries</h2>
        <p style={styles.subtitle}>Loading your inquiries...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerBlock}>
        <h2 style={styles.title}>📋 My Inquiries</h2>
        <p style={styles.subtitle}>
          Track your property inquiries, visit schedules, and current status.
        </p>
      </div>

      {sortedInquiries.length === 0 ? (
        <div style={styles.emptyCard}>
          <h3 style={styles.emptyTitle}>No inquiries yet</h3>
          <p style={styles.emptyText}>
            Once you send an inquiry for a property, it will appear here.
          </p>
        </div>
      ) : (
        <div style={styles.grid}>
          {sortedInquiries.map((inq) => {
            const requestType = String(inq.request_type || '').toUpperCase();
            const upcomingVisit = isUpcomingVisit(inq);

            return (
              <div key={inq.inquiry_id} style={styles.card}>
                <div style={styles.cardTopRow}>
                  <span style={styles.typePill}>
                    {requestType === 'RENT' ? 'Rent' : 'Sale'}
                  </span>

                  <span style={getStatusStyle(inq.status)}>
                    {formatStatusLabel(inq.status)}
                  </span>
                </div>

                <h3 style={styles.propertyTitle}>
                  {inq.c_type || 'Property'}{' '}
                  {requestType === 'RENT' ? 'for Rent' : 'for Sale'}
                </h3>

                <p style={styles.priceText}>{getPriceText(inq)}</p>

                <div style={styles.section}>
                  <p style={styles.societyName}>
                    {inq.society_name || 'Society N/A'}
                  </p>

                  <p style={styles.location}>
                    📍 {inq.society_address || 'Location N/A'}
                  </p>
                </div>

                {upcomingVisit ? (
                  <div style={styles.upcomingVisitBox}>
                    <p style={styles.upcomingLabel}>Upcoming Visit</p>
                    <p style={styles.upcomingText}>
                      {formatDate(inq.visit_date)} at {formatTime(inq.visit_time)}
                    </p>
                  </div>
                ) : (
                  <div style={styles.infoBox}>
                    <p style={styles.infoText}>
                      <b>Visit Date:</b> {formatDate(inq.visit_date)}
                    </p>
                    <p style={styles.infoText}>
                      <b>Visit Time:</b> {formatTime(inq.visit_time)}
                    </p>
                  </div>
                )}

                <div style={styles.section}>
                  <p style={styles.label}>Status Progress</p>
                  <StatusTimeline status={inq.status} />
                </div>

                <div style={styles.section}>
                  <p style={styles.label}>Your Message</p>
                  <p style={styles.message}>
                    {inq.message || 'No message provided'}
                  </p>
                </div>

                {inq.notes && (
                  <div style={styles.buyerNoteBox}>
                    <p style={styles.label}>Visit / Follow-up Note</p>
                    <p style={styles.message}>{inq.notes}</p>
                  </div>
                )}

                <button
                  type="button"
                  style={styles.viewButton}
                  onClick={() => handleViewProperty(inq.property_id)}
                >
                  View Property
                </button>

                <p style={styles.createdAt}>
                  Inquiry sent: {formatDateTime(inq.created_at)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: '16px',
    background: '#f5f7fb',
    minHeight: '100vh'
  },
  headerBlock: {
    marginBottom: '18px'
  },
  title: {
    margin: '0 0 6px',
    fontSize: '24px',
    color: '#111827'
  },
  subtitle: {
    color: '#6b7280',
    margin: 0,
    lineHeight: '1.5'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px'
  },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '18px',
    padding: '16px',
    boxShadow: '0 8px 22px rgba(0,0,0,0.06)'
  },
  cardTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px'
  },
  typePill: {
    padding: '6px 10px',
    borderRadius: '999px',
    background: '#eef2ff',
    color: '#4338ca',
    fontSize: '12px',
    fontWeight: '800'
  },
  propertyTitle: {
    margin: '0 0 6px',
    fontSize: '18px',
    lineHeight: '1.3',
    color: '#111827'
  },
  priceText: {
    margin: 0,
    fontSize: '21px',
    fontWeight: '900',
    color: '#111827'
  },
  section: {
    marginTop: '14px'
  },
  societyName: {
    margin: '0 0 4px',
    fontWeight: '800',
    color: '#111827',
    lineHeight: '1.4'
  },
  location: {
    margin: 0,
    color: '#6b7280',
    lineHeight: '1.5'
  },
  infoBox: {
    marginTop: '14px',
    background: '#f9fafb',
    borderRadius: '14px',
    padding: '12px',
    border: '1px solid #eef2f7'
  },
  infoText: {
    margin: '0 0 6px',
    color: '#374151',
    lineHeight: '1.5'
  },
  upcomingVisitBox: {
    marginTop: '14px',
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    borderRadius: '14px',
    padding: '12px'
  },
  upcomingLabel: {
    margin: '0 0 4px',
    color: '#c2410c',
    fontSize: '13px',
    fontWeight: '900'
  },
  upcomingText: {
    margin: 0,
    color: '#7c2d12',
    fontSize: '16px',
    fontWeight: '800'
  },
  label: {
    margin: '0 0 8px',
    fontSize: '13px',
    fontWeight: '800',
    color: '#6b7280'
  },
  message: {
    margin: 0,
    lineHeight: '1.5',
    color: '#374151'
  },
  buyerNoteBox: {
    marginTop: '14px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '14px',
    padding: '12px'
  },
  timelineWrapper: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: '4px'
  },
  timelineItem: {
    position: 'relative',
    textAlign: 'center'
  },
  timelineDot: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: '#e5e7eb',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '900',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2
  },
  timelineDotActive: {
    background: '#2563eb'
  },
  timelineLine: {
    position: 'absolute',
    top: '12px',
    left: '50%',
    width: '100%',
    height: '2px',
    background: '#e5e7eb',
    zIndex: 1
  },
  timelineLineActive: {
    background: '#2563eb'
  },
  timelineText: {
    margin: '6px 0 0',
    fontSize: '10px',
    color: '#9ca3af',
    fontWeight: '700',
    lineHeight: '1.3'
  },
  timelineTextActive: {
    color: '#1f2937'
  },
  viewButton: {
    width: '100%',
    border: 'none',
    borderRadius: '14px',
    padding: '12px 14px',
    background: '#2563eb',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '900',
    cursor: 'pointer',
    marginTop: '16px'
  },
  createdAt: {
    margin: '12px 0 0',
    color: '#6b7280',
    fontSize: '13px',
    lineHeight: '1.4'
  },
  emptyCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '18px',
    padding: '24px',
    textAlign: 'center',
    boxShadow: '0 8px 22px rgba(0,0,0,0.06)'
  },
  emptyTitle: {
    margin: '0 0 8px',
    color: '#111827'
  },
  emptyText: {
    margin: 0,
    color: '#6b7280',
    lineHeight: '1.5'
  }
};