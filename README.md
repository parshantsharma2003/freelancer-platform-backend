# FreelancePro Backend API

A production-ready Node.js/Express REST API for the FreelancePro freelancer marketplace. The backend handles authentication, job management, contracts, payments, messaging, reviews, and admin features with real-time Socket.IO support and comprehensive security middleware.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Setup](#environment-setup)
- [API Documentation](#api-documentation)
- [Database Models](#database-models)
- [Real-time Features](#real-time-features)
- [Authentication](#authentication)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## Features

- **JWT Authentication** - Secure access and refresh token system with automatic refresh flow
- **Role-Based Access Control** - Client, Freelancer, and Admin roles with granular permissions
- **Job Marketplace** - Full job lifecycle (create, browse, filter, close)
- **Proposal System** - Freelancers submit proposals, clients accept/reject
- **Contract Management** - Track work milestones, deliverables, and disputes
- **Payment & Escrow** - Secure payment handling with milestone-based release
- **Real-time Messaging** - Socket.IO-powered chat and notifications
- **Reviews & Ratings** - Multi-dimensional feedback system
- **Admin Panel** - User management, dispute resolution, platform analytics
- **OAuth Integration** - Google, GitHub, LinkedIn authentication support
- **File Uploads** - Document and portfolio file management
- **Background Jobs** - BullMQ for async tasks (emails, notifications)

## Tech Stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Real-time**: Socket.IO
- **Authentication**: Passport.js, JWT
- **Payments**: Stripe
- **Job Queue**: BullMQ, Redis
- **Email**: Nodemailer, SendGrid, Twilio
- **Testing**: Jest, Supertest
- **Database Testing**: MongoDB Memory Server

## Project Structure

```
the-backend/
├── config/               # Configuration files
│   ├── database.js       # MongoDB connection
│   ├── passport.js       # OAuth strategies
│   └── redis.js          # Redis client
├── controllers/          # Route handlers and business logic
│   ├── authController.js
│   ├── userController.js
│   ├── jobController.js
│   ├── proposalController.js
│   ├── contractController.js
│   ├── milestoneController.js
│   ├── paymentController.js
│   ├── messageController.js
│   ├── reviewController.js
│   ├── notificationController.js
│   ├── inviteController.js
│   ├── adminController.js
│   ├── disputeController.js
│   └── uploadController.js
├── middleware/           # Request processing
│   ├── authMiddleware.js        # JWT verification & RBAC
│   ├── errorHandler.js          # Centralized error handling
│   ├── rateLimiter.js           # Request rate limiting
│   ├── sanitizeInput.js         # Input sanitization
│   └── validationMiddleware.js  # Request validation
├── models/               # Mongoose schemas
│   ├── User.js
│   ├── FreelancerProfile.js
│   ├── ClientProfile.js
│   ├── Job.js
│   ├── Proposal.js
│   ├── Contract.js
│   ├── Milestone.js
│   ├── Payment.js
│   ├── Message.js
│   ├── Chat.js
│   ├── Review.js
│   ├── Notification.js
│   ├── Invite.js
│   ├── Dispute.js
│   └── TimeEntry.js
├── routes/               # API route definitions
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── jobRoutes.js
│   ├── proposalRoutes.js
│   ├── contractRoutes.js
│   ├── milestoneRoutes.js
│   ├── paymentRoutes.js
│   ├── messageRoutes.js
│   ├── chatRoutes.js
│   ├── reviewRoutes.js
│   ├── notificationRoutes.js
│   ├── inviteRoutes.js
│   ├── adminRoutes.js
│   ├── disputeRoutes.js
│   ├── timeEntryRoutes.js
│   ├── uploadRoutes.js
│   └── savedSearchRoutes.js
├── socket/               # Real-time features
│   ├── socketAuth.js     # Socket authentication
│   ├── socketEvents.js   # Event handlers
│   └── socketHandler.js  # Socket initialization
├── services/             # Business logic services
├── utils/                # Utilities and helpers
├── workers/              # Background job processors
├── tests/                # Jest test suites
├── migrations/           # Database migrations
└── server.js             # Application entry point
```

## Getting Started

### Prerequisites

- Node.js v18 or newer
- MongoDB 4.4+ (local or Atlas)
- npm or yarn

### Installation

```bash
cd the-backend
npm install
```

### Environment Setup

Copy the environment template and configure:

```bash
cp .env.example .env
```

## Environment Setup

Create a `.env` file in the backend directory:

```env
# Application
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/freelancepro

# JWT Authentication
JWT_ACCESS_SECRET=replace-with-secure-access-secret-32-chars-min
JWT_REFRESH_SECRET=replace-with-secure-refresh-secret-32-chars-min
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Frontend Configuration
FRONTEND_URL=http://localhost:5173
OAUTH_SUCCESS_REDIRECT=http://localhost:5173/auth/callback

# OAuth Providers (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret

# Stripe (Payments)
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret

# Email Services (choose one or more)
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=noreply@freelancepro.com
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Redis (optional, for caching and job queue)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=debug
```

## API Documentation

### Base URL

```
Development: http://localhost:5000/api
Production: https://freelancerpro-e7cbdnb6bkayc2f8.eastasia-01.azurewebsites.net/api
```

### Response Format

All API responses follow a standard format:

```json
{
  "status": "success",
  "message": "Operation completed successfully",
  "data": {
    "id": "user-123",
    "email": "user@example.com"
  }
}
```

Error responses:

```json
{
  "status": "error",
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

### Authentication

Include JWT token in Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Rate Limiting

- Standard endpoints: 100 requests per 15 minutes per IP
- Auth endpoints: 5 requests per 15 minutes per IP
- Response header: `X-RateLimit-Remaining`

### Core API Endpoints

#### Authentication

- `POST /auth/register` - Register new user (client or freelancer)
- `POST /auth/login` - Login with email and password
- `POST /auth/refresh` - Refresh access token using refresh token
- `POST /auth/logout` - Logout and revoke tokens
- `GET /auth/me` - Get current user profile
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with token
- `POST /auth/google` - OAuth login with Google
- `POST /auth/github` - OAuth login with GitHub
- `POST /auth/linkedin` - OAuth login with LinkedIn

#### Users

- `GET /users/:id` - Get user profile
- `PUT /users/:id` - Update user profile
- `GET /users/:id/reviews` - Get user reviews
- `GET /users/search` - Search users by skills/expertise
- `POST /users/wallet` - Get wallet balance
- `POST /users/wallet/withdraw` - Withdraw funds

#### Jobs

- `GET /jobs` - Get all jobs (filterable)
- `POST /jobs` - Create job (client only)
- `GET /jobs/:id` - Get job details
- `PUT /jobs/:id` - Update job (client only)
- `DELETE /jobs/:id` - Delete job (client only)
- `POST /jobs/:id/close` - Close job
- `GET /jobs/search` - Search jobs by title, category, skills

#### Proposals

- `POST /proposals` - Submit proposal (freelancer only)
- `GET /proposals/job/:jobId` - Get proposals for job
- `GET /proposals/user/:userId` - Get user's proposals
- `PUT /proposals/:id/accept` - Accept proposal (client only)
- `PUT /proposals/:id/reject` - Reject proposal (client only)
- `PUT /proposals/:id/withdraw` - Withdraw proposal (freelancer only)

#### Contracts

- `GET /contracts/my` - Get my contracts
- `GET /contracts/:id` - Get contract details
- `PUT /contracts/:id` - Update contract
- `POST /contracts/:id/start` - Start contract work
- `POST /contracts/:id/complete` - Mark contract complete
- `GET /contracts/:id/timeline` - Get contract timeline

#### Milestones

- `POST /contracts/:contractId/milestones` - Create milestone
- `GET /contracts/:contractId/milestones` - Get milestones
- `PUT /milestones/:id` - Update milestone
- `POST /milestones/:id/submit` - Submit work
- `POST /milestones/:id/approve` - Approve milestone (client only)
- `POST /milestones/:id/release` - Release payment from escrow

#### Payments

- `POST /payments` - Create payment/deposit to escrow
- `GET /payments/my` - Get payment history
- `GET /payments/:id` - Get payment details
- `POST /payments/:id/release` - Release from escrow (client only)
- `POST /payments/webhook/stripe` - Stripe webhook endpoint

#### Messages & Chat

- `GET /messages/conversations` - Get all conversations
- `GET /messages/conversations/:id` - Get conversation details
- `POST /messages` - Send message
- `GET /messages/:conversationId` - Get messages in conversation
- `PUT /messages/:id/read` - Mark message as read
- `DELETE /messages/:id` - Delete message

#### Reviews

- `POST /reviews` - Create review (draft)
- `POST /reviews/:contractId/submit` - Submit review
- `GET /reviews/user/:userId` - Get user reviews
- `GET /reviews/:id` - Get review details
- `PUT /reviews/:id` - Update review (draft only)

#### Notifications

- `GET /notifications` - Get user notifications
- `PUT /notifications/:id/read` - Mark as read
- `PUT /notifications/read-all` - Mark all as read
- `DELETE /notifications/:id` - Delete notification
- `GET /notifications/settings` - Get notification preferences
- `PUT /notifications/settings` - Update preferences

#### Admin

- `GET /admin/stats` - Platform statistics
- `GET /admin/users` - List all users (paginated)
- `PUT /admin/users/:id/status` - Update user status
- `GET /admin/jobs` - List all jobs
- `PUT /admin/jobs/:id/flag` - Flag content
- `GET /admin/disputes` - List disputes
- `POST /admin/disputes/:id/resolve` - Resolve dispute
- `GET /admin/payments` - Payment reports

## Database Models

### User

```javascript
{
  email: String (unique, required),
  password: String (hashed),
  firstName: String,
  lastName: String,
  avatar: String (URL),
  role: String (enum: ['client', 'freelancer', 'admin']),
  isEmailVerified: Boolean,
  isPhoneVerified: Boolean,
  phone: String,
  bio: String,
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  socialLinks: {
    linkedin: String,
    github: String,
    portfolio: String
  },
  isActive: Boolean,
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Job

```javascript
{
  client: ObjectId (ref: User),
  title: String,
  description: String,
  category: String,
  skills: [String],
  experience: String (enum: ['entry', 'intermediate', 'expert']),
  budget: {
    type: String (enum: ['fixed', 'hourly']),
    minAmount: Number,
    maxAmount: Number
  },
  duration: String,
  status: String (enum: ['open', 'in-progress', 'completed', 'closed']),
  proposalsCount: Number,
  views: Number,
  attachments: [String],
  postedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Contract

```javascript
{
  job: ObjectId (ref: Job),
  client: ObjectId (ref: User),
  freelancer: ObjectId (ref: User),
  proposal: ObjectId (ref: Proposal),
  status: String (enum: ['pending', 'active', 'in-review', 'completed', 'disputed', 'cancelled']),
  startDate: Date,
  endDate: Date,
  rate: Number,
  totalAmount: Number,
  escrowAmount: Number,
  escrowReleased: Boolean,
  milestones: [ObjectId (ref: Milestone)],
  description: String,
  terms: String,
  attachments: [String],
  createdAt: Date,
  updatedAt: Date
}
```

### Milestone

```javascript
{
  contract: ObjectId (ref: Contract),
  title: String,
  description: String,
  amount: Number,
  deadline: Date,
  status: String (enum: ['pending', 'in-progress', 'submitted', 'approved', 'released', 'disputed']),
  deliverables: String,
  attachments: [String],
  submittedAt: Date,
  approvedAt: Date,
  releasedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Payment

```javascript
{
  user: ObjectId (ref: User),
  milestone: ObjectId (ref: Milestone),
  amount: Number,
  type: String (enum: ['deposit', 'release', 'withdrawal']),
  status: String (enum: ['pending', 'processing', 'completed', 'failed']),
  stripePaymentIntentId: String,
  stripeTransferId: String,
  paymentMethod: String,
  description: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Message

```javascript
{
  sender: ObjectId (ref: User),
  receiver: ObjectId (ref: User),
  conversation: ObjectId (ref: Chat),
  content: String,
  attachments: [String],
  isRead: Boolean,
  readAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Review

```javascript
{
  contract: ObjectId (ref: Contract),
  reviewer: ObjectId (ref: User),
  reviewee: ObjectId (ref: User),
  rating: Number (1-5),
  categoryRatings: {
    communication: Number,
    professionalism: Number,
    quality: Number,
    deadline: Number
  },
  comment: String,
  status: String (enum: ['draft', 'submitted']),
  isAnonymous: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## Real-time Features

### Socket.IO Events

#### Connection Events

- `user_online` - Emitted when user connects
- `user_offline` - Emitted when user disconnects
- `user_status` - Broadcast user online/offline status

#### Messaging

- `send_message` - Send message in conversation
- `new_message` - Receive new message
- `typing` - User is typing
- `stop_typing` - User stopped typing
- `message_read` - Message read receipt

#### Notifications

- `new_notification` - New notification received
- `notification_read` - Notification marked as read
- `notification_cleared` - Notification cleared

#### Proposals & Contracts

- `proposal_submitted` - New proposal for job
- `proposal_accepted` - Proposal accepted
- `proposal_rejected` - Proposal rejected
- `contract_started` - Contract work began
- `contract_completed` - Contract finished
- `milestone_submitted` - Work submitted for milestone
- `milestone_approved` - Milestone approved
- `milestone_released` - Payment released from escrow

#### Job Updates

- `job_created` - New job posted
- `job_closed` - Job closed
- `job_updated` - Job details changed

### Socket Authentication

Connect with JWT token:

```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: accessToken
  }
});
```

## Authentication

### JWT Flow

1. User registers or logs in
2. Server returns `accessToken` (15 min) and `refreshToken` (7 days)
3. Client stores refresh token in secure storage
4. Access token used in Authorization header for API requests
5. On 401 response, refresh token exchanged for new access token
6. Refresh token stored in secure HTTP-only cookie for extra security

### Protected Routes

Routes use `authMiddleware` to verify JWT and role:

```javascript
router.post('/jobs', authMiddleware.verify, authMiddleware.authorize(['client']), jobController.createJob);
```

Available roles:
- `client` - Job poster and payment handler
- `freelancer` - Proposal submitter and work provider
- `admin` - Platform moderator and manager

## Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:local

# Run specific test file
npm run test -- auth.e2e.test.js

# Run tests with coverage
npm run test -- --coverage
```

### Test Environment

Tests use MongoDB Memory Server for isolated database testing. Environment is automatically configured with test secrets.

### Test Files

- `tests/auth.e2e.test.js` - Authentication flows
- `tests/payments.e2e.test.js` - Payment and escrow operations
- `tests/contracts.e2e.test.js` - Contract lifecycle

## Deployment

### Prerequisites

- Production MongoDB instance (MongoDB Atlas recommended)
- Stripe account and API keys
- Email service (SendGrid, Nodemailer, Twilio)
- Static frontend hosting (Vercel, Netlify, Azure Static Web Apps)

### Backend Deployment Steps

1. **Set production environment variables:**

   Update all `.env` variables to production values, especially:
   - `NODE_ENV=production`
   - `MONGODB_URI` (production database)
   - `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (strong random strings)
   - `FRONTEND_URL` (production frontend domain)
   - `STRIPE_SECRET_KEY` and webhook secret

2. **Deploy to hosting:**

   **Azure App Service:**
   ```bash
   az webapp deployment source config-zip --resource-group myResourceGroup \
     --name myAppName --src deployment.zip
   ```

   **Render:**
   - Connect GitHub repo
   - Set build command: `npm install`
   - Set start command: `npm start`
   - Add environment variables

   **Railway:**
   ```bash
   npm install -g @railway/cli
   railway link
   railway deploy
   ```

   **Heroku (deprecated but supported):**
   ```bash
   heroku create app-name
   git push heroku main
   heroku config:set NODE_ENV=production
   ```

3. **Verify deployment:**
   - Check `/api/auth/me` endpoint returns 200 with "Unauthorized" message (no token)
   - Verify CORS allows your frontend domain
   - Test OAuth redirects
   - Verify Stripe webhook endpoint is reachable

## Security

### Password Security

- Passwords hashed with bcryptjs (10+ salt rounds)
- Never stored or logged in plain text
- Strong password requirements enforced at registration

### JWT Security

- Access tokens: 15 minutes validity
- Refresh tokens: 7 days validity, stored in secure HTTP-only cookies
- Tokens include user ID and role claims
- Signature verified on every request

### Data Protection

- Input validation using express-validator and Joi
- SQL injection protection (MongoDB native)
- XSS protection via Helmet
- CORS restricted to whitelisted origins
- Rate limiting on authentication endpoints

### HTTPS & Headers

- Helmet middleware enables security headers
- HSTS enforced in production
- X-Frame-Options prevents clickjacking
- X-Content-Type-Options prevents MIME sniffing
- CSP headers configured

### API Security

- All endpoints require authentication except auth routes
- Role-based authorization enforced
- Request size limits (10MB)
- Timeout limits (30 seconds)

## Troubleshooting

### Common Issues

**MongoDB Connection Error**
```
Error: Cannot connect to MongoDB
```
Solution: Ensure MONGODB_URI is correct and MongoDB service is running

**JWT Token Expired**
```
Error: Token expired
```
Solution: Use refresh token to get new access token

**CORS Error**
```
Error: Origin not allowed by CORS
```
Solution: Add frontend URL to FRONTEND_URL environment variable or CORS whitelist in server.js

**Port Already in Use**
```
Error: EADDRINUSE: address already in use :::5000
```
Solution: Change PORT in .env or kill process using port 5000

**Socket Connection Issues**
```
WebSocket connection failed
```
Solution: Ensure Socket.IO is allowed through CORS, check auth token is valid

### Debug Logging

Set `LOG_LEVEL=debug` in `.env` for detailed logs:
```bash
NODE_ENV=development LOG_LEVEL=debug npm run dev
```

### Database Inspection

Use MongoDB Compass to inspect database:
```
mongodb://localhost:27017/freelancepro
```

## Contributing

1. Create a feature branch
2. Make changes with tests
3. Run `npm run lint` and `npm run format`
4. Create a pull request

## License

ISC
Connect GitHub repository and configure build command:
```bash
npm install && npm start
```

## 📈 Performance

- Response compression enabled
- Database query optimization
- Connection pooling
- Efficient indexing

## 🛠️ Development

```bash
# Install nodemon for auto-reload
npm install -g nodemon

# Run with nodemon
npm run dev

# Check logs
tail -f server.log
```

## ⚙️ Configuration

Modify `server.js` for:
- Port configuration
- CORS settings
- Middleware order
- Route prefixes

## 📝 Logging

Development: Console logs with Morgan
Production: Consider Winston or similar

## 🔄 API Versioning

Current version: v1
Future: `/api/v2/...`

---

For more information, see the main project README.
