// ==========================================================
// server.js
// ==========================================================
// SocioDeal Backend
// Tech Stack: Node.js + Express + PostgreSQL
//
// Purpose:
// - Multi-society property management platform
// - Platform admin onboards societies
// - Society admin manages properties/inquiries for own society only
//
// Important Property Module Fix:
// - Frontend should use NEW property fields only
// - OLD DB fields are still filled safely in backend because they are NOT NULL:
//   price, society_cd, so_name, so_location, a_type, negotiate
// - These old fields are kept only for backward DB compatibility
// ==========================================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const pool = require("./db");

const app = express();

const upload = require('./upload');

const cloudinary = require("./cloudinary");

app.use(cors());
app.use(express.json());

// ==========================================================
// AUTH MIDDLEWARE
// ==========================================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ message: "Access token missing" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Invalid authorization format" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    req.user = user;
    next();
  });
}

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
}

// ==========================================================
// HELPER FUNCTIONS
// ==========================================================

// Convert empty string/undefined/null to null
function toNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return value;
}

// Convert empty string/undefined/null to number or null
function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const num = Number(value);

  if (Number.isNaN(num)) {
    return null;
  }

  return num;
}

// Normalize negotiable value from frontend
// Frontend may send: "Yes", "No", true, false
function normalizeNegotiable(value) {
  if (value === true || value === "true" || value === "Yes" || value === "YES") {
    return "Yes";
  }

  if (value === false || value === "false" || value === "No" || value === "NO") {
    return "No";
  }

  return null;
}

// Convert negotiable to old boolean field negotiate
function negotiableToBoolean(value) {
  const normalized = normalizeNegotiable(value);
  return normalized === "Yes";
}

// Normalize request_type to avoid invalid old a_type values
function normalizeRequestType(value) {
  if (!value) {
    return "SALE";
  }

  const normalized = String(value).toUpperCase();

  if (normalized === "SALE" || normalized === "RENT") {
    return normalized;
  }

  return "SALE";
}

// DB compatibility price:
// - If SALE: use expected_price
// - If RENT: use expected_rent
// - If nothing available: use 0 because old price column is NOT NULL
function getCompatibilityPrice(requestType, expectedPrice, expectedRent) {
  if (requestType === "SALE") {
    return Number(expectedPrice || 0);
  }

  if (requestType === "RENT") {
    return Number(expectedRent || 0);
  }

  return 0;
}

// ==========================================================
// AUTH APIs
// ==========================================================

