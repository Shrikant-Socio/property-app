// ------------------------------------------------------------
// AddProperty.js
// ------------------------------------------------------------
// Society Admin page to add a new property.
//
// Important rules:
// 1. Society details come from logged-in admin's mapped society.
// 2. Society code/name/address are read-only.
// 3. Frontend does NOT send society_id or society_code manually.
// 4. Backend uses req.user.society_id from JWT.
// 5. SALE and RENT show different pricing fields.
// 6. After property is saved successfully, user is redirected to
//    Manage Property Images page:
//    /properties/:id/images/manage
// ------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function AddProperty() {
  // Used to redirect after successful property creation
  const navigate = useNavigate();

  // JWT token for protected API calls
  const token = localStorage.getItem('token');

  // Logged-in admin's mapped society
  const [society, setSociety] = useState(null);

  // Message shown after success/error
  const [message, setMessage] = useState('');

  // Prevent duplicate submit while API call is in progress
  const [saving, setSaving] = useState(false);

  // Main property form state
  const [formData, setFormData] = useState({
    wing_flat_no: '',
    floor_no: '',
    c_type: '2BHK',
    carpet_area_sqft: '',
    f_type: 'Semi-Furnished',
    furniture_details: '',
    parking_type: 'Reserved',
    parking_count: '1',
    request_type: 'SALE',

    // SALE fields
    expected_price: '',
    negotiable: 'Yes',
    bottom_price: '',
    monthly_maintenance: '',

    // RENT fields
    expected_rent: '',
    expected_deposit: '',
    bottom_rent_price: '',
    bottom_deposit_price: '',

    // Additional useful fields
    available_from: '',
    property_description: '',
    owner_name: '',
    owner_contact: '',
    admin_notes: ''
  });

  // Load mapped society when page opens
  useEffect(() => {
    fetchMySociety();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------
  // Fetch mapped society details for logged-in society admin
  // API: GET /my-society
  // ------------------------------------------------------------
  const fetchMySociety = async () => {
    try {
      const res = await api.get('/my-society', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setSociety(res.data);
    } catch (error) {
      console.error('Fetch society error:', error);
      setMessage(error.response?.data?.message || 'Failed to load society details');
    }
  };

  // ------------------------------------------------------------
  // Handle form field changes
  // Works for input, select, textarea
  // ------------------------------------------------------------
  const handleChange = (e) => {
    const { name, value } = e.target;

    // If request type changes, reset transaction-specific pricing fields
    if (name === 'request_type') {
      setFormData({
        ...formData,
        request_type: value,

        expected_price: '',
        negotiable: 'Yes',
        bottom_price: '',

        expected_rent: '',
        expected_deposit: '',
        bottom_rent_price: '',
        bottom_deposit_price: ''
      });

      return;
    }

    // If negotiable becomes No, clear bottom price
    if (name === 'negotiable' && value === 'No') {
      setFormData({
        ...formData,
        negotiable: value,
        bottom_price: ''
      });

      return;
    }

    setFormData({
      ...formData,
      [name]: value
    });
  };

  // ------------------------------------------------------------
  // Extract created property ID safely from backend response.
  //
  // This is defensive because different backend versions may return:
  // 1. { prop_id: 1 }
  // 2. { id: 1 }
  // 3. { property_id: 1 }
  // 4. { property: { prop_id: 1 } }
  // 5. { property: { id: 1 } }
  // 6. { property: { property_id: 1 } }
  // 7. { data: { prop_id: 1 } }
  // ------------------------------------------------------------
  const getCreatedPropertyId = (responseData) => {
    return (
      responseData?.prop_id ||
      responseData?.id ||
      responseData?.property_id ||
      responseData?.property?.prop_id ||
      responseData?.property?.id ||
      responseData?.property?.property_id ||
      responseData?.data?.prop_id ||
      responseData?.data?.id ||
      responseData?.data?.property_id
    );
  };

  // ------------------------------------------------------------
  // Submit property details
  // Backend will automatically attach society_id, society_code,
  // society_name using logged-in user's token.
  //
  // New frontend flow:
  // Add Property -> Save -> Redirect to Manage Images
  // ------------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setMessage('');

      const res = await api.post('/properties', formData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const createdPropertyId = getCreatedPropertyId(res.data);

      // If backend returns created property ID, redirect to image manager
      if (createdPropertyId) {
        setMessage('Property added successfully ✅ Redirecting to image upload...');

        navigate(`/properties/${createdPropertyId}/images/manage`);
        return;
      }

      // Fallback safety:
      // If backend saved property but did not return ID, do not break the flow.
      // User can still go to My Properties and manage/edit from there.
      setMessage(
        'Property added successfully ✅ But property ID was not returned, so image upload page could not open automatically.'
      );

      navigate('/my-properties');
    } catch (error) {
      console.error('Add property error:', error);
      setMessage(error.response?.data?.message || 'Failed to add property');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="card" style={{ maxWidth: '850px', margin: '0 auto' }}>
        <h2>➕ Add Property</h2>

        {/* ------------------------------------------------------
            Read-only mapped society section
        ------------------------------------------------------ */}
        <div className="card" style={{ backgroundColor: '#f9fafb' }}>
          <h3>Mapped Society</h3>

          {society ? (
            <>
              <p><b>Society Code:</b> {society.society_code}</p>
              <p><b>Society Name:</b> {society.society_name}</p>
              <p><b>Address:</b> {society.address || 'N/A'}</p>
            </>
          ) : (
            <p>Loading mapped society...</p>
          )}
        </div>

        <form onSubmit={handleSubmit}>

          {/* ------------------------------------------------------
              Basic Property Details
          ------------------------------------------------------ */}
          <h3>Property Details</h3>

          <label>Wing and Flat No.</label>
          <input
            className="input"
            name="wing_flat_no"
            value={formData.wing_flat_no}
            onChange={handleChange}
            placeholder="Example: A-503"
            required
          />

          <label>Floor No.</label>
          <input
            className="input"
            type="number"
            name="floor_no"
            value={formData.floor_no}
            onChange={handleChange}
            placeholder="Example: 5"
            required
          />

          <label>Configuration</label>
          <select
            className="select"
            name="c_type"
            value={formData.c_type}
            onChange={handleChange}
            required
          >
            <option>1RK</option>
            <option>1BHK</option>
            <option>1.5BHK</option>
            <option>2BHK</option>
            <option>2.5BHK</option>
            <option>3BHK</option>
            <option>3.5BHK</option>
          </select>

          <label>Carpet Area (Sq.Ft)</label>
          <input
            className="input"
            type="number"
            name="carpet_area_sqft"
            value={formData.carpet_area_sqft}
            onChange={handleChange}
            placeholder="Example: 815"
            required
          />

          <label>Furnishing Type</label>
          <select
            className="select"
            name="f_type"
            value={formData.f_type}
            onChange={handleChange}
            required
          >
            <option>Fully-Furnished</option>
            <option>Semi-Furnished</option>
            <option>Un-Furnished</option>
          </select>

          <label>Furniture Details</label>
          <textarea
            className="textarea"
            name="furniture_details"
            value={formData.furniture_details}
            onChange={handleChange}
            placeholder="Example: Sofa, bed, wardrobe, AC, modular kitchen..."
            rows="3"
          />

          <label>Parking</label>
          <select
            className="select"
            name="parking_type"
            value={formData.parking_type}
            onChange={handleChange}
          >
            <option>Reserved</option>
            <option>Open Reserved</option>
            <option>No Parking</option>
          </select>

          <label>No. of Parking</label>
          <select
            className="select"
            name="parking_count"
            value={formData.parking_count}
            onChange={handleChange}
            disabled={formData.parking_type === 'No Parking'}
            style={{
              backgroundColor: formData.parking_type === 'No Parking' ? '#f3f4f6' : '#fff',
              cursor: formData.parking_type === 'No Parking' ? 'not-allowed' : 'pointer'
            }}
          >
            <option>0</option>
            <option>1</option>
            <option>2</option>
            <option>3</option>
          </select>

          <label>Available From</label>
          <input
            className="input"
            type="date"
            name="available_from"
            value={formData.available_from}
            onChange={handleChange}
          />

          <label>Property Description</label>
          <textarea
            className="textarea"
            name="property_description"
            value={formData.property_description}
            onChange={handleChange}
            placeholder="Add key highlights, view, condition, restrictions, etc."
            rows="3"
          />

          <hr style={{ margin: '24px 0' }} />

          {/* ------------------------------------------------------
              Owner / Internal Admin Details
          ------------------------------------------------------ */}
          <h3>Owner / Internal Details</h3>

          <label>Owner Name</label>
          <input
            className="input"
            name="owner_name"
            value={formData.owner_name}
            onChange={handleChange}
            placeholder="Owner name"
          />

          <label>Owner Contact</label>
          <input
            className="input"
            name="owner_contact"
            value={formData.owner_contact}
            onChange={handleChange}
            placeholder="Owner contact number"
          />

          <label>Admin Notes</label>
          <textarea
            className="textarea"
            name="admin_notes"
            value={formData.admin_notes}
            onChange={handleChange}
            placeholder="Internal admin note, not visible to buyers"
            rows="3"
          />

          <hr style={{ margin: '24px 0' }} />

          {/* ------------------------------------------------------
              Request Type / Transaction Details
          ------------------------------------------------------ */}
          <h3>Request Received</h3>

          <label>Request Type</label>
          <select
            className="select"
            name="request_type"
            value={formData.request_type}
            onChange={handleChange}
            required
          >
            <option>SALE</option>
            <option>RENT</option>
          </select>

          {/* SALE specific fields */}
          {formData.request_type === 'SALE' && (
            <>
              <h3>Sale Details</h3>

              <label>Expected Price</label>
              <input
                className="input"
                type="number"
                name="expected_price"
                value={formData.expected_price}
                onChange={handleChange}
                placeholder="Example: 9500000"
                required
              />

              <label>Negotiable</label>
              <select
                className="select"
                name="negotiable"
                value={formData.negotiable}
                onChange={handleChange}
              >
                <option>Yes</option>
                <option>No</option>
              </select>

              <label>Bottom Price</label>
              <input
                className="input"
                type="number"
                name="bottom_price"
                value={formData.bottom_price}
                onChange={handleChange}
                placeholder="Enter lowest acceptable price"
                disabled={formData.negotiable === 'No'}
                style={{
                  backgroundColor: formData.negotiable === 'No' ? '#f3f4f6' : '#fff',
                  cursor: formData.negotiable === 'No' ? 'not-allowed' : 'text'
                }}
              />

              <label>Monthly Maintenance</label>
              <input
                className="input"
                type="number"
                name="monthly_maintenance"
                value={formData.monthly_maintenance}
                onChange={handleChange}
                placeholder="Example: 3500"
              />
            </>
          )}

          {/* RENT specific fields */}
          {formData.request_type === 'RENT' && (
            <>
              <h3>Rent Details</h3>

              <label>Expected Rent</label>
              <input
                className="input"
                type="number"
                name="expected_rent"
                value={formData.expected_rent}
                onChange={handleChange}
                placeholder="Example: 30000"
                required
              />

              <label>Expected Deposit Amount</label>
              <input
                className="input"
                type="number"
                name="expected_deposit"
                value={formData.expected_deposit}
                onChange={handleChange}
                placeholder="Example: 90000"
                required
              />

              <label>Bottom Rent Price</label>
              <input
                className="input"
                type="number"
                name="bottom_rent_price"
                value={formData.bottom_rent_price}
                onChange={handleChange}
                placeholder="Example: 28000"
              />

              <label>Bottom Deposit Price</label>
              <input
                className="input"
                type="number"
                name="bottom_deposit_price"
                value={formData.bottom_deposit_price}
                onChange={handleChange}
                placeholder="Example: 75000"
              />

              <label>Monthly Maintenance</label>
              <input
                className="input"
                type="number"
                name="monthly_maintenance"
                value={formData.monthly_maintenance}
                onChange={handleChange}
                placeholder="Example: 3500"
              />
            </>
          )}

          <div style={{ marginTop: '20px' }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Saving Property...' : 'Add Property'}
            </button>
          </div>
        </form>

        {message && <p style={{ marginTop: '15px' }}>{message}</p>}
      </div>
    </div>
  );
}