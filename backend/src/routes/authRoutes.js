const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  register,
  login,
  me,
  getSettings,
  saveSettings,
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, me);
router.get("/settings", authMiddleware, getSettings);
router.post("/settings", authMiddleware, saveSettings);

module.exports = router;
