# Central Notifications - Quick Reference

Fast lookup for notification APIs, code examples, and common tasks.

---

## API Quick Links

| Task | Endpoint | Method | Auth |
|------|----------|--------|------|
| Get notifications | GET /api/notifications | GET | ✓ |
| Mark as read | /api/notifications/:id/read | PATCH/PUT | ✓ |
| Mark all read | /api/notifications/mark-all-read | PUT | ✓ |
| Delete notification | /api/notifications/:id | DELETE | ✓ |
| Unread count | /api/notifications/unread-count | GET | ✓ |

---

## JavaScript Snippets

### Get All Notifications
```javascript
async function getNotifications(token) {
  const res = await fetch('/api/notifications?page=1&limit=20', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}

// Usage
const data = await getNotifications(userToken);
console.log(`Unread: ${data.data.unreadCount}`);
```

### Get Unread Only
```javascript
async function getUnread(token) {
  const res = await fetch('/api/notifications?page=1&limit=20&isRead=false', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}
```

### Get by Type
```javascript
async function getNotificationsByType(type, token) {
  const res = await fetch(
    `/api/notifications?page=1&limit=20&type=${type}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
}

// Usage
const proposals = await getNotificationsByType('proposal_received', token);
```

### Mark Single as Read
```javascript
async function markAsRead(notificationId, token) {
  const res = await fetch(
    `/api/notifications/${notificationId}/read`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return res.json();
}
```

### Mark All as Read
```javascript
async function markAllAsRead(token) {
  const res = await fetch(
    '/api/notifications/mark-all-read',
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return res.json();
}
```

### Delete Notification
```javascript
async function deleteNotification(notificationId, token) {
  const res = await fetch(
    `/api/notifications/${notificationId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return res.json();
}
```

### Get Unread Count
```javascript
async function getUnreadCount(token) {
  const res = await fetch('/api/notifications/unread-count', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.data.count;
}

// Usage
const count = await getUnreadCount(token);
document.querySelector('.badge').textContent = count;
```

---

## Socket.io Integration

### Setup Connection
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: localStorage.getItem('authToken')
  }
});

socket.on('connect', () => console.log('Connected'));
socket.on('disconnect', () => console.log('Disconnected'));
```

### Listen for Notifications
```javascript
socket.on('notification', (notification) => {
  console.log(`📬 ${notification.title}`);
  console.log(`Type: ${notification.type}`);
  console.log(`Priority: ${notification.priority}`);
  
  // Update badge
  badge.textContent = parseInt(badge.textContent) + 1;
  
  // Show toast
  showToast(notification.title, notification.priority);
  
  // Navigate on click
  if (notification.actionUrl) {
    // Link to notification.actionUrl
  }
});
```

### Listen for Job Alerts (Saved Searches)
```javascript
socket.on('job_alert', (jobAlert) => {
  console.log(`🎯 New Job: ${jobAlert.jobTitle}`);
  console.log(`Budget: $${jobAlert.budget.amount}`);
  console.log(`Match: ${jobAlert.matchPercentage}%`);
});
```

---

## cURL Commands

### Get Notifications
```bash
curl -X GET 'http://localhost:5000/api/notifications?page=1&limit=20' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Unread Only
```bash
curl -X GET 'http://localhost:5000/api/notifications?page=1&isRead=false' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get by Type
```bash
curl -X GET 'http://localhost:5000/api/notifications?type=proposal_received' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Mark as Read
```bash
curl -X PATCH 'http://localhost:5000/api/notifications/NOTIF_ID/read' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Mark All as Read
```bash
curl -X PUT 'http://localhost:5000/api/notifications/mark-all-read' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Delete Notification
```bash
curl -X DELETE 'http://localhost:5000/api/notifications/NOTIF_ID' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Unread Count
```bash
curl -X GET 'http://localhost:5000/api/notifications/unread-count' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Common Workflows

### Complete: User Opens Notification Center
```javascript
async function loadNotificationCenter(token) {
  try {
    // Get notifications
    const notifRes = await fetch(
      '/api/notifications?page=1&limit=50',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const notifData = await notifRes.json();
    
    // Render notifications
    renderNotifications(notifData.data.notifications);
    updateBadge(notifData.data.unreadCount);
    
    // Mark visible ones as read
    const visibleIds = notifData.data.notifications
      .filter(n => !n.isRead)
      .map(n => n._id);
    
    await Promise.all(
      visibleIds.map(id => markAsRead(id, token))
    );
    
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}
```

### Complete: Notification Event Handler
```javascript
function handleNotificationClick(notification) {
  // Mark as read if not already
  if (!notification.isRead) {
    markAsRead(notification._id, token);
  }
  
  // Navigate to action
  if (notification.actionUrl) {
    window.location.href = notification.actionUrl;
  }
}
```

### Complete: Mark All as Read
```javascript
async function clearAllNotifications(token) {
  try {
    const res = await fetch(
      '/api/notifications/mark-all-read',
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    const data = await res.json();
    console.log(`${data.data.modifiedCount} marked as read`);
    updateBadge(0);
  } catch (err) {
    console.error('Failed to clear notifications:', err);
  }
}
```

---

## Notification Types Reference

### Type: `job_posted`
- **Trigger:** Job matches saved search
- **Recipient:** Freelancer with matching criteria
- **Example Title:** "New Job: Build React Dashboard"
- **Action URL:** `/jobs/{jobId}`

### Type: `proposal_received`
- **Trigger:** Freelancer submits proposal
- **Recipient:** Job client
- **Example Title:** "New Proposal Received"
- **Action URL:** `/jobs/{jobId}/proposals/{proposalId}`

### Type: `proposal_accepted`
- **Trigger:** Client accepts proposal
- **Recipient:** Freelancer
- **Example Title:** "Your Proposal Was Accepted!"
- **Action URL:** `/proposals/{proposalId}`

### Type: `contract_created`
- **Trigger:** Auto when proposal accepted
- **Recipient:** Freelancer
- **Example Title:** "Contract Created"
- **Action URL:** `/contracts/{contractId}`

### Type: `payment_received`
- **Trigger:** Client releases escrow payment
- **Recipient:** Freelancer
- **Example Title:** "Payment Released"
- **Action URL:** `/contracts/{contractId}/payments`

### Type: `milestone_submitted`
- **Trigger:** Freelancer submits milestone
- **Recipient:** Client
- **Example Title:** "Milestone Submitted"
- **Action URL:** `/milestones/{milestoneId}`

### Type: `review_received`
- **Trigger:** User receives review
- **Recipient:** Reviewed user
- **Example Title:** "You Received a Review"
- **Action URL:** `/reviews/{reviewId}`

### Type: `message_received`
- **Trigger:** User receives message
- **Recipient:** Message recipient
- **Example Title:** "New Message"
- **Action URL:** `/messages/{contractId}`

---

## Query Examples

### Get Last 10 Unread Notifications
```
GET /api/notifications?limit=10&isRead=false
```

Response shows newest unread first (sorted by createdAt DESC).

### Get Paginated Job Alerts
```
GET /api/notifications?page=2&limit=20&type=job_posted
```

Page 2 of job posted notifications, 20 per page.

### Get All Proposal Notifications
```
GET /api/notifications?type=proposal_received&limit=100
```

All proposal received notifications, 100 per page.

### Get Notifications from Last 7 Days
```
GET /api/notifications?limit=100

// Then filter client-side:
notifications.filter(n => {
  const age = Date.now() - new Date(n.createdAt);
  return age < 7 * 24 * 60 * 60 * 1000; // 7 days in ms
});
```

---

## Firebase/Postman Examples

### Postman - Get Notifications
```
Method: GET
URL: http://localhost:5000/api/notifications?page=1&limit=20
Headers:
  Content-Type: application/json
  Authorization: Bearer YOUR_TOKEN
```

### Postman - Mark as Read
```
Method: PATCH
URL: http://localhost:5000/api/notifications/NOTIF_ID/read
Headers:
  Authorization: Bearer YOUR_TOKEN
```

---

## Testing Checklist

### Manual Testing Steps

- [ ] **View Notifications**
  - [ ] Load GET /api/notifications
  - [ ] Verify notifications display correctly
  - [ ] Check pagination works (page=2, limit=10)

- [ ] **Filter by Type**
  - [ ] Filter by type=job_posted
  - [ ] Filter by type=proposal_received
  - [ ] Verify correct notifications returned

- [ ] **Filter by Read Status**
  - [ ] Filter by isRead=false (unread only)
  - [ ] Filter by isRead=true (read only)
  - [ ] Verify correct results

- [ ] **Mark as Read (Single)**
  - [ ] Get unread notification ID
  - [ ] PATCH /api/notifications/:id/read
  - [ ] Verify isRead=true and readAt set
  - [ ] Verify other notifications unchanged

- [ ] **Mark All as Read**
  - [ ] Get unread count
  - [ ] PUT /api/notifications/mark-all-read
  - [ ] Verify all marked read
  - [ ] Verify unread count = 0

- [ ] **Delete Notification**
  - [ ] DELETE /api/notifications/:id
  - [ ] Verify notification removed
  - [ ] Verify other notifications intact

- [ ] **Unread Count**
  - [ ] GET /api/notifications/unread-count
  - [ ] Create notification
  - [ ] Verify count incremented
  - [ ] Mark as read, verify count decremented

- [ ] **Socket Events**
  - [ ] Connect to socket with auth token
  - [ ] Create job matching user's criteria
  - [ ] Verify 'job_alert' event received
  - [ ] Verify notification has correct structure

- [ ] **Authorization**
  - [ ] Try accessing other user's notifications (should fail)
  - [ ] Try marking other user's notification as read (should fail)
  - [ ] Try without auth token (should fail)

---

## Response Codes

| Code | Meaning | Fix |
|------|---------|-----|
| 200 | Success | None |
| 400 | Bad request | Check filters, pagination params |
| 401 | Unauthorized | Check auth token, make sure logged in |
| 403 | Forbidden | Check you own the notification |
| 404 | Not found | Check notification ID exists |
| 500 | Server error | Check logs, server is running |

---

## Troubleshooting

### "Unauthorized" Error (401)
- [ ] Check token is included in Authorization header
- [ ] Check token format: `Bearer YOUR_TOKEN`
- [ ] Check token is not expired
- [ ] Check token is correct for the user

### "Forbidden" Error (403)
- [ ] You can only access your own notifications
- [ ] Check that notificationId belongs to your user
- [ ] Try getting your notifications first to find correct IDs

### Socket Events Not Received
- [ ] Check socket is connected: `socket.on('connect', () => {...})`
- [ ] Check auth token is passed correctly
- [ ] Make sure user is logged in on another client (create notification)
- [ ] Check browser console for connection errors

### Notification Not Marking as Read
- [ ] Check notification ID is correct
- [ ] Check you're using PUT or PATCH (not GET/DELETE)
- [ ] Check notification belongs to your user
- [ ] Try GET /api/notifications to verify notification exists

### Missing Notifications
- [ ] Check pagination is correct (default page=1, limit=20)
- [ ] Check isRead filter isn't hiding results
- [ ] Check type filter isn't filtering out notifications
- [ ] Older notifications might be deleted (cleanup job)

---

## Integration Checklist

- [ ] Notification model exists and indexes created
- [ ] notificationService.js created with all functions
- [ ] notificationController.js refactored to use service
- [ ] notificationRoutes.js registered with all endpoints
- [ ] jobController calls savedSearchService.notifyFreelancersAboutJob()
- [ ] proposalController calls notifyProposalReceived()
- [ ] proposalController calls notifyProposalAccepted() & notifyContractCreated()
- [ ] paymentController calls notifyPaymentReleased()
- [ ] Socket.io configured and passing notifications
- [ ] Email queuing infrastructure in place (ready for service)
- [ ] Authorization checks on all endpoints
- [ ] Error handling with fallbacks
- [ ] Tests passing for all endpoints
- [ ] Documentation complete

---

## Next Steps

### For Frontend Developers
1. Install socket.io client: `npm install socket.io-client`
2. Setup socket connection with auth token
3. Use JavaScript snippets above to fetch notifications
4. Listen for 'notification' and 'job_alert' socket events
5. Update UI badge with unread count
6. Implement mark-as-read on navigation

### For Backend Developers
1. ✅ Core system implemented
2. ⏳ Connect to actual email service (currently queued)
3. ⏳ Add milestone and review notifications (templates exist)
4. ⏳ Add message notifications (template exists)
5. ⏳ Setup notification cleanup cron job
6. ⏳ Add notification preferences/settings model

---

## File References

- **Service:** [services/notificationService.js](../services/notificationService.js)
- **Controller:** [controllers/notificationController.js](../controllers/notificationController.js)
- **Routes:** [routes/notificationRoutes.js](../routes/notificationRoutes.js)
- **Model:** [models/Notification.js](../models/Notification.js)
- **Full Docs:** [CENTRAL_NOTIFICATION_SYSTEM.md](./CENTRAL_NOTIFICATION_SYSTEM.md)
- **Saved Jobs:** [SAVED_JOBS_QUICK_REFERENCE.md](./SAVED_JOBS_QUICK_REFERENCE.md)
