import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import path from "path";
import { Server } from "socket.io";
import passport from "passport";

import connectDB from "./config/database.js";
import { configurePassport } from "./config/passport.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { sanitizeInput } from "./middleware/sanitizeInput.js";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import freelancerRoutes from "./routes/freelancerRoutes.js";
import clientRoutes from "./routes/clientRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import proposalRoutes from "./routes/proposalRoutes.js";
import contractRoutes from "./routes/contractRoutes.js";
import milestoneRoutes from "./routes/milestoneRoutes.js";
import timeEntryRoutes from "./routes/timeEntryRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import inviteRoutes from "./routes/inviteRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import disputeRoutes from "./routes/disputeRoutes.js";
import savedSearchRoutes from "./routes/savedSearchRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";

import { stripeWebhook } from "./controllers/paymentController.js";
import { socketAuthMiddleware } from "./socket/socketAuth.js";
import { initializeSocketEvents } from "./socket/socketEvents.js";

dotenv.config();

await connectDB();

const DEFAULT_FRONTEND_URL =
  "https://gentle-stone-05625c900.7.azurestaticapps.net";

/*
|--------------------------------------------------------------------------
| APP + HTTP SERVER
|--------------------------------------------------------------------------
*/

const app = express();
const httpServer = createServer(app);

/*
|--------------------------------------------------------------------------
| TRUST PROXY
|--------------------------------------------------------------------------
*/

app.set("trust proxy", 1);

/*
|--------------------------------------------------------------------------
| PASSPORT
|--------------------------------------------------------------------------
*/

configurePassport();
app.use(passport.initialize());

/*
|--------------------------------------------------------------------------
| SECURITY
|--------------------------------------------------------------------------
*/

app.use(helmet());
app.use(compression());

/*
|--------------------------------------------------------------------------
| COOKIE PARSER (NEW - REQUIRED FOR AUTH)
|--------------------------------------------------------------------------
*/

app.use(cookieParser());

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

const normalizeOrigin = (value) => {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return String(value).replace(/\/+$/, "");
  }
};

const configuredOrigins = [
  process.env.FRONTEND_URL,
  process.env.OAUTH_SUCCESS_REDIRECT,
  ...(process.env.FRONTEND_URLS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
];

const allowedOrigins = [
  DEFAULT_FRONTEND_URL,
  ...configuredOrigins
]
  .map(normalizeOrigin)
  .filter(Boolean)
  .filter((origin, index, allOrigins) => allOrigins.indexOf(origin) === index);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    console.warn("Blocked by CORS:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Cache-Control",
    "Pragma",
    "Expires"
  ]
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/*
|--------------------------------------------------------------------------
| SOCKET.IO
|--------------------------------------------------------------------------
*/

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  }
});

io.use(socketAuthMiddleware);

const socketBroadcast = initializeSocketEvents(io);

app.set("io", io);
app.set("socketBroadcast", socketBroadcast);

console.log("📡 Socket.io initialized");

/*
|--------------------------------------------------------------------------
| STRIPE WEBHOOK (RAW BODY)
|--------------------------------------------------------------------------
*/

app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

/*
|--------------------------------------------------------------------------
| BODY PARSERS
|--------------------------------------------------------------------------
*/

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput);

const uploadDirectory = path.resolve(process.env.UPLOAD_PATH || "./uploads");
app.use(
  "/uploads",
  (req, res, next) => {
    // Uploaded media must be embeddable by the frontend dev origin.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  },
  express.static(uploadDirectory)
);

/*
|--------------------------------------------------------------------------
| LOGGING
|--------------------------------------------------------------------------
*/

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/*
|--------------------------------------------------------------------------
| RATE LIMIT
|--------------------------------------------------------------------------
*/

app.use("/api", rateLimiter);

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Server is running",
    timestamp: new Date().toISOString()
  });
});

/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/freelancers", freelancerRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/proposals", proposalRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/milestones", milestoneRoutes);
app.use("/api/time-entries", timeEntryRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/saved-searches", savedSearchRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/uploads", uploadRoutes);

/*
|--------------------------------------------------------------------------
| 404 HANDLER
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found"
  });
});

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use(errorHandler);

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

const PORT = process.env.PORT || 5001;

let server = null;

if (process.env.NODE_ENV !== "test") {
  server = httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log("🌐 Allowed origins:", allowedOrigins);
  });

  /*
  |--------------------------------------------------------------------------
  | GRACEFUL SHUTDOWN
  |--------------------------------------------------------------------------
  */

  const shutdown = (signal) => {
    console.log(`🛑 Received ${signal}. Closing server...`);

    if (!server) {
      process.exit(0);
      return;
    }

    server.close(() => {
      console.log("✅ Server closed cleanly");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("uncaughtException", shutdown);
  process.on("unhandledRejection", shutdown);
}

export default app;
export { httpServer, server };
