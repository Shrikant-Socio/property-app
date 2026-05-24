// ------------------------------------------------------------
// SocietyDashboard.js
// ------------------------------------------------------------
// SocioDeal - Society Admin Reporting Dashboard
//
// Purpose:
// - Shows reporting only for logged-in society_admin's mapped society.
// - Uses backend API: GET /dashboard/society
//
// Important business clarification:
// - Closed Deals = inquiries marked as deal_closed
// - Closed Properties = properties no longer visible to buyers/tenants
//
// Important:
// - Backend controls society isolation.
// - This page does not expose other society data.
// - Mobile-first responsive card-based dashboard.
// ------------------------------------------------------------

import { useEffect, useState } from 'react';
import api from '../services/api';

export default function SocietyDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setErrorMsg('');

      const res = await api.get('/dashboard/society', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setDashboard(res.data || {});
    } catch (error) {
      console.error('Society dashboard error:', error);
      setErrorMsg(
        error.response?.data?.message ||
          'Failed to load society dashboard.'
      );
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (value) => {
    return Number(value || 0).toLocaleString('en-IN');
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

  const getInquiryConversionPercent = () => {
    const total = Number(dashboard?.total_inquiries || 0);
    const closedDeals = Number(dashboard?.deal_closed_inquiries || 0);

    if (!total) return 0;

    return Math.round((closedDeals / total) * 100);
  };

  // ------------------------------------------------------------
// Property Closure Rate
// Formula:
// closed_properties / total_properties
//
// This is different from Deal Conversion.
// Example:
// 2 closed properties / 2 total properties = 100%
// ------------------------------------------------------------
const getPropertyClosurePercent = () => {
  const totalProperties = Number(dashboard?.total_properties || 0);
  const closedProperties = Number(dashboard?.closed_properties || 0);

  if (!totalProperties) return 0;

  return Math.round((closedProperties / totalProperties) * 100);
};

  if (loading) {
    return (
      <div className="page-container">
        <h2>📊 Society Dashboard</h2>
        <p className="muted">Loading reporting dashboard...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div style={styles.header}>
        <h2 style={styles.title}>📊 Society Dashboard</h2>
        <p className="muted" style={styles.subtitle}>
          Track properties, inquiries, visits, closed deals, and closed inventory for your society.
        </p>
      </div>

      {errorMsg && (
        <div style={styles.errorBox}>
          {errorMsg}
        </div>
      )}

      {!errorMsg && dashboard && (
        <>
          <div style={styles.kpiGrid}>
            <KpiCard title="Total Properties" value={formatNumber(dashboard.total_properties)} icon="🏢" />
            <KpiCard title="Sale Properties" value={formatNumber(dashboard.sale_properties)} icon="🏷️" />
            <KpiCard title="Rent Properties" value={formatNumber(dashboard.rent_properties)} icon="🔑" />
            <KpiCard title="Available Properties" value={formatNumber(dashboard.available_properties)} icon="✅" variant="success" />
            <KpiCard title="Closed Properties" value={formatNumber(dashboard.closed_properties)} icon="🔒" variant="danger" />
            <KpiCard title="Total Inquiries" value={formatNumber(dashboard.total_inquiries)} icon="📩" />
            <KpiCard title="Requested" value={formatNumber(dashboard.requested_inquiries)} icon="🕒" />
            <KpiCard title="Contacted" value={formatNumber(dashboard.contacted_inquiries)} icon="📞" />
            <KpiCard title="Visits Scheduled" value={formatNumber(dashboard.visit_scheduled_inquiries)} icon="📅" />
            <KpiCard title="Closed Deals" value={formatNumber(dashboard.deal_closed_inquiries)} icon="🎯" variant="purple" />
            <KpiCard title="Deal Conversion" value={`${getInquiryConversionPercent()}%`} icon="📈" />
            <KpiCard title="Property Closure Rate" value={`${getPropertyClosurePercent()}%`} icon="📊" variant="danger" />
          </div>

          <div style={styles.helperBox}>
  <strong>ℹ Understanding Dashboard Metrics</strong>

  <p>
    <b>Closed Deals</b> = inquiries marked as deal_closed.
  </p>

  <p>
    <b>Deal Conversion</b> = closed deals divided by total inquiries.
  </p>

  <p>
    <b>Closed Properties</b> = properties no longer visible to buyers/tenants.
  </p>

  <p>
    <b>Property Closure Rate</b> = closed properties divided by total properties.
  </p>
</div>

          <div style={styles.sectionGrid}>
            <div className="card">
              <h3>Inquiry Funnel</h3>

              <FunnelRow label="Requested" value={dashboard.requested_inquiries} total={dashboard.total_inquiries} />
              <FunnelRow label="Contacted" value={dashboard.contacted_inquiries} total={dashboard.total_inquiries} />
              <FunnelRow label="Visit Scheduled" value={dashboard.visit_scheduled_inquiries} total={dashboard.total_inquiries} />
              <FunnelRow label="Closed Deals" value={dashboard.deal_closed_inquiries} total={dashboard.total_inquiries} />
            </div>

            <div className="card">
              <h3>Property Mix</h3>

              <FunnelRow label="Sale" value={dashboard.sale_properties} total={dashboard.total_properties} />
              <FunnelRow label="Rent" value={dashboard.rent_properties} total={dashboard.total_properties} />
              <FunnelRow label="Available" value={dashboard.available_properties} total={dashboard.total_properties} />
              <FunnelRow label="Closed Properties" value={dashboard.closed_properties} total={dashboard.total_properties} />
            </div>
          </div>

          <div className="card">
            <h3>Recent Inquiries</h3>

            {Array.isArray(dashboard.recent_inquiries) &&
            dashboard.recent_inquiries.length > 0 ? (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Inquiry</th>
                      <th style={styles.th}>Property</th>
                      <th style={styles.th}>Buyer</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Created</th>
                    </tr>
                  </thead>

                  <tbody>
                    {dashboard.recent_inquiries.map((inq) => (
                      <tr key={inq.inquiry_id}>
                        <td style={styles.td}>#{inq.inquiry_id}</td>
                        <td style={styles.td}>
                          {inq.c_type || 'Property'} {inq.request_type || ''}
                        </td>
                        <td style={styles.td}>
                          {inq.buyer_name || inq.name || 'N/A'}
                        </td>
                        <td style={styles.td}>
                          <span style={styles.statusPill}>
                            {String(inq.status || 'requested').replaceAll('_', ' ')}
                          </span>
                        </td>
                        <td style={styles.td}>{formatDateTime(inq.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No recent inquiries found.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ title, value, icon, variant = 'default' }) {
  const variantStyle =
    variant === 'success'
      ? styles.kpiSuccess
      : variant === 'danger'
        ? styles.kpiDanger
        : variant === 'purple'
          ? styles.kpiPurple
          : {};

  return (
    <div style={{ ...styles.kpiCard, ...variantStyle }}>
      <div style={styles.kpiIcon}>{icon}</div>
      <p style={styles.kpiTitle}>{title}</p>
      <h3 style={styles.kpiValue}>{value}</h3>
    </div>
  );
}

function FunnelRow({ label, value, total }) {
  const safeValue = Number(value || 0);
  const safeTotal = Number(total || 0);
  const percent = safeTotal ? Math.round((safeValue / safeTotal) * 100) : 0;

  return (
    <div style={styles.funnelRow}>
      <div style={styles.funnelTop}>
        <span>{label}</span>
        <strong>{safeValue}</strong>
      </div>

      <div style={styles.progressTrack}>
        <div style={{ ...styles.progressFill, width: `${percent}%` }} />
      </div>

      <p style={styles.percentText}>{percent}%</p>
    </div>
  );
}

const styles = {
  header: { marginBottom: '18px' },
  title: { margin: '0 0 6px', fontSize: '28px' },
  subtitle: { margin: 0 },

  errorBox: {
    background: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #fecaca',
    borderRadius: '14px',
    padding: '14px',
    fontWeight: '800'
  },

  helperBox: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1e3a8a',
    borderRadius: '16px',
    padding: '14px 16px',
    marginBottom: '18px'
  },

  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '14px',
    marginBottom: '18px',
    alignItems: 'stretch'
  },

  kpiCard: {
    minHeight: '150px',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '18px',
    padding: '16px',
    boxShadow: '0 8px 22px rgba(15, 23, 42, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between'
  },

  kpiSuccess: { borderColor: '#bbf7d0', background: '#f0fdf4' },
  kpiDanger: { borderColor: '#fecaca', background: '#fef2f2' },
  kpiPurple: { borderColor: '#ddd6fe', background: '#f5f3ff' },

  kpiIcon: { fontSize: '24px', marginBottom: '8px' },
  kpiTitle: { margin: 0, color: '#6b7280', fontSize: '13px', fontWeight: '800' },
  kpiValue: { margin: '6px 0 0', fontSize: '26px', fontWeight: '900' },

  sectionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px'
  },

  funnelRow: { marginTop: '14px' },
  funnelTop: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    fontWeight: '800',
    marginBottom: '6px'
  },
  progressTrack: {
    height: '10px',
    borderRadius: '999px',
    background: '#e5e7eb',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: '999px',
    background: '#2563eb'
  },
  percentText: { margin: '4px 0 0', fontSize: '12px', color: '#6b7280' },

  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: '680px' },
  th: {
    textAlign: 'left',
    padding: '10px',
    borderBottom: '1px solid #e5e7eb',
    color: '#6b7280',
    fontSize: '13px'
  },
  td: {
    padding: '10px',
    borderBottom: '1px solid #f1f5f9',
    fontSize: '14px'
  },
  statusPill: {
    display: 'inline-block',
    background: '#eef2ff',
    color: '#3730a3',
    padding: '5px 9px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '800',
    textTransform: 'capitalize'
  }
};