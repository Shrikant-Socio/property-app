// ------------------------------------------------------------
// EditProperty.js
// ------------------------------------------------------------
// SocioDeal - Edit Property Page
//
// Purpose:
// - Load existing property by ID
// - Populate all new property fields correctly
// - Update property using only new fields
// - Keep image upload section working
//
// Important:
// - Frontend uses NEW fields only
// - Old compatibility fields like price, a_type, so_name, so_location
//   are handled safely by backend only
// ------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

export default function EditProperty() {
  const { id } = useParams();
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  const [society, setSociety] = useState(null);
  const [images, setImages] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

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

    expected_price: '',
    negotiable: 'Yes',
    bottom_price: '',
    monthly_maintenance: '',

    expected_rent: '',
    expected_deposit: '',
    bottom_rent_price: '',
    bottom_deposit_price: '',

    property_status: 'AVAILABLE',
    available_from: '',
    property_description: '',
    owner_name: '',
    owner_contact: '',
    admin_notes: ''
  });

  // ------------------------------------------------------------
  // Common auth header for protected APIs
  // ------------------------------------------------------------
  const authConfig = {
    headers: {
      Authorization: `Bearer ${token}`
    }
  };

  // ------------------------------------------------------------
  // Convert backend value safely to input value
  // React input fields should not receive null/undefined
  // ------------------------------------------------------------
  const safeValue = (value) => {
    if (value === null || value === undefined) return '';
    return String(value);
  };

  // ------------------------------------------------------------
  // Convert date from backend timestamp to yyyy-mm-dd for date input
  // Example backend: 2026-04-30T18:30:00.000Z
  // ------------------------------------------------------------
  const formatDateForInput = (dateValue) => {
    if (!dateValue) return '';
    return String(dateValue).substring(0, 10);
  };

  // ------------------------------------------------------------
  // Load property + images when page opens
  // ------------------------------------------------------------
  useEffect(() => {
    fetchProperty();
    fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ------------------------------------------------------------
  // Fetch property details
  // ------------------------------------------------------------
  const fetchProperty = async () => {
    try {
      setLoading(true);
      setMessage('');

      const res = await api.get(`/properties/${id}`, authConfig);
      const property = res.data;

      console.log('Loaded property for edit:', property);

      // Society details are read-only on edit page
      setSociety({
        society_code: property.society_code || property.society_cd || '',
        society_name: property.society_name || property.so_name || '',
        address: property.society_address || property.so_location || ''
      });

      // Populate form with NEW property fields
      setFormData({
        wing_flat_no: safeValue(property.wing_flat_no),
        floor_no: safeValue(property.floor_no),
        c_type: property.c_type || '2BHK',
        carpet_area_sqft: safeValue(property.carpet_area_sqft),
        f_type: property.f_type || 'Semi-Furnished',
        furniture_details: safeValue(property.furniture_details),
        parking_type: property.parking_type || 'Reserved',
        parking_count: safeValue(property.parking_count || '1'),
        request_type: property.request_type || property.a_type || 'SALE',

        expected_price: safeValue(property.expected_price),
        negotiable:
          property.negotiable ||
          (property.negotiate === true ? 'Yes' : 'No'),
        bottom_price: safeValue(property.bottom_price),
        monthly_maintenance: safeValue(property.monthly_maintenance),

        expected_rent: safeValue(property.expected_rent),
        expected_deposit: safeValue(property.expected_deposit),
        bottom_rent_price: safeValue(property.bottom_rent_price),
        bottom_deposit_price: safeValue(property.bottom_deposit_price),

        property_status: property.property_status || 'AVAILABLE',
        available_from: formatDateForInput(property.available_from),
        property_description: safeValue(property.property_description),
        owner_name: safeValue(property.owner_name),
        owner_contact: safeValue(property.owner_contact),
        admin_notes: safeValue(property.admin_notes)
      });
    } catch (error) {
      console.error('Fetch property error:', error);

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          'Failed to load property details'
      );
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // Fetch existing property images
  // If backend image API is not ready, do not break edit page
  // ------------------------------------------------------------
  const fetchImages = async () => {
    try {
      const res = await api.get(`/properties/${id}/images`, authConfig);
      setImages(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.warn('Image API not available or failed:', error);
      setImages([]);
    }
  };

  // ------------------------------------------------------------
  // Handle form changes
  // ------------------------------------------------------------
  const handleChange = (e) => {
    const { name, value } = e.target;

    // When request type changes, clear opposite pricing fields
    if (name === 'request_type') {
      setFormData((prev) => ({
        ...prev,
        request_type: value,

        expected_price: value === 'SALE' ? prev.expected_price : '',
        negotiable: 'Yes',
        bottom_price: value === 'SALE' ? prev.bottom_price : '',

        expected_rent: value === 'RENT' ? prev.expected_rent : '',
        expected_deposit: value === 'RENT' ? prev.expected_deposit : '',
        bottom_rent_price: value === 'RENT' ? prev.bottom_rent_price : '',
        bottom_deposit_price:
          value === 'RENT' ? prev.bottom_deposit_price : ''
      }));
      return;
    }

    // If negotiable is No, clear bottom price
    if (name === 'negotiable' && value === 'No') {
      setFormData((prev) => ({
        ...prev,
        negotiable: value,
        bottom_price: ''
      }));
      return;
    }

    // If no parking, parking count must be 0
    if (name === 'parking_type' && value === 'No Parking') {
      setFormData((prev) => ({
        ...prev,
        parking_type: value,
        parking_count: '0'
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // ------------------------------------------------------------
  // Submit updated property
  // ------------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setMessage('');

      const payload = {
        ...formData,

        // Keep SALE fields only for SALE
        expected_price:
          formData.request_type === 'SALE' ? formData.expected_price : '',
        bottom_price:
          formData.request_type === 'SALE' ? formData.bottom_price : '',

        // Keep RENT fields only for RENT
        expected_rent:
          formData.request_type === 'RENT' ? formData.expected_rent : '',
        expected_deposit:
          formData.request_type === 'RENT' ? formData.expected_deposit : '',
        bottom_rent_price:
          formData.request_type === 'RENT'
            ? formData.bottom_rent_price
            : '',
        bottom_deposit_price:
          formData.request_type === 'RENT'
            ? formData.bottom_deposit_price
            : ''
      };

      await api.put(`/properties/${id}`, payload, authConfig);

      alert('Property updated successfully ✅');
      navigate('/my-properties');
    } catch (error) {
      console.error('Update property error:', error);

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          'Failed to update property'
      );
    }
  };

  // ------------------------------------------------------------
  // Image file selection
  // ------------------------------------------------------------
  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  // ------------------------------------------------------------
  // Upload property image
  // ------------------------------------------------------------
  const handleUploadImage = async () => {
    if (!selectedFile) {
      alert('Please choose an image file first');
      return;
    }

    try {
      const uploadData = new FormData();
      uploadData.append('image', selectedFile);

      await api.post(`/properties/${id}/upload-image`, uploadData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      alert('Image uploaded successfully ✅');
      setSelectedFile(null);
      fetchImages();
    } catch (error) {
      console.error('Upload image error:', error);

      alert(
        error.response?.data?.message ||
          error.response?.data?.error ||
          'Image upload failed'
      );
    }
  };

  // ------------------------------------------------------------
  // Loading state
  // ------------------------------------------------------------
  if (loading) {
    return (
      <div className="page-container">
        <div className="card" style={{ maxWidth: '850px', margin: '0 auto' }}>
          <h2>✏️ Edit Property</h2>
          <p>Loading property details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="card" style={{ maxWidth: '850px', margin: '0 auto' }}>
        <h2>✏️ Edit Property</h2>

        {/* Read-only mapped society section */}
        <div className="card" style={{ backgroundColor: '#f9fafb' }}>
          <h3>Mapped Society</h3>

          {society ? (
            <>
              <p>
                <b>Society Code:</b> {society.society_code || 'N/A'}
              </p>
              <p>
                <b>Society Name:</b> {society.society_name || 'N/A'}
              </p>
              <p>
                <b>Address:</b> {society.address || 'N/A'}
              </p>
            </>
          ) : (
            <p>Society details not available</p>
          )}
        </div>

        {message && (
          <p style={{ color: 'red', marginTop: '15px' }}>{message}</p>
        )}

        <form onSubmit={handleSubmit}>
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
            <option>4BHK</option>
          </select>

          <label>Carpet Area (Sq.Ft)</label>
          <input
            className="input"
            type="number"
            name="carpet_area_sqft"
            value={formData.carpet_area_sqft}
            onChange={handleChange}
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
            <option>Covered</option>
            <option>Open</option>
            <option>No Parking</option>
          </select>

          <label>No. of Parking</label>
          <select
            className="select"
            name="parking_count"
            value={formData.parking_count}
            onChange={handleChange}
            disabled={formData.parking_type === 'No Parking'}
          >
            <option>0</option>
            <option>1</option>
            <option>2</option>
            <option>3</option>
          </select>

          <label>Property Status</label>
          <select
            className="select"
            name="property_status"
            value={formData.property_status}
            onChange={handleChange}
          >
            <option>AVAILABLE</option>
            <option>ON_HOLD</option>
            <option>CLOSED</option>
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
            rows="3"
          />

          <hr style={{ margin: '24px 0' }} />

          <h3>Owner / Internal Details</h3>

          <label>Owner Name</label>
          <input
            className="input"
            name="owner_name"
            value={formData.owner_name}
            onChange={handleChange}
          />

          <label>Owner Contact</label>
          <input
            className="input"
            name="owner_contact"
            value={formData.owner_contact}
            onChange={handleChange}
          />

          <label>Admin Notes</label>
          <textarea
            className="textarea"
            name="admin_notes"
            value={formData.admin_notes}
            onChange={handleChange}
            rows="3"
          />

          <hr style={{ margin: '24px 0' }} />

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
                disabled={formData.negotiable === 'No'}
              />

              <label>Monthly Maintenance</label>
              <input
                className="input"
                type="number"
                name="monthly_maintenance"
                value={formData.monthly_maintenance}
                onChange={handleChange}
              />
            </>
          )}

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
                required
              />

              <label>Expected Deposit Amount</label>
              <input
                className="input"
                type="number"
                name="expected_deposit"
                value={formData.expected_deposit}
                onChange={handleChange}
                required
              />

              <label>Bottom Rent Price</label>
              <input
                className="input"
                type="number"
                name="bottom_rent_price"
                value={formData.bottom_rent_price}
                onChange={handleChange}
              />

              <label>Bottom Deposit Price</label>
              <input
                className="input"
                type="number"
                name="bottom_deposit_price"
                value={formData.bottom_deposit_price}
                onChange={handleChange}
              />

              <label>Monthly Maintenance</label>
              <input
                className="input"
                type="number"
                name="monthly_maintenance"
                value={formData.monthly_maintenance}
                onChange={handleChange}
              />
            </>
          )}

          <div style={{ marginTop: '20px' }}>
            <button className="btn btn-primary" type="submit">
              Update Property
            </button>
          </div>
        </form>

        <hr style={{ margin: '24px 0' }} />

        <h3>🖼 Upload Property Image</h3>

        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="input"
        />

        <button
          type="button"
          className="btn btn-success"
          onClick={handleUploadImage}
          style={{ marginTop: '10px' }}
        >
          Upload Image
        </button>

        <div style={{ marginTop: '24px' }}>
          <h3>Existing Images</h3>

          {images.length === 0 ? (
            <p className="muted">No images added yet</p>
          ) : (
            <div className="property-grid">
              {images.map((img) => (
                <div key={img.image_id || img.image_url} className="card">
                  <img
                    src={img.image_url}
                    alt="Property"
                    style={{
                      width: '100%',
                      height: '160px',
                      objectFit: 'cover',
                      borderRadius: '8px'
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}