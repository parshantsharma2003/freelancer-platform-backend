# Saved Jobs & Job Alerts System

## Overview

The Saved Jobs & Job Alerts system allows freelancers to create saved search criteria and automatically receive notifications when new jobs matching those criteria are posted. This eliminates the need to manually check for relevant jobs.

**Key Features:**
- Multiple saved searches per freelancer
- Flexible filter criteria (skills, budget, category, duration, experience level, location)
- Real-time notifications via socket.io when matching jobs are posted
- Email notifications (when enabled)
- Customizable daily notification limits
- Quiet hours support (don't notify during specified times)
- Notification tracking and statistics

---

## How It Works

### 1. Freelancer Creates Saved Search
```
Freelancer creates saved search with:
  - Search name
  - Filter criteria (skills, budget, category, etc.)
  - Notification preferences (email, daily limits, quiet hours)
```

### 2. New Job Is Posted
```
Client posts job → Job is saved to database
                ↓
              Broadcast to all freelancers
                ↓
         Match against saved searches
                ↓
        Notify matching freelancers
```

### 3. Matching Process
```
For each saved search:
  ✓ Check if job skills match search skills
  ✓ Check if job category matches search category
  ✓ Check if job budget falls within range
  ✓ Check if job duration is in search preferences
  ✓ Check if job experience level is in search preferences
  ✓ Check if job location matches search location
  
If ALL checks pass → Job matches this saved search
```

### 4. Notification Delivery
```
If match found:
  ✓ Create database notification
  ✓ Send socket.io event to freelancer (if online)
  ✓ Queue email notification (if enabled)
  ✓ Check daily notification limits
  ✓ Respect quiet hours settings
```

---

## Data Model

### SavedSearch Schema

```javascript
{
  _id: ObjectId,
  freelancer: ObjectId,       // Reference to freelancer (User)
  name: String,               // Search name (e.g., "React Projects")
  
  // Filter criteria
  filters: {
    skills: [String],         // Skills to match (any of these)
    category: String,         // Job category
    budget: {
      minAmount: Number,      // Minimum job budget
      maxAmount: Number,      // Maximum job budget
      currency: String        // Currency (default: USD)
    },
    duration: [String],       // Job durations (array of enums)
    experienceLevel: [String],// Experience levels (entry/intermediate/expert)
    location: String,         // Location requirement
    preferredLocation: {
      country: String,
      city: String
    }
  },
  
  // Notification settings
  notificationSettings: {
    emailNotification: Boolean,      // Enable email alerts
    notifyWhenJobsCount: Number,    // Minimum jobs before notifying
    maxNotificationsPerDay: Number, // Daily notification limit
    quietHoursStart: String,        // HH:MM format
    quietHoursEnd: String           // HH:MM format
  },
  
  // Status and tracking
  isActive: Boolean,
  matchedJobsCount: Number,         // Total jobs matched
  lastNotificationAt: Date,
  notificationsThisDay: Number,
  notificationDateTracker: Date,
  
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

```javascript
- (freelancer, isActive)         // Fast lookup for freelancer's searches
- (isActive, createdAt DESC)     // Find searches for job matching
- (filters.category, isActive)   // Category-based matching
- name (text)                    // Search by name
```

---

## API Endpoints

### Create Saved Search
```
POST /api/saved-searches
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "React Projects - $2K-$5K",
  "filters": {
    "skills": ["React", "JavaScript", "Node.js"],
    "category": "Web Development",
    "budget": {
      "minAmount": 2000,
      "maxAmount": 5000,
      "currency": "USD"
    },
    "duration": ["1-2-weeks", "2-4-weeks"],
    "experienceLevel": ["intermediate", "expert"],
    "location": "worldwide"
  },
  "notificationSettings": {
    "emailNotification": true,
    "notifyWhenJobsCount": 1,
    "maxNotificationsPerDay": 3,
    "quietHoursStart": "22:00",
    "quietHoursEnd": "08:00"
  }
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "message": "Saved search created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "freelancer": {
      "_id": "507f1f77bcf86cd799439001",
      "name": "John Developer",
      "email": "john@example.com"
    },
    "name": "React Projects - $2K-$5K",
    "filters": {
      "skills": ["React", "JavaScript", "Node.js"],
      "category": "Web Development",
      "budget": {
        "minAmount": 2000,
        "maxAmount": 5000,
        "currency": "USD"
      }
    },
    "isActive": true,
    "matchedJobsCount": 5,
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

**Validations:**
- `name` required and non-empty
- `filters` optional but recommended
- Email notification settings optional

---

### Get Saved Searches
```
GET /api/saved-searches?page=1&limit=10
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "React Projects - $2K-$5K",
      "filters": {
        "skills": ["React", "JavaScript"],
        "category": "Web Development",
        "budget": {
          "minAmount": 2000,
          "maxAmount": 5000
        }
      },
      "isActive": true,
      "matchedJobsCount": 12,
      "notificationSettings": {
        "emailNotification": true,
        "maxNotificationsPerDay": 3
      },
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "pages": 1,
    "limit": 10
  }
}
```

