// ------------------------------------------------------------
// Inquiries.js
// ------------------------------------------------------------
// SocioDeal - Society Admin Inquiry Management Dashboard
//
// Purpose:
// - Society admin can view and manage inquiries for ONLY their society.
// - Uses backend APIs:
//   1. GET /society-inquiries
//   2. PATCH /inquiries/:id/status
//
// Latest enhancement:
// - Backend now requires buyer_message for every status update.
// - Admin must select predefined buyer-visible message before update.
// - Internal notes are optional.
// - Visit date/time are required only for visit_scheduled.
//
// Important:
// - Buyer UI remains unchanged.
// - This page is already protected in App.js for society_admin.
// - Backend enforces multi-society isolation.
// ------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

export default function Inquiries() {
  // ------------------------------------------------------------
  // Main page states
  // ------------------------------------------------------------
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // ------------------------------------------------------------
  // Action states
  // ------------------------------------------------------------
  const [updating, setUpdating] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionMessageType, setActionMessageType] = useState('');

  // ------------------------------------------------------------
  // Single action modal state
  // This modal is used for all status updates.
  // ------------------------------------------------------------
  const [actionModal, setActionModal] = useState({
    open: false,
    inquiry: null,
    status: '',
    label: '',
    buyer_message: '',
    notes: '',
    visit_date: '',
    visit_time: ''
  });

  const token = localStorage.getItem('token');

  // ------------------------------------------------------------
  // Status options supported by backend
  // ------------------------------------------------------------
  const STATUS_OPTIONS = [
    { value: 'requested', label: 'Requested' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'visit_scheduled', label: 'Visit Scheduled' },
    { value: 'visited', label: 'Visited' },
    { value: 'negotiation', label: 'Negotiation' },
    { value: 'deal_closed', label: 'Deal Closed' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  // ------------------------------------------------------------
  // Predefined buyer-visible messages
  // These values must exactly match backend allowed messages.
  // ------------------------------------------------------------
  const BUYER_MESSAGES = {
    requested: [
      'Your inquiry has been received by society admin.'
    ],
    contacted: [
      'Society admin has contacted you. Please check your phone.',
      'We tried reaching you. Please call back when available.'
    ],
    visit_scheduled: [
      'Your visit has been scheduled. Please arrive on time.',
      'Your site visit is scheduled. Please coordinate with society admin.'
    ],
    visited: [
      'Thank you for visiting the property. We will update you on next steps.',
      'Your visit is completed. Please share your interest with society admin.'
    ],
    negotiation: [
      'Your inquiry is under price discussion.',
      'Society admin is coordinating with the owner for price discussion.'
    ],
    deal_closed: [
      'Congratulations, this deal has been marked as closed.',
      'Your deal is successfully closed. Society admin will guide you on next steps.'
    ],
    rejected: [
      'This property is currently not available.',
      'Your inquiry could not be processed at this time.'
    ],
    cancelled: [
      'Your inquiry has been cancelled as per the current process.',
      'This inquiry has been cancelled. Please contact society admin if needed.'
    ]
  };

  // ------------------------------------------------------------
  // Quick actions shown on each inquiry card
  // ------------------------------------------------------------
  const QUICK_ACTIONS = [
    { status: 'contacted', label: 'Contacted' },
    { status: 'visit_scheduled', label: 'Schedule Visit' },
    { status: 'visited', label: 'Visited' },
    { status: 'negotiation', label: 'Negotiation' },
    { status: 'deal_closed', label: 'Deal Closed' },
    { status: 'rejected', label: 'Reject Inquiry' },
    { status: 'cancelled', label: 'Cancel Inquiry' }
  ];

  useEffect(() => {
    fetchSocietyInquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------
  // Fetch society inquiries
  // Backend returns only inquiries for logged-in society admin society.
  // ------------------------------------------------------------
  const fetchSocietyInquiries = async () => {
    try {
      setLoading(true);
      setPageError('');

      const res = await api.get('/society-inquiries', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const list = Array.isArray(res.data)
        ? res.data
        : res.data?.data || res.data?.inquiries || [];

      setInquiries(list);
    } catch (error) {
      console.error('Error fetching society inquiries:', error);

      setInquiries([]);
      setPageError(
        error.response?.data?.message ||
          'Failed to load society inquiries.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------
  const normalizeStatus = (status) => {
    return String(status || 'requested').trim().toLowerCase();
  };

  const getStatusLabel = (status) => {
    const normalized = normalizeStatus(status);
    const match = STATUS_OPTIONS.find((item) => item.value === normalized);

    return match ? match.label : normalized.replaceAll('_', ' ');
  };

  const formatInquiryType = (type) => {
    if (!type) return 'N/A';
    return String(type).replaceAll('_', ' ');
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return 'N/A';

    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) return 'N/A';

    return `₹${numericValue.toLocaleString('en-IN')}`;
  };

  const formatDate = (value) => {
    if (!value) return 'N/A';

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
    if (!value) return 'N/A';
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

  // ------------------------------------------------------------
  // Status badge colors
  // ------------------------------------------------------------
  const getStatusBadgeStyle = (status) => {
    const normalized = normalizeStatus(status);

    const base = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '7px 11px',
      borderRadius: '999px',
      fontSize: '12px',
      fontWeight: '900',
      textTransform: 'capitalize',
      whiteSpace: 'nowrap'
    };

    if (normalized === 'requested') {
      return { ...base, background: '#e5e7eb', color: '#374151' };
    }

    if (normalized === 'contacted') {
      return { ...base, background: '#dbeafe', color: '#1d4ed8' };
    }

    if (normalized === 'visit_scheduled') {
      return { ...base, background: '#ffedd5', color: '#c2410c' };
    }

    if (normalized === 'visited') {
      return { ...base, background: '#ede9fe', color: '#6d28d9' };
    }

    if (normalized === 'negotiation') {
      return { ...base, background: '#fef9c3', color: '#a16207' };
    }

    if (normalized === 'deal_closed') {
      return { ...base, background: '#dcfce7', color: '#15803d' };
    }

    if (normalized === 'rejected') {
      return { ...base, background: '#fee2e2', color: '#b91c1c' };
    }

    if (normalized === 'cancelled') {
      return { ...base, background: '#7f1d1d', color: '#ffffff' };
    }

    return { ...base, background: '#e5e7eb', color: '#374151' };
  };

  // ------------------------------------------------------------
  // Filter and sort inquiries
  // ------------------------------------------------------------
  const filteredInquiries = useMemo(() => {
    const sorted = [...inquiries].sort((a, b) => {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    if (statusFilter === 'all') return sorted;

    return sorted.filter((inq) => normalizeStatus(inq.status) === statusFilter);
  }, [inquiries, statusFilter]);

  // ------------------------------------------------------------
  // Dashboard stats
  // ------------------------------------------------------------
  const stats = useMemo(() => {
    return {
      total: inquiries.length,
      requested: inquiries.filter((i) => normalizeStatus(i.status) === 'requested').length,
      contacted: inquiries.filter((i) => normalizeStatus(i.status) === 'contacted').length,
      visit_scheduled: inquiries.filter((i) => normalizeStatus(i.status) === 'visit_scheduled').length,
      negotiation: inquiries.filter((i) => normalizeStatus(i.status) === 'negotiation').length,
      deal_closed: inquiries.filter((i) => normalizeStatus(i.status) === 'deal_closed').length
    };
  }, [inquiries]);

  // ------------------------------------------------------------
  // Open action modal for any status action
  // ------------------------------------------------------------
  const openActionModal = (inquiry, action) => {
    const messages = BUYER_MESSAGES[action.status] || [];

    setActionModal({
      open: true,
      inquiry,
      status: action.status,
      label: action.label,
      buyer_message: messages[0] || '',
      notes: inquiry.notes || '',
      visit_date: inquiry.visit_date ? String(inquiry.visit_date).substring(0, 10) : '',
      visit_time: inquiry.visit_time ? String(inquiry.visit_time).slice(0, 5) : ''
    });

    setActionMessage('');
    setActionMessageType('');
  };

  // ------------------------------------------------------------
  // Close action modal
  // ------------------------------------------------------------
  const closeActionModal = () => {
    setActionModal({
      open: false,
      inquiry: null,
      status: '',
      label: '',
      buyer_message: '',
      notes: '',
      visit_date: '',
      visit_time: ''
    });
  };

  // ------------------------------------------------------------
  // Submit status update
  // Sends buyer_message as mandatory field.
  // ------------------------------------------------------------
  const handleSubmitStatusUpdate = async () => {
    if (!actionModal.inquiry) return;

    if (!actionModal.status) {
      setActionMessageType('error');
      setActionMessage('Status is missing.');
      return;
    }

    if (!actionModal.buyer_message) {
      setActionMessageType('error');
      setActionMessage('Please select buyer-visible message.');
      return;
    }

    if (actionModal.status === 'visit_scheduled') {
      if (!actionModal.visit_date) {
        setActionMessageType('error');
        setActionMessage('Please select visit date.');
        return;
      }

      if (!actionModal.visit_time) {
        setActionMessageType('error');
        setActionMessage('Please select visit time.');
        return;
      }
    }

    try {
      setUpdating(true);
      setActionMessage('');
      setActionMessageType('');

      const payload = {
        status: actionModal.status,
        buyer_message: actionModal.buyer_message,
        visit_date:
          actionModal.status === 'visit_scheduled'
            ? actionModal.visit_date
            : null,
        visit_time:
          actionModal.status === 'visit_scheduled'
            ? actionModal.visit_time
            : null,
        notes: actionModal.notes || ''
      };

      await api.patch(
        `/inquiries/${actionModal.inquiry.inquiry_id}/status`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      closeActionModal();

      setActionMessageType('success');
      setActionMessage('Inquiry status updated successfully.');

      // Refresh list so admin sees latest backend data.
      await fetchSocietyInquiries();
    } catch (error) {
      console.error('Error updating inquiry:', error);

      setActionMessageType('error');
      setActionMessage(
        error.response?.data?.message ||
          'Failed to update inquiry. Please try again.'
      );
    } finally {
      setUpdating(false);
    }
  };

  // ------------------------------------------------------------
  // Loading state
  // ------------------------------------------------------------
  if (loading) {
    return (
      <div className="page-container">
        <h2>📋 Society Inquiries</h2>
        <p className="muted">Loading inquiries...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div style={styles.headerBlock}>
        <h2 style={styles.pageTitle}>📋 Society Inquiries</h2>

        <p className="muted" style={styles.pageSubtitle}>
          Manage buyer inquiries, schedule visits, update status, and send clear buyer-visible messages.
        </p>
      </div>

      {pageError && (
        <div style={{ ...styles.messageBox, ...styles.errorBox }}>
          {pageError}
        </div>
      )}

      {actionMessage && (
        <div
          style={{
            ...styles.messageBox,
            ...(actionMessageType === 'success'
              ? styles.successBox
              : styles.errorBox)
          }}
        >
          {actionMessage}
        </div>
      )}

      {/* --------------------------------------------------------
          Stats cards
      -------------------------------------------------------- */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Total</span>
          <strong style={styles.statValue}>{stats.total}</strong>
        </div>

        <div style={styles.statCard}>
          <span style={styles.statLabel}>Requested</span>
          <strong style={styles.statValue}>{stats.requested}</strong>
        </div>

        <div style={styles.statCard}>
          <span style={styles.statLabel}>Contacted</span>
          <strong style={styles.statValue}>{stats.contacted}</strong>
        </div>

        <div style={styles.statCard}>
          <span style={styles.statLabel}>Visits</span>
          <strong style={styles.statValue}>{stats.visit_scheduled}</strong>
        </div>

        <div style={styles.statCard}>
          <span style={styles.statLabel}>Negotiation</span>
          <strong style={styles.statValue}>{stats.negotiation}</strong>
        </div>

        <div style={styles.statCard}>
          <span style={styles.statLabel}>Closed</span>
          <strong style={styles.statValue}>{stats.deal_closed}</strong>
        </div>
      </div>

      {/* --------------------------------------------------------
          Filter
      -------------------------------------------------------- */}
      <div className="card">
        <label style={styles.label}>Filter by Status</label>

        <select
          className="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Inquiries</option>

          {STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>

      {/* --------------------------------------------------------
          Inquiry cards
      -------------------------------------------------------- */}
      {filteredInquiries.length === 0 ? (
        <div style={styles.emptyCard}>
          <h3>No inquiries found</h3>

          <p className="muted">
            New buyer inquiries for your society properties will appear here.
          </p>
        </div>
      ) : (
        <div style={styles.inquiryGrid}>
          {filteredInquiries.map((inq) => {
            const requestType = String(inq.request_type || '').toUpperCase();
            const status = normalizeStatus(inq.status);

            return (
              <article key={inq.inquiry_id} style={styles.inquiryCard}>
                <div style={styles.cardTopRow}>
                  <div>
                    <p style={styles.cardSmallText}>
                      Inquiry #{inq.inquiry_id}
                    </p>

                    <h3 style={styles.cardTitle}>
                      {inq.c_type || 'Property'}{' '}
                      {requestType === 'RENT' ? 'for Rent' : 'for Sale'}
                    </h3>
                  </div>

                  <span style={getStatusBadgeStyle(status)}>
                    {getStatusLabel(status)}
                  </span>
                </div>

                <p style={styles.priceText}>{getPriceText(inq)}</p>

                <div style={styles.infoBlock}>
                  <p style={styles.infoText}>
                    <b>Society:</b> {inq.society_name || 'N/A'}
                  </p>

                  <p style={styles.infoText}>
                    📍 {inq.society_address || 'Location N/A'}
                  </p>

                  <p style={styles.infoText}>
                    <b>Property Status:</b> {inq.property_status || 'N/A'}
                  </p>

                  <p style={styles.infoText}>
                    <b>Available From:</b> {formatDate(inq.available_from)}
                  </p>
                </div>

                <div style={styles.buyerBox}>
                  <p style={styles.sectionTitle}>Buyer Details</p>

                  <p style={styles.infoText}>
                    <b>Name:</b> {inq.buyer_name || 'N/A'}
                  </p>

                  <p style={styles.infoText}>
                    <b>Mobile:</b> {inq.buyer_mobile || 'N/A'}
                  </p>

                  <p style={styles.infoText}>
                    <b>Email:</b> {inq.buyer_email || 'N/A'}
                  </p>
                </div>

                <div style={styles.infoBlock}>
                  <p style={styles.sectionTitle}>Inquiry Details</p>

                  <p style={styles.infoText}>
                    <b>Type:</b> {formatInquiryType(inq.inquiry_type)}
                  </p>

                  <p style={styles.infoText}>
                    <b>Message:</b> {inq.message || 'No message provided'}
                  </p>

                  <p style={styles.infoText}>
                    <b>Created:</b> {formatDateTime(inq.created_at)}
                  </p>
                </div>

                <div style={styles.visitBox}>
                  <p style={styles.sectionTitle}>Visit / Follow-up</p>

                  <p style={styles.infoText}>
                    <b>Visit Date:</b> {formatDate(inq.visit_date)}
                  </p>

                  <p style={styles.infoText}>
                    <b>Visit Time:</b> {formatTime(inq.visit_time)}
                  </p>

                  <p style={styles.infoText}>
                    <b>Internal Notes:</b> {inq.notes || 'No internal notes added'}
                  </p>

                  <p style={styles.infoText}>
                    <b>Buyer Message:</b> {inq.buyer_message || 'No buyer message sent yet'}
                  </p>

                  <p style={styles.infoText}>
                    <b>Last Updated:</b> {formatDateTime(inq.last_status_updated_at)}
                  </p>
                </div>

                <div style={styles.actionBlock}>
                  <p style={styles.sectionTitle}>Quick Actions</p>

                  <div style={styles.actionGrid}>
                    {QUICK_ACTIONS.map((action) => {
                      const isCurrentStatus = status === action.status;

                      return (
                        <button
                          key={action.status}
                          type="button"
                          style={{
                            ...styles.actionButton,
                            ...(isCurrentStatus ? styles.actionButtonDisabled : {})
                          }}
                          disabled={updating || isCurrentStatus}
                          onClick={() => openActionModal(inq, action)}
                        >
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* --------------------------------------------------------
          Status update modal
      -------------------------------------------------------- */}
      {actionModal.open && (
        <div style={styles.modalBackdrop}>
          <div style={styles.modalCard}>
            <h3 style={styles.modalTitle}>Confirm Status Update</h3>

            <p style={styles.modalText}>
              Update inquiry #{actionModal.inquiry?.inquiry_id} to{' '}
              <b>{actionModal.label}</b>.
            </p>

            <label style={styles.label}>Buyer-visible Message</label>

            <div style={styles.messageOptions}>
              {(BUYER_MESSAGES[actionModal.status] || []).map((msg) => (
                <label key={msg} style={styles.radioOption}>
                  <input
                    type="radio"
                    name="buyer_message"
                    value={msg}
                    checked={actionModal.buyer_message === msg}
                    onChange={(e) =>
                      setActionModal((current) => ({
                        ...current,
                        buyer_message: e.target.value
                      }))
                    }
                  />

                  <span>{msg}</span>
                </label>
              ))}
            </div>

            {actionModal.status === 'visit_scheduled' && (
              <>
                <label style={styles.label}>Visit Date</label>
                <input
                  className="input"
                  type="date"
                  value={actionModal.visit_date}
                  onChange={(e) =>
                    setActionModal((current) => ({
                      ...current,
                      visit_date: e.target.value
                    }))
                  }
                />

                <label style={styles.label}>Visit Time</label>
                <input
                  className="input"
                  type="time"
                  value={actionModal.visit_time}
                  onChange={(e) =>
                    setActionModal((current) => ({
                      ...current,
                      visit_time: e.target.value
                    }))
                  }
                />
              </>
            )}

            <label style={styles.label}>Internal Notes Optional</label>
            <textarea
              className="textarea"
              rows="4"
              value={actionModal.notes}
              placeholder="Internal admin note. Buyer will not see this if backend keeps notes internal."
              onChange={(e) =>
                setActionModal((current) => ({
                  ...current,
                  notes: e.target.value
                }))
              }
            />

            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.cancelButton}
                onClick={closeActionModal}
                disabled={updating}
              >
                Cancel
              </button>

              <button
                type="button"
                style={styles.confirmButton}
                onClick={handleSubmitStatusUpdate}
                disabled={updating}
              >
                {updating ? 'Updating...' : 'Confirm Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Local styles
// ------------------------------------------------------------
const styles = {
  headerBlock: {
    marginBottom: '18px'
  },

  pageTitle: {
    margin: '0 0 6px',
    fontSize: '26px'
  },

  pageSubtitle: {
    margin: 0
  },

  messageBox: {
    padding: '12px 14px',
    borderRadius: '14px',
    marginBottom: '14px',
    fontWeight: '800'
  },

  successBox: {
    background: '#dcfce7',
    color: '#166534',
    border: '1px solid #bbf7d0'
  },

  errorBox: {
    background: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #fecaca'
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
    gap: '12px',
    marginBottom: '18px'
  },

  statCard: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '16px',
    padding: '14px',
    boxShadow: '0 8px 22px rgba(15, 23, 42, 0.06)'
  },

  statLabel: {
    display: 'block',
    fontSize: '13px',
    color: '#6b7280',
    fontWeight: '800',
    marginBottom: '4px'
  },

  statValue: {
    fontSize: '24px',
    color: '#111827'
  },

  label: {
    display: 'block',
    fontWeight: '900',
    marginBottom: '6px',
    color: '#111827'
  },

  emptyCard: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '18px',
    padding: '24px',
    textAlign: 'center',
    boxShadow: '0 8px 22px rgba(15, 23, 42, 0.06)'
  },

  inquiryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '16px'
  },

  inquiryCard: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '20px',
    padding: '16px',
    boxShadow: '0 10px 26px rgba(15, 23, 42, 0.08)'
  },

  cardTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '8px'
  },

  cardSmallText: {
    margin: '0 0 4px',
    fontSize: '12px',
    color: '#6b7280',
    fontWeight: '800'
  },

  cardTitle: {
    margin: 0,
    fontSize: '18px',
    lineHeight: '1.35'
  },

  priceText: {
    margin: '8px 0 12px',
    fontSize: '22px',
    fontWeight: '900',
    color: '#111827'
  },

  infoBlock: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #eef2f7'
  },

  buyerBox: {
    marginTop: '12px',
    padding: '12px',
    borderRadius: '14px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0'
  },

  visitBox: {
    marginTop: '12px',
    padding: '12px',
    borderRadius: '14px',
    background: '#fff7ed',
    border: '1px solid #fed7aa'
  },

  sectionTitle: {
    margin: '0 0 8px',
    fontSize: '13px',
    fontWeight: '900',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },

  infoText: {
    margin: '0 0 6px',
    fontSize: '14px',
    color: '#374151',
    lineHeight: '1.5'
  },

  actionBlock: {
    marginTop: '14px'
  },

  actionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '8px'
  },

  actionButton: {
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#111827',
    padding: '10px 12px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '900',
    cursor: 'pointer'
  },

  actionButtonDisabled: {
    background: '#f3f4f6',
    color: '#9ca3af',
    cursor: 'not-allowed'
  },

  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px'
  },

  modalCard: {
    width: '100%',
    maxWidth: '520px',
    maxHeight: '90vh',
    overflowY: 'auto',
    background: '#ffffff',
    borderRadius: '18px',
    padding: '18px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.25)'
  },

  modalTitle: {
    margin: '0 0 8px',
    fontSize: '21px'
  },

  modalText: {
    margin: '0 0 14px',
    color: '#374151',
    lineHeight: '1.5'
  },

  messageOptions: {
    display: 'grid',
    gap: '10px',
    marginBottom: '14px'
  },

  radioOption: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    background: '#f9fafb',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: '1.5'
  },

  modalActions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginTop: '16px'
  },

  cancelButton: {
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#111827',
    padding: '12px 14px',
    borderRadius: '12px',
    fontWeight: '900',
    cursor: 'pointer'
  },

  confirmButton: {
    border: 'none',
    background: '#2563eb',
    color: '#ffffff',
    padding: '12px 14px',
    borderRadius: '12px',
    fontWeight: '900',
    cursor: 'pointer'
  }
};