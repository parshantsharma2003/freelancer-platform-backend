import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import passport from 'passport';

import connectDB from './config/database.js';
import { configurePassport } from './config/passport.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import freelancerRoutes from './routes/freelancerRoutes.js';
import clientRoutes from './routes/clientRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import proposalRoutes from './routes/proposalRoutes.js';
import contractRoutes from './routes/contractRoutes.js';
import milestoneRoutes from './routes/milestoneRoutes.js';
import timeEntryRoutes from './routes/timeEntryRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import inviteRoutes from './routes/inviteRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import disputeRoutes from './routes/disputeRoutes.js';
import savedSearchRoutes from './routes/savedSearchRoutes.js';

import { stripeWebhook } from './controllers/paymentController.js';
import { socketAuthMiddleware } from './socket/socketAuth.js';
import { initializeSocketEvents } from './socket/socketEvents.js';

dotenv.config();

/* -------------------------------------------------------------------------- */
/*                               APP + SERVER                                 */
/* -------------------------------------------------------------------------- */

const app = express();
const httpServer = createServer(app);

/* -------------------------------------------------------------------------- */
/*                                DATABASE                                    */
/* -------------------------------------------------------------------------- */

connectDB();

/* -------------------------------------------------------------------------- */
/*                              PASSPORT                                      */
/* -------------------------------------------------------------------------- */

configurePassport();
app.use(passport.initialize());

/* -------------------------------------------------------------------------- */
/*                               SECURITY                                     */
/* -------------------------------------------------------------------------- */

app.use(helmet());
app.use(compression());

/* -------------------------------------------------------------------------- */
/*                                 CORS                                       */
/* -------------------------------------------------------------------------- */

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'If-None-Match', 'If-Modified-Since']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* -------------------------------------------------------------------------- */
/*                              SOCKET.IO                                     */
/* -------------------------------------------------------------------------- */

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Apply authentication middleware to all socket connections
io.use(socketAuthMiddleware);

// Initialize socket event handlers and get broadcast methods
const socketBroadcast = initializeSocketEvents(io);

// Attach io and broadcast methods to app for use in controllers
app.set('io', io);
app.set('socketBroadcast', socketBroadcast);

console.log('📡 Socket.io initialized with authentication');

/* -------------------------------------------------------------------------- */
/*                          STRIPE WEBHOOK (RAW)                               */
/* -------------------------------------------------------------------------- */

app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);

/* -------------------------------------------------------------------------- */
/*                             BODY PARSERS                                   */
/* -------------------------------------------------------------------------- */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* -------------------------------------------------------------------------- */
/*                                 LOGGING                                    */
/* -------------------------------------------------------------------------- */

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

/* -------------------------------------------------------------------------- */
/*                              RATE LIMIT                                    */
/* -------------------------------------------------------------------------- */

app.use('/api', rateLimiter);

/* -------------------------------------------------------------------------- */
/*                                HEALTH                                      */
/* -------------------------------------------------------------------------- */

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(204).end();
});

/* -------------------------------------------------------------------------- */
/*                                ROUTES                                      */
/* -------------------------------------------------------------------------- */

app.use('/api/auth', authRoutes);
app.use('/api/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/freelancers', freelancerRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/saved-searches', savedSearchRoutes);
app.use('/api/admin', adminRoutes);

/* -------------------------------------------------------------------------- */
/*                               404 HANDLER                                  */
/* -------------------------------------------------------------------------- */

app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

/* -------------------------------------------------------------------------- */
/*                              ERROR HANDLER                                 */
/* -------------------------------------------------------------------------- */

app.use(errorHandler);

/* -------------------------------------------------------------------------- */
/*                              START SERVER                                  */
/* -------------------------------------------------------------------------- */

const PORT = Number(process.env.PORT) || 5001;
let server = null;

server = httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Allowed origins:`, allowedOrigins);
  console.log(`📡 Socket.io initialized`);
});

/* -------------------------------------------------------------------------- */
/*                        GRACEFUL SHUTDOWN (CRITICAL)                         */
/* -------------------------------------------------------------------------- */

const shutdown = (signal) => {
  console.log(`🛑 Received ${signal}. Closing server...`);
  if (server) {
    server.close(() => {
      console.log('✅ Server closed cleanly');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGINT', shutdown);      // Ctrl + C
process.on('SIGTERM', shutdown);     // Terminal / OS close
process.on('uncaughtException', shutdown);
process.on('unhandledRejection', shutdown);

export default app;
export { httpServer };
