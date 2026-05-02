// ------------------------------------------------------------
// SocietyOnboarding.js
// Platform Admin page to onboard society + create society admin
// ------------------------------------------------------------

import { useState } from 'react';
import api from '../services/api';

export default function SocietyOnboarding() {
  const token = localStorage.getItem('token');

  // Society code preview. Final code should also be generated/validated by backend.
  const generateSocietyCode = () => {
    const random = Math.floor(100000 + Math.random() * 900000);
    return `SD-${random}`;
  };

  // Common society amenities shown as checkboxes
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

  const [formData, setFormData] = useState({
    society_code: generateSocietyCode(),
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

    admin_name: '',
    admin_contact_number: '',
    society_office_contact: '',
    admin_email: '',
    society_email: '',
    admin_password: ''
  });

  const [message, setMessage] = useState('');

  // Handles normal input/select changes
  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData({
      ...formData,
      [name]: value
    });
  };

  // Handles amenities checkbox selection
  const handleAmenityChange = (amenity) => {
    const alreadySelected = formData.amenities.includes(amenity);

    setFormData({
      ...formData,
      amenities: alreadySelected
        ? formData.amenities.filter((item) => item !== amenity)
        : [...formData.amenities, amenity]
    });
  };

  // Handles lift type multi-select checkbox
  const handleLiftTypeChange = (type) => {
    const alreadySelected = formData.lift_types.includes(type);

    setFormData({
      ...formData,
      lift_types: alreadySelected
        ? formData.lift_types.filter((item) => item !== type)
        : [...formData.lift_types, type]
    });
  };

  // Submit society + admin creation request
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.post(
        '/societies',
        {
          ...formData,

          // Convert values before sending to backend
          apartment_count: Number(formData.apartment_count),
          lift_available: formData.lift_available === 'Yes',
          visitor_parking: formData.visitor_parking === 'Yes',
          visitor_parking_count:
            formData.visitor_parking === 'Yes'
              ? Number(formData.visitor_parking_count)
              : 0,
          entry_exit_points: Number(formData.entry_exit_points)
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setMessage('Society onboarded successfully ✅');

      setFormData({
        society_code: generateSocietyCode(),
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

        admin_name: '',
        admin_contact_number: '',
        society_office_contact: '',
        admin_email: '',
        society_email: '',
        admin_password: ''
      });

    } catch (error) {
      console.error('Society onboarding error:', error);
      setMessage(error.response?.data?.message || 'Failed to onboard society');
    }
  };

  return (
    <div className="page-container">
      <div className="card" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h2>🏢 Onboard New Society</h2>
        <p className="muted">
          Platform admin can onboard a society and create its first society admin.
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
            required
          />

          <h3>Society Amenities</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
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
                <label key={type} style={{ display: 'block' }}>
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
              backgroundColor: formData.visitor_parking === 'No' ? '#f3f4f6' : '#fff'
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

          <label>Admin Person Name</label>
          <input
            className="input"
            name="admin_name"
            value={formData.admin_name}
            onChange={handleChange}
            required
          />

          <label>Admin Contact Number</label>
          <input
            className="input"
            name="admin_contact_number"
            value={formData.admin_contact_number}
            onChange={handleChange}
            required
          />

          <label>Society Office Contact Number</label>
          <input
            className="input"
            name="society_office_contact"
            value={formData.society_office_contact}
            onChange={handleChange}
          />

          <label>Admin Email ID</label>
          <input
            className="input"
            type="email"
            name="admin_email"
            value={formData.admin_email}
            onChange={handleChange}
            required
          />

          <label>Society Email ID</label>
          <input
            className="input"
            type="email"
            name="society_email"
            value={formData.society_email}
            onChange={handleChange}
          />

          <label>Login Password for First Login</label>
          <input
            className="input"
            type="password"
            name="admin_password"
            value={formData.admin_password}
            onChange={handleChange}
            required
          />

          <button className="btn btn-primary" type="submit">
            Onboard Society
          </button>
        </form>

        {message && <p style={{ marginTop: '16px' }}>{message}</p>}
      </div>
    </div>
  );
}