app.post("/register", async (req, res) => {
  try {
    const { full_name, email, phone, password, role, society_id } = req.body;

    if (!full_name || !email || !password || !role) {
      return res.status(400).json({
        message: "full_name, email, password and role are required",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users
       (full_name, email, phone, password, role, society_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id, full_name, email, phone, role, society_id`,
      [full_name, email, phone || null, hashedPassword, role, society_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Register error:", err);

    // PostgreSQL duplicate key error
// This handles duplicate email / phone with proper user-friendly message
if (err.code === "23505") {
  const detail = err.detail || "";

  if (detail.includes("email")) {
    return res.status(400).json({
      message: "Email is already registered",
    });
  }

  if (detail.includes("phone")) {
    return res.status(400).json({
      message: "Mobile number is already registered with another user",
    });
  }

  return res.status(400).json({
    message: "User already exists with provided details",
  });
}

    res.status(500).json({
      message: "Failed to register user",
      error: err.message,
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const userResult = await pool.query(
      `SELECT *
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = userResult.rows[0];

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Block society admin if mapped society is missing/inactive
    if (user.role === "society_admin") {
      const societyResult = await pool.query(
        `SELECT society_id, status
         FROM societies
         WHERE society_id = $1`,
        [user.society_id]
      );

      if (societyResult.rows.length === 0) {
        return res.status(403).json({
          message: "Society not found. Please contact platform admin.",
        });
      }

      if (societyResult.rows[0].status !== "active") {
        return res.status(403).json({
          message:
            "Your society access is inactive. Please contact platform admin.",
        });
      }
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        society_id: user.society_id,
        phone_verified: user.phone_verified,
        phone_verified_at: user.phone_verified_at,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        society_id: user.society_id,
      },
    });
  } catch (err) {
    console.error("Login error:", err);

    res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
});

// ==========================================================
// SOCIETY APIs - PLATFORM ADMIN
// ==========================================================

app.post(
  "/societies",
  authenticateToken,
  authorizeRoles("platform_admin"),
  async (req, res) => {
    try {
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
        society_office_contact,
        society_email,
        city,
        pincode,

        admin_name,
        admin_contact_number,
        admin_email,
        admin_password,
      } = req.body;

      if (!society_name || !address) {
        return res.status(400).json({
          message: "Society name and address are required",
        });
      }

      if (!admin_name || !admin_email || !admin_password) {
        return res.status(400).json({
          message: "Admin name, email and password are required",
        });
      }

      const finalSocietyCode = society_code || `SD-${Date.now()}`;
      const hashedPassword = await bcrypt.hash(admin_password, 10);

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const societyResult = await client.query(
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
           ($1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, 'active')
           RETURNING *`,
          [
            finalSocietyCode,
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
          ]
        );

        const society = societyResult.rows[0];

        const adminResult = await client.query(
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
            society.society_id,
          ]
        );

        await client.query("COMMIT");

        res.status(201).json({
          message: "Society and society admin created successfully",
          society,
          admin: adminResult.rows[0],
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Error creating society:", err);

      if (err.code === "23505") {
        return res.status(400).json({
          message: "Society code or admin email already exists",
        });
      }

      res.status(500).json({
        message: "Failed to create society",
        error: err.message,
      });
    }
  }
);

app.get(
  "/societies",
  authenticateToken,
  authorizeRoles("platform_admin"),
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
      console.error("Error fetching societies:", err);

      res.status(500).json({
        message: "Failed to fetch societies",
        error: err.message,
      });
    }
  }
);

app.get(
  "/societies/:id",
  authenticateToken,
  authorizeRoles("platform_admin"),
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
        return res.status(404).json({ message: "Society not found" });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error fetching society:", err);

      res.status(500).json({
        message: "Failed to fetch society",
        error: err.message,
      });
    }
  }
);

app.put(
  "/societies/:id",
  authenticateToken,
  authorizeRoles("platform_admin"),
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
        status,
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
          status || "active",
          id,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Society not found" });
      }

      res.json({
        message: "Society updated successfully",
        society: result.rows[0],
      });
    } catch (err) {
      console.error("Error updating society:", err);

      res.status(500).json({
        message: "Failed to update society",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// SOCIETY ADMIN APIs
// ==========================================================

app.get(
  "/societies/:id/admin",
  authenticateToken,
  authorizeRoles("platform_admin"),
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
        return res.status(404).json({ message: "Admin not found" });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error fetching admin:", err);

      res.status(500).json({
        message: "Failed to fetch admin",
        error: err.message,
      });
    }
  }
);

app.put(
  "/societies/:id/admin",
  authenticateToken,
  authorizeRoles("platform_admin"),
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
        [full_name, email, phone || null, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Admin not found" });
      }

      res.json({
        message: "Admin updated successfully",
        admin: result.rows[0],
      });
    } catch (err) {
      console.error("Error updating admin:", err);

      if (err.code === "23505") {
        return res.status(400).json({
          message: "Email already exists",
        });
      }

      res.status(500).json({
        message: "Failed to update admin",
        error: err.message,
      });
    }
  }
);

app.put(
  "/societies/:id/admin/reset-password",
  authenticateToken,
  authorizeRoles("platform_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { new_password } = req.body;

      if (!new_password) {
        return res.status(400).json({
          message: "New password is required",
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
        return res.status(404).json({ message: "Admin not found" });
      }

      res.json({ message: "Password reset successfully" });
    } catch (err) {
      console.error("Error resetting password:", err);

      res.status(500).json({
        message: "Failed to reset password",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// MY SOCIETY - SOCIETY ADMIN
// ==========================================================

app.get(
  "/my-society",
  authenticateToken,
  authorizeRoles("society_admin"),
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
          message: "Society not found for logged-in admin",
        });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error fetching my society:", err);

      res.status(500).json({
        message: "Failed to fetch society details",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// PROPERTY APIs - CLEAN VERSION
// ==========================================================
// Frontend should use these NEW fields:
//
// wing_flat_no
// floor_no
// c_type
// carpet_area_sqft
// f_type
// furniture_details
// parking_type
// parking_count
// request_type
// expected_price
// negotiable
// bottom_price
// monthly_maintenance
// expected_rent
// expected_deposit
// bottom_rent_price
// bottom_deposit_price
// property_status
// available_from
// property_description
// owner_name
// owner_contact
// admin_notes
//
// OLD fields filled by backend only:
// price, society_cd, so_name, so_location, a_type, negotiate
// ==========================================================

app.post(
  "/properties",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    try {
      const created_by = req.user.user_id;
      const society_id = req.user.society_id;

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

        property_status,
        available_from,
        property_description,
        owner_name,
        owner_contact,
        admin_notes,
      } = req.body;

      const finalRequestType = normalizeRequestType(request_type);
      const finalNegotiable = normalizeNegotiable(negotiable);

      if (!wing_flat_no || !c_type || !f_type || !finalRequestType) {
        return res.status(400).json({
          message:
            "wing_flat_no, c_type, f_type and request_type are required",
        });
      }

      if (finalRequestType === "SALE" && !expected_price) {
        return res.status(400).json({
          message: "expected_price is required for SALE property",
        });
      }

      if (finalRequestType === "RENT" && !expected_rent) {
        return res.status(400).json({
          message: "expected_rent is required for RENT property",
        });
      }

      const societyResult = await pool.query(
        `SELECT society_id, society_code, society_name, address
         FROM societies
         WHERE society_id = $1
           AND status = 'active'`,
        [society_id]
      );

      if (societyResult.rows.length === 0) {
        return res.status(400).json({
          message: "Active society not found for logged-in admin",
        });
      }

      const society = societyResult.rows[0];

      // Compatibility values for old NOT NULL columns
      const compatibilityPrice = getCompatibilityPrice(
        finalRequestType,
        expected_price,
        expected_rent
      );

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

          expected_price,
          negotiable,
          bottom_price,
          monthly_maintenance,

          expected_rent,
          expected_deposit,
          bottom_rent_price,
          bottom_deposit_price,

          property_status,
          available_from,
          property_description,
          owner_name,
          owner_contact,
          admin_notes,

          created_by,

          price,
          a_type,
          negotiate
         )
         VALUES
         (
          $1, $2, $3, $4,
          $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20, $21,
          $22, $23, $24, $25, $26, $27,
          $28,
          $29, $30, $31
         )
         RETURNING *`,
        [
          society.society_id,
          society.society_code,
          society.society_name,
          society.address,

          wing_flat_no,
          toNumberOrNull(floor_no),
          c_type,
          toNumberOrNull(carpet_area_sqft),
          f_type,
          toNull(furniture_details),
          toNull(parking_type),
          toNumberOrNull(parking_count) || 0,
          finalRequestType,

          toNumberOrNull(expected_price),
          finalNegotiable,
          toNumberOrNull(bottom_price),
          toNumberOrNull(monthly_maintenance),

          toNumberOrNull(expected_rent),
          toNumberOrNull(expected_deposit),
          toNumberOrNull(bottom_rent_price),
          toNumberOrNull(bottom_deposit_price),

          property_status || "AVAILABLE",
          toNull(available_from),
          toNull(property_description),
          toNull(owner_name),
          toNull(owner_contact),
          toNull(admin_notes),

          created_by,

          compatibilityPrice,
          finalRequestType,
          negotiableToBoolean(finalNegotiable),
        ]
      );

      res.status(201).json({
        message: "Property added successfully",
        property: result.rows[0],
      });
    } catch (err) {
      console.error("Error creating property:", err);

      res.status(500).json({
        message: "Failed to create property",
        error: err.message,
      });
    }
  }
);

app.get(
  "/my-properties",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT 
           p.*,
           s.society_code,
           s.society_name,
           s.address AS society_address
         FROM properties p
         LEFT JOIN societies s ON p.society_id = s.society_id
         WHERE p.society_id = $1
         ORDER BY p.prop_id DESC`,
        [req.user.society_id]
      );

      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching my properties:", err);

      res.status(500).json({
        message: "Failed to fetch properties",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// PUBLIC PROPERTY LIST API
// ==========================================================
// Purpose:
// - Guest/buyer can view all available properties
// - Society admins list their own properties using /my-properties
// - Platform admin should not use this as admin dashboard
// ==========================================================

app.get("/properties", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         p.*,
         s.society_code,
         s.society_name,
         s.address AS society_address
       FROM properties p
       LEFT JOIN societies s ON p.society_id = s.society_id
       WHERE COALESCE(p.property_status, 'AVAILABLE') = 'AVAILABLE'
       ORDER BY p.prop_id DESC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching public properties:", err);

    res.status(500).json({
      message: "Failed to fetch properties",
      error: err.message
    });
  }
});

// ==========================================================
// PUBLIC PROPERTY DETAILS API
// ==========================================================
// Anyone can view property details.
// Society admin restrictions are handled only in edit/update APIs.
// ==========================================================

app.get("/properties/:id", async (req, res) => {
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
      return res.status(404).json({
        message: "Property not found"
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching property:", err);

    res.status(500).json({
      message: "Failed to fetch property",
      error: err.message
    });
  }
});

app.put(
  "/properties/:id",
  authenticateToken,
  authorizeRoles("society_admin"),
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

        property_status,
        available_from,
        property_description,
        owner_name,
        owner_contact,
        admin_notes,
      } = req.body;

      const finalRequestType = normalizeRequestType(request_type);
      const finalNegotiable = normalizeNegotiable(negotiable);

      if (!wing_flat_no || !c_type || !f_type || !finalRequestType) {
        return res.status(400).json({
          message:
            "wing_flat_no, c_type, f_type and request_type are required",
        });
      }

      if (finalRequestType === "SALE" && !expected_price) {
        return res.status(400).json({
          message: "expected_price is required for SALE property",
        });
      }

      if (finalRequestType === "RENT" && !expected_rent) {
        return res.status(400).json({
          message: "expected_rent is required for RENT property",
        });
      }

      const compatibilityPrice = getCompatibilityPrice(
        finalRequestType,
        expected_price,
        expected_rent
      );

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

           expected_price = $10,
           negotiable = $11,
           bottom_price = $12,
           monthly_maintenance = $13,

           expected_rent = $14,
           expected_deposit = $15,
           bottom_rent_price = $16,
           bottom_deposit_price = $17,

           property_status = $18,
           available_from = $19,
           property_description = $20,
           owner_name = $21,
           owner_contact = $22,
           admin_notes = $23,

           price = $24,
           a_type = $25,
           negotiate = $26
         WHERE prop_id = $27
           AND society_id = $28
         RETURNING *`,
        [
          wing_flat_no,
          toNumberOrNull(floor_no),
          c_type,
          toNumberOrNull(carpet_area_sqft),
          f_type,
          toNull(furniture_details),
          toNull(parking_type),
          toNumberOrNull(parking_count) || 0,
          finalRequestType,

          toNumberOrNull(expected_price),
          finalNegotiable,
          toNumberOrNull(bottom_price),
          toNumberOrNull(monthly_maintenance),

          toNumberOrNull(expected_rent),
          toNumberOrNull(expected_deposit),
          toNumberOrNull(bottom_rent_price),
          toNumberOrNull(bottom_deposit_price),

          property_status || "AVAILABLE",
          toNull(available_from),
          toNull(property_description),
          toNull(owner_name),
          toNull(owner_contact),
          toNull(admin_notes),

          compatibilityPrice,
          finalRequestType,
          negotiableToBoolean(finalNegotiable),

          id,
          req.user.society_id,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Property not found or unauthorized",
        });
      }

      res.json({
        message: "Property updated successfully",
        property: result.rows[0],
      });
    } catch (err) {
      console.error("Error updating property:", err);

      res.status(500).json({
        message: "Failed to update property",
        error: err.message,
      });
    }
  }
);

