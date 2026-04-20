const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { status, start, stop } = require("../controllers/swapController");

const router = express.Router();

router.get("/status", authMiddleware, status);
router.post("/start", authMiddleware, start);
router.post("/stop", authMiddleware, stop);

module.exports = router;
