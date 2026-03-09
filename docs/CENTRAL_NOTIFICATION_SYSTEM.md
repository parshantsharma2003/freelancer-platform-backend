# Central Notification System

## Overview

The Central Notification System provides a unified, real-time notification platform for all platform events. Notifications are delivered via multiple channels (real-time socket.io, database records, email) and can be tracked, marked as read, and managed by users.

**Key Features:**
- Real-time socket.io notifications for online users
- Database-backed notification history
- Email notifications (queued for async sending)
- Multiple notification types (job posted, proposal received, payment released, etc.)
- Unread notification tracking and statistics
- Bulk notification creation for multiple recipients
- Priority levels for notification importance
- Related entity tracking (job, proposal, contract, user, message)
- Authorization-aware (users can only access their own notifications)

---

## Architecture

### Multi-Channel Delivery

```
Event Triggered (job posted, proposal accepted, etc.)
            ↓
notificationService.create*()
            ↓
        ┌───┴───┬────────────┐
        │       │            │
    Database  Socket.io    Email Queue
        │       │            │
        ↓       ↓            ↓
   Store        Real-time  Queue for
   Record       Notify     async sending
```

### Data Flow

1. **Event occurs** in any controller (job posted, payment released, etc.)
2. **Call notificationService** with event data
3. **Notification created** in database
4. **Socket event sent** to online user (real-time)
5. **Email queued** for later delivery (async)
6. **Response returned** to controller

---

## Notification Model

### Schema

```javascript
{
  _id: ObjectId,
  recipient: ObjectId,           // User receiving notification
  type: String,                  // job_posted, proposal_received, payment_received, etc.
  title: String,                 // Display title
  message: String,               // Full notification message
  
  // Related entities (optional)
  relatedJob: ObjectId,
  relatedProposal: ObjectId,
  relatedContract: ObjectId,
  relatedUser: ObjectId,
  relatedMessage: ObjectId,
  
  // Action URL for frontend navigation
  actionUrl: String,
  
  // Read status
  isRead: Boolean,               // Default: false
  readAt: Date,
  
  // Priority
  priority: String,              // low, medium, high, urgent
  
  // Delivery tracking
  emailSent: Boolean,            // Default: false
  emailSentAt: Date,
  pushSent: Boolean,             // Default: false
  pushSentAt: Date,
  
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

```javascript
// Fast lookup by recipient and read status
db.notifications.createIndex({ "recipient": 1, "isRead": 1, "createdAt": -1 })

