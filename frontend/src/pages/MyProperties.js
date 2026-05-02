import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function MyProperties() {
  const [properties, setProperties] = useState([]);
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchMyProperties();
  }, []);

  const fetchMyProperties = async () => {
    try {
      const res = await api.get('/my-properties', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setProperties(res.data);
    } catch (error) {
      console.error('Error fetching properties:', error);
    }
  };

  const deleteProperty = async (id) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this property?');

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

  return (
    <div style={{ padding: '20px' }}>
      <h2>🏠 My Properties</h2>

      {properties.length === 0 ? (
        <p>No properties found</p>
      ) : (
        properties.map((p) => (
          <div
            key={p.prop_id}
            style={{
              border: '1px solid #ccc',
              padding: '10px',
              marginBottom: '10px',
              borderRadius: '6px'
            }}
          >
            <h3>{p.so_name}</h3>
            <p><b>Location:</b> {p.so_location}</p>
            <p><b>Config:</b> {p.c_type}</p>
            <p><b>Type:</b> {p.a_type}</p>
            <p><b>Price:</b> ₹{p.price}</p>
            <p><b>Negotiable:</b> {p.negotiate ? 'Yes' : 'No'}</p>

            <div style={{ marginTop: '10px' }}>
              <Link to={`/edit-property/${p.prop_id}`}>
                <button style={{ marginRight: '10px' }}>Edit</button>
              </Link>

              <button
                onClick={() => deleteProperty(p.prop_id)}
                style={{ background: 'red', color: 'white' }}
              >
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}