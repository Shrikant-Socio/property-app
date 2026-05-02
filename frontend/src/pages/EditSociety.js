// ------------------------------------------------------------
// EditSociety.js
// ------------------------------------------------------------
// Platform Admin page to edit onboarded society details.
//
// Important rules:
// 1. Society Code is auto-generated during onboarding.
// 2. Society Code is NON-editable here.
// 3. Platform admin can update society operational/master details.
// 4. Society admin login password is NOT edited here.
// ------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

export default function EditSociety() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  // Common society amenities list
  const amenitiesList = [
    'Senior Citizen Area',
    'Children Play Area',
    'Swimming Pool',
    'Clubhouse',
    'Gym / Fitness Center',
    'Yoga / Meditation Center',
    'Jogging Track',
    'Landscape Garden',
    'Indoor Games Room',
    'Multipurpose Hall',
    'Library',
    'Amphitheater',
    'Basketball Court',
    'Badminton Court',
    'Tennis Court',
    'Cricket Net',
    'Pet Park',
    'CCTV Surveillance',
    'Security Cabin',
    'Rainwater Harvesting'
  ];

  // Full society edit form state
  const [formData, setFormData] = useState({
    society_code: '',
    society_name: '',
    address: '',
    google_map_link: '',
    apartment_count: '',
    amenities: [],
    lift_available: 'No',
    lift_types: [],
    visitor_parking: 'No',
    visitor_parking_count: '',
    entry_exit_points: '1',
    society_office_contact: '',
    society_email: '',
    city: '',
    pincode: '',
    status: 'active'
  });

  const [message, setMessage] = useState('');

  // Load society details on page open
  useEffect(() => {
    fetchSociety();
  }, [id]);

  // Fetch selected society data from backend
  const fetchSociety = async () => {
    try {
      const res = await api.get(`/societies/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setFormData({
        society_code: res.data.society_code || '',
        society_name: res.data.society_name || '',
        address: res.data.address || '',
        google_map_link: res.data.google_map_link || '',
        apartment_count: res.data.apartment_count || '',
        amenities: res.data.amenities || [],
        lift_available: res.data.lift_available ? 'Yes' : 'No',
        lift_types: res.data.lift_types || [],
        visitor_parking: res.data.visitor_parking ? 'Yes' : 'No',
        visitor_parking_count: res.data.visitor_parking_count || '',
        entry_exit_points: res.data.entry_exit_points || '1',
        society_office_contact: res.data.society_office_contact || '',
        society_email: res.data.society_email || '',
        city: res.data.city || '',
        pincode: res.data.pincode || '',
        status: res.data.status || 'active'
      });

    } catch (error) {
      console.error('Fetch society error:', error);
      setMessage('Failed to load society details');
    }
  };

  // Handle normal text/select field changes
  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData({
      ...formData,
      [name]: value
    });
  };

  // Handle amenities checkbox selection
  const handleAmenityChange = (amenity) => {
    const alreadySelected = formData.amenities.includes(amenity);

    setFormData({
      ...formData,
      amenities: alreadySelected
        ? formData.amenities.filter((item) => item !== amenity)
        : [...formData.amenities, amenity]
    });
  };

  // Handle lift type checkbox selection
  const handleLiftTypeChange = (type) => {
    const alreadySelected = formData.lift_types.includes(type);

    setFormData({
      ...formData,
      lift_types: alreadySelected
        ? formData.lift_types.filter((item) => item !== type)
        : [...formData.lift_types, type]
    });
  };

  // Submit updated society details
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.put(
        `/societies/${id}`,
        {
          ...formData,

          // Convert UI values into backend/database-friendly values
          apartment_count: formData.apartment_count
            ? Number(formData.apartment_count)
            : null,

          lift_available: formData.lift_available === 'Yes',

          visitor_parking: formData.visitor_parking === 'Yes',

          visitor_parking_count:
            formData.visitor_parking === 'Yes'
              ? Number(formData.visitor_parking_count || 0)
              : 0,

          entry_exit_points: Number(formData.entry_exit_points || 1)
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      alert('Society updated successfully ✅');
      navigate('/societies');

    } catch (error) {
      console.error('Update society error:', error);
      setMessage(error.response?.data?.message || 'Failed to update society');
    }
  };

  return (
    <div className="page-container">
      <div className="card" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h2>✏️ Edit Society</h2>
        <p className="muted">
          Update society master details. Society code is system-generated and cannot be changed.
        </p>

        <form onSubmit={handleSubmit}>
          <h3>Society Details</h3>

          <label>Society Code</label>
          <input
            className="input"
            name="society_code"
            value={formData.society_code}
            readOnly
            style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
          />

          <label>Society Name</label>
          <input
            className="input"
            name="society_name"
            value={formData.society_name}
            onChange={handleChange}
            required
          />

          <label>Society Address</label>
          <textarea
            className="textarea"
            name="address"
            value={formData.address}
            onChange={handleChange}
            required
          />

          <label>Society Google Map Link</label>
          <input
            className="input"
            name="google_map_link"
            value={formData.google_map_link}
            onChange={handleChange}
            placeholder="Paste Google Map link"
          />

          <label>Number of Apartments</label>
          <input
            className="input"
            type="number"
            name="apartment_count"
            value={formData.apartment_count}
            onChange={handleChange}
          />

          <label>City</label>
          <input
            className="input"
            name="city"
            value={formData.city}
            onChange={handleChange}
          />

          <label>Pincode</label>
          <input
            className="input"
            name="pincode"
            value={formData.pincode}
            onChange={handleChange}
          />

          <h3>Society Amenities</h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '8px',
              marginBottom: '20px'
            }}
          >
            {amenitiesList.map((amenity) => (
              <label key={amenity}>
                <input
                  type="checkbox"
                  checked={formData.amenities.includes(amenity)}
                  onChange={() => handleAmenityChange(amenity)}
                />
                {' '}{amenity}
              </label>
            ))}
          </div>

          <hr style={{ margin: '24px 0' }} />

          <label>Lift Available</label>
          <select
            className="select"
            name="lift_available"
            value={formData.lift_available}
            onChange={handleChange}
          >
            <option>No</option>
            <option>Yes</option>
          </select>

          {formData.lift_available === 'Yes' && (
            <>
              <label>Lift Type</label>

              {['Small (4 People)', 'Medium (6-10 People)', 'Luggage / Cargo'].map((type) => (
                <label key={type} style={{ display: 'block', marginBottom: '6px' }}>
                  <input
                    type="checkbox"
                    checked={formData.lift_types.includes(type)}
                    onChange={() => handleLiftTypeChange(type)}
                  />
                  {' '}{type}
                </label>
              ))}
            </>
          )}

          <label>Visitor Parking</label>
          <select
            className="select"
            name="visitor_parking"
            value={formData.visitor_parking}
            onChange={handleChange}
          >
            <option>No</option>
            <option>Yes</option>
          </select>

          <label>No. of Visitor Parking</label>
          <input
            className="input"
            type="number"
            name="visitor_parking_count"
            value={formData.visitor_parking_count}
            onChange={handleChange}
            disabled={formData.visitor_parking === 'No'}
            style={{
              backgroundColor: formData.visitor_parking === 'No' ? '#f3f4f6' : '#fff',
              cursor: formData.visitor_parking === 'No' ? 'not-allowed' : 'text'
            }}
          />

          <label>No. of Entry/Exit Points</label>
          <select
            className="select"
            name="entry_exit_points"
            value={formData.entry_exit_points}
            onChange={handleChange}
          >
            <option>1</option>
            <option>2</option>
            <option>3</option>
            <option>4</option>
            <option>5</option>
          </select>

          <hr style={{ margin: '24px 0' }} />

          <h3>Society Admin Department Details</h3>

          <label>Society Office Contact Number</label>
          <input
            className="input"
            name="society_office_contact"
            value={formData.society_office_contact}
            onChange={handleChange}
          />

          <label>Society Email ID</label>
          <input
            className="input"
            type="email"
            name="society_email"
            value={formData.society_email}
            onChange={handleChange}
          />

          <label>Status</label>
          <select
            className="select"
            name="status"
            value={formData.status}
            onChange={handleChange}
          >
            <option value="active">active</option>
            <option value="pending">pending</option>
            <option value="inactive">inactive</option>
          </select>

          <button className="btn btn-primary" type="submit">
            Update Society
          </button>
        </form>

        {message && <p style={{ marginTop: '16px' }}>{message}</p>}
      </div>
    </div>
  );
}