// Fast lookup by type
db.notifications.createIndex({ "recipient": 1, "type": 1 })
```

---

## API Endpoints

### Get Notifications

```
GET /api/notifications?page=1&limit=20&isRead=false&type=job_posted
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional) - Page number (default: 1)
- `limit` (optional) - Results per page (default: 20)
- `isRead` (optional) - Filter by read status (true/false)
- `type` (optional) - Filter by notification type

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "notifications": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "recipient": "507f1f77bcf86cd799439001",
        "type": "job_posted",
        "title": "New Job: Build React Dashboard",
        "message": "A new Web Development job has been posted",
        "isRead": false,
        "priority": "high",
        "relatedJob": {
          "_id": "507f1f77bcf86cd799439011",
          "title": "Build React Dashboard",
          "category": "Web Development"
        },
        "actionUrl": "/jobs/507f1f77bcf86cd799439011",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "unreadCount": 5,
    "pagination": {
      "total": 42,
      "page": 1,
      "limit": 20,
      "pages": 3
    }
  }
}
```

---

### Mark Notification As Read

```
PUT /api/notifications/:id/read
Authorization: Bearer <token>
```

OR

```
PATCH /api/notifications/:id/read
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Notification marked as read",
  "data": {
    "notification": {
      "_id": "507f1f77bcf86cd799439012",
      "isRead": true,
      "readAt": "2024-01-15T11:00:00Z"
    }
  }
}
```

---

### Mark All As Read

```
PUT /api/notifications/mark-all-read
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "12 notifications marked as read",
  "data": {
    "modifiedCount": 12
  }
}
```

---

### Get Unread Count

```
GET /api/notifications/unread-count
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "count": 5
  }
}
```

---

### Delete Notification

```
DELETE /api/notifications/:id
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Notification deleted"
}
```

---

## Notification Types

### Job Posted
**Type:** `job_posted`
**Trigger:** When job is posted and matches saved searches
**Recipients:** Freelancers with matching saved searches
**Example:**
```javascript
{
  type: 'job_posted',
  title: 'New Job: Build React Dashboard',
  message: 'A new Web Development job has been posted matching your criteria',
  priority: 'high',
  relatedJob: jobId,
  actionUrl: `/jobs/${jobId}`
}
```

### Proposal Received
**Type:** `proposal_received`
**Trigger:** When freelancer submits proposal to job
**Recipients:** Job client
**Example:**
```javascript
{
  type: 'proposal_received',
  title: 'New Proposal Received',
  message: 'John Doe submitted a proposal for $1,500',
  priority: 'high',
  relatedProposal: proposalId,
  relatedJob: jobId,
  actionUrl: `/jobs/${jobId}/proposals/${proposalId}`
}
```

### Proposal Accepted
**Type:** `proposal_accepted`
**Trigger:** When client accepts proposal
**Recipients:** Freelancer
**Example:**
```javascript
{
  type: 'proposal_accepted',
  title: 'Proposal Accepted!',
  message: 'Your proposal for "Build React Dashboard" has been accepted',
  priority: 'urgent',
  relatedProposal: proposalId,
  relatedJob: jobId,
  actionUrl: `/proposals/${proposalId}`
}
```

### Contract Created
**Type:** `contract_created`
**Trigger:** Auto-created when proposal is accepted
**Recipients:** Freelancer
**Example:**
```javascript
{
  type: 'contract_created',
  title: 'Contract Created',
  message: 'Your contract for "Build React Dashboard" is now active',
  priority: 'high',
  relatedContract: contractId,
  actionUrl: `/contracts/${contractId}`
}
```

### Payment Released
**Type:** `payment_received`
**Trigger:** When client releases escrow payment
**Recipients:** Freelancer
**Example:**
```javascript
{
  type: 'payment_received',
  title: 'Payment Released',
  message: 'You received $1,200 for "Build React Dashboard"',
  priority: 'urgent',
  relatedContract: contractId,
  actionUrl: `/payments/${paymentId}`
}
```

### Milestone Submitted
**Type:** `milestone_submitted`
**Trigger:** When freelancer submits milestone
**Recipients:** Client
**Example:**
```javascript
{
  type: 'milestone_submitted',
  title: 'Milestone Submitted',
  message: 'Milestone "Design Phase" has been submitted for review',
  priority: 'high',
  relatedContract: contractId,
  actionUrl: `/milestones/${milestoneId}`
}
```

### Review Received
**Type:** `review_received`
**Trigger:** When someone leaves a review
**Recipients:** Reviewed user
**Example:**
```javascript
{
  type: 'review_received',
  title: 'You Received a Review',
  message: 'John Doe left a 5-star review',
  priority: 'medium',
  relatedContract: contractId,
  actionUrl: `/reviews/${reviewId}`
}
```

### Message Received
**Type:** `message_received`
**Trigger:** When user receives a message
**Recipients:** Message recipient
**Example:**
```javascript
{
  type: 'message_received',
  title: 'New Message',
  message: 'John Doe sent you a message',
  priority: 'medium',
  relatedMessage: messageId,
  actionUrl: `/messages/${contractId}`
}
```

---

## Service Layer

### Core Functions

#### createNotification()
Create a single notification and send via all channels

**Signature:**
```javascript
createNotification(notificationData, socketBroadcast) => Promise<Notification>
```

**Parameters:**
- `notificationData` - Object with required fields: recipient, type, title, message
- `socketBroadcast` - Optional socket broadcast object for real-time delivery

**Example:**
```javascript
await notificationService.createNotification(
  {
    recipient: userId,
    type: 'job_posted',
    title: 'New Job Available',
    message: 'A new React job has been posted',
    relatedJob: jobId,
    actionUrl: `/jobs/${jobId}`,
    emailNotification: true
  },
  socketBroadcast
);
```

#### createBulkNotifications()
Create notifications for multiple recipients (e.g., all matching freelancers)

**Signature:**
```javascript
createBulkNotifications(recipientIds, notificationData, socketBroadcast) => Promise<Array<Notification>>
```

**Example:**
```javascript
const matchingFreelancers = [userId1, userId2, userId3];
await notificationService.createBulkNotifications(
  matchingFreelancers,
  {
    type: 'job_posted',
    title: 'New Job: Build React App',
    message: 'A new React job matching your criteria...',
    relatedJob: jobId
  },
  socketBroadcast
);
```

#### Template Functions
Pre-built notification creators for common events:

```javascript
// Job posted
notifyJobPosted(job, freelancerIds, socketBroadcast)

