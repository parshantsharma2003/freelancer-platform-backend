# FreelancePro Backend API

Production-ready Node.js + Express backend for the FreelancePro freelancer platform.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev

# Start production server
npm start
```

## 📂 Project Structure

```
├── config/
│   └── database.js         # MongoDB connection
├── controllers/
│   ├── authController.js   # Authentication logic
│   ├── userController.js   # User management
│   ├── jobController.js    # Job operations
│   ├── proposalController.js
│   ├── contractController.js
│   ├── paymentController.js
│   ├── messageController.js
│   ├── reviewController.js
│   ├── notificationController.js
│   └── adminController.js
├── middleware/
│   ├── authMiddleware.js   # JWT & RBAC
│   ├── errorHandler.js     # Error handling
│   ├── rateLimiter.js      # Rate limiting
│   └── validationMiddleware.js
├── models/
│   ├── User.js
│   ├── FreelancerProfile.js
│   ├── ClientProfile.js
│   ├── Job.js
│   ├── Proposal.js
│   ├── Contract.js
│   ├── Payment.js
│   ├── Message.js
│   ├── Review.js
│   └── Notification.js
├── routes/
│   └── ...Routes.js        # API route definitions
├── socket/
│   └── socketHandler.js    # Real-time events
├── utils/
│   └── jwtUtils.js         # Token management
└── server.js               # Entry point
```

## 🔑 Environment Variables

```env
NODE_ENV=production
PORT=5000
MONGO_URI=mongodb+srv://<your-production-cluster>/freelancer-platform
JWT_ACCESS_SECRET=your-access-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
FRONTEND_URL=https://gentle-stone-05625c900.7.azurestaticapps.net
STRIPE_SECRET_KEY=your-stripe-key
```

## 📡 API Documentation

### Base URL
```
https://freelancerpro-e7cbdnb6bkayc2f8.eastasia-01.azurewebsites.net/api
```

### Response Format
```json
{
  "status": "success|error",
  "message": "Description",
  "data": {}
}
```

### Authentication Header
```
Authorization: Bearer <access_token>
```

## 🧪 Testing

Test the API using tools like:
- Postman
- Thunder Client (VS Code)
- cURL
- Insomnia

Sample request:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

## 🔒 Security

- JWT token authentication
- Bcrypt password hashing
- Rate limiting (100 req/15min)
- Request validation
- CORS protection
- Helmet security headers
- MongoDB injection protection

## 🐛 Error Handling

All errors follow consistent format:
```json
{
  "status": "error",
  "message": "Error description"
}
```

HTTP Status Codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Server Error

## 📊 Database Models

### User Schema
```javascript
{
  email: String,
  password: String (hashed),
  firstName: String,
  lastName: String,
  role: String (client|freelancer|admin),
  isActive: Boolean,
  isVerified: Boolean
}
```

### Job Schema
```javascript
{
  client: ObjectId (ref: User),
  title: String,
  description: String,
  category: String,
  skills: [String],
  budget: { type, amount },
  status: String,
  proposalsCount: Number
}
```

## 🔌 Socket.io Events

### Client → Server
- `user_online` - User connects
- `typing` - User typing
- `send_message` - New message
- `join_conversation` - Join chat room

### Server → Client
- `new_message` - New message received
- `new_notification` - New notification
- `user_status` - User online/offline
- `message_read` - Message read receipt

## 🚀 Deployment

### Railway
```bash
railway login
railway init
railway up
```

### Heroku
```bash
heroku create app-name
git push heroku main
heroku config:set NODE_ENV=production
```

### Render
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
