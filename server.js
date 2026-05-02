// ==========================================================
// server.js
// ==========================================================
// Main backend file for Property + Inquiry Management System
// Now supports:
// - Multi-society architecture
// - Admin-controlled data isolation
// - JWT authentication
// ==========================================================

// Load environment variables
require('dotenv').config();

// Import required packages
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Import DB connection pool
const pool = require('./db');

// Create express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ==========================================================
// AUTH MIDDLEWARE
// ==========================================================

// Verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ message: 'Access token missing' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }

    req.user = user; // attach decoded user to request
    next();
  });
}

// Role-based authorization
function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
}
// ==========================================================
// CREATE SOCIETY + ADMIN (SUPER ADMIN ONLY)
// ==========================================================

app.post(
  '/societies',
  authenticateToken,
  authorizeRoles('platform_admin'),
  async (req, res) => {
    try {

      const {
        society_name,
        address,
        city,
        pincode,
        admin_name,
        admin_email,
        admin_password
      } = req.body;
      
      // System Generated Society Code
      const society_code = `SD-${Date.now()}`;

      // 🔐 Hash admin password
      const hashedPassword = await bcrypt.hash(admin_password, 10);

      // 1️⃣ Create Society
      const societyResult = await pool.query(
        `INSERT INTO societies
         (society_code, society_name, address, city, pincode, status)
         VALUES ($1,$2,$3,$4,$5,'active')
         RETURNING *`,
        [society_code, society_name, address, city, pincode]
      );

      const society = societyResult.rows[0];

      // 2️⃣ Create Society Admin
      const adminResult = await pool.query(
        `INSERT INTO users
         (full_name, email, password, role, society_id)
         VALUES ($1,$2,$3,'society_admin',$4)
         RETURNING user_id, full_name, email, role, society_id`,
        [
          admin_name,
          admin_email,
          hashedPassword,
          society.society_id
        ]
      );

      res.status(201).json({
        message: 'Society and Admin created successfully',
        society,
        admin: adminResult.rows[0]
      });

    } catch (err) {
      console.error('Error creating society:', err);
      res.status(500).json({
        message: 'Failed to create society',
        error: err.message
      });
    }
  }
);

// ==========================================================
// AUTH APIs
// ==========================================================

// Register user
app.post('/register', async (req, res) => {
  try {
    const { full_name, email, phone, password, role, society_id } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, phone, password, role, society_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING user_id, full_name, email, phone, role, society_id`,
      [full_name, email, phone, hashedPassword, role, society_id]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).send('Server error');
  }
});

// Login
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
// --------------------------------------------------
// Block society_admin login if their society is inactive
// --------------------------------------------------
if (user.role === 'society_admin') {
  const societyResult = await pool.query(
    `SELECT status
     FROM societies
     WHERE society_id = $1`,
    [user.society_id]
  );

  if (societyResult.rows.length === 0) {
    return res.status(403).json({
      message: 'Society is not found. Please contact platform admin.'
    });
  }

  if (societyResult.rows[0].status !== 'active') {
    return res.status(403).json({
      message: 'Your society access is inactive. Please contact platform admin.'
    });
  }
}
    // Include society_id in token (IMPORTANT)
    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        society_id: user.society_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        society_id: user.society_id
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send('Server error');
  }
});
// ==========================================================
// GET ALL SOCIETIES - PLATFORM ADMIN ONLY
// ==========================================================
// Purpose:
// - Platform admin can see all onboarded societies
// - Used by "Societies" page in frontend
// ==========================================================

app.get(
  '/societies',
  authenticateToken,
  authorizeRoles('platform_admin'),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT 
           society_id,
           society_code,
           society_name,
           address,
           city,
           pincode,
           status,
           created_at
         FROM societies
         ORDER BY society_id DESC`
      );

      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching societies:', err);
      res.status(500).json({ message: 'Failed to fetch societies' });
    }
  }
);
// ==========================================================
// GET SINGLE SOCIETY - PLATFORM ADMIN ONLY
// ==========================================================
// Purpose:
// - Used when editing society details
// ==========================================================

