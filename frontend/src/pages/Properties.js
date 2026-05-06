// ------------------------------------------------------------
// Properties.js
// ------------------------------------------------------------
// SocioDeal - Buyer-facing Property Listing Page
//
// Mobile-first improvements:
// 1. Buyer/guest cards are optimized for mobile and desktop.
// 2. Cover image is prominent.
// 3. SALE / RENT badge is visible on image.
// 4. Price / rent is highlighted.
// 5. Society name is visible upfront.
// 6. Buyer/guest privacy preserved: wing_flat_no is NOT shown.
// 7. Filter tabs added: All / Sale / Rent.
// 8. Role rules preserved.
// ------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function Properties() {
  const [properties, setProperties] = useState([]);
  const [coverImages, setCoverImages] = useState({});
  const [loading, setLoading] = useState(true);

  // Buyer-facing filter: all / sale / rent
  const [requestTypeFilter, setRequestTypeFilter] = useState('all');

  const token = localStorage.getItem('token');

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('user'));
  } catch {
    user = null;
  }

  useEffect(() => {
    fetchProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizeRequestType = (property) => {
    return String(property.request_type || property.a_type || 'SALE').toUpperCase();
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return 'N/A';
    return `₹${Number(value).toLocaleString('en-IN')}`;
  };

  const getDisplayPrice = (property) => {
    const requestType = normalizeRequestType(property);

    if (requestType === 'RENT') {
      return property.expected_rent
        ? `${formatCurrency(property.expected_rent)} / month`
        : 'Rent on request';
    }

    return property.expected_price || property.price
      ? formatCurrency(property.expected_price || property.price)
      : 'Price on request';
  };

  const getLocation = (property) => {
    return (
      property.society_address ||
      property.so_location ||
      property.location ||
      'Location N/A'
    );
  };

  const fetchCoverImages = async (propertyList) => {
    const imageMap = {};

    await Promise.all(
      propertyList.map(async (property) => {
        const propertyId = property.prop_id || property.property_id || property.id;

        if (!propertyId) return;

        try {
          const res = await api.get(`/properties/${propertyId}/images`);

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
          // Image failure should not block property listing.
          console.error(`Image fetch failed for property ${propertyId}:`, error);
        }
      })
    );

    setCoverImages(imageMap);
  };

  const fetchProperties = async () => {
    try {
      setLoading(true);

      if (user?.role === 'platform_admin') {
        setProperties([]);
        return;
      }

      let res;

      if (token && user?.role === 'society_admin') {
        res = await api.get('/my-properties', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      } else {
        res = await api.get('/properties');
      }

      const propertyList = Array.isArray(res.data)
        ? res.data
        : res.data?.data || [];

      setProperties(propertyList);
      fetchCoverImages(propertyList);
    } catch (error) {
      console.error('Error fetching properties:', error);
      setProperties([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredProperties = useMemo(() => {
    if (requestTypeFilter === 'all') return properties;

    return properties.filter((property) => {
      const requestType = normalizeRequestType(property);
      return requestType === requestTypeFilter.toUpperCase();
    });
  }, [properties, requestTypeFilter]);

  if (user?.role === 'platform_admin') {
    return (
      <div className="page-container">
        <div className="card">
          <h2>Platform Admin Access</h2>
          <p>
            Platform admin is only allowed to onboard societies and create
            society admins.
          </p>
          <p>Please use the <b>Society Onboarding</b> menu.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <p className="page-container">Loading properties...</p>;
  }

  return (
    <div className="page-container property-listing-page">
      <div className="property-page-header">
        <h2>🏠 Properties</h2>
        <p className="muted">
          {user?.role === 'society_admin'
            ? 'Showing properties from your society only.'
            : 'Browse society-managed homes for sale and rent.'}
        </p>
      </div>

      {/* Mobile-friendly filter tabs */}
      <div className="property-filter-tabs" aria-label="Property type filter">
        <button
          type="button"
          className={`property-filter-tab ${requestTypeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setRequestTypeFilter('all')}
        >
          All
        </button>

        <button
          type="button"
          className={`property-filter-tab ${requestTypeFilter === 'sale' ? 'active' : ''}`}
          onClick={() => setRequestTypeFilter('sale')}
        >
          Sale
        </button>

        <button
          type="button"
          className={`property-filter-tab ${requestTypeFilter === 'rent' ? 'active' : ''}`}
          onClick={() => setRequestTypeFilter('rent')}
        >
          Rent
        </button>
      </div>

      {filteredProperties.length === 0 ? (
        <div className="card">
          <p>No properties found for selected filter.</p>
        </div>
      ) : (
        <div className="property-grid buyer-property-grid">
          {filteredProperties.map((property) => {
            const propertyId = property.prop_id || property.property_id || property.id;
            const requestType = normalizeRequestType(property);
            const imageUrl = coverImages[propertyId];

            return (
              <article key={propertyId} className="buyer-property-card">
                <div className="buyer-property-image-wrap">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={`${property.c_type || 'Property'} in ${property.society_name || property.so_name || 'society'}`}
                      className="buyer-property-image"
                    />
                  ) : (
                    <div className="buyer-property-placeholder">
                      <span className="buyer-property-placeholder-icon">🏢</span>
                      <span>No Image Available</span>
                    </div>
                  )}

                  <span className={`property-type-badge ${requestType === 'RENT' ? 'rent' : 'sale'}`}>
                    {requestType}
                  </span>
                </div>

                <div className="buyer-property-content">
                  <div className="buyer-property-price">
                    {getDisplayPrice(property)}
                  </div>

                  <h3 className="buyer-property-title">
                    {property.c_type || 'Property'} {requestType === 'RENT' ? 'for Rent' : 'for Sale'}
                  </h3>

                  <p className="buyer-property-society">
                    {property.society_name || property.so_name || 'Society N/A'}
                  </p>

                  <p className="buyer-property-location">
                    📍 {getLocation(property)}
                  </p>

                  <div className="buyer-property-highlights">
                    <span>{property.c_type || 'BHK N/A'}</span>

                    {property.carpet_area_sqft && (
                      <span>{property.carpet_area_sqft} Sq.Ft</span>
                    )}

                    {property.f_type && (
                      <span>{property.f_type}</span>
                    )}
                  </div>

                  {requestType === 'RENT' && property.expected_deposit && (
                    <p className="buyer-property-small-text">
                      Deposit: {formatCurrency(property.expected_deposit)}
                    </p>
                  )}

                  <Link to={`/properties/${propertyId}`} className="buyer-property-link">
                    <button className="btn btn-primary buyer-view-details-btn">
                      View Details
                    </button>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}