app.delete(
  "/properties/:id",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const inquiryCheck = await pool.query(
        `SELECT COUNT(*)::int AS inquiry_count
         FROM inquiries
         WHERE property_id = $1`,
        [id]
      );

      if (inquiryCheck.rows[0].inquiry_count > 0) {
        return res.status(400).json({
          message:
            "This property has inquiries. Please close/delete inquiries before deleting the property.",
        });
      }

      const result = await pool.query(
        `DELETE FROM properties
         WHERE prop_id = $1
           AND society_id = $2
         RETURNING *`,
        [id, req.user.society_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Property not found or unauthorized",
        });
      }

      res.json({
        message: "Property deleted successfully",
        property: result.rows[0],
      });
    } catch (err) {
      console.error("Error deleting property:", err);

      res.status(500).json({
        message: "Failed to delete property",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// SOCIETY SUMMARY DASHBOARD - PLATFORM ADMIN
// ==========================================================

app.get(
  "/societies/:id/summary",
  authenticateToken,
  authorizeRoles("platform_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const societyResult = await pool.query(
        `SELECT *
         FROM societies
         WHERE society_id = $1`,
        [id]
      );

      if (societyResult.rows.length === 0) {
        return res.status(404).json({ message: "Society not found" });
      }

      const propertyCountResult = await pool.query(
        `SELECT COUNT(*)::int AS total_properties
         FROM properties
         WHERE society_id = $1`,
        [id]
      );

      const inquiryCountResult = await pool.query(
        `SELECT COUNT(*)::int AS total_inquiries
         FROM inquiries
         WHERE society_id = $1`,
        [id]
      );

      const adminCountResult = await pool.query(
        `SELECT COUNT(*)::int AS total_admins
         FROM users
         WHERE society_id = $1
           AND role = 'society_admin'`,
        [id]
      );

      const recentInquiryResult = await pool.query(
        `SELECT 
           i.inquiry_id,
           i.name,
           i.phone,
           i.message,
           i.status,
           i.created_at,
           p.wing_flat_no,
           p.c_type,
           p.request_type,
           p.expected_price,
           p.expected_rent
         FROM inquiries i
         LEFT JOIN properties p ON i.property_id = p.prop_id
         WHERE i.society_id = $1
         ORDER BY i.inquiry_id DESC
         LIMIT 5`,
        [id]
      );

      res.json({
        society: societyResult.rows[0],
        stats: {
          total_properties: propertyCountResult.rows[0].total_properties,
          total_inquiries: inquiryCountResult.rows[0].total_inquiries,
          total_admins: adminCountResult.rows[0].total_admins,
        },
        recent_inquiries: recentInquiryResult.rows,
      });
    } catch (err) {
      console.error("Error fetching society summary:", err);

      res.status(500).json({
        message: "Failed to fetch society summary",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// PROPERTY IMAGE APIs - PRODUCTION READY VERSION
// ==========================================================
// Features:
// - Upload max 10 images per property
// - Store Cloudinary secure URL + public_id
// - Public image fetch for buyers/guests
// - Society admin ownership validation
// - Delete image from Cloudinary + DB
// - Set only one cover image per property
// - Reorder display_order safely
//
// IMPORTANT:
// - This replaces your old image APIs.
// - Existing old endpoint POST /properties/:id/upload-image is kept
//   for backward compatibility with current frontend.
// ==========================================================

// ----------------------------------------------------------
// Helper: Validate that logged-in society_admin owns property
// ----------------------------------------------------------
async function validatePropertyOwnership(propertyId, societyId) {
  const result = await pool.query(
    `SELECT prop_id, society_id
     FROM properties
     WHERE prop_id = $1
       AND society_id = $2`,
    [propertyId, societyId]
  );

  return result.rows[0] || null;
}

// ----------------------------------------------------------
// Helper: Delete uploaded Cloudinary files if DB validation fails
// ----------------------------------------------------------
async function cleanupUploadedFiles(files = []) {
  for (const file of files) {
    const publicId = file.filename || file.public_id;

    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.error("Cloudinary cleanup failed:", err.message);
      }
    }
  }
}

// ----------------------------------------------------------
// Middleware wrapper for multiple image upload
// Field name expected: images
// ----------------------------------------------------------
function uploadPropertyImages(req, res, next) {
  upload.array("images", 10)(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message: err.message || "Image upload failed",
      });
    }

    next();
  });
}

