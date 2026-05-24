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

// ==========================================================
// LOGIN API - HARDENED VERSION
// ==========================================================
// Enhancements:
// - Blocks inactive accounts
// - Blocks blocked accounts
// - Tracks failed login attempts
// - Blocks account after 5 failed attempts
// - Resets failed_login_attempts on successful login
// - Updates last_login_at on successful login
// - Returns force_password_change flag for frontend redirect
// - Keeps existing JWT payload backward-compatible
// ==========================================================

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // ------------------------------------------------------
    // Basic validation
    // ------------------------------------------------------
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // ------------------------------------------------------
    // Fetch user by email.
    // SELECT * is kept for backward compatibility with your
    // current login logic, because token/user response uses
    // multiple fields.
    // ------------------------------------------------------
    const userResult = await pool.query(
      `SELECT *
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const user = userResult.rows[0];

    // ------------------------------------------------------
    // Account status check before password validation.
    // This prevents inactive/blocked users from logging in.
    // NULL is treated as active for backward compatibility.
    // ------------------------------------------------------
    const accountStatus = user.account_status || "active";

    if (accountStatus === "inactive") {
      return res.status(403).json({
        message: "Your account is inactive. Contact administrator.",
      });
    }

    if (accountStatus === "blocked") {
      return res.status(403).json({
        message: "Your account is blocked. Contact support.",
      });
    }

    // ------------------------------------------------------
    // Password validation using bcrypt.
    // Never expose or return password/hash.
    // ------------------------------------------------------
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      const currentFailedAttempts = Number(user.failed_login_attempts || 0);
      const newFailedAttempts = currentFailedAttempts + 1;

      // Optional lock rule:
      // After 5 wrong attempts, block account.
      if (newFailedAttempts >= 5) {
        await pool.query(
          `UPDATE users
           SET failed_login_attempts = $1,
               account_status = 'blocked'
           WHERE user_id = $2`,
          [newFailedAttempts, user.user_id]
        );

        return res.status(403).json({
          message:
            "Your account is blocked due to multiple failed login attempts. Contact support.",
        });
      }

      await pool.query(
        `UPDATE users
         SET failed_login_attempts = $1
         WHERE user_id = $2`,
        [newFailedAttempts, user.user_id]
      );

      return res.status(401).json({
        message: "Invalid email or password",
        attempts_remaining: Math.max(0, 5 - newFailedAttempts),
      });
    }

    // ------------------------------------------------------
    // Block society admin if mapped society is missing/inactive.
    // Existing behavior preserved.
    // ------------------------------------------------------
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

    // ------------------------------------------------------
    // Successful login:
    // - reset failed attempts
    // - update last_login_at
    // - fetch updated values for clean response
    // ------------------------------------------------------
    const updatedUserResult = await pool.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           last_login_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING *`,
      [user.user_id]
    );

    const updatedUser = updatedUserResult.rows[0];

    // ------------------------------------------------------
    // JWT payload remains backward-compatible.
    // Added force_password_change/account_status for frontend use.
    // ------------------------------------------------------
    const token = jwt.sign(
      {
        user_id: updatedUser.user_id,
        email: updatedUser.email,
        role: updatedUser.role,
        society_id: updatedUser.society_id,
        phone_verified: updatedUser.phone_verified,
        phone_verified_at: updatedUser.phone_verified_at,
        account_status: updatedUser.account_status || "active",
        force_password_change: updatedUser.force_password_change || false,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      token,
      user: {
        user_id: updatedUser.user_id,
        full_name: updatedUser.full_name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        society_id: updatedUser.society_id,
        phone_verified: updatedUser.phone_verified,
        phone_verified_at: updatedUser.phone_verified_at,
        account_status: updatedUser.account_status || "active",
        force_password_change: updatedUser.force_password_change || false,
        last_login_at: updatedUser.last_login_at,
      },
    });
  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
});

// ==========================================================
// CHANGE PASSWORD API
// ==========================================================
// API: POST /change-password
// Auth: JWT required
// Works for: platform_admin, society_admin, buyer, tenant
// ==========================================================