app.get(
  '/societies/:id',
  authenticateToken,
  authorizeRoles('platform_admin'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `SELECT *
         FROM societies
         WHERE society_id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Society not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error fetching society:', err);
      res.status(500).json({ message: 'Failed to fetch society' });
    }
  }
);
// ==========================================================
// UPDATE SOCIETY - PLATFORM ADMIN ONLY
// ==========================================================
// Purpose:
// Platform admin can update all society master details.
// Society code is received but should remain unchanged from UI.
// ==========================================================

app.put(
  '/societies/:id',
  authenticateToken,
  authorizeRoles('platform_admin'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const {
        society_name,
        address,
        google_map_link,
        apartment_count,
        amenities,
        lift_available,
        lift_types,
        visitor_parking,
        visitor_parking_count,
        entry_exit_points,
        society_office_contact,
        society_email,
        city,
        pincode,
        status
      } = req.body;

      const result = await pool.query(
        `UPDATE societies
         SET
           society_name = $1,
           address = $2,
           google_map_link = $3,
           apartment_count = $4,
           amenities = $5,
           lift_available = $6,
           lift_types = $7,
           visitor_parking = $8,
           visitor_parking_count = $9,
           entry_exit_points = $10,
           society_office_contact = $11,
           society_email = $12,
           city = $13,
           pincode = $14,
           status = $15
         WHERE society_id = $16
         RETURNING *`,
        [
          society_name,
          address,
          google_map_link || null,
          apartment_count || null,
          amenities || [],
          lift_available || false,
          lift_types || [],
          visitor_parking || false,
          visitor_parking_count || 0,
          entry_exit_points || 1,
          society_office_contact || null,
          society_email || null,
          city || null,
          pincode || null,
          status || 'active',
          id
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Society not found' });
      }

      res.json({
        message: 'Society updated successfully',
        society: result.rows[0]
      });

    } catch (err) {
      console.error('Error updating society:', err);
      res.status(500).json({
        message: 'Failed to update society',
        error: err.message
      });
    }
  }
);
app.put(
  '/properties/:id',
  authenticateToken,
  authorizeRoles('society_admin'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const {
        wing_flat_no,
        floor_no,
        c_type,
        carpet_area_sqft,
        f_type,
        furniture_details,
        parking_type,
        parking_count,
        request_type,

        expected_price,
        negotiable,
        bottom_price,
        monthly_maintenance,

        expected_rent,
        expected_deposit,
        bottom_rent_price,
        bottom_deposit_price,

        available_from,
        property_description,
        owner_name,
        owner_contact,
        admin_notes
      } = req.body;

      const result = await pool.query(
        `UPDATE properties
         SET
           wing_flat_no = $1,
           floor_no = $2,
           c_type = $3,
           carpet_area_sqft = $4,
           f_type = $5,
           furniture_details = $6,
           parking_type = $7,
           parking_count = $8,
           request_type = $9,

           a_type = $10,
           price = $11,
           negotiate = $12,

           expected_price = $13,
           negotiable = $14,
           bottom_price = $15,
           monthly_maintenance = $16,

           expected_rent = $17,
           expected_deposit = $18,
           bottom_rent_price = $19,
           bottom_deposit_price = $20,

           available_from = $21,
           property_description = $22,
           owner_name = $23,
           owner_contact = $24,
           admin_notes = $25
         WHERE prop_id = $26
           AND society_id = $27
         RETURNING *`,
        [
          wing_flat_no,
          floor_no ? Number(floor_no) : null,
          c_type,
          carpet_area_sqft ? Number(carpet_area_sqft) : null,
          f_type,
          furniture_details || null,
          parking_type,
          parking_count ? Number(parking_count) : 0,
          request_type,

          request_type,
          request_type === 'SALE'
            ? Number(expected_price || 0)
            : Number(expected_rent || 0),
          negotiable === 'Yes',

          expected_price ? Number(expected_price) : null,
          negotiable || null,
          bottom_price ? Number(bottom_price) : null,
          monthly_maintenance ? Number(monthly_maintenance) : null,

          expected_rent ? Number(expected_rent) : null,
          expected_deposit ? Number(expected_deposit) : null,
          bottom_rent_price ? Number(bottom_rent_price) : null,
          bottom_deposit_price ? Number(bottom_deposit_price) : null,

          available_from || null,
          property_description || null,
          owner_name || null,
          owner_contact || null,
          admin_notes || null,

          id,
          req.user.society_id
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Property not found or not allowed' });
      }

      res.json({
        message: 'Property updated successfully',
        property: result.rows[0]
      });

    } catch (err) {
      console.error('Update property error:', err);
      res.status(500).json({
        message: 'Failed to update property',
        error: err.message
      });
    }
  }
);
app.put("/properties/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const {
      title,
      location,
      society_cd,
      so_name,
      so_location,
      f_type,
      c_type,
      a_type,
      price,
      negotiate,
      description,
      area,
      floor,
      parking,
      image_url
    } = req.body;

    let query = `
      UPDATE properties
      SET
        title = $1,
        location = $2,
        society_cd = $3,
        so_name = $4,
        so_location = $5,
        f_type = $6,
        c_type = $7,
        a_type = $8,
        price = $9,
        negotiate = $10,
        description = $11,
        area = $12,
        floor = $13,
        parking = $14,
        image_url = $15
      WHERE prop_id = $16
    `;

    let values = [
      title,
      location,
      society_cd,
      so_name,
      so_location,
      f_type,
      c_type,
      a_type,
      price,
      negotiate,
      description,
      area,
      floor,
      parking,
      image_url,
      id
    ];

    if (user.role === "society_admin") {
      query += ` AND society_id = $17`;
      values.push(user.society_id);
    }

    query += ` RETURNING *`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Property not found or unauthorized" });
    }

    res.json({
      message: "Property updated successfully",
      property: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating property:", err);
    res.status(500).json({ error: "Error updating property" });
  }
});
// ==========================================================
// CREATE PROPERTY - SOCIETY ADMIN ONLY
// ==========================================================
// Purpose:
// - Society admin adds property under their mapped society
// - Society ID/code/name are NOT taken from frontend
// - Backend maps property using logged-in user's society_id
// - Supports SALE and RENT specific fields
// ==========================================================

app.post(
  '/properties',
  authenticateToken,
  authorizeRoles('society_admin'),
  async (req, res) => {
    try {
      // Logged-in society admin info from JWT token
      const created_by = req.user.user_id;
      const society_id = req.user.society_id;

      // Property details from frontend
      const {
        wing_flat_no,
        floor_no,
        c_type,
        carpet_area_sqft,
        f_type,
        furniture_details,
        parking_type,
        parking_count,
        request_type,

        expected_price,
        negotiable,
        bottom_price,
        monthly_maintenance,

        expected_rent,
        expected_deposit,
        bottom_rent_price,
        bottom_deposit_price,

        available_from,
        property_description,
        owner_name,
        owner_contact,
        admin_notes
      } = req.body;

      // Fetch society master record using logged-in admin society_id
      const societyResult = await pool.query(
        `SELECT society_id, society_code, society_name, address
         FROM societies
         WHERE society_id = $1
           AND status = 'active'`,
        [society_id]
      );

      if (societyResult.rows.length === 0) {
        return res.status(400).json({
          message: 'Active society not found for logged-in admin'
        });
      }

      const society = societyResult.rows[0];

      // Insert property
      const result = await pool.query(
        `INSERT INTO properties
         (
          society_id,
          society_cd,
          so_name,
          so_location,

          wing_flat_no,
          floor_no,
          c_type,
          carpet_area_sqft,
          f_type,
          furniture_details,
          parking_type,
          parking_count,
          request_type,

          a_type,
          price,
          negotiate,

          expected_price,
          negotiable,
          bottom_price,
          monthly_maintenance,

          expected_rent,
          expected_deposit,
          bottom_rent_price,
          bottom_deposit_price,

          available_from,
          property_description,
          owner_name,
          owner_contact,
          admin_notes,

          property_status,
          created_by
         )
         VALUES
         (
          $1,$2,$3,$4,
          $5,$6,$7,$8,$9,$10,$11,$12,$13,
          $14,$15,$16,
          $17,$18,$19,$20,
          $21,$22,$23,$24,
          $25,$26,$27,$28,$29,
          'AVAILABLE',$30
         )
         RETURNING *`,
        [
          society.society_id,
          society.society_code,
          society.society_name,
          society.address,

          wing_flat_no,
          floor_no ? Number(floor_no) : null,
          c_type,
          carpet_area_sqft ? Number(carpet_area_sqft) : null,
          f_type,
          furniture_details || null,
          parking_type,
          parking_count ? Number(parking_count) : 0,
          request_type,

          // Existing old columns kept for compatibility with current UI/listing
          request_type,
          request_type === 'SALE'
            ? Number(expected_price || 0)
            : Number(expected_rent || 0),
          negotiable === 'Yes',

          expected_price ? Number(expected_price) : null,
          negotiable || null,
          bottom_price ? Number(bottom_price) : null,
          monthly_maintenance ? Number(monthly_maintenance) : null,

          expected_rent ? Number(expected_rent) : null,
          expected_deposit ? Number(expected_deposit) : null,
          bottom_rent_price ? Number(bottom_rent_price) : null,
          bottom_deposit_price ? Number(bottom_deposit_price) : null,

          available_from || null,
          property_description || null,
          owner_name || null,
          owner_contact || null,
          admin_notes || null,

          created_by
        ]
      );

      res.status(201).json({
        message: 'Property added successfully',
        property: result.rows[0]
      });

    } catch (err) {
      console.error('Error creating property:', err);
      res.status(500).json({
        message: 'Failed to create property',
        error: err.message
      });
    }
  }
);
// ==========================================================
// GET SOCIETY PROPERTIES - SOCIETY ADMIN ONLY
// ==========================================================
// Purpose:
// - Society admin should see all properties mapped to their society
// - Do not depend only on created_by
// - This supports multi-admin society usage in future
// ==========================================================

app.get(
  '/my-properties',
  authenticateToken,
  authorizeRoles('society_admin'),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT *
         FROM properties
         WHERE society_id = $1
         ORDER BY prop_id DESC`,
        [req.user.society_id]
      );

      res.json(result.rows);

    } catch (err) {
      console.error('Error fetching society properties:', err);
      res.status(500).json({
        message: 'Failed to fetch society properties',
        error: err.message
      });
    }
  }
);
// ==========================================================
// GET SOCIETY ADMIN DETAILS
// ==========================================================