// Proposal received
notifyProposalReceived(proposal, clientId, socketBroadcast)

// Proposal accepted
notifyProposalAccepted(proposal, freelancerId, socketBroadcast)

// Contract created
notifyContractCreated(contract, userId, socketBroadcast)

// Payment released
notifyPaymentReleased(payment, freelancerId, amount, socketBroadcast)

// Milestone submitted
notifyMilestoneSubmitted(milestone, clientId, freelancerId, socketBroadcast)

// Review received
notifyReviewReceived(review, userId, reviewerId, socketBroadcast)

// Message received
notifyMessageReceived(message, recipientId, senderId, socketBroadcast)
```

#### Management Functions

```javascript
// Get user's notifications
getNotificationsForUser(userId, page, limit, filters)

// Get unread count
getUnreadCount(userId)

// Mark single as read
markAsRead(notificationId, userId)

// Mark all as read
markAllAsRead(userId)

// Delete notification
deleteNotification(notificationId, userId)

// Clear all notifications
clearAllNotifications(userId)

// Get statistics
getNotificationStats(userId)

// Delete old notifications
deleteOldNotifications(daysOld)
```

---

## Socket Events

### job_alert (from Saved Searches)
When a job matches saved search criteria and freelancer is online:

```javascript
socket.on('job_alert', (data) => {
  console.log(`New job: ${data.jobTitle} - $${data.budget.amount}`);
})
```

### notification (Real-time notification)
When any notification is created for online user:

```javascript
socket.on('notification', (data) => {
  console.log(`${data.type}: ${data.title}`);
  console.log(`Priority: ${data.priority}`);
})
```

---

## Integration Points

### When Event Occurs → Notification Sent

| Event | Trigger | Type | Recipient | Channel |
|-------|---------|------|-----------|---------|
| Job Posted | POST /api/jobs (status: open) | job_posted | Matched freelancers | Socket, Email |
| Proposal Submitted | POST /api/proposals | proposal_received | Client | Socket, Email |
| Proposal Accepted | PATCH /api/proposals/:id/accept | proposal_accepted | Freelancer | Socket, Email |
| Contract Created | Auto (proposal accepted) | contract_created | Freelancer | Socket, Email |
| Payment Released | POST /api/payments/:id/release | payment_received | Freelancer | Socket, Email |
| Milestone Submitted | POST /api/milestones/:id/submit | milestone_submitted | Client | Socket, Email |

### Current Integration Status

✅ **Job Posted** - Via savedSearchService.notifyFreelancersAboutJob()
✅ **Proposal Received** - Via notificationService.notifyProposalReceived()
✅ **Proposal Accepted** - Via notificationService.notifyProposalAccepted()
✅ **Contract Created** - Via notificationService.notifyContractCreated()
✅ **Payment Released** - Via notificationService.notifyPaymentReleased()

⏳ **TODO** - Milestone notifications
⏳ **TODO** - Review notifications
⏳ **TODO** - Message notifications

---

## Code Examples

### JavaScript - Get Notifications

```javascript
const response = await fetch('/api/notifications?page=1&limit=20', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const result = await response.json();
console.log(`Unread: ${result.data.unreadCount}`);
result.data.notifications.forEach(notif => {
  console.log(`${notif.type}: ${notif.title}`);
});
```

### JavaScript - Mark as Read

```javascript
const response = await fetch(`/api/notifications/${notificationId}/read`, {
  method: 'PATCH',  // or PUT
  headers: { 'Authorization': `Bearer ${token}` }
});

const result = await response.json();
console.log('Marked as read');
```

### JavaScript - Listen for Real-Time Notifications

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: authToken }
});

socket.on('notification', (notif) => {
  console.log(`${notif.title}`);
  console.log(`Action: ${notif.actionUrl}`);
  
  // Update UI
  updateNotificationCenter({
    type: notif.type,
    title: notif.title,
    actionUrl: notif.actionUrl
  });
});
```

### cURL - Get Notifications

```bash
curl -X GET 'http://localhost:5000/api/notifications?page=1&limit=20' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### cURL - Mark as Read

```bash
curl -X PATCH http://localhost:5000/api/notifications/NOTIF_ID/read \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Email Notification Queue

Emails are queued for async delivery using a background job system (placeholder for Bull/Agenda):

```javascript
// In notificationService.createNotification()
if (emailNotification) {
  // TODO: Queue email job
  // await emailQueue.add('send-notification-email', {
  //   userId: recipient,
  //   notificationId: notification._id,
  //   type: type,
  //   title: title,
  //   message: message
  // });
}
```

This allows:
- **Non-blocking** - Email sending doesn't block API response
- **Reliable** - Failed emails can be retried
- **Scalable** - Handle many emails concurrently
- **Configurable** - User can set email preferences

---

## Priority Levels

Notifications can have different priority levels to signal importance:

| Priority | Use Case | Example |
|----------|----------|---------|
| low | General information | Account updates |
| medium | Standard notifications | Messages, reviews |
| high | Important events | Proposal received, milestone submitted |
| urgent | Time-sensitive | Payment released, proposal accepted |

Frontend can use priority to:
- Highlight important notifications
- Play different sounds
- Show toast notifications with different styling
- Sort/filter by priority

---

## Performance Optimization

### Indexing

The Notification model includes indexes for:
- `(recipient, isRead, createdAt DESC)` - Fast paginated queries
- `(recipient, type)` - Fast type filtering

### Pagination

Always paginate notification queries to avoid large result sets:
```javascript
GET /api/notifications?page=1&limit=20  // Good
GET /api/notifications                   // Might load hundreds
```

### Bulk Operations

Use `createBulkNotifications()` when notifying many users:
```javascript
// Good - parallel creation
await notificationService.createBulkNotifications(userIds, data, socket)

// Avoid - sequential creation
for (const userId of userIds) {
  await notificationService.createNotification({ recipient: userId, ...data }, socket)
}
```

---

## Error Handling

Notification errors are non-blocking - they don't fail parent operations:

```javascript
try {
  await notificationService.notifyProposalReceived(proposal, clientId, socket);
} catch (err) {
  console.log('[Notification] Failed but non-critical:', err.message);
  // Fallback to creating simple Notification directly
  await Notification.create({ ... });
}
```

---

## Testing Checklist

- [ ] Create notification via service
- [ ] Receive real-time socket event
- [ ] Get notifications paginated
- [ ] Filter by type
- [ ] Filter by read status
- [ ] Mark single notification as read
- [ ] Mark all as read
- [ ] Delete notification
- [ ] Get unread count
- [ ] Verify authorization (can't access others' notifications)
- [ ] Bulk notification creation
- [ ] Email queuing (when implemented)
- [ ] Socket broadcast to online users only

---

## Future Enhancements

1. **Notification Preferences:**
   - User control over notification types
   - Email frequency settings (immediate, daily digest, weekly)
   - Do-not-disturb hours

2. **Advanced Features:**
   - Notification grouping (5 new jobs → "5 new jobs matching criteria")
   - Smart threading (related notifications in threads)
   - Notification templates with dynamic content

3. **Delivery Improvements:**
   - SMS notifications
   - Push notifications to mobile apps
   - In-app notification bell with badge counts
   - Notification history export

4. **Analytics:**
   - Notification delivery rates
   - Open rates
   - Click-through rates
   - User engagement metrics

---

## Related Documentation

- [Saved Jobs & Alerts](./SAVED_JOBS_SYSTEM.md) - Job alert notifications
- [Notification Model](../models/Notification.js) - Schema details
- [Socket Events](./SOCKET_EVENTS.md) - Real-time delivery
- [Email System](./EMAIL_SYSTEM.md) - Email notification delivery
