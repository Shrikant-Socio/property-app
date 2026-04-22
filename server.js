const upload = require('./upload');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const pool = require('./db');

const app = express();
console.log(process.env.JWT_SECRET);
// ===============================
// MIDDLEWARE
// ===============================
app.use(cors());
app.use(express.json());

// ===============================
// AUTH MIDDLEWARE
// ===============================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  // Expected format: Bearer <token>
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token missing' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  });
};

// ===============================
// ROLE CHECK MIDDLEWARE
// ===============================
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied for this role' });
    }
    next();
  };
};

// ===============================
// BASIC ROUTES
// ===============================
app.get('/', (req, res) => {
  res.send('Server is running 🚀');
});

app.get('/test', (req, res) => {
  res.json({ message: 'API is working ✅' });
});

// ===============================
// AUTH APIs
// ===============================

// REGISTER USER
app.post('/register', async (req, res) => {
  try {
    const { full_name, email, phone, password, role } = req.body;

    if (!full_name || !email || !password || !role) {
      return res.status(400).json({ message: 'Required fields are missing' });
    }

    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR phone = $2',
      [email, phone || null]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists with email or phone' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, phone, password, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, full_name, email, phone, role, created_at`,
      [full_name, email, phone || null, hashedPassword, role]
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).send('Server error');
  }
});

// LOGIN USER
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const user = result.rows[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).send('Server error');
  }
});

// ===============================
// PROPERTY APIs
// ===============================

