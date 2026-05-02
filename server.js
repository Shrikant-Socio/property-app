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

    if (err.code === "23505") {
      return res.status(400).json({ message: "Email already exists" });
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

app.get("/properties/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    let query = `
      SELECT 
        p.*,
        s.society_code,
        s.society_name,
        s.address AS society_address
      FROM properties p
      LEFT JOIN societies s ON p.society_id = s.society_id
      WHERE p.prop_id = $1
    `;

    const values = [id];

    // Society admin can only access own society property
    if (req.user.role === "society_admin") {
      query += ` AND p.society_id = $2`;
      values.push(req.user.society_id);
    }

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Property not found or unauthorized",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching property:", err);

    res.status(500).json({
      message: "Failed to fetch property",
      error: err.message,
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
// INQUIRY APIs
// ==========================================================

app.post("/inquiry", authenticateToken, async (req, res) => {
  try {
    const { property_id, message } = req.body;

    if (!property_id) {
      return res.status(400).json({
        message: "property_id is required",
      });
    }

    const propertyResult = await pool.query(
      `SELECT prop_id, society_id
       FROM properties
       WHERE prop_id = $1`,
      [property_id]
    );

    if (propertyResult.rows.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    const property = propertyResult.rows[0];

    const result = await pool.query(
      `INSERT INTO inquiries
       (property_id, user_id, name, phone, message, society_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        property_id,
        req.user.user_id,
        req.user.email,
        "",
        message || "",
        property.society_id,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating inquiry:", err);

    res.status(500).json({
      message: "Failed to create inquiry",
      error: err.message,
    });
  }
});

app.get(
  "/inquiries",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT 
           i.*,
           p.wing_flat_no,
           p.c_type,
           p.request_type,
           p.expected_price,
           p.expected_rent
         FROM inquiries i
         JOIN properties p ON i.property_id = p.prop_id
         WHERE p.society_id = $1
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

app.patch(
  "/inquiry/:id",
  authenticateToken,
  authorizeRoles("society_admin"),
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
        [status, visit_date, visit_time, notes, id, req.user.society_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Inquiry not found or unauthorized",
        });
      }

      res.json(result.rows[0]);
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