app.post("/change-password", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const { current_password, new_password, confirm_password } = req.body;

    if (!current_password || !new_password || !confirm_password) {
      return res.status(400).json({
        message: "current_password, new_password and confirm_password are required",
      });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({
        message: "New password and confirm password do not match",
      });
    }

    if (String(new_password).length < 8) {
      return res.status(400).json({
        message: "New password must be at least 8 characters long",
      });
    }

    const userResult = await pool.query(
      `SELECT 
         user_id,
         password,
         role,
         account_status,
         force_password_change
       FROM users
       WHERE user_id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = userResult.rows[0];
    const accountStatus = user.account_status || "active";

    if (accountStatus === "inactive") {
      return res.status(403).json({
        message: "Your account is inactive. Contact administrator.",
      });
    }

    if (accountStatus === "blocked") {
      return res.status(403).json({
        message: "Your account is blocked. Contact support.",
      });
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      current_password,
      user.password
    );

    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    const isSamePassword = await bcrypt.compare(new_password, user.password);

    if (isSamePassword) {
      return res.status(400).json({
        message: "New password cannot be same as current password",
      });
    }

    const hashedNewPassword = await bcrypt.hash(new_password, 10);

    await pool.query(
      `UPDATE users
       SET
         password = $1,
         force_password_change = false,
         password_updated_at = CURRENT_TIMESTAMP,
         failed_login_attempts = 0
       WHERE user_id = $2`,
      [hashedNewPassword, userId]
    );

    return res.status(200).json({
      message: "Password changed successfully",
    });
  } catch (err) {
    console.error("Change password error:", err);

    return res.status(500).json({
      message: "Failed to change password",
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

// ==========================================================
// RESET SOCIETY ADMIN PASSWORD - PLATFORM ADMIN
// ==========================================================
// Route:
// PUT /societies/:id/admin/reset-password
//
// Here :id = society_id, not user_id.
//
// Purpose:
// - Platform admin can reset society admin password
// - If admin was blocked due to failed login attempts,
//   reset should unblock the account
// - Force password change after reset
// ==========================================================

app.put(
  "/societies/:id/admin/reset-password",
  authenticateToken,
  authorizeRoles("platform_admin"),
  async (req, res) => {
    try {
      const { id } = req.params; // society_id
      const { new_password } = req.body;

      if (!new_password) {
        return res.status(400).json({
          message: "New password is required",
        });
      }

      const hashedPassword = await bcrypt.hash(new_password, 10);

      const result = await pool.query(
        `UPDATE users
         SET
           password = $1,
           account_status = 'active',
           failed_login_attempts = 0,
           force_password_change = true,
           password_updated_at = CURRENT_TIMESTAMP,
           deactivated_at = NULL,
           deactivated_by = NULL
         WHERE society_id = $2
           AND role = 'society_admin'
         RETURNING
           user_id,
           full_name,
           email,
           role,
           society_id,
           account_status,
           failed_login_attempts,
           force_password_change,
           password_updated_at`,
        [hashedPassword, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Admin not found",
        });
      }

      return res.json({
        message: "Password reset successfully. Admin account is active now.",
        admin: result.rows[0],
      });
    } catch (err) {
      console.error("Error resetting password:", err);

      return res.status(500).json({
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
// SOCIETY ADMIN INQUIRY MANAGEMENT APIs
// ==========================================================

const SOCIETY_ADMIN_INQUIRY_STATUSES = [
  "requested",
  "contacted",
  "visit_scheduled",
  "visited",
  "negotiation",
  "deal_closed",
  "rejected",
  "cancelled",
];

// ==========================================================
// BUYER-VISIBLE PREDEFINED STATUS MESSAGES
// ==========================================================
// Society admin must select one of these messages while updating
// inquiry status. This avoids unclear/blank buyer updates.
// ==========================================================

const BUYER_STATUS_MESSAGES = {
  contacted: [
    "Society admin has contacted you. Please check your phone.",
    "We tried reaching you. Please call back when available.",
  ],

  visit_scheduled: [
    "Your visit has been scheduled. Please arrive on time.",
    "Your site visit is scheduled. Please coordinate with society admin.",
  ],

  visited: [
    "Thank you for visiting the property. We will update you on next steps.",
    "Your visit is completed. Please share your interest with society admin.",
  ],

  negotiation: [
    "Your inquiry is under price discussion.",
    "Society admin is coordinating with the owner for price discussion.",
  ],

  deal_closed: [
    "Congratulations, this deal has been marked as closed.",
    "Your deal is successfully closed. Society admin will guide you on next steps.",
  ],

  rejected: [
    "This property is currently not available.",
    "Your inquiry could not be processed at this time.",
  ],

  cancelled: [
    "Your inquiry has been cancelled as per the current process.",
    "This inquiry has been cancelled. Please contact society admin if needed.",
  ],

  requested: [
    "Your inquiry has been received by society admin.",
  ],
};

function isAllowedBuyerMessage(status, buyerMessage) {
  if (!status || !buyerMessage) return false;

  const allowedMessages = BUYER_STATUS_MESSAGES[status];

  if (!Array.isArray(allowedMessages)) return false;

  return allowedMessages.includes(String(buyerMessage).trim());
}

// ==========================================================
// GET /society-inquiries
// Society admin can view only inquiries for own society
// ==========================================================

app.get(
  "/society-inquiries",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    try {
      const societyId = req.user.society_id;

      if (!societyId) {
        return res.status(403).json({
          message: "Society admin is not mapped to any society",
        });
      }

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

           -- Internal/admin operational note
           i.notes,

           -- Buyer-visible latest status explanation
           i.buyer_message,

           i.mobile_verified,
           i.mobile_verified_at,
           i.last_status_updated_at,

           u.full_name AS buyer_name,
           u.phone AS buyer_mobile,
           u.email AS buyer_email,

           p.c_type,
           p.request_type,
           p.expected_price,
           p.expected_rent,
           p.expected_deposit,
           p.property_status,
           p.available_from,

           s.society_name,
           s.address AS society_address

         FROM inquiries i
         JOIN properties p
           ON i.property_id = p.prop_id
         LEFT JOIN users u
           ON i.user_id = u.user_id
         LEFT JOIN societies s
           ON p.society_id = s.society_id

         WHERE p.society_id = $1
           AND i.society_id = $1

         ORDER BY i.created_at DESC, i.inquiry_id DESC`,
        [societyId]
      );

      return res.status(200).json(result.rows);
    } catch (err) {
      console.error("Error fetching society inquiries:", err);

      return res.status(500).json({
        message: "Failed to fetch society inquiries",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// PATCH /inquiries/:id/status
// Society admin updates inquiry status + inserts timeline history
// ==========================================================
// Important:
// - Society admin can update only inquiries from own society
// - Status update and history insert happen in one transaction
// - If history insert fails, status update is rolled back
// - buyer_message is buyer-visible
// - notes is internal/admin note
// ==========================================================

app.patch(
  "/inquiries/:id/status",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const societyId = req.user.society_id;
      const inquiryId = Number(req.params.id);

      const { status, buyer_message, visit_date, visit_time, notes } = req.body;

      // ------------------------------------------------------
      // Basic auth/society validation
      // ------------------------------------------------------
      if (!societyId) {
        return res.status(403).json({
          message: "Society admin is not mapped to any society",
        });
      }

      if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
        return res.status(400).json({
          message: "Invalid inquiry id",
        });
      }

      if (!status) {
        return res.status(400).json({
          message: "status is required",
        });
      }

      if (!SOCIETY_ADMIN_INQUIRY_STATUSES.includes(status)) {
        return res.status(400).json({
          message:
            "Invalid status. Allowed values: requested, contacted, visit_scheduled, visited, negotiation, deal_closed, rejected, cancelled",
        });
      }

      if (!buyer_message || !String(buyer_message).trim()) {
        return res.status(400).json({
          message: "buyer_message is required for status update",
        });
      }

      if (!isAllowedBuyerMessage(status, buyer_message)) {
        return res.status(400).json({
          message: "Invalid buyer_message for selected status",
          allowed_messages: BUYER_STATUS_MESSAGES[status] || [],
        });
      }

      if (status === "visit_scheduled" && (!visit_date || !visit_time)) {
        return res.status(400).json({
          message:
            "visit_date and visit_time are required when scheduling a visit",
        });
      }

      await client.query("BEGIN");

      // ------------------------------------------------------
      // Step 1:
      // Fetch current inquiry with society isolation.
      // FOR UPDATE locks row so two admins cannot update same inquiry
      // at exactly the same time.
      // ------------------------------------------------------
      const currentInquiryResult = await client.query(
        `SELECT
           i.inquiry_id,
           i.status AS old_status,
           i.property_id,
           i.society_id
         FROM inquiries i
         JOIN properties p
           ON i.property_id = p.prop_id
         WHERE i.inquiry_id = $1
           AND i.society_id = $2
           AND p.society_id = $2
         FOR UPDATE`,
        [inquiryId, societyId]
      );

      if (currentInquiryResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "Inquiry not found or unauthorized",
        });
      }

      const currentInquiry = currentInquiryResult.rows[0];
      const oldStatus = currentInquiry.old_status;

      // ------------------------------------------------------
      // Step 2:
      // Update latest inquiry state.
      // This keeps the main inquiries table as the current snapshot.
      // ------------------------------------------------------
      const updatedInquiryResult = await client.query(
        `UPDATE inquiries
         SET
           status = $1,
           buyer_message = $2,
           visit_date = COALESCE($3, visit_date),
           visit_time = COALESCE($4, visit_time),
           notes = COALESCE($5, notes),
           last_status_updated_at = CURRENT_TIMESTAMP,
           status_updated_by = $6
         WHERE inquiry_id = $7
           AND society_id = $8
         RETURNING
           inquiry_id,
           property_id,
           user_id,
           name AS buyer_name_snapshot,
           phone AS buyer_mobile_snapshot,
           inquiry_type,
           message,
           status,
           buyer_message,
           created_at,
           visit_date,
           visit_time,
           notes,
           mobile_verified,
           mobile_verified_at,
           last_status_updated_at,
           status_updated_by`,
        [
          status,
          String(buyer_message).trim(),
          visit_date || null,
          visit_time || null,
          notes || null,
          req.user.user_id,
          inquiryId,
          societyId,
        ]
      );

      const updatedInquiry = updatedInquiryResult.rows[0];
     // ------------------------------------------------------
     // Step 2.1:
     // If inquiry is marked as deal_closed, close the property.
     // This keeps dashboard counts and buyer listing correct.
     // Property remains in DB for admin/reporting history.
     // ------------------------------------------------------
     if (status === "deal_closed") {
     await client.query(
     `UPDATE properties
     SET property_status = 'CLOSED'
     WHERE prop_id = $1
       AND society_id = $2`,
     [updatedInquiry.property_id, societyId]
      );
     }
      // ------------------------------------------------------
      // Step 3:
      // Insert status history/timeline row.
      // This preserves audit trail and supports buyer/admin timeline UI.
      // ------------------------------------------------------
      const historyResult = await client.query(
        `INSERT INTO inquiry_status_history
         (
           inquiry_id,
           old_status,
           new_status,
           buyer_message,
           internal_note,
           visit_date,
           visit_time,
           changed_by,
           changed_at
         )
         VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
         RETURNING
           history_id,
           inquiry_id,
           old_status,
           new_status,
           buyer_message,
           internal_note,
           visit_date,
           visit_time,
           changed_by,
           changed_at`,
        [
          inquiryId,
          oldStatus,
          status,
          String(buyer_message).trim(),
          notes || null,
          visit_date || null,
          visit_time || null,
          req.user.user_id,
        ]
      );
              // ------------------------------------------------------
      // Step 4:
      // Create buyer notification for inquiry update.
      // Buyer will see this in notification center.
      // ------------------------------------------------------
      const notificationType =
        status === "visit_scheduled"
          ? "visit_scheduled"
          : status === "deal_closed"
          ? "deal_closed"
          : "inquiry_status_updated";

      await createNotification({
        user_id: updatedInquiry.user_id,
        society_id: societyId,
        notification_type: notificationType,

        title:
          status === "visit_scheduled"
            ? "Visit Scheduled"
            : status === "deal_closed"
            ? "Deal Closed"
            : "Inquiry Status Updated",

        message: String(buyer_message).trim(),

        reference_type: "inquiry",
        reference_id: inquiryId,

        // Important:
        // Use transaction client so notification and
        // inquiry update succeed/fail together.
        client,
      });
      await client.query("COMMIT");

      return res.status(200).json({
        message: "Inquiry status updated successfully",
        inquiry: updatedInquiry,
        history: historyResult.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");

      console.error("Error updating inquiry status:", err);

      return res.status(500).json({
        message: "Failed to update inquiry status",
        error: err.message,
      });
    } finally {
      client.release();
    }
  }
);