// CREATE PROPERTY
// Only society_admin should ideally create properties
app.post(
  '/properties',
  authenticateToken,
  authorizeRoles('society_admin'),
  async (req, res) => {
    try {
      const {
        society_cd,
        so_name,
        so_location,
        f_type,
        c_type,
        a_type,
        price,
        negotiate
      } = req.body;

      const created_by = req.user.user_id;

      const result = await pool.query(
        `INSERT INTO properties
         (society_cd, so_name, so_location, f_type, c_type, a_type, price, negotiate, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          society_cd,
          so_name,
          so_location,
          f_type,
          c_type,
          a_type,
          price,
          negotiate,
          created_by
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Error creating property:', err);
      res.status(500).send('Server error');
    }
  }
);

// GET ALL PROPERTIES
app.get('/properties', async (req, res) => {
  try {
    const {
      location,
      c_type,
      a_type,
      min_price,
      max_price,
      page = 1,
      limit = 5,
      sort = 'latest'
    } = req.query;

    let query = 'SELECT * FROM properties WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) FROM properties WHERE 1=1';
    const values = [];

    // Filter by location
    if (location) {
      values.push(`%${location}%`);
      query += ` AND so_location ILIKE $${values.length}`;
      countQuery += ` AND so_location ILIKE $${values.length}`;
    }

    // Filter by config
    if (c_type) {
      values.push(c_type);
      query += ` AND c_type = $${values.length}`;
      countQuery += ` AND c_type = $${values.length}`;
    }

    // Filter by transaction type
    if (a_type) {
      values.push(a_type);
      query += ` AND a_type = $${values.length}`;
      countQuery += ` AND a_type = $${values.length}`;
    }

    // Filter by minimum price
    if (min_price) {
      values.push(min_price);
      query += ` AND price >= $${values.length}`;
      countQuery += ` AND price >= $${values.length}`;
    }

    // Filter by maximum price
    if (max_price) {
      values.push(max_price);
      query += ` AND price <= $${values.length}`;
      countQuery += ` AND price <= $${values.length}`;
    }

    // Sorting
    if (sort === 'price_asc') {
      query += ' ORDER BY price ASC';
    } else if (sort === 'price_desc') {
      query += ' ORDER BY price DESC';
    } else {
      query += ' ORDER BY prop_id DESC'; // latest first
    }

    // Pagination
    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    if (isNaN(pageNumber) || pageNumber < 1) {
  return res.status(400).json({ message: 'Invalid page number' });
}

if (isNaN(pageSize) || pageSize < 1) {
  return res.status(400).json({ message: 'Invalid limit value' });
}
    const offset = (pageNumber - 1) * pageSize;

    values.push(pageSize);
    query += ` LIMIT $${values.length}`;

    values.push(offset);
    query += ` OFFSET $${values.length}`;

    // Execute queries
    const dataResult = await pool.query(query, values);

    const countValues = values.slice(0, values.length - 2); // exclude LIMIT/OFFSET
    const countResult = await pool.query(countQuery, countValues);

    const totalRecords = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalRecords / pageSize);

    res.json({
      page: pageNumber,
      limit: pageSize,
      totalRecords,
      totalPages,
      sort,
      data: dataResult.rows
    });
  } catch (err) {
    console.error('Error fetching paginated properties:', err);
    res.status(500).send('Server error');
  }
});
// 🔹 GET SINGLE PROPERTY DETAILS
app.get('/properties/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        p.*,
        u.full_name AS owner_name,
        u.email AS owner_email,
        u.phone AS owner_phone
       FROM properties p
       LEFT JOIN users u ON p.created_by = u.user_id
       WHERE p.prop_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error('Error fetching property details:', err);
    res.status(500).send('Server error');
  }
});
app.put('/properties/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      society_cd,
      so_name,
      so_location,
      f_type,
      c_type,
      a_type,
      price,
      negotiate
    } = req.body;

    const propertyResult = await pool.query(
      'SELECT * FROM properties WHERE prop_id = $1',
      [id]
    );

    if (propertyResult.rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const property = propertyResult.rows[0];

    if (property.created_by !== req.user.user_id) {
      return res.status(403).json({ message: 'Not authorized to edit this property' });
    }

    const result = await pool.query(
      `UPDATE properties
       SET society_cd = $1,
           so_name = $2,
           so_location = $3,
           f_type = $4,
           c_type = $5,
           a_type = $6,
           price = $7,
           negotiate = $8
       WHERE prop_id = $9
       RETURNING *`,
      [society_cd, so_name, so_location, f_type, c_type, a_type, price, negotiate, id]
    );

    res.json({
      message: 'Property updated successfully',
      property: result.rows[0]
    });

  } catch (err) {
    console.error('Update property error:', err);
    res.status(500).send('Server error');
  }
});
app.get(
  '/my-properties',
  authenticateToken,
  authorizeRoles('society_admin'),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT *
         FROM properties
         WHERE created_by = $1
         ORDER BY prop_id DESC`,
        [req.user.user_id]
      );

      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching my properties:', err);
      res.status(500).send('Server error');
    }
  }
)
// --------------------------------------------------
// Upload a real image file for a property
// This version handles multer/cloudinary errors clearly
// --------------------------------------------------
app.post('/properties/:id/upload-image', authenticateToken, (req, res) => {
  // Call multer middleware manually so we can catch upload errors
  upload.single('image')(req, res, async (err) => {
    try {
      // ------------------------------------------
      // STEP 1: Handle upload middleware errors
      // ------------------------------------------
      if (err) {
        console.error('Multer/Cloudinary upload error:', err);

        return res.status(400).json({
          message: 'Upload middleware failed',
          error: err.message || 'Unknown upload error'
        });
      }

      // ------------------------------------------
      // STEP 2: Confirm request reached backend
      // ------------------------------------------
      console.log('Upload route hit successfully');
      console.log('Property ID:', req.params.id);
      console.log('Uploaded file object:', req.file);

      const { id } = req.params;

      // ------------------------------------------
      // STEP 3: Check property exists
      // ------------------------------------------
      const propertyResult = await pool.query(
        'SELECT * FROM properties WHERE prop_id = $1',
        [id]
      );

      if (propertyResult.rows.length === 0) {
        return res.status(404).json({ message: 'Property not found' });
      }

      const property = propertyResult.rows[0];

      // ------------------------------------------
      // STEP 4: Check ownership
      // Only property owner/admin can upload image
      // ------------------------------------------
      if (property.created_by !== req.user.user_id) {
        return res.status(403).json({
          message: 'Not authorized to upload image for this property'
        });
      }

      // ------------------------------------------
      // STEP 5: Validate uploaded file path
      // Cloudinary URL should be available in req.file.path
      // ------------------------------------------
      const imageUrl = req.file?.path;

      if (!imageUrl) {
        return res.status(400).json({
          message: 'Image upload failed',
          error: 'No file URL returned from Cloudinary'
        });
      }

      console.log('Image uploaded to Cloudinary:', imageUrl);

      // ------------------------------------------
      // STEP 6: Save image URL into DB
      // ------------------------------------------
      const result = await pool.query(
        `INSERT INTO property_images (property_id, image_url)
         VALUES ($1, $2)
         RETURNING *`,
        [id, imageUrl]
      );

      // ------------------------------------------
      // STEP 7: Return success response
      // ------------------------------------------
      res.status(201).json({
        message: 'Image uploaded successfully',
        image: result.rows[0]
      });

    } catch (error) {
      console.error('Upload route runtime error:', error);

      res.status(500).json({
        message: 'Image upload failed',
        error: error.message || 'Server error'
      });
    }
  });
});
app.delete('/properties/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Check property exists
    const propertyResult = await pool.query(
      'SELECT * FROM properties WHERE prop_id = $1',
      [id]
    );

    if (propertyResult.rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const property = propertyResult.rows[0];

    // 2. Check ownership
    if (property.created_by !== req.user.user_id) {
      return res.status(403).json({ message: 'Not authorized to delete this property' });
    }

    // 3. Check if inquiries exist
    const inquiryResult = await pool.query(
      'SELECT inquiry_id FROM inquiries WHERE property_id = $1 LIMIT 1',
      [id]
    );

    if (inquiryResult.rows.length > 0) {
      return res.status(400).json({
        message: 'Cannot delete property because inquiries already exist for it'
      });
    }

    // 4. Delete property
    await pool.query(
      'DELETE FROM properties WHERE prop_id = $1',
      [id]
    );

    res.json({ message: 'Property deleted successfully' });

  } catch (err) {
    console.error('Delete property error:', err);
    res.status(500).send('Server error');
  }
});

