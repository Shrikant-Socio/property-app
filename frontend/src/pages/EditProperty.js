// ------------------------------------------------------------
// EditProperty.js
// ------------------------------------------------------------
// Society Admin page to edit existing property.
//
// This form now matches AddProperty.js fields.
// It supports:
// - Basic property details
// - Sale/Rent conditional pricing
// - Image upload section
// - Existing image preview
// ------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

export default function EditProperty() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  // Mapped society details
  const [society, setSociety] = useState(null);

  // Existing uploaded images
  const [images, setImages] = useState([]);

  // Selected image file
  const [selectedFile, setSelectedFile] = useState(null);

  // Message
  const [message, setMessage] = useState('');

  // Same fields as AddProperty.js
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

    available_from: '',
    property_description: '',
    owner_name: '',
    owner_contact: '',
    admin_notes: ''
  });

  useEffect(() => {
    fetchProperty();
    fetchImages();
  }, [id]);

  // Fetch property details and populate full edit form
  const fetchProperty = async () => {
    try {
      const res = await api.get(`/properties/${id}`);

      setSociety({
        society_code: res.data.society_code || res.data.society_cd || '',
        society_name: res.data.society_name || res.data.so_name || '',
        address: res.data.society_address || res.data.so_location || ''
      });

      setFormData({
        wing_flat_no: res.data.wing_flat_no || '',
        floor_no: res.data.floor_no || '',
        c_type: res.data.c_type || '2BHK',
        carpet_area_sqft: res.data.carpet_area_sqft || '',
        f_type: res.data.f_type || 'Semi-Furnished',
        furniture_details: res.data.furniture_details || '',
        parking_type: res.data.parking_type || 'Reserved',
        parking_count: res.data.parking_count ?? '1',
        request_type: res.data.request_type || res.data.a_type || 'SALE',

        expected_price: res.data.expected_price || '',
        negotiable: res.data.negotiable || (res.data.negotiate ? 'Yes' : 'No'),
        bottom_price: res.data.bottom_price || '',
        monthly_maintenance: res.data.monthly_maintenance || '',

        expected_rent: res.data.expected_rent || '',
        expected_deposit: res.data.expected_deposit || '',
        bottom_rent_price: res.data.bottom_rent_price || '',
        bottom_deposit_price: res.data.bottom_deposit_price || '',

        available_from: res.data.available_from
          ? res.data.available_from.substring(0, 10)
          : '',
        property_description: res.data.property_description || '',
        owner_name: res.data.owner_name || '',
        owner_contact: res.data.owner_contact || '',
        admin_notes: res.data.admin_notes || ''
      });

    } catch (error) {
      console.error('Fetch property error:', error);
      setMessage('Failed to load property details');
    }
  };

  // Fetch existing property images
  const fetchImages = async () => {
    try {
      const res = await api.get(`/properties/${id}/images`);
      setImages(res.data);
    } catch (error) {
      console.error('Fetch images error:', error);
    }
  };

  // Handle form changes
  const handleChange = (e) => {
    const { name, value } = e.target;

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

    if (name === 'negotiable' && value === 'No') {
      setFormData({
        ...formData,
        negotiable: value,
        bottom_price: ''
      });
      return;
    }

    if (name === 'parking_type' && value === 'No Parking') {
      setFormData({
        ...formData,
        parking_type: value,
        parking_count: '0'
      });
      return;
    }

    setFormData({
      ...formData,
      [name]: value
    });
  };

  // Submit updated property details
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.put(`/properties/${id}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      alert('Property updated successfully ✅');
      navigate('/my-properties');

    } catch (error) {
      console.error('Update property error:', error);
      setMessage(error.response?.data?.message || 'Failed to update property');
    }
  };

  // Select image file
  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  // Upload image
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

  return (
    <div className="page-container">
      <div className="card" style={{ maxWidth: '850px', margin: '0 auto' }}>
        <h2>✏️ Edit Property</h2>

        {/* Read-only society details */}
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

        {message && <p style={{ marginTop: '15px' }}>{message}</p>}

        <hr style={{ margin: '24px 0' }} />

        <h3>🖼 Upload Property Image</h3>

        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="input"
        />

        <button className="btn btn-success" onClick={handleUploadImage}>
          Upload Image
        </button>

        <div style={{ marginTop: '24px' }}>
          <h3>Existing Images</h3>

          {images.length === 0 ? (
            <p className="muted">No images added yet</p>
          ) : (
            <div className="property-grid">
              {images.map((img) => (
                <div key={img.image_id} className="card">
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