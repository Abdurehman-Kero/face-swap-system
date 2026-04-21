const path = require("path");
const { promisePool } = require("../models/database");
const swapEngineClient = require("../services/swapEngineClient");

const activeByUser = new Map();

const getUserSettings = async (userId) => {
  const [rows] = await promisePool.query(
    `SELECT execution_provider, frame_processor, live_mirror
         FROM user_settings WHERE user_id = ? LIMIT 1`,
    [userId],
  );

  return (
    rows[0] || {
      execution_provider: "cpu",
      frame_processor: "face_swapper",
      live_mirror: false,
    }
  );
};

const stopSessionRecord = async (sessionId) => {
  await promisePool.query(
    `UPDATE swap_sessions
         SET status = 'stopped', ended_at = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW())
         WHERE id = ?`,
    [sessionId],
  );
};

const status = async (req, res, next) => {
  try {
    const engine = await swapEngineClient.health();
    const active = activeByUser.get(req.user.id);

    if (swapEngineClient.isEngineMode() && active) {
      const remoteStatus = await swapEngineClient.getSessionStatus({
        userId: req.user.id,
      });
      const isRunning = Boolean(remoteStatus.isRunning);

      if (!isRunning) {
        await stopSessionRecord(active.sessionId);
        activeByUser.delete(req.user.id);
      }
    }

    const latest = activeByUser.get(req.user.id);
    if (latest) {
      return res.json({
        isRunning: true,
        sessionId: latest.sessionId,
        faceImageId: latest.faceImageId,
        engine,
      });
    }

    return res.json({
      isRunning: false,
      sessionId: null,
      faceImageId: null,
      engine,
    });
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
      "SELECT id, image_path FROM face_images WHERE id = ? AND user_id = ? LIMIT 1",
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
      if (swapEngineClient.isEngineMode()) {
        await swapEngineClient.stopSession({ userId: req.user.id });
      }
      await stopSessionRecord(existing.sessionId);
    }

    const [result] = await promisePool.query(
      `INSERT INTO swap_sessions (user_id, face_image_id, status)
             VALUES (?, ?, 'running')`,
      [req.user.id, faceImageId],
    );

    const userSettings = await getUserSettings(req.user.id);
    const absoluteFacePath = path.resolve(
      __dirname,
      "../../",
      faces[0].image_path,
    );

    if (swapEngineClient.isEngineMode()) {
      await swapEngineClient.startSession({
        userId: req.user.id,
        sessionId: result.insertId,
        faceImageId,
        faceImagePath: absoluteFacePath,
        executionProvider: userSettings.execution_provider,
        frameProcessor: userSettings.frame_processor,
        liveMirror: Boolean(userSettings.live_mirror),
      });
    }

    activeByUser.set(req.user.id, {
      sessionId: result.insertId,
      faceImageId,
    });

    const engine = await swapEngineClient.health();

    return res.json({
      success: true,
      isRunning: true,
      sessionId: result.insertId,
      engine,
    });
  } catch (error) {
    return next(error);
  }
};

const stop = async (req, res, next) => {
  try {
    const active = activeByUser.get(req.user.id);
    const engine = await swapEngineClient.health();

    if (!active) {
      return res.json({ success: true, isRunning: false, engine });
    }

    if (swapEngineClient.isEngineMode()) {
      await swapEngineClient.stopSession({ userId: req.user.id });
    }

    await stopSessionRecord(active.sessionId);
    activeByUser.delete(req.user.id);

    return res.json({ success: true, isRunning: false, engine });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  status,
  start,
  stop,
};