app.get(
  '/societies/:id/admin',
  authenticateToken,
  authorizeRoles('platform_admin'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `SELECT user_id, full_name, email, phone
         FROM users
         WHERE society_id = $1
           AND role = 'society_admin'
         LIMIT 1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Admin not found' });
      }

      res.json(result.rows[0]);

    } catch (err) {
      console.error('Error fetching admin:', err);
      res.status(500).json({ message: 'Failed to fetch admin' });
    }
  }
);
// ==========================================================
// UPDATE SOCIETY ADMIN DETAILS
// ==========================================================

app.put(
  '/societies/:id/admin',
  authenticateToken,
  authorizeRoles('platform_admin'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { full_name, email, phone } = req.body;

      const result = await pool.query(
        `UPDATE users
         SET full_name = $1,
             email = $2,
             phone = $3
         WHERE society_id = $4
           AND role = 'society_admin'
         RETURNING user_id, full_name, email, phone`,
        [full_name, email, phone, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Admin not found' });
      }

      res.json({
        message: 'Admin updated successfully',
        admin: result.rows[0]
      });

    } catch (err) {
      console.error('Error updating admin:', err);

      if (err.code === '23505') {
        return res.status(400).json({
          message: 'Email already exists'
        });
      }

      res.status(500).json({ message: 'Failed to update admin' });
    }
  }
);
// ==========================================================
// RESET SOCIETY ADMIN PASSWORD
// ==========================================================

app.put(
  '/societies/:id/admin/reset-password',
  authenticateToken,
  authorizeRoles('platform_admin'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { new_password } = req.body;

      if (!new_password) {
        return res.status(400).json({
          message: 'New password is required'
        });
      }

      const hashedPassword = await bcrypt.hash(new_password, 10);

      const result = await pool.query(
        `UPDATE users
         SET password = $1
         WHERE society_id = $2
           AND role = 'society_admin'
         RETURNING user_id`,
        [hashedPassword, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Admin not found' });
      }

      res.json({ message: 'Password reset successfully' });

    } catch (err) {
      console.error('Error resetting password:', err);
      res.status(500).json({ message: 'Failed to reset password' });
    }
  }
);
// ==========================================================
// GET SINGLE PROPERTY DETAILS
// ==========================================================
// Purpose:
// - Used by Property Details page
// - Returns one property by prop_id
// - Also returns admin/owner details
// ==========================================================

app.get('/properties/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
         p.*,
         s.society_code,
         s.society_name,
         s.address AS society_address
       FROM properties p
       LEFT JOIN societies s ON p.society_id = s.society_id
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
app.get("/properties/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    let query = `
      SELECT *
      FROM properties
      WHERE prop_id = $1
    `;

    let values = [id];

    // Society admin can only access own society property
    if (user.role === "society_admin") {
      query += ` AND society_id = $2`;
      values.push(user.society_id);
    }

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Property not found or unauthorized" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching property:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==========================================================
// SOCIETY SUMMARY DASHBOARD - PLATFORM ADMIN ONLY
// ==========================================================
// Purpose:
// - Platform admin can see high-level metrics for one society
// - Used by Society Details dashboard page
// ==========================================================

app.get(
  '/societies/:id/summary',
  authenticateToken,
  authorizeRoles('platform_admin'),
  async (req, res) => {
    try {
      const { id } = req.params;

      // 1. Fetch society basic details
      const societyResult = await pool.query(
        `SELECT *
         FROM societies
         WHERE society_id = $1`,
        [id]
      );

      if (societyResult.rows.length === 0) {
        return res.status(404).json({ message: 'Society not found' });
      }

      const society = societyResult.rows[0];

      // 2. Count properties for this society
      const propertyCountResult = await pool.query(
        `SELECT COUNT(*)::int AS total_properties
         FROM properties
         WHERE society_id = $1`,
        [id]
      );

      // 3. Count inquiries for this society
      const inquiryCountResult = await pool.query(
        `SELECT COUNT(*)::int AS total_inquiries
         FROM inquiries
         WHERE society_id = $1`,
        [id]
      );

      // 4. Count society admins for this society
      const adminCountResult = await pool.query(
        `SELECT COUNT(*)::int AS total_admins
         FROM users
         WHERE society_id = $1
           AND role = 'society_admin'`,
        [id]
      );

      // 5. Fetch recent inquiries
      const recentInquiryResult = await pool.query(
        `SELECT 
           i.inquiry_id,
           i.name,
           i.phone,
           i.message,
           i.status,
           i.created_at,
           p.so_name,
           p.price
         FROM inquiries i
         LEFT JOIN properties p ON i.property_id = p.prop_id
         WHERE i.society_id = $1
         ORDER BY i.inquiry_id DESC
         LIMIT 5`,
        [id]
      );

      res.json({
        society,
        stats: {
          total_properties: propertyCountResult.rows[0].total_properties,
          total_inquiries: inquiryCountResult.rows[0].total_inquiries,
          total_admins: adminCountResult.rows[0].total_admins
        },
        recent_inquiries: recentInquiryResult.rows
      });

    } catch (err) {
      console.error('Error fetching society summary:', err);
      res.status(500).json({
        message: 'Failed to fetch society summary',
        error: err.message
      });
    }
  }
);
// ==========================================================
// CREATE SOCIETY + FIRST SOCIETY ADMIN
// PLATFORM ADMIN ONLY
// ==========================================================
// Purpose:
// - Platform admin onboards a new society
// - Society code comes from frontend as auto-generated read-only value
// - Creates first society admin login for that society
// ==========================================================

app.post(
  '/societies',
  authenticateToken,
  authorizeRoles('platform_admin'),
  async (req, res) => {
    try {
      // ------------------------------
      // 1. Read society details
      // ------------------------------
      const {
        society_code,
        society_name,
        address,
        google_map_link,
        apartment_count,
        amenities,
        lift_available,
        lift_types,
        visitor_parking,
        visitor_parking_count,
        entry_exit_points,

        // ------------------------------
        // 2. Read society admin details
        // ------------------------------
        admin_name,
        admin_contact_number,
        society_office_contact,
        admin_email,
        society_email,
        admin_password
      } = req.body;

      // ------------------------------
      // 3. Basic validations
      // ------------------------------
      if (!society_code || !society_name || !address) {
        return res.status(400).json({
          message: 'Society code, name and address are required'
        });
      }

      if (!admin_name || !admin_email || !admin_password) {
        return res.status(400).json({
          message: 'Admin name, email and password are required'
        });
      }

      // ------------------------------
      // 4. Hash society admin password
      // ------------------------------
      const hashedPassword = await bcrypt.hash(admin_password, 10);

      // ------------------------------
      // 5. Create society record
      // ------------------------------
      const societyResult = await pool.query(
        `INSERT INTO societies
         (
          society_code,
          society_name,
          address,
          google_map_link,
          apartment_count,
          amenities,
          lift_available,
          lift_types,
          visitor_parking,
          visitor_parking_count,
          entry_exit_points,
          society_office_contact,
          society_email,
          city,
          pincode,
          status
         )
         VALUES
         (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, 'active'
         )
         RETURNING *`,
        [
          society_code,
          society_name,
          address,
          google_map_link || null,
          apartment_count || null,
          amenities || [],
          lift_available || false,
          lift_types || [],
          visitor_parking || false,
          visitor_parking_count || 0,
          entry_exit_points || 1,
          society_office_contact || null,
          society_email || null,

          // Keeping city/pincode for existing DB compatibility
          req.body.city || null,
          req.body.pincode || null
        ]
      );

      const society = societyResult.rows[0];

      // ------------------------------
      // 6. Create first society admin
      // ------------------------------
      const adminResult = await pool.query(
        `INSERT INTO users
         (
          full_name,
          email,
          phone,
          password,
          role,
          society_id
         )
         VALUES ($1, $2, $3, $4, 'society_admin', $5)
         RETURNING user_id, full_name, email, phone, role, society_id`,
        [
          admin_name,
          admin_email,
          admin_contact_number || null,
          hashedPassword,
          society.society_id
        ]
      );

      // ------------------------------
      // 7. Return success response
      // ------------------------------
      res.status(201).json({
        message: 'Society and society admin created successfully',
        society,
        admin: adminResult.rows[0]
      });

    } catch (err) {
      console.error('Error creating society:', err);

      // Duplicate society code or admin email
      if (err.code === '23505') {
        return res.status(400).json({
          message: 'Society code or admin email already exists'
        });
      }

      res.status(500).json({
        message: 'Failed to create society',
        error: err.message
      });
    }
  }
);
// ==========================================================
// GET LOGGED-IN ADMIN'S SOCIETY
// ==========================================================
// Purpose:
// - Society admin should see their assigned society details
// - Used on Add Property page to display society code/name
// - Society code/name are read-only on frontend
// ==========================================================

app.get(
  '/my-society',
  authenticateToken,
  authorizeRoles('society_admin'),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT 
           society_id,
           society_code,
           society_name,
           address,
           city,
           pincode,
           status
         FROM societies
         WHERE society_id = $1`,
        [req.user.society_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: 'Society not found for logged-in admin'
        });
      }

      res.json(result.rows[0]);

    } catch (err) {
      console.error('Error fetching my society:', err);
      res.status(500).json({
        message: 'Failed to fetch society details'
      });
    }
  }
);
// ==========================================================
// INQUIRY APIs
// ==========================================================