// ===============================
// INQUIRY APIs
// ===============================

// CREATE INQUIRY
// Buyer / tenant / society_admin can be allowed, but typically buyer/tenant
app.post(
  '/inquiry',
  authenticateToken,
  authorizeRoles('buyer', 'tenant'),
  async (req, res) => {
    try {
      const { property_id, message } = req.body;

      const userResult = await pool.query(
        'SELECT user_id, full_name, phone FROM users WHERE user_id = $1',
        [req.user.user_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const user = userResult.rows[0];

      const result = await pool.query(
        `INSERT INTO inquiries (property_id, user_id, name, phone, message)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [property_id, user.user_id, user.full_name, user.phone, message]
      );

      res.status(201).json(result.rows[0]);

    } catch (err) {
      // 👇 Handle duplicate inquiry
      if (err.code === '23505') {
        return res.status(400).json({
          message: 'You have already sent an inquiry for this property'
        });
      }

      console.error('Error creating inquiry:', err);
      res.status(500).send('Server error');
    }
  }
);

// GET ALL INQUIRIES WITH PROPERTY DETAILS
app.get(
  '/inquiries',
  authenticateToken,
  authorizeRoles('society_admin'),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          i.inquiry_id,
          i.user_id,
          i.property_id,
          i.name,
          i.phone,
          i.message,
          i.status,
          i.created_at,
          p.society_cd,
          p.so_name,
          p.so_location,
          p.f_type,
          p.c_type,
          p.a_type,
          p.price,
          p.negotiate,
          p.created_by
        FROM inquiries i
        JOIN properties p ON i.property_id = p.prop_id
        WHERE p.created_by = $1
        ORDER BY i.inquiry_id DESC
      `, [req.user.user_id]);

      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching inquiries:', err);
      res.status(500).send('Server error');
    }
  }
);  

// UPDATE INQUIRY STATUS
app.patch(
  '/inquiry/:id',
  authenticateToken,
  authorizeRoles('society_admin'),
  async (req, res) => {
    try {
      const { status } = req.body;
      const { id } = req.params;

      console.log('Updating inquiry:', id, 'to status:', status);

      let updateQuery = '';
      let values = [status, id];

      if (status === 'contacted') {
        updateQuery = `
          UPDATE inquiries
          SET status = $1, contacted_at = CURRENT_TIMESTAMP
          WHERE inquiry_id = $2
          RETURNING *`;
      } else if (status === 'visit_scheduled') {
        updateQuery = `
          UPDATE inquiries
          SET status = $1, visit_scheduled_at = CURRENT_TIMESTAMP
          WHERE inquiry_id = $2
          RETURNING *`;
      } else if (status === 'closed' || status === 'rejected') {
        updateQuery = `
          UPDATE inquiries
          SET status = $1, closed_at = CURRENT_TIMESTAMP
          WHERE inquiry_id = $2
          RETURNING *`;
      } else {
        updateQuery = `
          UPDATE inquiries
          SET status = $1
          WHERE inquiry_id = $2
          RETURNING *`;
      }

      const result = await pool.query(updateQuery, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Inquiry not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error updating inquiry:', err);
      res.status(500).send('Server error');
    }
  }
);

// Add image URL for a property
app.post('/properties/:id/images', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { image_url } = req.body;

    // Check property exists
    const propertyResult = await pool.query(
      'SELECT * FROM properties WHERE prop_id = $1',
      [id]
    );

    if (propertyResult.rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const property = propertyResult.rows[0];

    // Ensure only owner can add image
    if (property.created_by !== req.user.user_id) {
      return res.status(403).json({ message: 'Not authorized to add image to this property' });
    }

    const result = await pool.query(
      `INSERT INTO property_images (property_id, image_url)
       VALUES ($1, $2)
       RETURNING *`,
      [id, image_url]
    );

    res.status(201).json({
      message: 'Image added successfully',
      image: result.rows[0]
    });

  } catch (err) {
    console.error('Add image error:', err);
    res.status(500).send('Server error');
  }
});

// Get images for one property
app.get('/properties/:id/images', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM property_images WHERE property_id = $1 ORDER BY image_id DESC',
      [id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error('Fetch images error:', err);
    res.status(500).send('Server error');
  }
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});