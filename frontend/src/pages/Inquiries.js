// ------------------------------------------------------------
// Inquiries.js
// ------------------------------------------------------------
// Admin Inquiry Dashboard
//
// This page allows society admin to:
// 1. View inquiries for their own society
// 2. Filter inquiries by status
// 3. See dashboard counts
// 4. Update inquiry status
// 5. Schedule visit date/time
// 6. Add admin notes
// ------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

export default function Inquiries() {
  // Stores all inquiry records returned from backend
  const [inquiries, setInquiries] = useState([]);

  // Controls loading message while API is running
  const [loading, setLoading] = useState(true);

  // Used for filtering inquiry list by selected status
  const [statusFilter, setStatusFilter] = useState('all');

  // Read JWT token from localStorage for protected API calls
  const token = localStorage.getItem('token');

  // ------------------------------------------------------------
  // Load inquiries when page opens
  // ------------------------------------------------------------
  useEffect(() => {
    fetchInquiries();
  }, []);

  // ------------------------------------------------------------
  // Fetch inquiries from backend
  // Backend should already filter by logged-in admin's society_id
  // ------------------------------------------------------------
  const fetchInquiries = async () => {
    try {
      const res = await api.get('/inquiries', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setInquiries(res.data);
    } catch (error) {
      console.error('Error fetching inquiries:', error);
      setInquiries([]);
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // Update inquiry
  //
  // This function is reusable for:
  // - status update
  // - visit date update
  // - visit time update
  // - notes update
  //
  // Example:
  // updateInquiry(5, { status: 'CONTACTED' })
  // updateInquiry(5, { visit_date: '2026-05-10' })
  // ------------------------------------------------------------
  const updateInquiry = async (id, data) => {
    try {
      await api.patch(`/inquiry/${id}`, data, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      // Refresh latest data after update
      fetchInquiries();
    } catch (error) {
      console.error('Error updating inquiry:', error);
      alert(error.response?.data?.message || 'Failed to update inquiry');
    }
  };

  // ------------------------------------------------------------
  // Filter inquiries on frontend based on selected status
  // ------------------------------------------------------------
  const filteredInquiries = useMemo(() => {
    if (statusFilter === 'all') return inquiries;

    return inquiries.filter((inq) => inq.status === statusFilter);
  }, [inquiries, statusFilter]);

  // ------------------------------------------------------------
  // Dashboard counts
  // These counts are calculated from loaded inquiry list
  // ------------------------------------------------------------
  const stats = useMemo(() => {
    return {
      total: inquiries.length,
      new: inquiries.filter((i) => i.status === 'NEW').length,
      contacted: inquiries.filter((i) => i.status === 'CONTACTED').length,
      visit_scheduled: inquiries.filter((i) => i.status === 'VISIT_SCHEDULED').length,
      negotiation: inquiries.filter((i) => i.status === 'NEGOTIATION').length,
      closed: inquiries.filter((i) => i.status === 'CLOSED').length,
      cancelled: inquiries.filter((i) => i.status === 'CANCELLED').length,
    };
  }, [inquiries]);

  // ------------------------------------------------------------
  // Loading state
  // ------------------------------------------------------------
  if (loading) {
    return <p className="page-container">Loading inquiries...</p>;
  }

  return (
    <div className="page-container">
      <h2>📋 Inquiry Dashboard</h2>
      <p className="muted">
        Manage buyer inquiries, visit schedules, deal status, and admin notes.
      </p>

      {/* --------------------------------------------------------
          Stats Cards Section
      --------------------------------------------------------- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        <div className="card"><b>Total</b><br />{stats.total}</div>
        <div className="card"><b>New</b><br />{stats.new}</div>
        <div className="card"><b>Contacted</b><br />{stats.contacted}</div>
        <div className="card"><b>Visit Scheduled</b><br />{stats.visit_scheduled}</div>
        <div className="card"><b>Negotiation</b><br />{stats.negotiation}</div>
        <div className="card"><b>Closed</b><br />{stats.closed}</div>
        <div className="card"><b>Cancelled</b><br />{stats.cancelled}</div>
      </div>

      {/* --------------------------------------------------------
          Filter Section
      --------------------------------------------------------- */}
      <div className="card">
        <label><b>Filter by Status</b></label>

        <select
          className="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="VISIT_SCHEDULED">Visit Scheduled</option>
          <option value="NEGOTIATION">Negotiation</option>
          <option value="CLOSED">Closed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* --------------------------------------------------------
          Inquiry List
      --------------------------------------------------------- */}
      {filteredInquiries.length === 0 ? (
        <p>No inquiries found</p>
      ) : (
        filteredInquiries.map((inq) => (
          <div key={inq.inquiry_id} className="card">

            {/* Property Information */}
            <h3>{inq.so_name}</h3>
            <p><b>Property ID:</b> {inq.property_id}</p>
            <p><b>Price:</b> ₹{inq.price}</p>

            <hr />

            {/* Buyer / Inquiry Information */}
            <p><b>Buyer Name:</b> {inq.name || 'N/A'}</p>
            <p><b>Phone:</b> {inq.phone || 'N/A'}</p>
            <p><b>Message:</b> {inq.message}</p>

            <hr />

            {/* Status Update */}
            <label><b>Status</b></label>
            <select
              className="select"
              value={inq.status || 'NEW'}
              onChange={(e) =>
                updateInquiry(inq.inquiry_id, { status: e.target.value })
              }
            >
              <option value="NEW">NEW</option>
              <option value="CONTACTED">CONTACTED</option>
              <option value="VISIT_SCHEDULED">VISIT_SCHEDULED</option>
              <option value="NEGOTIATION">NEGOTIATION</option>
              <option value="CLOSED">CLOSED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>

            {/* Visit Scheduling */}
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

            {/* Admin Notes */}
            <label><b>Admin Notes</b></label>
            <textarea
              className="textarea"
              rows="3"
              value={inq.notes || ''}
              placeholder="Add internal notes for this inquiry..."
              onChange={(e) =>
                updateInquiry(inq.inquiry_id, { notes: e.target.value })
              }
            />

            <p className="muted">
              Created At: {inq.created_at ? new Date(inq.created_at).toLocaleString() : 'N/A'}
            </p>
          </div>
        ))
      )}
    </div>
  );
}