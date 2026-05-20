import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { uploadChatAsset, downloadChatFile } from "../controllers/uploadController.js";

const router = express.Router();

router.post("/chat-asset", protect, uploadChatAsset);
router.get("/chat-file/:filePath", protect, downloadChatFile);

export default router;
