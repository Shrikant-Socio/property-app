// ------------------------------------------------------------
// Inquiries.js
// ------------------------------------------------------------
// Admin Inquiry Dashboard
//
// Fixes included:
// 1. Property fields mapped correctly.
// 2. Backend-safe lowercase statuses.
// 3. Page no longer scrolls to top after every action.
// 4. Textarea focus remains stable while typing.
// 5. Notes are saved on blur instead of every keystroke.
// ------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

export default function Inquiries() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const token = localStorage.getItem('token');

  const STATUS_OPTIONS = [
    { value: 'requested', label: 'Requested' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'visit_scheduled', label: 'Visit Scheduled' },
    { value: 'negotiation', label: 'Negotiation' },
    { value: 'closed', label: 'Closed' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  useEffect(() => {
    fetchInquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInquiries = async () => {
    try {
      setLoading(true);

      const res = await api.get('/inquiries', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setInquiries(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error fetching inquiries:', error);
      setInquiries([]);
      alert(error.response?.data?.message || 'Failed to fetch inquiries');
    } finally {
      setLoading(false);
    }
  };

  const normalizeStatus = (status) => {
    if (!status) return 'requested';
    return String(status).trim().toLowerCase();
  };

  const getStatusLabel = (status) => {
    const normalized = normalizeStatus(status);
    const match = STATUS_OPTIONS.find((s) => s.value === normalized);
    return match ? match.label : normalized.replaceAll('_', ' ');
  };

  const getPropertyPrice = (inq) => {
    const requestType = String(inq.request_type || inq.a_type || '').toUpperCase();

    if (requestType === 'RENT') {
      return inq.expected_rent
        ? `₹${Number(inq.expected_rent).toLocaleString('en-IN')} / month`
        : 'N/A';
    }

    return inq.expected_price || inq.price
      ? `₹${Number(inq.expected_price || inq.price).toLocaleString('en-IN')}`
      : 'N/A';
  };

  // ------------------------------------------------------------
  // Update inquiry locally first so focus/scroll does not jump.
  // Then call backend API.
  // We intentionally do NOT call fetchInquiries() here.
  // ------------------------------------------------------------
  const updateInquiry = async (id, data) => {
    const previousInquiries = inquiries;

    setInquiries((current) =>
      current.map((inq) =>
        inq.inquiry_id === id ? { ...inq, ...data } : inq
      )
    );

    try {
      await api.patch(`/inquiry/${id}`, data, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error('Error updating inquiry:', error);

      // Roll back UI if backend update fails
      setInquiries(previousInquiries);

      alert(error.response?.data?.message || 'Failed to update inquiry');
    }
  };

  // ------------------------------------------------------------
  // Local-only field change.
  // Used for notes typing so textarea does not lose focus.
  // ------------------------------------------------------------
  const updateInquiryLocalOnly = (id, data) => {
    setInquiries((current) =>
      current.map((inq) =>
        inq.inquiry_id === id ? { ...inq, ...data } : inq
      )
    );
  };

  const filteredInquiries = useMemo(() => {
    if (statusFilter === 'all') return inquiries;

    return inquiries.filter(
      (inq) => normalizeStatus(inq.status) === statusFilter
    );
  }, [inquiries, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: inquiries.length,
      requested: inquiries.filter((i) => normalizeStatus(i.status) === 'requested').length,
      contacted: inquiries.filter((i) => normalizeStatus(i.status) === 'contacted').length,
      visit_scheduled: inquiries.filter((i) => normalizeStatus(i.status) === 'visit_scheduled').length,
      negotiation: inquiries.filter((i) => normalizeStatus(i.status) === 'negotiation').length,
      closed: inquiries.filter((i) => normalizeStatus(i.status) === 'closed').length,
      cancelled: inquiries.filter((i) => normalizeStatus(i.status) === 'cancelled').length
    };
  }, [inquiries]);

  if (loading) {
    return <p className="page-container">Loading inquiries...</p>;
  }

  return (
    <div className="page-container">
      <h2>📋 Inquiry Dashboard</h2>

      <p className="muted">
        Manage buyer inquiries, visit schedules, deal status, and admin notes.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        <div className="card"><b>Total</b><br />{stats.total}</div>
        <div className="card"><b>Requested</b><br />{stats.requested}</div>
        <div className="card"><b>Contacted</b><br />{stats.contacted}</div>
        <div className="card"><b>Visit Scheduled</b><br />{stats.visit_scheduled}</div>
        <div className="card"><b>Negotiation</b><br />{stats.negotiation}</div>
        <div className="card"><b>Closed</b><br />{stats.closed}</div>
        <div className="card"><b>Cancelled</b><br />{stats.cancelled}</div>
      </div>

      <div className="card">
        <label><b>Filter by Status</b></label>

        <select
          className="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>

      {filteredInquiries.length === 0 ? (
        <p>No inquiries found</p>
      ) : (
        filteredInquiries.map((inq) => {
          const currentStatus = normalizeStatus(inq.status);

          return (
            <div key={inq.inquiry_id} className="card">
              <h3>Property Inquiry #{inq.inquiry_id}</h3>

              <p><b>Property ID:</b> {inq.property_id || 'N/A'}</p>
              <p><b>Flat:</b> {inq.wing_flat_no || 'N/A'}</p>
              <p><b>Configuration:</b> {inq.c_type || 'N/A'}</p>
              <p><b>Request Type:</b> {inq.request_type || inq.a_type || 'N/A'}</p>
              <p><b>Price / Rent:</b> {getPropertyPrice(inq)}</p>

              <hr />

              <p><b>Buyer Name:</b> {inq.name || 'N/A'}</p>
              <p><b>Phone:</b> {inq.phone || 'N/A'}</p>
              <p><b>Message:</b> {inq.message || 'N/A'}</p>

              <hr />

              <p>
                <b>Current Status:</b>{' '}
                <span
                  style={{
                    background: '#e5e7eb',
                    padding: '4px 8px',
                    borderRadius: '6px'
                  }}
                >
                  {getStatusLabel(currentStatus)}
                </span>
              </p>

              <label><b>Status</b></label>
              <select
                className="select"
                value={currentStatus}
                onChange={(e) =>
                  updateInquiry(inq.inquiry_id, { status: e.target.value })
                }
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '12px'
                }}
              >
                <div>
                  <label><b>Visit Date</b></label>
                  <input
                    className="input"
                    type="date"
                    value={inq.visit_date ? inq.visit_date.substring(0, 10) : ''}
                    onChange={(e) =>
                      updateInquiry(inq.inquiry_id, { visit_date: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label><b>Visit Time</b></label>
                  <input
                    className="input"
                    type="time"
                    value={inq.visit_time || ''}
                    onChange={(e) =>
                      updateInquiry(inq.inquiry_id, { visit_time: e.target.value })
                    }
                  />
                </div>
              </div>

              <label><b>Admin Notes</b></label>
              <textarea
                className="textarea"
                rows="3"
                value={inq.notes || ''}
                placeholder="Add internal notes for this inquiry..."
                onChange={(e) =>
                  updateInquiryLocalOnly(inq.inquiry_id, { notes: e.target.value })
                }
                onBlur={(e) =>
                  updateInquiry(inq.inquiry_id, { notes: e.target.value })
                }
              />

              <p className="muted">
                Created At:{' '}
                {inq.created_at
                  ? new Date(inq.created_at).toLocaleString()
                  : 'N/A'}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}