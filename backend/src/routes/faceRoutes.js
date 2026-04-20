const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  upload,
  listFaces,
  uploadFace,
} = require("../controllers/faceController");

const router = express.Router();

router.get("/", authMiddleware, listFaces);
router.post("/upload", authMiddleware, upload.single("face"), uploadFace);

module.exports = router;
