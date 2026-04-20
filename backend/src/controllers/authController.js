const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { promisePool } = require("../models/database");

const signToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: process.env.JWT_EXPIRE || "24h" },
  );
};

const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ error: "username, email and password are required" });
    }

    const [existing] = await promisePool.query(
      "SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1",
      [email, username],
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: "User already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await promisePool.query(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
      [username, email, passwordHash],
    );

    const user = { id: result.insertId, username, email };

    // Initialize default settings
    await promisePool.query(
      "INSERT IGNORE INTO user_settings (user_id, execution_provider, frame_processor, live_mirror) VALUES (?, ?, ?, ?)",
      [user.id, "cpu", "face_swapper", false],
    );

    return res.status(201).json({ token: signToken(user), user });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const [rows] = await promisePool.query(
      "SELECT id, username, email, password_hash FROM users WHERE email = ? LIMIT 1",
      [email],
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    return res.json({
      token: signToken(user),
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const [rows] = await promisePool.query(
      "SELECT id, username, email, created_at FROM users WHERE id = ? LIMIT 1",
      [req.user.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(rows[0]);
  } catch (error) {
    return next(error);
  }
};

const getSettings = async (req, res, next) => {
  try {
    const [rows] = await promisePool.query(
      "SELECT execution_provider, frame_processor, live_mirror FROM user_settings WHERE user_id = ? LIMIT 1",
      [req.user.id],
    );

    if (rows.length > 0) {
      return res.json(rows[0]);
    }

    const defaults = {
      execution_provider: "cpu",
      frame_processor: "face_swapper",
      live_mirror: false,
    };

    await promisePool.query(
      "INSERT INTO user_settings (user_id, execution_provider, frame_processor, live_mirror) VALUES (?, ?, ?, ?)",
      [
        req.user.id,
        defaults.execution_provider,
        defaults.frame_processor,
        defaults.live_mirror,
      ],
    );

    return res.json(defaults);
  } catch (error) {
    return next(error);
  }
};

const saveSettings = async (req, res, next) => {
  try {
    const {
      execution_provider = "cpu",
      frame_processor = "face_swapper",
      live_mirror = false,
    } = req.body;

    await promisePool.query(
      `INSERT INTO user_settings (user_id, execution_provider, frame_processor, live_mirror)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                execution_provider = VALUES(execution_provider),
                frame_processor = VALUES(frame_processor),
                live_mirror = VALUES(live_mirror)`,
      [req.user.id, execution_provider, frame_processor, Boolean(live_mirror)],
    );

    return res.json({
      success: true,
      execution_provider,
      frame_processor,
      live_mirror: Boolean(live_mirror),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
  me,
  getSettings,
  saveSettings,
};