---

### Get Specific Saved Search
```
GET /api/saved-searches/:id
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "freelancer": { /* ... */ },
    "name": "React Projects - $2K-$5K",
    "filters": { /* ... */ },
    "notificationSettings": { /* ... */ },
    "isActive": true,
    "matchedJobsCount": 12,
    "lastNotificationAt": "2024-01-20T14:30:00Z"
  }
}
```

**Error Responses:**
- 404: Saved search not found
- 403: Unauthorized (not your saved search)

---

### Update Saved Search
```
PATCH /api/saved-searches/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "React Projects - Updated",
  "filters": {
    "budget": {
      "minAmount": 3000,
      "maxAmount": 7000
    }
  },
  "notificationSettings": {
    "maxNotificationsPerDay": 5
  },
  "isActive": true
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Saved search updated successfully",
  "data": { /* updated saved search */ }
}
```

---

### Delete Saved Search
```
DELETE /api/saved-searches/:id
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Saved search deleted successfully"
}
```

---

### Get Saved Search Statistics
```
GET /api/saved-searches/stats
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "totalSearches": 5,
    "activeSearches": 4,
    "inactiveSearches": 1,
    "totalJobMatches": 47,
    "totalNotifications": 32
  }
}
```

---

## Socket Events

### Job Alert Notification (Real-time)
When a job matches a saved search and freelancer is online:

**Event Name:** `job_alert`

**Event Data:**
```javascript
{
  type: 'job_alert',
  title: 'New job matches your saved search: "React Projects - $2K-$5K"',
  message: 'Build Real Estate Platform',
  jobId: '507f1f77bcf86cd799439011',
  jobTitle: 'Build Real Estate Platform',
  jobCategory: 'Web Development',
  budget: {
    type: 'fixed',
    amount: 3500,
    currency: 'USD'
  },
  skills: ['React', 'Node.js', 'MongoDB'],
  savedSearchId: '507f1f77bcf86cd799439012',
  savedSearchName: 'React Projects - $2K-$5K'
}
```

---

## Code Examples

### JavaScript - Create Saved Search

**Frontend Code:**
```javascript
const createSavedSearch = async (searchData) => {
  const response = await fetch('/api/saved-searches', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      name: 'React Projects',
      filters: {
        skills: ['React', 'JavaScript'],
        category: 'Web Development',
        budget: {
          minAmount: 2000,
          maxAmount: 5000
        }
      },
      notificationSettings: {
        emailNotification: true,
        maxNotificationsPerDay: 3
      }
    })
  });

  const result = await response.json();
  return result.data;
};
```

### JavaScript - Listen for Job Alerts (Socket.IO)

**Frontend Code:**
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: authToken
  }
});

// Listen for job alerts
socket.on('job_alert', (alert) => {
  console.log(`New job alert: ${alert.jobTitle}`);
  console.log(`Budget: ${alert.budget.amount} ${alert.budget.currency}`);
  console.log(`Search: ${alert.savedSearchName}`);
  
  // Update UI
  showNotification({
    title: alert.title,
    message: `${alert.jobTitle} - $${alert.budget.amount}`,
    link: `/jobs/${alert.jobId}`
  });
});
```

### cURL - Create Saved Search

```bash
curl -X POST http://localhost:5000/api/saved-searches \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "React Projects",
    "filters": {
      "skills": ["React", "JavaScript"],
      "category": "Web Development",
      "budget": {
        "minAmount": 2000,
        "maxAmount": 5000
      }
    },
    "notificationSettings": {
      "emailNotification": true
    }
  }'
```

### cURL - Get All Saved Searches

```bash
curl -X GET "http://localhost:5000/api/saved-searches?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### cURL - Update Saved Search

```bash
curl -X PATCH http://localhost:5000/api/saved-searches/607f1f77bcf86cd799439012 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "React Projects - Updated",
    "notificationSettings": {
      "maxNotificationsPerDay": 5
    }
  }'
```

---

## Matching Algorithm

### Step-by-Step Matching

When a job is posted:

1. **Load all active saved searches** from database
   ```javascript
   const searches = await SavedSearch.find({ isActive: true })
   ```

2. **For each saved search**, check if job matches:
   ```javascript
   function matchesJob(job) {
     // Skills check: job must have at least one matching skill
     if (search.filters.skills.length > 0) {
       const hasMatch = search.filters.skills.some(skill =>
         job.skills.includes(skill)
       );
       if (!hasMatch) return false;
     }
     
     // Category check: exact match
     if (search.filters.category) {
       if (job.category !== search.filters.category) return false;
     }
     
     // Budget check: job amount within range
     if (search.filters.budget?.minAmount) {
       if (jobAmount < minAmount) return false;
     }
     if (search.filters.budget?.maxAmount) {
       if (jobAmount > maxAmount) return false;
     }
     
     // Duration check: job duration in list
     if (search.filters.duration.length > 0) {
       if (!search.filters.duration.includes(job.duration)) return false;
     }
     
     // Experience level check
     if (search.filters.experienceLevel.length > 0) {
       if (!search.filters.experienceLevel.includes(job.experienceLevel)) return false;
     }
     
     // All checks passed
     return true;
   }
   ```

