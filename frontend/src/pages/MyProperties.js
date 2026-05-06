// ------------------------------------------------------------
// MyProperties.js
// ------------------------------------------------------------
// Society Admin page to view and manage own society properties.
//
// Features:
// 1. Shows properties in card layout.
// 2. Shows cover image thumbnail if available.
// 3. Falls back to placeholder when no image exists.
// 4. Keeps existing Edit / Manage Images / Delete functionality.
// ------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function MyProperties() {
  const [properties, setProperties] = useState([]);
  const [coverImages, setCoverImages] = useState({});
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchMyProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------
  // Fetch society admin's own properties
  // API: GET /my-properties
  // ------------------------------------------------------------
  const fetchMyProperties = async () => {
    try {
      setLoading(true);

      const res = await api.get('/my-properties', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const propertyList = Array.isArray(res.data) ? res.data : [];

      setProperties(propertyList);

      // After properties are loaded, fetch cover image for each property
      fetchCoverImages(propertyList);
    } catch (error) {
      console.error('Error fetching properties:', error);
      alert(error.response?.data?.message || 'Failed to fetch properties');
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // Fetch cover image for each property.
  //
  // API used:
  // GET /properties/:id/images
  //
  // Safe behavior:
  // - If image API fails for one property, other cards still load.
  // - If no cover image exists, first image is used.
  // - If no image exists, placeholder is shown.
  // ------------------------------------------------------------
  const fetchCoverImages = async (propertyList) => {
    const imageMap = {};

    await Promise.all(
      propertyList.map(async (property) => {
        const propertyId = property.prop_id || property.property_id || property.id;

        if (!propertyId) return;

        try {
          const res = await api.get(`/properties/${propertyId}/images`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });

          const images = Array.isArray(res.data)
            ? res.data
            : res.data?.images || res.data?.data || [];

          const coverImage =
            images.find((img) => img.is_cover === true) || images[0];

          if (coverImage) {
            imageMap[propertyId] =
              coverImage.image_url || coverImage.url || coverImage.secure_url;
          }
        } catch (error) {
          console.error(`Image fetch failed for property ${propertyId}:`, error);
        }
      })
    );

    setCoverImages(imageMap);
  };

  // ------------------------------------------------------------
  // Delete selected property
  // API: DELETE /properties/:id
  // ------------------------------------------------------------
  const deleteProperty = async (id) => {
    const confirmDelete = window.confirm(
      'Are you sure you want to delete this property?'
    );

    if (!confirmDelete) return;

    try {
      await api.delete(`/properties/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      alert('Property deleted ✅');
      fetchMyProperties();
    } catch (error) {
      console.error('Delete error:', error);
      alert(error.response?.data?.message || 'Failed to delete property');
    }
  };

  // ------------------------------------------------------------
  // Format price safely.
  // Existing backend may return price / expected_price / rent fields.
  // ------------------------------------------------------------
  const formatPrice = (property) => {
    const value =
      property.price ||
      property.expected_price ||
      property.expected_rent ||
      property.expected_deposit;

    if (!value) return 'N/A';

    return `₹${Number(value).toLocaleString('en-IN')}`;
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <h2>🏠 My Properties</h2>
        <p>Loading properties...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>🏠 My Properties</h2>
          <p style={styles.subtitle}>
            Manage your society properties, images, and listing details.
          </p>
        </div>

        <Link to="/add-property">
          <button style={styles.addButton}>+ Add Property</button>
        </Link>
      </div>

      {properties.length === 0 ? (
        <div style={styles.emptyCard}>
          <h3>No properties found</h3>
          <p>Add your first property to start managing listings.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {properties.map((p) => {
            const propertyId = p.prop_id || p.property_id || p.id;
            const imageUrl = coverImages[propertyId];

            return (
              <div key={propertyId} style={styles.card}>
                {/* Image preview section */}
                <div style={styles.imageBox}>
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Property"
                      style={styles.image}
                    />
                  ) : (
                    <div style={styles.placeholder}>
                      <span style={styles.placeholderIcon}>🏢</span>
                      <span>No Image</span>
                    </div>
                  )}

                  <span style={styles.badge}>
                    {p.request_type || p.a_type || 'PROPERTY'}
                  </span>
                </div>

                {/* Property information */}
                <div style={styles.content}>
                  <h3 style={styles.cardTitle}>
                    {p.so_name || p.society_name || 'Society Property'}
                  </h3>

                  <p style={styles.location}>
                    📍 {p.so_location || p.society_location || 'Location N/A'}
                  </p>

                  <div style={styles.infoGrid}>
                    <div>
                      <span style={styles.label}>Config</span>
                      <p style={styles.value}>{p.c_type || 'N/A'}</p>
                    </div>

                    <div>
                      <span style={styles.label}>Type</span>
                      <p style={styles.value}>{p.request_type || p.a_type || 'N/A'}</p>
                    </div>

                    <div>
                      <span style={styles.label}>Price / Rent</span>
                      <p style={styles.value}>{formatPrice(p)}</p>
                    </div>

                    <div>
                      <span style={styles.label}>Negotiable</span>
                      <p style={styles.value}>
                        {p.negotiate === true || p.negotiable === 'Yes'
                          ? 'Yes'
                          : 'No'}
                      </p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={styles.actions}>
                    <Link to={`/edit-property/${propertyId}`}>
                      <button style={styles.editButton}>Edit</button>
                    </Link>

                    <Link to={`/properties/${propertyId}/images/manage`}>
                      <button style={styles.imageButton}>Manage Images</button>
                    </Link>

                    <button
                      onClick={() => deleteProperty(propertyId)}
                      style={styles.deleteButton}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Inline styles.
// Kept inside file so you can directly replace without CSS changes.
// ------------------------------------------------------------
const styles = {
  page: {
    padding: '24px',
    background: '#f3f4f6',
    minHeight: '100vh'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    gap: '16px'
  },
  title: {
    margin: 0,
    fontSize: '28px'
  },
  subtitle: {
    margin: '6px 0 0',
    color: '#6b7280'
  },
  addButton: {
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px'
  },
  card: {
    background: '#fff',
    borderRadius: '14px',
    overflow: 'hidden',
    boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
    border: '1px solid #e5e7eb'
  },
  imageBox: {
    height: '190px',
    position: 'relative',
    background: '#e5e7eb'
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  placeholder: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    color: '#6b7280',
    fontWeight: '600'
  },
  placeholderIcon: {
    fontSize: '36px',
    marginBottom: '8px'
  },
  badge: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    background: '#111827',
    color: '#fff',
    padding: '5px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '700'
  },
  content: {
    padding: '16px'
  },
  cardTitle: {
    margin: '0 0 6px',
    fontSize: '20px'
  },
  location: {
    margin: '0 0 14px',
    color: '#6b7280'
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '16px'
  },
  label: {
    fontSize: '12px',
    color: '#6b7280'
  },
  value: {
    margin: '4px 0 0',
    fontWeight: '600',
    color: '#111827'
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    borderTop: '1px solid #e5e7eb',
    paddingTop: '14px'
  },
  editButton: {
    background: '#f59e0b',
    color: '#fff',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  imageButton: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  deleteButton: {
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  emptyCard: {
    background: '#fff',
    padding: '24px',
    borderRadius: '12px',
    border: '1px solid #e5e7eb'
  }
};