// ==========================================================
// GET /inquiries/:id/timeline
// Inquiry timeline for buyer or society admin
// ==========================================================

app.get(
  "/inquiries/:id/timeline",
  authenticateToken,
  async (req, res) => {
    try {
      const inquiryId = Number(req.params.id);

      if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
        return res.status(400).json({
          message: "Invalid inquiry id",
        });
      }

      let accessResult;

      if (req.user.role === "society_admin") {
        accessResult = await pool.query(
          `SELECT i.inquiry_id
           FROM inquiries i
           JOIN properties p ON i.property_id = p.prop_id
           WHERE i.inquiry_id = $1
             AND i.society_id = $2
             AND p.society_id = $2`,
          [inquiryId, req.user.society_id]
        );
      } else if (req.user.role === "buyer" || req.user.role === "tenant") {
        accessResult = await pool.query(
          `SELECT inquiry_id
           FROM inquiries
           WHERE inquiry_id = $1
             AND user_id = $2`,
          [inquiryId, req.user.user_id]
        );
      } else {
        return res.status(403).json({
          message: "Access denied",
        });
      }

      if (accessResult.rows.length === 0) {
        return res.status(404).json({
          message: "Inquiry not found or unauthorized",
        });
      }

      const timelineResult = await pool.query(
        `SELECT
           h.history_id,
           h.inquiry_id,
           h.old_status,
           h.new_status,
           h.buyer_message,
           h.internal_note,
           h.visit_date,
           h.visit_time,
           h.changed_at,
           u.full_name AS changed_by_name
         FROM inquiry_status_history h
         LEFT JOIN users u ON h.changed_by = u.user_id
         WHERE h.inquiry_id = $1
         ORDER BY h.changed_at ASC, h.history_id ASC`,
        [inquiryId]
      );

      return res.status(200).json(timelineResult.rows);
    } catch (err) {
      console.error("Error fetching inquiry timeline:", err);

      return res.status(500).json({
        message: "Failed to fetch inquiry timeline",
        error: err.message,
      });
    }
  }
);