// Create inquiry (auto map to society)
app.post('/inquiry', authenticateToken, async (req, res) => {
  try {
    const { property_id, message } = req.body;

    const user = req.user;

    // Fetch property to get society_id
    const propertyResult = await pool.query(
      'SELECT prop_id, society_id FROM properties WHERE prop_id = $1',
      [property_id]
    );

    if (propertyResult.rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const property = propertyResult.rows[0];

    const result = await pool.query(
      `INSERT INTO inquiries
       (property_id, user_id, name, phone, message, society_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        property_id,
        user.user_id,
        user.email,
        '', // phone optional
        message,
        property.society_id
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error('Error creating inquiry:', err);
    res.status(500).send('Server error');
  }
});
// ==========================================================
// UPDATE INQUIRY STATUS / VISIT / NOTES
// ==========================================================

app.patch(
  '/inquiry/:id',
  authenticateToken,
  authorizeRoles('society_admin'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const { status, visit_date, visit_time, notes } = req.body;

      const result = await pool.query(
        `UPDATE inquiries
         SET 
           status = COALESCE($1, status),
           visit_date = COALESCE($2, visit_date),
           visit_time = COALESCE($3, visit_time),
           notes = COALESCE($4, notes)
         WHERE inquiry_id = $5
           AND society_id = $6
         RETURNING *`,
        [
          status,
          visit_date,
          visit_time,
          notes,
          id,
          req.user.society_id
        ]
      );

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
// ==========================================================
// GET INQUIRIES (STRICT SOCIETY FILTER)
// ==========================================================

app.get(
  '/inquiries',
  authenticateToken,
  authorizeRoles('society_admin'),
  async (req, res) => {
    try {

      console.log("Logged-in user:", req.user); // debug

      const result = await pool.query(
        `SELECT i.*, p.so_name, p.price
         FROM inquiries i
         JOIN properties p ON i.property_id = p.prop_id
         WHERE p.society_id = $1   -- 🔴 IMPORTANT CHANGE
         ORDER BY i.inquiry_id DESC`,
        [req.user.society_id]
      );

      res.json(result.rows);

    } catch (err) {
      console.error('Error fetching inquiries:', err);
      res.status(500).send('Server error');
    }
  }
);
// ==========================================================
// SERVER START
// ==========================================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});