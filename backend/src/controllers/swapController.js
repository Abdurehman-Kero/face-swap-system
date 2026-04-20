const { promisePool } = require("../models/database");

const activeByUser = new Map();

const status = async (req, res, next) => {
  try {
    const active = activeByUser.get(req.user.id);
    if (active) {
      return res.json({
        isRunning: true,
        sessionId: active.sessionId,
        faceImageId: active.faceImageId,
      });
    }

    return res.json({ isRunning: false, sessionId: null, faceImageId: null });
  } catch (error) {
    return next(error);
  }
};

const start = async (req, res, next) => {
  try {
    const { faceImageId } = req.body;

    if (!faceImageId) {
      return res.status(400).json({ error: "faceImageId is required" });
    }

    const [faces] = await promisePool.query(
      "SELECT id FROM face_images WHERE id = ? AND user_id = ? LIMIT 1",
      [faceImageId, req.user.id],
    );

    if (faces.length === 0) {
      return res.status(404).json({ error: "Face image not found" });
    }

    await promisePool.query(
      "UPDATE face_images SET is_active = false WHERE user_id = ?",
      [req.user.id],
    );
    await promisePool.query(
      "UPDATE face_images SET is_active = true WHERE id = ? AND user_id = ?",
      [faceImageId, req.user.id],
    );

    const existing = activeByUser.get(req.user.id);
    if (existing) {
      await promisePool.query(
        `UPDATE swap_sessions
                 SET status = 'stopped', ended_at = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW())
                 WHERE id = ?`,
        [existing.sessionId],
      );
    }

    const [result] = await promisePool.query(
      `INSERT INTO swap_sessions (user_id, face_image_id, status)
             VALUES (?, ?, 'running')`,
      [req.user.id, faceImageId],
    );

    activeByUser.set(req.user.id, {
      sessionId: result.insertId,
      faceImageId,
    });

    return res.json({
      success: true,
      isRunning: true,
      sessionId: result.insertId,
    });
  } catch (error) {
    return next(error);
  }
};

const stop = async (req, res, next) => {
  try {
    const active = activeByUser.get(req.user.id);

    if (!active) {
      return res.json({ success: true, isRunning: false });
    }

    await promisePool.query(
      `UPDATE swap_sessions
             SET status = 'stopped', ended_at = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW())
             WHERE id = ?`,
      [active.sessionId],
    );

    activeByUser.delete(req.user.id);

    return res.json({ success: true, isRunning: false });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  status,
  start,
  stop,
};