3. **Collect all matching searches**

4. **Notify matching freelancers** with rate limiting:
   - Check if freelancer should be notified (daily limit, quiet hours)
   - Create database notification record
   - Send socket.io event to online freelancers
   - Queue email notification for later sending

---

## Notification Limits & Quiet Hours

### Daily Notification Limit

Each saved search has a `maxNotificationsPerDay` setting (default: 3):

```javascript
// Check if freelancer can be notified
if (notificationsThisDay >= maxNotificationsPerDay) {
  skipNotification();  // Daily limit reached
}
```

### Quiet Hours

Specify when NOT to send notifications:

```javascript
{
  notificationSettings: {
    quietHoursStart: "22:00",  // 10 PM
    quietHoursEnd: "08:00"     // 8 AM
  }
}
```

If current time is 22:00-08:00, notifications are queued for morning.

### Notification Counter Reset

Counters reset at midnight using a cron job:

```javascript
// Run at 00:00 daily
await SavedSearch.updateMany(
  {},
  {
    notificationsThisDay: 0,
    notificationDateTracker: new Date()
  }
);
```

---

## Performance Optimization

### Indexes

All frequent queries use indexes for performance:

```javascript
// Index for freelancer lookups
db.savedsearches.createIndex({ "freelancer": 1, "isActive": 1 })

// Index for job matching (find all active searches)
db.savedsearches.createIndex({ "isActive": 1, "createdAt": -1 })

// Index for category-based matching
db.savedsearches.createIndex({ "filters.category": 1, "isActive": 1 })

// Text search index
db.savedsearches.createIndex({ "name": "text" })
```

### Query Optimization

- Only load active searches for job matching
- Batch queries when processing multiple searches
- Use bulk update for marking matches
- Queue heavy operations (email sending) asynchronously

---

## Integration with Job System

### When Job Is Posted

1. **Create job record** in database
2. **Broadcast to all users** via socket (existing functionality)
3. **Process saved search alerts** (new functionality):
   - Find matching saved searches
   - Send real-time socket notifications
   - Create database notifications
   - Queue email notifications
   - Update match statistics

### No Breaking Changes

- Existing job posting works unchanged
- Saved search processing is non-blocking
- Errors in alert processing don't block job creation

---

## Error Handling

| Scenario | Status | Error |
|----------|--------|-------|
| Missing search name | 400 | "Search name is required" |
| Invalid freelancer ID | 404 | "Freelancer not found" |
| Search not found | 404 | "Saved search not found" |
| Unauthorized access | 403 | "Unauthorized access to this saved search" |
| Invalid budget values | 400 | "Budget values must be positive numbers" |

---

## Best Practices

### For Freelancers

1. **Create targeted searches** - Be specific with skills and budget ranges
2. **Use multiple searches** - Different searches for different job types
3. **Set notification limits** - Avoid alert fatigue
4. **Use quiet hours** - Specify times when you don't want notifications
5. **Monitor statistics** - Check which searches bring the most matches

### For Integration

1. **Check socket connection** - Ensure `job_alert` event listener is set up
2. **Handle offline scenarios** - Fallback to database notifications when offline
3. **Batch operations** - Create multiple saved searches at once if needed
4. **Cache search results** - Don't recreate searches if values haven't changed

---

## Testing Checklist

- [ ] Create saved search with various filters
- [ ] Verify saved search is created with correct data
- [ ] Update saved search and verify changes
- [ ] Delete saved search
- [ ] Post job matching saved search filters
- [ ] Verify notification created in database
- [ ] Verify socket event sent to online freelancer
- [ ] Verify notification count incremented
- [ ] Test daily notification limits
- [ ] Test quiet hours functionality
- [ ] Test with multiple overlapping filters
- [ ] Test bulk job posting with many searches
- [ ] Verify pagination on search list

---

## Future Enhancements

1. **Advanced Filters:**
   - Client rating minimum
   - Project complexity level
   - Preferred client ID exclusion
   - Custom tag matching

2. **Smart Notifications:**
   - Machine learning to predict job interest
   - Duplicate job detection
   - Job ranking by relevance
   - Batched daily digest option

3. **Analytics:**
   - Search effectiveness metrics
   - Applied job rate tracking
   - Success rate by search
   - Historical trend analysis

4. **Automation:**
   - Auto-apply to matching jobs
   - Custom actions on match
   - Workflow triggers

---

## Related Documentation

- [Job Management](./JOB_API_QUICK_REFERENCE.md)
- [Notification System](./NOTIFICATION_SYSTEM.md)
- [Socket Events](./SOCKET_EVENTS.md)
