// ------------------------------------------------------------
// SocietyReminders.js
// ------------------------------------------------------------
// SocioDeal - Society Admin Operational Reminder Dashboard
//
// Purpose:
// - Helps society_admin quickly act on pending inquiry follow-ups.
// - Uses backend API: GET /dashboard/reminders
// - Uses existing status update API:
//   PATCH /inquiries/:id/status
//
// Important:
// - This page is for society_admin only.
// - Backend enforces society isolation.
// - Existing Inquiries.js functionality is not changed.
// - Status update modal pattern is reused here safely.
// ------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

export default function SocietyReminders() {
  const token = localStorage.getItem('token');

  const [reminders, setReminders] = useState({
    pending_followups: [],
    contacted_no_visit: [],
    visits_today: [],
    post_visit_followups: [],
    stuck_negotiations: []
  });

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionMessageType, setActionMessageType] = useState('');
  const [updating, setUpdating] = useState(false);

  const [openSections, setOpenSections] = useState({
    pending_followups: true,
    contacted_no_visit: true,
    visits_today: true,
    post_visit_followups: true,
    stuck_negotiations: true
  });

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

  const BUYER_MESSAGES = {
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

  const SECTION_CONFIG = [
    {
      key: 'pending_followups',
      title: 'Pending Follow-ups',
      icon: '🟠',
      color: '#c2410c',
      bg: '#fff7ed',
      border: '#fed7aa',
      description: 'Requested inquiries older than 24 hours with no admin action.',
      actions: [
        { status: 'contacted', label: 'Contact Buyer' },
        { status: 'visit_scheduled', label: 'Schedule Visit' }
      ]
    },
    {
      key: 'contacted_no_visit',
      title: 'Contacted No Visit',
      icon: '🔵',
      color: '#1d4ed8',
      bg: '#eff6ff',
      border: '#bfdbfe',
      description: 'Buyer contacted but visit is not scheduled yet.',
      actions: [
        { status: 'visit_scheduled', label: 'Schedule Visit' },
        { status: 'negotiation', label: 'Negotiation' }
      ]
    },
    {
      key: 'visits_today',
      title: 'Visits Today',
      icon: '🟣',
      color: '#6d28d9',
      bg: '#f5f3ff',
      border: '#ddd6fe',
      description: 'Property visits scheduled for today.',
      actions: [
        { status: 'visited', label: 'Mark Visited' }
      ]
    },
    {
      key: 'post_visit_followups',
      title: 'Post Visit Follow-ups',
      icon: '🟢',
      color: '#0f766e',
      bg: '#f0fdfa',
      border: '#99f6e4',
      description: 'Visited inquiries waiting for next action.',
      actions: [
        { status: 'negotiation', label: 'Negotiation' },
        { status: 'deal_closed', label: 'Deal Closed' },
        { status: 'rejected', label: 'Reject' }
      ]
    },
    {
      key: 'stuck_negotiations',
      title: 'Stuck Negotiations',
      icon: '🟡',
      color: '#a16207',
      bg: '#fefce8',
      border: '#fef08a',
      description: 'Negotiations that need follow-up.',
      actions: [
        { status: 'contacted', label: 'Follow-up' },
        { status: 'deal_closed', label: 'Deal Closed' },
        { status: 'rejected', label: 'Reject' }
      ]
    }
  ];

  useEffect(() => {
    fetchReminders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReminders = async () => {
    try {
      setLoading(true);
      setPageError('');

      const res = await api.get('/dashboard/reminders', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setReminders({
        pending_followups: Array.isArray(res.data?.pending_followups)
          ? res.data.pending_followups
          : [],
        contacted_no_visit: Array.isArray(res.data?.contacted_no_visit)
          ? res.data.contacted_no_visit
          : [],
        visits_today: Array.isArray(res.data?.visits_today)
          ? res.data.visits_today
          : [],
        post_visit_followups: Array.isArray(res.data?.post_visit_followups)
          ? res.data.post_visit_followups
          : [],
        stuck_negotiations: Array.isArray(res.data?.stuck_negotiations)
          ? res.data.stuck_negotiations
          : []
      });
    } catch (error) {
      console.error('Reminder dashboard error:', error);

      setPageError(
        error.response?.data?.message ||
          'Failed to load reminder dashboard.'
      );
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    return SECTION_CONFIG.map((section) => ({
      ...section,
      count: reminders[section.key]?.length || 0
    }));
  }, [reminders]);

  const totalReminders = useMemo(() => {
    return stats.reduce((sum, item) => sum + item.count, 0);
  }, [stats]);

  const normalizeStatus = (status) => {
    return String(status || 'requested').trim().toLowerCase();
  };

  const formatStatusLabel = (status) => {
    return normalizeStatus(status).replaceAll('_', ' ');
  };

  const formatInquiryType = (type) => {
    if (!type) return 'N/A';
    return String(type).replaceAll('_', ' ');
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

  const getStatusBadgeStyle = (status) => {
    const normalized = normalizeStatus(status);

    const base = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '6px 10px',
      borderRadius: '999px',
      fontSize: '12px',
      fontWeight: '900',
      textTransform: 'capitalize',
      whiteSpace: 'nowrap'
    };

    if (normalized === 'requested') return { ...base, background: '#e5e7eb', color: '#374151' };
    if (normalized === 'contacted') return { ...base, background: '#dbeafe', color: '#1d4ed8' };
    if (normalized === 'visit_scheduled') return { ...base, background: '#ffedd5', color: '#c2410c' };
    if (normalized === 'visited') return { ...base, background: '#ede9fe', color: '#6d28d9' };
    if (normalized === 'negotiation') return { ...base, background: '#fef9c3', color: '#a16207' };
    if (normalized === 'deal_closed') return { ...base, background: '#dcfce7', color: '#15803d' };
    if (normalized === 'rejected') return { ...base, background: '#fee2e2', color: '#b91c1c' };
    if (normalized === 'cancelled') return { ...base, background: '#7f1d1d', color: '#ffffff' };

    return { ...base, background: '#e5e7eb', color: '#374151' };
  };

  const openActionModal = (inquiry, action) => {
    const messages = BUYER_MESSAGES[action.status] || [];

    setActionModal({
      open: true,
      inquiry,
      status: action.status,
      label: action.label,
      buyer_message: messages[0] || '',
      notes: '',
      visit_date: inquiry.visit_date ? String(inquiry.visit_date).substring(0, 10) : '',
      visit_time: inquiry.visit_time ? String(inquiry.visit_time).slice(0, 5) : ''
    });

    setActionMessage('');
    setActionMessageType('');
  };

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
      setActionMessage('Inquiry updated successfully.');

      await fetchReminders();
    } catch (error) {
      console.error('Reminder update error:', error);

      setActionMessageType('error');
      setActionMessage(
        error.response?.data?.message ||
          'Failed to update inquiry. Please try again.'
      );
    } finally {
      setUpdating(false);
    }
  };

  const toggleSection = (key) => {
    setOpenSections((current) => ({
      ...current,
      [key]: !current[key]
    }));
  };

  if (loading) {
    return (
      <div className="page-container">
        <h2>⏰ Reminder Dashboard</h2>
        <p className="muted">Loading operational reminders...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div style={styles.header}>
        <h2 style={styles.title}>⏰ Reminder Dashboard</h2>
        <p className="muted" style={styles.subtitle}>
          Focus on follow-ups, visits, and negotiations that need immediate admin action.
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

      <div style={styles.summaryGrid}>
        {stats.map((item) => (
          <button
            key={item.key}
            type="button"
            style={{
              ...styles.summaryCard,
              background: item.bg,
              borderColor: item.border
            }}
            onClick={() => toggleSection(item.key)}
          >
            <span style={styles.summaryIcon}>{item.icon}</span>
            <span style={styles.summaryTitle}>{item.title}</span>
            <strong style={{ ...styles.summaryCount, color: item.color }}>
              {item.count}
            </strong>
          </button>
        ))}
      </div>

      <div style={styles.overviewBox}>
        <strong>Total active reminders: {totalReminders}</strong>
        <p>
          Use this page as your daily working queue. After updating an inquiry,
          the reminder list refreshes automatically.
        </p>
      </div>

      {SECTION_CONFIG.map((section) => {
        const list = reminders[section.key] || [];
        const isOpen = openSections[section.key];

        return (
          <section key={section.key} style={styles.sectionBlock}>
            <button
              type="button"
              style={{
                ...styles.sectionHeader,
                background: section.bg,
                borderColor: section.border
              }}
              onClick={() => toggleSection(section.key)}
            >
              <span>
                {section.icon} {section.title}
              </span>

              <span style={{ ...styles.sectionCount, color: section.color }}>
                {list.length}
              </span>
            </button>

            {isOpen && (
              <div style={styles.sectionBody}>
                <p style={styles.sectionDescription}>{section.description}</p>

                {list.length === 0 ? (
                  <div style={styles.emptyCard}>
                    No reminders in this section.
                  </div>
                ) : (
                  <div style={styles.reminderGrid}>
                    {list.map((item) => (
                      <ReminderCard
                        key={`${section.key}-${item.inquiry_id}`}
                        item={item}
                        section={section}
                        onAction={openActionModal}
                        updating={updating}
                        formatDate={formatDate}
                        formatDateTime={formatDateTime}
                        formatTime={formatTime}
                        formatInquiryType={formatInquiryType}
                        formatStatusLabel={formatStatusLabel}
                        getStatusBadgeStyle={getStatusBadgeStyle}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      {actionModal.open && (
        <div style={styles.modalBackdrop}>
          <div style={styles.modalCard}>
            <h3 style={styles.modalTitle}>Confirm Reminder Action</h3>

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
              placeholder="Internal follow-up note."
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

function ReminderCard({
  item,
  section,
  onAction,
  updating,
  formatDate,
  formatDateTime,
  formatTime,
  formatInquiryType,
  formatStatusLabel,
  getStatusBadgeStyle
}) {
  const requestType = String(item.request_type || '').toUpperCase();

  return (
    <article style={styles.reminderCard}>
      <div style={styles.cardTop}>
        <div>
          <p style={styles.smallText}>Inquiry #{item.inquiry_id}</p>
          <h3 style={styles.cardTitle}>
            {item.c_type || 'Property'} {requestType === 'RENT' ? 'for Rent' : 'for Sale'}
          </h3>
        </div>

        <span style={getStatusBadgeStyle(item.status)}>
          {formatStatusLabel(item.status)}
        </span>
      </div>

      <div style={styles.badgeRow}>
        <span style={styles.requestBadge}>{requestType || 'N/A'}</span>
        <span style={styles.propertyBadge}>{item.property_status || 'N/A'}</span>
      </div>

      <div style={styles.infoBox}>
        <p style={styles.sectionMiniTitle}>Buyer</p>
        <p><b>Name:</b> {item.buyer_name || 'N/A'}</p>
        <p><b>Mobile:</b> {item.buyer_phone || 'N/A'}</p>
        <p><b>Email:</b> {item.buyer_email || 'N/A'}</p>
      </div>

      <div style={styles.infoBox}>
        <p style={styles.sectionMiniTitle}>Inquiry</p>
        <p><b>Type:</b> {formatInquiryType(item.inquiry_type)}</p>
        <p><b>Buyer Message:</b> {item.buyer_message || 'No buyer message yet'}</p>
        <p><b>Created:</b> {formatDateTime(item.created_at)}</p>
        <p><b>Last Updated:</b> {formatDateTime(item.last_status_updated_at)}</p>
      </div>

      {(item.visit_date || item.visit_time) && (
        <div style={styles.visitBox}>
          <p style={styles.sectionMiniTitle}>Visit</p>
          <p><b>Date:</b> {formatDate(item.visit_date)}</p>
          <p><b>Time:</b> {formatTime(item.visit_time)}</p>
        </div>
      )}

      <div style={styles.actionBlock}>
        <p style={styles.sectionMiniTitle}>Recommended Actions</p>

        <div style={styles.actionGrid}>
          {section.actions.map((action) => (
            <button
              key={action.status}
              type="button"
              style={styles.actionButton}
              disabled={updating}
              onClick={() => onAction(item, action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

const styles = {
  header: {
    marginBottom: '18px'
  },

  title: {
    margin: '0 0 6px',
    fontSize: '28px'
  },

  subtitle: {
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

  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: '12px',
    marginBottom: '16px'
  },

  summaryCard: {
    border: '1px solid',
    borderRadius: '18px',
    padding: '14px',
    textAlign: 'left',
    cursor: 'pointer',
    display: 'grid',
    gap: '6px',
    boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)'
  },

  summaryIcon: {
    fontSize: '24px'
  },

  summaryTitle: {
    color: '#374151',
    fontWeight: '900',
    fontSize: '14px'
  },

  summaryCount: {
    fontSize: '26px',
    fontWeight: '900'
  },

  overviewBox: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '16px',
    padding: '14px 16px',
    marginBottom: '18px',
    boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)'
  },

  sectionBlock: {
    marginBottom: '18px'
  },

  sectionHeader: {
    width: '100%',
    border: '1px solid',
    borderRadius: '16px',
    padding: '14px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: '900',
    fontSize: '16px',
    cursor: 'pointer'
  },

  sectionCount: {
    background: '#ffffff',
    padding: '5px 10px',
    borderRadius: '999px',
    fontWeight: '900'
  },

  sectionBody: {
    marginTop: '10px'
  },

  sectionDescription: {
    margin: '0 0 12px',
    color: '#6b7280'
  },

  emptyCard: {
    background: '#ffffff',
    border: '1px dashed #d1d5db',
    borderRadius: '16px',
    padding: '18px',
    color: '#6b7280',
    textAlign: 'center'
  },

  reminderGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
    gap: '14px'
  },

  reminderCard: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '20px',
    padding: '16px',
    boxShadow: '0 10px 26px rgba(15, 23, 42, 0.08)'
  },

  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'flex-start'
  },

  smallText: {
    margin: '0 0 4px',
    color: '#6b7280',
    fontWeight: '800',
    fontSize: '12px'
  },

  cardTitle: {
    margin: 0,
    fontSize: '18px'
  },

  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '12px'
  },

  requestBadge: {
    background: '#eef2ff',
    color: '#3730a3',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '900'
  },

  propertyBadge: {
    background: '#f1f5f9',
    color: '#334155',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '900'
  },

  infoBox: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #eef2f7'
  },

  visitBox: {
    marginTop: '12px',
    padding: '12px',
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    borderRadius: '14px'
  },

  sectionMiniTitle: {
    margin: '0 0 8px',
    color: '#6b7280',
    fontWeight: '900',
    fontSize: '13px',
    textTransform: 'uppercase'
  },

  actionBlock: {
    marginTop: '14px'
  },

  actionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
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

  label: {
    display: 'block',
    fontWeight: '900',
    marginBottom: '6px',
    color: '#111827'
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