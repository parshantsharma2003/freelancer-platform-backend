import fs from "fs/promises";
import path from "path";
import { asyncHandler } from "../middleware/errorHandler.js";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

const MIME_EXTENSION_MAP = {
  // Audio
  "audio/webm": ".webm",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/flac": ".flac",
  "audio/aac": ".aac",
  // Images
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  // Documents
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/xml": ".xml",
  "application/json": ".json",
  "application/xml": ".xml",
  // Microsoft Office
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  // Archives
  "application/zip": ".zip",
  "application/x-rar-compressed": ".rar",
  "application/x-7z-compressed": ".7z",
  "application/gzip": ".gz",
  "application/x-tar": ".tar",
  "application/x-bzip2": ".bz2",
  // Video
  "video/mp4": ".mp4",
  "video/mpeg": ".mpeg",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
  "video/x-matroska": ".mkv",
  "video/webm": ".webm",
  "video/3gpp": ".3gp",
  // Code
  "text/javascript": ".js",
  "text/typescript": ".ts",
  "text/x-python": ".py",
  "text/x-java": ".java",
  "text/x-c": ".c",
  "text/x-cpp": ".cpp",
  "text/x-csharp": ".cs",
  "text/html": ".html",
  "text/css": ".css",
  "text/x-php": ".php",
  "application/x-sh": ".sh",
  // Other
  "application/octet-stream": ".bin"
};

const sanitizeFileName = (name = "file") =>
  String(name)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);

const getExtFromMime = (mimeType = "") => {
  if (!mimeType) return "";
  return MIME_EXTENSION_MAP[mimeType.toLowerCase()] || "";
};

const parseDataUrl = (dataUrl = "") => {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;

  const mimeType = match[1];
  const base64Payload = match[2];
  const buffer = Buffer.from(base64Payload, "base64");

  return { mimeType, buffer };
};

const buildPublicBaseUrl = (req) => {
  const configured = process.env.CDN_BASE_URL || process.env.BACKEND_PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
};

export const uploadChatAsset = asyncHandler(async (req, res) => {
  const { dataUrl, fileName, mimeType, assetType = "file" } = req.body || {};

  if (!dataUrl || typeof dataUrl !== "string") {
    return res.status(400).json({
      status: "error",
      message: "dataUrl is required"
    });
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return res.status(400).json({
      status: "error",
      message: "Invalid dataUrl format"
    });
  }

  const resolvedMimeType = String(mimeType || parsed.mimeType || "application/octet-stream").toLowerCase();
  const buffer = parsed.buffer;

  if (!buffer?.length) {
    return res.status(400).json({
      status: "error",
      message: "Empty upload payload"
    });
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    return res.status(413).json({
      status: "error",
      message: "File too large. Maximum upload size is 15MB"
    });
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  const rootUploadDir = process.env.UPLOAD_PATH || "./uploads";
  const targetDir = path.resolve(rootUploadDir, "chat", year, month);
  await fs.mkdir(targetDir, { recursive: true });

  const safeOriginalName = sanitizeFileName(fileName || `asset-${Date.now()}`);
  const extFromName = path.extname(safeOriginalName);
  const ext = extFromName || getExtFromMime(resolvedMimeType) || ".bin";
  const baseName = safeOriginalName.replace(new RegExp(`${extFromName.replace(".", "\\.")}$`), "") || "asset";

  const persistedName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${baseName}${ext}`;
  const absoluteFilePath = path.join(targetDir, persistedName);
  await fs.writeFile(absoluteFilePath, buffer);

  const relativeUrlPath = `/uploads/chat/${year}/${month}/${persistedName}`;
  const publicBaseUrl = buildPublicBaseUrl(req);

  return res.status(201).json({
    status: "success",
    data: {
      assetType,
      fileName: `${baseName}${ext}`,
      mimeType: resolvedMimeType,
      size: buffer.length,
      relativePath: relativeUrlPath,
      url: `${publicBaseUrl}${relativeUrlPath}`,
      uploadedAt: now.toISOString()
    }
  });
});

// Download chat file/attachment
export const downloadChatFile = asyncHandler(async (req, res) => {
  const { filePath } = req.params;

  if (!filePath || typeof filePath !== "string") {
    return res.status(400).json({
      status: "error",
      message: "File path is required"
    });
  }

  // Decode the file path (it's base64 encoded in the URL)
  let decodedPath;
  try {
    decodedPath = Buffer.from(filePath, "base64").toString("utf-8");
  } catch (err) {
    // If not base64, use as-is
    decodedPath = filePath;
  }

  // Ensure the path is relative (remove leading slashes)
  const normalizedPath = decodedPath.replace(/^\/+/, '').replace(/^uploads\//, '');

  // Security: ensure the file is within the chat directory
  const rootUploadDir = process.env.UPLOAD_PATH || "./uploads";
  const chatDir = path.resolve(rootUploadDir, "chat");
  
  // Construct the absolute file path
  const absoluteFilePath = path.resolve(chatDir, normalizedPath);

  // Prevent directory traversal attacks
  if (!absoluteFilePath.startsWith(chatDir)) {
    console.warn('[Security] Directory traversal attempt detected:', {
      normalized: normalizedPath,
      resolved: absoluteFilePath,
      allowed: chatDir
    });
    return res.status(403).json({
      status: "error",
      message: "Access denied"
    });
  }

  try {
    // Check if file exists and is actually a file
    const stat = await fs.stat(absoluteFilePath);
    if (!stat.isFile()) {
      return res.status(404).json({
        status: "error",
        message: "File not found"
      });
    }

    // Read file and send
    const fileData = await fs.readFile(absoluteFilePath);
    const fileName = path.basename(absoluteFilePath);
    
    // Determine MIME type
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes = {
      ".pdf": "application/pdf",
      ".txt": "text/plain",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".webm": "audio/webm",
      ".ogg": "audio/ogg",
      ".zip": "application/zip",
      ".rar": "application/x-rar-compressed",
      ".7z": "application/x-7z-compressed",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".ppt": "application/vnd.ms-powerpoint",
      ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ".csv": "text/csv",
      ".json": "application/json",
      ".xml": "application/xml"
    };

    const mimeType = mimeTypes[ext] || "application/octet-stream";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Content-Length", fileData.length);
    res.setHeader("Cache-Control", "public, max-age=3600");
    
    res.send(fileData);
  } catch (err) {
    console.error('[Download Error]', { path: absoluteFilePath, error: err.message });
    if (err.code === "ENOENT") {
      return res.status(404).json({
        status: "error",
        message: "File not found"
      });
    }
    throw err;
  }
});