async function createNotification({
  user_id,
  society_id = null,
  notification_type,
  title,
  message,
  reference_type = "system",
  reference_id = null,
  client = pool,
}) {
  return client.query(
    `INSERT INTO notifications
     (
       user_id,
       society_id,
       notification_type,
       title,
       message,
       reference_type,
       reference_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING notification_id`,
    [
      user_id,
      society_id,
      notification_type,
      title,
      message,
      reference_type,
      reference_id,
    ]
  );
}

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

// ==========================================================
// PHONE OTP APIs - BUYER / TENANT MOBILE VERIFICATION
// ==========================================================
// Purpose:
// - Buyer/Tenant must verify mobile before sending inquiry
// - OTP is stored as bcrypt hash, never as plain text
// - Local dev may return dev_otp for testing
// - Production must never return OTP
// ==========================================================

// Generate 6 digit OTP as string. e.g."042391" is possible and should remain 6 digits
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
  return res.status(400).json({
    message: "Mobile number is already verified. OTP verification is not required.",
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
      await createNotification({
  user_id: req.user.user_id,
  society_id: property.society_id,
  notification_type: "inquiry_created",
  title: "Inquiry Sent Successfully",
  message: "Your inquiry has been sent to society admin. You will receive updates soon.",
  reference_type: "inquiry",
  reference_id: result.rows[0].inquiry_id,
});

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
           i.buyer_message,
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
// REPORTING DASHBOARD APIs - PHASE 1
// ==========================================================
// APIs:
// 1. GET /dashboard/society
// 2. GET /dashboard/platform
//
// Rules:
// - Society admin sees ONLY own society data.
// - Platform admin sees aggregated platform-level data.
// - No buyer personal data is exposed in platform dashboard.
// - All queries are parameterized.
// ==========================================================

// ==========================================================
// GET /dashboard/society
// Society Admin Dashboard
// ==========================================================

app.get(
  "/dashboard/society",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    try {
      const societyId = req.user.society_id;

      if (!societyId) {
        return res.status(403).json({
          message: "Society admin is not mapped to any society",
        });
      }

      // ------------------------------------------------------
      // Property statistics for logged-in society only
      // ------------------------------------------------------
      const propertyStatsResult = await pool.query(
        `SELECT
           COUNT(*)::int AS total_properties,
           COUNT(*) FILTER (WHERE request_type = 'SALE')::int AS sale_properties,
           COUNT(*) FILTER (WHERE request_type = 'RENT')::int AS rent_properties,
           COUNT(*) FILTER (WHERE COALESCE(property_status, 'AVAILABLE') = 'AVAILABLE')::int AS available_properties,
           COUNT(*) FILTER (WHERE property_status = 'CLOSED')::int AS closed_properties
         FROM properties
         WHERE society_id = $1`,
        [societyId]
      );

      // ------------------------------------------------------
      // Inquiry statistics for logged-in society only
      // ------------------------------------------------------
      const inquiryStatsResult = await pool.query(
        `SELECT
           COUNT(*)::int AS total_inquiries,
           COUNT(*) FILTER (WHERE status = 'requested')::int AS requested_inquiries,
           COUNT(*) FILTER (WHERE status = 'contacted')::int AS contacted_inquiries,
           COUNT(*) FILTER (WHERE status = 'visit_scheduled')::int AS visit_scheduled_inquiries,
           COUNT(*) FILTER (WHERE status = 'deal_closed')::int AS deal_closed_inquiries
         FROM inquiries
         WHERE society_id = $1`,
        [societyId]
      );

      // ------------------------------------------------------
      // Recent inquiries for logged-in society only
      // Safe admin fields only.
      // ------------------------------------------------------
      const recentInquiriesResult = await pool.query(
        `SELECT
           i.inquiry_id,
           i.property_id,
           i.inquiry_type,
           i.status,
           i.name AS buyer_name,
           i.phone AS buyer_phone,
           i.created_at,
           i.buyer_message,
           i.visit_date,
           i.visit_time,

           p.request_type,
           p.c_type,
           p.property_status

         FROM inquiries i
         JOIN properties p
           ON i.property_id = p.prop_id
         WHERE i.society_id = $1
           AND p.society_id = $1
         ORDER BY i.created_at DESC, i.inquiry_id DESC
         LIMIT 10`,
        [societyId]
      );

      return res.status(200).json({
        ...propertyStatsResult.rows[0],
        ...inquiryStatsResult.rows[0],
        recent_inquiries: recentInquiriesResult.rows,
      });
    } catch (err) {
      console.error("Society dashboard error:", err);

      return res.status(500).json({
        message: "Failed to fetch society dashboard",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// GET /dashboard/platform
// Platform Admin Dashboard - Corrected Aggregation
// ==========================================================
// Important fix:
// - Avoid property × inquiry join multiplication.
// - KPI totals are calculated independently using subqueries.
// - society_wise_summary uses COUNT(DISTINCT ...) safely.
// - No buyer personal data is exposed.
// ==========================================================

app.get(
  "/dashboard/platform",
  authenticateToken,
  authorizeRoles("platform_admin"),
  async (req, res) => {
    try {
      // ------------------------------------------------------
      // Platform-level KPI totals
      // ------------------------------------------------------
      // These are calculated from base tables independently.
      // This avoids duplicated counts caused by joining
      // properties and inquiries together.
      // ------------------------------------------------------
      const platformStatsResult = await pool.query(
        `SELECT
           -- Society KPIs
           (SELECT COUNT(*)::int
            FROM societies) AS total_societies,

           (SELECT COUNT(*)::int
            FROM societies
            WHERE status = 'active') AS active_societies_count,

           -- Property KPIs
           (SELECT COUNT(*)::int
            FROM properties) AS total_properties,

           (SELECT COUNT(*)::int
            FROM properties
            WHERE request_type = 'SALE') AS sale_properties,

           (SELECT COUNT(*)::int
            FROM properties
            WHERE request_type = 'RENT') AS rent_properties,

           (SELECT COUNT(*)::int
            FROM properties
            WHERE COALESCE(property_status, 'AVAILABLE') <> 'CLOSED'
            ) AS available_properties,
           
          (SELECT COUNT(*)::int
            FROM properties
            WHERE property_status = 'CLOSED') AS closed_properties,

           -- Inquiry KPIs
           (SELECT COUNT(*)::int
            FROM inquiries) AS total_inquiries,

           (SELECT COUNT(*)::int
            FROM inquiries
            WHERE status = 'requested') AS requested_inquiries,

           (SELECT COUNT(*)::int
            FROM inquiries
            WHERE status = 'visit_scheduled') AS visit_scheduled_inquiries,

           (SELECT COUNT(*)::int
            FROM inquiries
            WHERE status = 'deal_closed') AS deal_closed_inquiries`
      );

      // ------------------------------------------------------
      // Society-wise summary
      // ------------------------------------------------------
      // Uses COUNT(DISTINCT ...) to avoid duplicated rows caused
      // by joining societies -> properties -> inquiries.
      // ------------------------------------------------------
     
      const societyWiseResult = await pool.query(
        `SELECT
           s.society_id,
           s.society_name,

           COUNT(DISTINCT p.prop_id)::int AS total_properties,

           COUNT(DISTINCT CASE
             WHEN p.request_type = 'SALE'
             THEN p.prop_id
           END)::int AS sale_properties,

           COUNT(DISTINCT CASE
             WHEN p.request_type = 'RENT'
             THEN p.prop_id
           END)::int AS rent_properties,

           COUNT(DISTINCT CASE
             WHEN COALESCE(p.property_status, 'AVAILABLE') <> 'CLOSED'
             THEN p.prop_id
           END)::int AS available_properties,

           COUNT(DISTINCT CASE
             WHEN p.property_status = 'CLOSED'
             THEN p.prop_id
           END)::int AS closed_properties,

           COUNT(DISTINCT i.inquiry_id)::int AS total_inquiries,

           COUNT(DISTINCT CASE
             WHEN i.status = 'requested'
             THEN i.inquiry_id
           END)::int AS requested_inquiries,

           COUNT(DISTINCT CASE
             WHEN i.status = 'visit_scheduled'
             THEN i.inquiry_id
           END)::int AS visit_scheduled_inquiries,

           COUNT(DISTINCT CASE
             WHEN i.status = 'deal_closed'
             THEN i.inquiry_id
           END)::int AS deal_closed_inquiries

         FROM societies s

         LEFT JOIN properties p
           ON s.society_id = p.society_id

         LEFT JOIN inquiries i
           ON p.prop_id = i.property_id

         GROUP BY
           s.society_id,
           s.society_name

         ORDER BY
           total_inquiries DESC,
           total_properties DESC,
           s.society_id DESC`
      );

      return res.status(200).json({
        ...platformStatsResult.rows[0],
        society_wise_summary: societyWiseResult.rows,
      });
    } catch (err) {
      console.error("Platform dashboard error:", err);

      return res.status(500).json({
        message: "Failed to fetch platform dashboard",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// SOCIETY ADMIN REMINDER DASHBOARD
// API: GET /dashboard/reminders
// ==========================================================
// Purpose:
// - Operational reminder dashboard for society_admin
// - Helps admin follow up pending/stale inquiries
//
// Security:
// - JWT required
// - society_admin only
// - Uses logged-in admin society_id only
// - No cross-society data exposure
// ==========================================================

app.get(
  "/dashboard/reminders",
  authenticateToken,
  authorizeRoles("society_admin"),
  async (req, res) => {
    try {
      const societyId = req.user.society_id;

      if (!societyId) {
        return res.status(403).json({
          message: "Society admin is not mapped to any society",
        });
      }

      // Common SELECT fields used in all reminder queries.
      // We do not expose owner_contact, admin_notes, or wing_flat_no.
      const reminderFields = `
        i.inquiry_id,
        i.property_id,
        i.name AS buyer_name,
        i.phone AS buyer_phone,
        u.email AS buyer_email,
        i.inquiry_type,
        i.status,
        i.buyer_message,
        i.visit_date,
        i.visit_time,
        i.created_at,
        i.last_status_updated_at,
        p.c_type,
        p.request_type,
        p.property_status
      `;

      // 1. Requested inquiries older than 24 hours
      const pendingFollowups = await pool.query(
        `SELECT ${reminderFields}
         FROM inquiries i
         JOIN properties p ON i.property_id = p.prop_id
         LEFT JOIN users u ON i.user_id = u.user_id
         WHERE i.society_id = $1
           AND p.society_id = $1
           AND i.status = 'requested'
           AND i.created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'
         ORDER BY i.created_at ASC`,
        [societyId]
      );

      // 2. Contacted inquiries older than 2 days, no visit scheduled
      const contactedNoVisit = await pool.query(
        `SELECT ${reminderFields}
         FROM inquiries i
         JOIN properties p ON i.property_id = p.prop_id
         LEFT JOIN users u ON i.user_id = u.user_id
         WHERE i.society_id = $1
           AND p.society_id = $1
           AND i.status = 'contacted'
           AND i.visit_date IS NULL
           AND COALESCE(i.last_status_updated_at, i.created_at) < CURRENT_TIMESTAMP - INTERVAL '2 days'
         ORDER BY COALESCE(i.last_status_updated_at, i.created_at) ASC`,
        [societyId]
      );

      // 3. Visits scheduled for today
      const visitsToday = await pool.query(
        `SELECT ${reminderFields}
         FROM inquiries i
         JOIN properties p ON i.property_id = p.prop_id
         LEFT JOIN users u ON i.user_id = u.user_id
         WHERE i.society_id = $1
           AND p.society_id = $1
           AND i.status = 'visit_scheduled'
           AND i.visit_date = CURRENT_DATE
         ORDER BY i.visit_time ASC NULLS LAST`,
        [societyId]
      );

      // 4. Visited inquiries older than 3 days, no next action
      const postVisitFollowups = await pool.query(
        `SELECT ${reminderFields}
         FROM inquiries i
         JOIN properties p ON i.property_id = p.prop_id
         LEFT JOIN users u ON i.user_id = u.user_id
         WHERE i.society_id = $1
           AND p.society_id = $1
           AND i.status = 'visited'
           AND COALESCE(i.last_status_updated_at, i.created_at) < CURRENT_TIMESTAMP - INTERVAL '3 days'
         ORDER BY COALESCE(i.last_status_updated_at, i.created_at) ASC`,
        [societyId]
      );

      // 5. Negotiation inquiries stuck for more than 5 days
      const stuckNegotiations = await pool.query(
        `SELECT ${reminderFields}
         FROM inquiries i
         JOIN properties p ON i.property_id = p.prop_id
         LEFT JOIN users u ON i.user_id = u.user_id
         WHERE i.society_id = $1
           AND p.society_id = $1
           AND i.status = 'negotiation'
           AND COALESCE(i.last_status_updated_at, i.created_at) < CURRENT_TIMESTAMP - INTERVAL '5 days'
         ORDER BY COALESCE(i.last_status_updated_at, i.created_at) ASC`,
        [societyId]
      );

      return res.status(200).json({
        pending_followups: pendingFollowups.rows,
        contacted_no_visit: contactedNoVisit.rows,
        visits_today: visitsToday.rows,
        post_visit_followups: postVisitFollowups.rows,
        stuck_negotiations: stuckNegotiations.rows,
      });
    } catch (err) {
      console.error("Reminder dashboard error:", err);

      return res.status(500).json({
        message: "Failed to fetch reminder dashboard",
        error: err.message,
      });
    }
  }
);

// ==========================================================
// NOTIFICATION CENTER APIs
// ==========================================================

app.get(
  "/notifications",
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
           notification_id,
           notification_type,
           title,
           message,
           reference_type,
           reference_id,
           is_read,
           read_at,
           created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY is_read ASC, created_at DESC`,
        [req.user.user_id]
      );

      return res.status(200).json(result.rows);
    } catch (err) {
      console.error("Fetch notifications error:", err);
      return res.status(500).json({
        message: "Failed to fetch notifications",
        error: err.message,
      });
    }
  }
);

app.patch(
  "/notifications/:id/read",
  authenticateToken,
  async (req, res) => {
    try {
      const notificationId = Number(req.params.id);

      if (!Number.isInteger(notificationId) || notificationId <= 0) {
        return res.status(400).json({ message: "Invalid notification id" });
      }

      const result = await pool.query(
        `UPDATE notifications
         SET is_read = true,
             read_at = CURRENT_TIMESTAMP
         WHERE notification_id = $1
           AND user_id = $2
         RETURNING *`,
        [notificationId, req.user.user_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Notification not found or unauthorized",
        });
      }

      return res.status(200).json({
        message: "Notification marked as read",
        notification: result.rows[0],
      });
    } catch (err) {
      console.error("Mark notification read error:", err);
      return res.status(500).json({
        message: "Failed to mark notification as read",
        error: err.message,
      });
    }
  }
);

app.patch(
  "/notifications/read-all",
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE notifications
         SET is_read = true,
             read_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
           AND is_read = false
         RETURNING notification_id`,
        [req.user.user_id]
      );

      return res.status(200).json({
        message: "All notifications marked as read",
        updated_count: result.rows.length,
      });
    } catch (err) {
      console.error("Mark all notifications read error:", err);
      return res.status(500).json({
        message: "Failed to mark all notifications as read",
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