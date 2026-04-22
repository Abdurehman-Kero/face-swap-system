const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { promisePool } = require("../models/database");

const uploadDir = path.join(__dirname, "../../uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeBaseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 60);
    cb(null, `${Date.now()}_${safeBaseName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MAX_FILE_SIZE || 10485760),
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    return cb(null, true);
  },
});

const listFaces = async (req, res, next) => {
  try {
    const [rows] = await promisePool.query(
      `SELECT id, user_id, image_path, original_filename, is_active, uploaded_at
             FROM face_images
             WHERE user_id = ?
             ORDER BY uploaded_at DESC`,
      [req.user.id],
    );

    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

const uploadFace = async (req, res, next) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: 'No file uploaded. Use field name "face".' });
    }

    const imagePath = `uploads/${req.file.filename}`;

    const [result] = await promisePool.query(
      `INSERT INTO face_images (user_id, image_path, original_filename, is_active)
             VALUES (?, ?, ?, false)`,
      [req.user.id, imagePath, req.file.originalname],
    );

    return res.status(201).json({
      id: result.insertId,
      image_path: imagePath,
      original_filename: req.file.originalname,
      is_active: false,
    });
  } catch (error) {
    return next(error);
  }
};

const deleteFace = async (req, res, next) => {
  let connection;
  try {
    const faceId = Number(req.params.id);
    if (!Number.isInteger(faceId) || faceId <= 0) {
      return res.status(400).json({ error: "Invalid face id" });
    }

    connection = await promisePool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, image_path
         FROM face_images
         WHERE id = ? AND user_id = ?
         LIMIT 1`,
      [faceId, req.user.id],
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Face image not found" });
    }

    await connection.query(
      "DELETE FROM swap_sessions WHERE user_id = ? AND face_image_id = ?",
      [req.user.id, faceId],
    );

    await connection.query(
      "DELETE FROM face_images WHERE id = ? AND user_id = ?",
      [faceId, req.user.id],
    );

    await connection.commit();

    const filePath = path.resolve(__dirname, "../../", rows[0].image_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return res.json({ success: true, id: faceId });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    return next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = {
  upload,
  listFaces,
  uploadFace,
  deleteFace,
};