// ----------------------------------------------------------
// Middleware wrapper for old single image upload
// Field name expected: image
// Kept for backward compatibility
// ----------------------------------------------------------
function uploadSinglePropertyImage(req, res, next) {
  upload.single("image")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message: err.message || "Image upload failed",
      });
    }

    next();
  });
}

// ==========================================================
// 1) GET PROPERTY IMAGES - PUBLIC
// ==========================================================
// Buyers/tenants/guests can view property images.
// Cover image appears first, then display_order, then image_id.
// ==========================================================

app.get("/properties/:id/images", async (req, res) => {
  try {
    const { id } = req.params;

    const propertyCheck = await pool.query(
      `SELECT prop_id
       FROM properties
       WHERE prop_id = $1`,
      [id]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        message: "Property not found",
      });
    }

    const result = await pool.query(
      `SELECT
         image_id,
         property_id,
         image_url,
         public_id,
         display_order,
         is_cover,
         uploaded_by,
         created_at
       FROM property_images
       WHERE property_id = $1
       ORDER BY
         is_cover DESC,
         display_order ASC,
         image_id ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch property images error:", err);

    res.status(500).json({
      message: "Failed to fetch property images",
      error: err.message,
    });
  }
});

// ==========================================================
// 2) UPLOAD MULTIPLE PROPERTY IMAGES - NEW API
// ==========================================================
// API:
// POST /properties/:id/images
//
// Form-data:
// images = file(s)
//
// Rules:
// - society_admin only
// - property must belong to logged-in admin society
// - max 10 total images per property
// - first uploaded image becomes cover if property has no cover
// ==========================================================

app.post(
  "/properties/:id/images",
  authenticateToken,
  authorizeRoles("society_admin"),
  uploadPropertyImages,
  async (req, res) => {
    const { id } = req.params;

    try {
      const property = await validatePropertyOwnership(
        id,
        req.user.society_id
      );

      if (!property) {
        await cleanupUploadedFiles(req.files || []);

        return res.status(404).json({
          message: "Property not found or unauthorized",
        });
      }

      const files = req.files || [];

      if (files.length === 0) {
        return res.status(400).json({
          message: "At least one image file is required",
        });
      }

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS image_count
         FROM property_images
         WHERE property_id = $1`,
        [id]
      );

      const existingCount = countResult.rows[0].image_count;

      if (existingCount + files.length > 10) {
        await cleanupUploadedFiles(files);

        return res.status(400).json({
          message: `Maximum 10 images are allowed per property. Current images: ${existingCount}`,
        });
      }

      const coverCheck = await pool.query(
        `SELECT image_id
         FROM property_images
         WHERE property_id = $1
           AND is_cover = true
         LIMIT 1`,
        [id]
      );

      const hasCoverImage = coverCheck.rows.length > 0;

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const insertedImages = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          const imageUrl = file.path;
          const publicId = file.filename || file.public_id || null;

          const shouldBeCover = !hasCoverImage && existingCount === 0 && i === 0;

          const insertResult = await client.query(
            `INSERT INTO property_images
             (
               property_id,
               image_url,
               public_id,
               display_order,
               is_cover,
               uploaded_by
             )
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
              id,
              imageUrl,
              publicId,
              existingCount + i,
              shouldBeCover,
              req.user.user_id,
            ]
          );

          insertedImages.push(insertResult.rows[0]);
        }

        await client.query("COMMIT");

        res.status(201).json({
          message: "Property image(s) uploaded successfully",
          images: insertedImages,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        await cleanupUploadedFiles(files);
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Upload property images error:", err);

      res.status(500).json({
        message: "Failed to upload property image(s)",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// 3) OLD SINGLE IMAGE UPLOAD API - BACKWARD COMPATIBLE
// ==========================================================
// API:
// POST /properties/:id/upload-image
//
// Form-data:
// image = file
//
// This keeps your existing frontend working.
// Internally it now stores public_id, display_order, uploaded_by, cover.
// ==========================================================

app.post(
  "/properties/:id/upload-image",
  authenticateToken,
  authorizeRoles("society_admin"),
  uploadSinglePropertyImage,
  async (req, res) => {
    const { id } = req.params;

    try {
      const property = await validatePropertyOwnership(
        id,
        req.user.society_id
      );

      if (!property) {
        await cleanupUploadedFiles(req.file ? [req.file] : []);

        return res.status(404).json({
          message: "Property not found or unauthorized",
        });
      }

      if (!req.file || !req.file.path) {
        return res.status(400).json({
          message: "Image file is required",
        });
      }

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS image_count
         FROM property_images
         WHERE property_id = $1`,
        [id]
      );

      const existingCount = countResult.rows[0].image_count;

      if (existingCount >= 10) {
        await cleanupUploadedFiles([req.file]);

        return res.status(400).json({
          message: "Maximum 10 images are allowed per property",
        });
      }

      const coverCheck = await pool.query(
        `SELECT image_id
         FROM property_images
         WHERE property_id = $1
           AND is_cover = true
         LIMIT 1`,
        [id]
      );

      const shouldBeCover = coverCheck.rows.length === 0 && existingCount === 0;

      const result = await pool.query(
        `INSERT INTO property_images
         (
           property_id,
           image_url,
           public_id,
           display_order,
           is_cover,
           uploaded_by
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          id,
          req.file.path,
          req.file.filename || req.file.public_id || null,
          existingCount,
          shouldBeCover,
          req.user.user_id,
        ]
      );

      res.status(201).json({
        message: "Image uploaded successfully",
        image: result.rows[0],
      });
    } catch (err) {
      console.error("Upload single property image error:", err);

      res.status(500).json({
        message: "Image upload failed",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// 4) DELETE PROPERTY IMAGE
// ==========================================================
// API:
// DELETE /properties/:propertyId/images/:imageId
//
// Rules:
// - society_admin only
// - property must belong to logged-in admin society
// - deletes image from Cloudinary first if public_id exists
// - deletes DB record
// - if deleted image was cover, next image becomes cover automatically
// ==========================================================

app.delete(
  "/properties/:propertyId/images/:imageId",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    const { propertyId, imageId } = req.params;

    try {
      const property = await validatePropertyOwnership(
        propertyId,
        req.user.society_id
      );

      if (!property) {
        return res.status(404).json({
          message: "Property not found or unauthorized",
        });
      }

      const imageResult = await pool.query(
        `SELECT *
         FROM property_images
         WHERE image_id = $1
           AND property_id = $2`,
        [imageId, propertyId]
      );

      if (imageResult.rows.length === 0) {
        return res.status(404).json({
          message: "Image not found",
        });
      }

      const image = imageResult.rows[0];

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        if (image.public_id) {
          await cloudinary.uploader.destroy(image.public_id);
        }

        await client.query(
          `DELETE FROM property_images
           WHERE image_id = $1
             AND property_id = $2`,
          [imageId, propertyId]
        );

        if (image.is_cover === true) {
          await client.query(
            `UPDATE property_images
             SET is_cover = true
             WHERE image_id = (
               SELECT image_id
               FROM property_images
               WHERE property_id = $1
               ORDER BY display_order ASC, image_id ASC
               LIMIT 1
             )`,
            [propertyId]
          );
        }

        await client.query("COMMIT");

        res.json({
          message: "Image deleted successfully",
          deleted_image_id: Number(imageId),
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Delete property image error:", err);

      res.status(500).json({
        message: "Failed to delete image",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// 5) SET COVER IMAGE
// ==========================================================
// API:
// PATCH /properties/:propertyId/images/:imageId/cover
//
// Rules:
// - society_admin only
// - property must belong to logged-in admin society
// - only one cover image allowed
// - respects uq_property_cover_image unique index
// ==========================================================

app.patch(
  "/properties/:propertyId/images/:imageId/cover",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    const { propertyId, imageId } = req.params;

    const client = await pool.connect();

    try {
      const property = await validatePropertyOwnership(
        propertyId,
        req.user.society_id
      );

      if (!property) {
        return res.status(404).json({
          message: "Property not found or unauthorized",
        });
      }

      const imageCheck = await pool.query(
        `SELECT image_id
         FROM property_images
         WHERE image_id = $1
           AND property_id = $2`,
        [imageId, propertyId]
      );

      if (imageCheck.rows.length === 0) {
        return res.status(404).json({
          message: "Image not found",
        });
      }

      await client.query("BEGIN");

      await client.query(
        `UPDATE property_images
         SET is_cover = false
         WHERE property_id = $1`,
        [propertyId]
      );

      const result = await client.query(
        `UPDATE property_images
         SET is_cover = true
         WHERE image_id = $1
           AND property_id = $2
         RETURNING *`,
        [imageId, propertyId]
      );

      await client.query("COMMIT");

      res.json({
        message: "Cover image updated successfully",
        image: result.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");

      console.error("Set cover image error:", err);

      res.status(500).json({
        message: "Failed to set cover image",
        error: err.message,
      });
    } finally {
      client.release();
    }
  }
);

// ==========================================================
// 6) REORDER PROPERTY IMAGES
// ==========================================================
// API:
// PATCH /properties/:propertyId/images/reorder
//
// Body:
// {
//   "images": [
//     { "image_id": 10, "display_order": 0 },
//     { "image_id": 11, "display_order": 1 }
//   ]
// }
//
// Rules:
// - society_admin only
// - property must belong to logged-in admin society
// - only images of that property can be reordered
// ==========================================================

app.patch(
  "/properties/:propertyId/images/reorder",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    const { propertyId } = req.params;
    const { images } = req.body;

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        message: "images array is required",
      });
    }

    const client = await pool.connect();

    try {
      const property = await validatePropertyOwnership(
        propertyId,
        req.user.society_id
      );

      if (!property) {
        return res.status(404).json({
          message: "Property not found or unauthorized",
        });
      }

      await client.query("BEGIN");

      for (const img of images) {
        if (
          img.image_id === undefined ||
          img.display_order === undefined ||
          Number.isNaN(Number(img.display_order))
        ) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            message: "Each image must have image_id and display_order",
          });
        }

        await client.query(
          `UPDATE property_images
           SET display_order = $1
           WHERE image_id = $2
             AND property_id = $3`,
          [Number(img.display_order), Number(img.image_id), propertyId]
        );
      }

      const result = await client.query(
        `SELECT
           image_id,
           property_id,
           image_url,
           public_id,
           display_order,
           is_cover,
           uploaded_by,
           created_at
         FROM property_images
         WHERE property_id = $1
         ORDER BY
           is_cover DESC,
           display_order ASC,
           image_id ASC`,
        [propertyId]
      );

      await client.query("COMMIT");

      res.json({
        message: "Image order updated successfully",
        images: result.rows,
      });
    } catch (err) {
      await client.query("ROLLBACK");

      console.error("Reorder property images error:", err);

      res.status(500).json({
        message: "Failed to reorder images",
        error: err.message,
      });
    } finally {
      client.release();
    }
  }
);

// ==========================================================
// OTP + INQUIRY APIs - BUYER/TENANT VERIFIED MOBILE FLOW
// ==========================================================
// Purpose:
// - Buyer/Tenant must verify their own registered mobile number before inquiry.
// - OTP is stored as a hash, never as plain text.
// - Local development can return OTP for testing only when NODE_ENV !== "production".
// - Inquiry creation trusts logged-in JWT user profile, not name/phone from request body.
// - Society admin inquiry visibility remains isolated by society_id.
// ==========================================================

// Allowed OTP purpose for this phase.
const OTP_PURPOSE_PHONE_VERIFICATION = "phone_verification";

// OTP configuration constants.
const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;

// Allowed inquiry types as per DB check constraint chk_inquiry_type.
const ALLOWED_INQUIRY_TYPES = [
  "interested",
  "schedule_visit",
  "contact_me",
  "price_negotiation",
  "more_details",
];

// Allowed inquiry statuses as per DB check constraint chk_inquiry_status.
const ALLOWED_INQUIRY_STATUSES = [
  "requested",
  "contacted",
  "visit_scheduled",
  "visited",
  "negotiation",
  "deal_closed",
  "cancelled",
  "rejected",
];

// ----------------------------------------------------------
// Helper: Normalize inquiry type from frontend.
// If frontend does not send inquiry_type, default to "interested"
// for backward compatibility with older inquiry flow.
// ----------------------------------------------------------
function normalizeInquiryType(value) {
  if (!value) return "interested";

  const normalized = String(value).toLowerCase().trim();

  return ALLOWED_INQUIRY_TYPES.includes(normalized) ? normalized : null;
}

// ----------------------------------------------------------
// Helper: Normalize mobile number.
// Keeps only digits so values like "+91 98765 43210" become "919876543210".
// Current validation below expects final Indian 10-digit format.
// ----------------------------------------------------------
function normalizeMobile(value) {
  if (!value) return "";
  return String(value).replace(/\D/g, "");
}

// ----------------------------------------------------------
// Helper: Validate Indian 10-digit mobile number.
// Starts with 6/7/8/9 and has exactly 10 digits.
// ----------------------------------------------------------
function isValidIndianMobile(value) {
  const mobile = normalizeMobile(value);
  return /^[6-9]\d{9}$/.test(mobile);
}

// ----------------------------------------------------------
// Helper: Generate 6-digit OTP as string.
// Example: "042391" is possible and should remain 6 digits.
// ----------------------------------------------------------
function generateSixDigitOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ==========================================================
// PHONE OTP APIs - BUYER / TENANT MOBILE VERIFICATION
// ==========================================================
// Purpose:
// - Buyer/Tenant must verify mobile before sending inquiry
// - OTP is stored as bcrypt hash, never as plain text
// - Local dev may return dev_otp for testing
// - Production must never return OTP
// ==========================================================

// Generate 6 digit OTP as string
function generateSixDigitOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ==========================================================
// SEND PHONE OTP
// API: POST /send-phone-otp
// Auth: buyer / tenant only
// Body: not required
// ==========================================================

app.post(
  "/send-phone-otp",
  authenticateToken,
  authorizeRoles("buyer", "tenant"),
  async (req, res) => {
    const client = await pool.connect();

    try {
          console.log("VERIFY OTP TOKEN USER:", req.user);
          console.log("VERIFY OTP BODY:", req.body);
      // ------------------------------------------------------
      // Always use logged-in user's phone from users table.
      // Do not trust phone from request body.
      // ------------------------------------------------------
      const userResult = await client.query(
        `SELECT user_id, full_name, phone, phone_verified
         FROM users
         WHERE user_id = $1`,
        [req.user.user_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      const user = userResult.rows[0];

      if (!user.phone) {
        return res.status(400).json({
          message: "Mobile number is not available in your profile",
        });
      }

      // Optional but recommended:
      // If already verified, no need to generate another OTP.
      if (user.phone_verified === true) {
        return res.status(200).json({
          message: "Mobile number is already verified",
          phone_verified: true,
        });
      }

      const otp = generateSixDigitOtp();

      // Hash OTP before storing.
      // This prevents plain OTP leakage from DB.
      const otpHash = await bcrypt.hash(otp, 10);

      await client.query("BEGIN");

      // ------------------------------------------------------
      // Cancel all previous pending OTPs for same user + phone.
      // This ensures only latest OTP can be verified.
      // ------------------------------------------------------
      await client.query(
        `UPDATE otp_verifications
         SET status = 'cancelled',
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
           AND phone = $2
           AND purpose = 'phone_verification'
           AND status = 'pending'`,
        [user.user_id, user.phone]
      );

      // ------------------------------------------------------
      // Insert fresh OTP row.
      // OTP expires after 5 minutes.
      // ------------------------------------------------------
      const otpResult = await client.query(
        `INSERT INTO otp_verifications
         (
           user_id,
           phone,
           otp_hash,
           purpose,
           expires_at,
           attempts,
           status,
           created_at,
           updated_at
         )
         VALUES
         (
           $1,
           $2,
           $3,
           'phone_verification',
           CURRENT_TIMESTAMP + INTERVAL '5 minutes',
           0,
           'pending',
           CURRENT_TIMESTAMP,
           CURRENT_TIMESTAMP
         )
         RETURNING otp_id, phone, purpose, expires_at, status`,
        [user.user_id, user.phone, otpHash]
      );

      await client.query("COMMIT");

      const response = {
        message: "OTP sent successfully",
        phone: user.phone,
        expires_at: otpResult.rows[0].expires_at,
      };

      // Only for local/dev testing.
      // Never return OTP in production.
      if (process.env.NODE_ENV !== "production") {
        response.dev_otp = otp;
      }

      return res.status(200).json(response);
    } catch (err) {
      await client.query("ROLLBACK");

      console.error("Send phone OTP error:", err);

      return res.status(500).json({
        message: "Failed to send OTP",
        error: err.message,
      });
    } finally {
      client.release();
    }
  }
);

// ==========================================================
// VERIFY PHONE OTP
// API: POST /verify-phone-otp
// Auth: buyer / tenant only
// Body:
// {
//   "otp": "123456"
// }
// ==========================================================

app.post(
  "/verify-phone-otp",
  authenticateToken,
  authorizeRoles("buyer", "tenant"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { otp } = req.body;

      if (!otp) {
        return res.status(400).json({
          message: "OTP is required",
        });
      }

      const enteredOtp = String(otp).trim();

      if (!/^\d{6}$/.test(enteredOtp)) {
        return res.status(400).json({
          message: "OTP must be a 6-digit number",
        });
      }

      // ------------------------------------------------------
      // Always use logged-in user's phone.
      // Buyer cannot verify another user's phone.
      // ------------------------------------------------------
      const userResult = await client.query(
        `SELECT user_id, phone, phone_verified
         FROM users
         WHERE user_id = $1`,
        [req.user.user_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      const user = userResult.rows[0];

      if (!user.phone) {
        return res.status(400).json({
          message: "Mobile number is not available in your profile",
        });
      }

      if (user.phone_verified === true) {
        return res.status(200).json({
          message: "Mobile number is already verified",
          phone_verified: true,
        });
      }

      await client.query("BEGIN");

      // ------------------------------------------------------
      // Fetch latest pending OTP only.
      // Important:
      // - status must be pending
      // - same user
      // - same phone
      // - purpose phone_verification
      // - latest OTP wins
      // ------------------------------------------------------
      const otpResult = await client.query(
        `SELECT
           otp_id,
           otp_hash,
           expires_at,
           attempts,
           status
         FROM otp_verifications
         WHERE user_id = $1
           AND phone = $2
           AND purpose = 'phone_verification'
           AND status = 'pending'
         ORDER BY otp_id DESC
         LIMIT 1
         FOR UPDATE`,
        [user.user_id, user.phone]
      );

      if (otpResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "No active OTP found. Please request a new OTP.",
        });
      }

      const otpRow = otpResult.rows[0];

      // ------------------------------------------------------
      // Expiry check.
      // Expired OTP must not verify user.
      // ------------------------------------------------------
      const now = new Date();
      const expiresAt = new Date(otpRow.expires_at);

      if (expiresAt <= now) {
        await client.query(
          `UPDATE otp_verifications
           SET status = 'expired',
               updated_at = CURRENT_TIMESTAMP
           WHERE otp_id = $1`,
          [otpRow.otp_id]
        );

        await client.query("COMMIT");

        return res.status(400).json({
          message: "OTP expired",
        });
      }

      // ------------------------------------------------------
      // Attempt limit check.
      // If already too many attempts, fail OTP.
      // ------------------------------------------------------
      if (Number(otpRow.attempts) >= 5) {
        await client.query(
          `UPDATE otp_verifications
           SET status = 'failed',
               updated_at = CURRENT_TIMESTAMP
           WHERE otp_id = $1`,
          [otpRow.otp_id]
        );

        await client.query("COMMIT");

        return res.status(400).json({
          message: "Maximum OTP attempts exceeded. Please request a new OTP.",
        });
      }

      // ------------------------------------------------------
      // Critical security check:
      // Compare entered OTP with bcrypt hash.
      // Invalid OTP must NOT update users table.
      // ------------------------------------------------------
      const isOtpValid = await bcrypt.compare(enteredOtp, otpRow.otp_hash);

      if (!isOtpValid) {
        const newAttempts = Number(otpRow.attempts) + 1;
        const newStatus = newAttempts >= 5 ? "failed" : "pending";

        await client.query(
          `UPDATE otp_verifications
           SET attempts = $1,
               status = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE otp_id = $3`,
          [newAttempts, newStatus, otpRow.otp_id]
        );

        await client.query("COMMIT");

        return res.status(400).json({
          message:
            newStatus === "failed"
              ? "Maximum OTP attempts exceeded. Please request a new OTP."
              : "Invalid OTP",
          attempts_remaining: Math.max(0, 5 - newAttempts),
        });
      }

      // ------------------------------------------------------
      // Success:
      // - mark OTP verified
      // - update user's phone_verified fields
      // - only correct latest pending unexpired OTP reaches here
      // ------------------------------------------------------
      await client.query(
        `UPDATE otp_verifications
         SET status = 'verified',
             verified_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE otp_id = $1`,
        [otpRow.otp_id]
      );

      const updatedUserResult = await client.query(
        `UPDATE users
         SET phone_verified = true,
             phone_verified_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
         RETURNING user_id, full_name, email, phone, role, phone_verified, phone_verified_at`,
        [user.user_id]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        message: "Mobile number verified successfully",
        phone_verified: true,
        user: updatedUserResult.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");

      console.error("Verify phone OTP error:", err);

      return res.status(500).json({
        message: "Failed to verify OTP",
        error: err.message,
      });
    } finally {
      client.release();
    }
  }
);

// ==========================================================
// CREATE INQUIRY - BUYER / TENANT ONLY
// ==========================================================
// API:
// POST /inquiry
//
// Important security rule:
// - We use users.full_name and users.phone from DB.
// - We do NOT trust name/phone sent from frontend body.
// - This prevents buyer A from submitting inquiry using buyer B details.
// ==========================================================

app.post(
  "/inquiry",
  authenticateToken,
  authorizeRoles("buyer", "tenant"),
  async (req, res) => {
    try {
      const { property_id, message, inquiry_type } = req.body;

      if (!property_id) {
        return res.status(400).json({
          message: "property_id is required",
        });
      }

      const finalType = normalizeInquiryType(inquiry_type);

      if (!finalType) {
        return res.status(400).json({
          message:
            "Invalid inquiry_type. Allowed values: interested, schedule_visit, contact_me, price_negotiation, more_details",
        });
      }

      // Fetch logged-in buyer/tenant profile from DB.
      // This is also where we enforce phone_verified before inquiry.
      const userResult = await pool.query(
        `SELECT user_id, full_name, phone, phone_verified, phone_verified_at
         FROM users
         WHERE user_id = $1`,
        [req.user.user_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          message: "Logged-in user not found",
        });
      }

      const user = userResult.rows[0];
      const finalName = String(user.full_name || "").trim();
      const finalPhone = normalizeMobile(user.phone);

      if (!finalName) {
        return res.status(400).json({
          message: "Name is required in your profile before sending inquiry",
        });
      }

      if (!isValidIndianMobile(finalPhone)) {
        return res.status(400).json({
          message: "Valid mobile number is required in your profile before sending inquiry",
        });
      }

      if (user.phone_verified !== true) {
        return res.status(403).json({
          message: "Please verify your mobile number before sending inquiry.",
          phone_verified: false,
        });
      }

      const propertyResult = await pool.query(
        `SELECT prop_id, society_id
         FROM properties
         WHERE prop_id = $1
           AND COALESCE(property_status, 'AVAILABLE') = 'AVAILABLE'`,
        [property_id]
      );

      if (propertyResult.rows.length === 0) {
        return res.status(404).json({
          message: "Property not found or not available",
        });
      }

      const property = propertyResult.rows[0];

      const result = await pool.query(
        `INSERT INTO inquiries
         (
           property_id,
           user_id,
           name,
           phone,
           message,
           society_id,
           inquiry_type,
           status,
           mobile_verified,
           mobile_verified_at,
           last_status_updated_at,
           status_updated_by
         )
         VALUES
         ($1, $2, $3, $4, $5, $6, $7, 'requested', $8, $9, CURRENT_TIMESTAMP, null)
         RETURNING *`,
        [
          property_id,
          req.user.user_id,
          finalName,
          finalPhone,
          toNull(message),
          property.society_id,
          finalType,
          user.phone_verified,
          user.phone_verified_at,
        ]
      );

      res.status(201).json({
        message: "Inquiry submitted successfully",
        inquiry: result.rows[0],
      });
    } catch (err) {
      // Duplicate inquiry rule:
      // DB constraint uq_inquiry_user_property allows only one inquiry
      // from same buyer/tenant for same property.
      if (err.code === "23505" && err.constraint === "uq_inquiry_user_property") {
        return res.status(409).json({
          message: "You have already sent an inquiry for this property",
        });
      }

      console.error("Error creating inquiry:", err);

      res.status(500).json({
        message: "Failed to create inquiry",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// SOCIETY ADMIN - GET INQUIRIES
// ==========================================================
// API:
// GET /inquiries
//
// Society isolation:
// - Society admin sees only inquiries mapped to their own society_id.
// ==========================================================

app.get(
  "/inquiries",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
           i.inquiry_id,
           i.property_id,
           i.user_id,
           i.name,
           i.phone,
           i.inquiry_type,
           i.message,
           i.status,
           i.created_at,
           i.visit_date,
           i.visit_time,
           i.notes,
           i.mobile_verified,
           i.mobile_verified_at,
           i.last_status_updated_at,
           i.status_updated_by,

           p.wing_flat_no,
           p.floor_no,
           p.c_type,
           p.request_type,
           p.expected_price,
           p.expected_rent,
           p.expected_deposit,
           p.property_status,

           s.society_name,
           s.address AS society_address

         FROM inquiries i
         JOIN properties p
           ON i.property_id = p.prop_id
         LEFT JOIN societies s
           ON p.society_id = s.society_id
         WHERE i.society_id = $1
         ORDER BY i.inquiry_id DESC`,
        [req.user.society_id]
      );

      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching inquiries:", err);

      res.status(500).json({
        message: "Failed to fetch inquiries",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// SOCIETY ADMIN - UPDATE INQUIRY STATUS
// ==========================================================
// API:
// PATCH /inquiry/:id
//
// Body example:
// {
//   "status": "visit_scheduled",
//   "visit_date": "2026-05-10",
//   "visit_time": "10:30",
//   "notes": "Please contact society office before visit."
// }
// ==========================================================

app.patch(
  "/inquiry/:id",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, visit_date, visit_time, notes } = req.body;

      if (status && !ALLOWED_INQUIRY_STATUSES.includes(status)) {
        return res.status(400).json({
          message:
            "Invalid status. Allowed values: requested, contacted, visit_scheduled, visited, negotiation, deal_closed, cancelled, rejected",
        });
      }

      const result = await pool.query(
        `UPDATE inquiries
         SET
           status = COALESCE($1, status),
           visit_date = COALESCE($2, visit_date),
           visit_time = COALESCE($3, visit_time),
           notes = COALESCE($4, notes),
           last_status_updated_at = CURRENT_TIMESTAMP,
           status_updated_by = $5
         WHERE inquiry_id = $6
           AND society_id = $7
         RETURNING *`,
        [
          status || null,
          visit_date || null,
          visit_time || null,
          notes || null,
          req.user.user_id,
          id,
          req.user.society_id,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Inquiry not found or unauthorized",
        });
      }

      res.json({
        message: "Inquiry updated successfully",
        inquiry: result.rows[0],
      });
    } catch (err) {
      console.error("Error updating inquiry:", err);

      res.status(500).json({
        message: "Failed to update inquiry",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// BUYER / TENANT - MY INQUIRIES
// ==========================================================
// API:
// GET /my-inquiries
//
// Buyer data safety:
// - Shows only inquiries for logged-in buyer/tenant.
// - Does NOT expose wing_flat_no, owner_contact, admin_notes, bottom prices.
// ==========================================================

app.get(
  "/my-inquiries",
  authenticateToken,
  authorizeRoles("buyer", "tenant"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
           i.inquiry_id,
           i.property_id,
           i.inquiry_type,
           i.message,
           i.status,
           i.created_at,
           i.visit_date,
           i.visit_time,
           i.notes,
           i.mobile_verified,
           i.mobile_verified_at,
           i.last_status_updated_at,

           p.c_type,
           p.request_type,
           p.expected_price,
           p.expected_rent,
           p.expected_deposit,
           p.property_status,
           p.available_from,

           COALESCE(s.society_name, p.so_name) AS society_name,
           COALESCE(s.address, p.so_location) AS society_address

         FROM inquiries i
         LEFT JOIN properties p
           ON i.property_id = p.prop_id
         LEFT JOIN societies s
           ON p.society_id = s.society_id
         WHERE i.user_id = $1
         ORDER BY i.inquiry_id DESC`,
        [req.user.user_id]
      );

      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching buyer/tenant inquiries:", err);

      res.status(500).json({
        message: "Failed to fetch my inquiries",
        error: err.message,
      });
    }
  }
);
// ==========================================================
// HEALTH CHECK
// ==========================================================

app.get("/", (req, res) => {
  res.send("SocioDeal backend is running");
});

// ==========================================================
// SERVER START
// ==========================================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});