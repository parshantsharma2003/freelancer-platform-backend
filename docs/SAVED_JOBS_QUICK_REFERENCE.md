# Saved Jobs & Alerts - Quick Reference

## Quick Navigation

| Purpose | Method | Endpoint |
|---------|--------|----------|
| Create Search | POST | `/api/saved-searches` |
| Get All Searches | GET | `/api/saved-searches` |
| Get One Search | GET | `/api/saved-searches/:id` |
| Update Search | PATCH | `/api/saved-searches/:id` |
| Delete Search | DELETE | `/api/saved-searches/:id` |
| Get Statistics | GET | `/api/saved-searches/stats` |

---

## Basic Workflow

### 1. Create a Saved Search

**JavaScript:**
```javascript
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
console.log(`Search created: ${result.data._id}`);
```

**cURL:**
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
    }
  }'
```

### 2. Get Your Saved Searches

**JavaScript:**
```javascript
const response = await fetch('/api/saved-searches?page=1&limit=10', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const result = await response.json();
result.data.forEach(search => {
  console.log(`${search.name}: ${search.matchedJobsCount} jobs matched`);
});
```

**cURL:**
```bash
curl -X GET 'http://localhost:5000/api/saved-searches?page=1&limit=10' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Update a Saved Search

**JavaScript:**
```javascript
const response = await fetch(`/api/saved-searches/${searchId}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    filters: {
      budget: {
        minAmount: 3000,
        maxAmount: 7000
      }
    },
    notificationSettings: {
      maxNotificationsPerDay: 5
    }
  })
});

const updated = await response.json();
console.log(`Updated: ${updated.data.name}`);
```

**cURL:**
```bash
curl -X PATCH http://localhost:5000/api/saved-searches/SEARCH_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "filters": {
      "budget": {
        "minAmount": 3000,
        "maxAmount": 7000
      }
    }
  }'
```

### 4. Delete a Saved Search

**JavaScript:**
```javascript
const response = await fetch(`/api/saved-searches/${searchId}`, {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${token}` }
});

console.log('Search deleted');
```

**cURL:**
```bash
curl -X DELETE http://localhost:5000/api/saved-searches/SEARCH_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 5. Get Search Statistics

**JavaScript:**
```javascript
const response = await fetch('/api/saved-searches/stats', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const stats = await response.json();
console.log(`Total searches: ${stats.data.totalSearches}`);
console.log(`Job matches this month: ${stats.data.totalJobMatches}`);
console.log(`Notifications received: ${stats.data.totalNotifications}`);
```

**cURL:**
```bash
curl -X GET http://localhost:5000/api/saved-searches/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Real-Time Job Alerts (Socket.IO)

**Frontend Setup:**
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: authToken  // Your JWT token
  }
});

// Listen for job alerts
socket.on('job_alert', (alert) => {
  console.log(`New job: ${alert.jobTitle}`);
  console.log(`Skills: ${alert.skills.join(', ')}`);
  console.log(`Budget: $${alert.budget.amount}`);
  console.log(`Search: ${alert.savedSearchName}`);
  
  // Navigate to job details
  window.location.href = `/jobs/${alert.jobId}`;
  
  // OR show in-app notification
  showNotification({
    title: alert.title,
    message: `${alert.jobTitle} - $${alert.budget.amount}`,
    actionUrl: `/jobs/${alert.jobId}`
  });
});
```

---

## Common Workflows

### Scenario 1: Freelancer Sets Up Basic Search

```javascript
// Create a general React search
await fetch('/api/saved-searches', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    name: 'Any React Work',
    filters: {
      skills: ['React'],
      category: 'Web Development'
    },
    notificationSettings: {
      emailNotification: true
    }
  })
});
```

### Scenario 2: Narrow Down Results

```javascript
// Update the search to be more specific
await fetch('/api/saved-searches/SEARCH_ID', {
  method: 'PATCH',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    filters: {
      skills: ['React', 'TypeScript', 'Node.js'],
      experienceLevel: ['expert'],
      budget: {
        minAmount: 5000,
        maxAmount: 15000
      }
    }
  })
});
```

### Scenario 3: Create Different Budget Tiers

```javascript
// Low budget (Quick gigs)
await fetch('/api/saved-searches', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Quick React Jobs',
    filters: {
      skills: ['React'],
      budget: { minAmount: 500, maxAmount: 1500 }
    }
  })
});

// Mid budget (Regular projects)
await fetch('/api/saved-searches', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Mid-Range React Projects',
    filters: {
      skills: ['React', 'Node.js'],
      budget: { minAmount: 2000, maxAmount: 5000 }
    }
  })
});

// High budget (Enterprise)
await fetch('/api/saved-searches', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Enterprise React Solutions',
    filters: {
      skills: ['React', 'Node.js', 'TypeScript'],
      experienceLevel: ['expert'],
      budget: { minAmount: 5000, maxAmount: 50000 }
    }
  })
});
```

### Scenario 4: Location-Based Search

```javascript
// UK-based projects only
await fetch('/api/saved-searches', {
  method: 'POST',
  body: JSON.stringify({
    name: 'UK Web Development',
    filters: {
      skills: ['Web Development'],
      location: 'region-specific',
      preferredLocation: {
        country: 'United Kingdom',
        city: 'London'
      }
    }
  })
});
```

---

## Filter Examples

### Example 1: Full-Stack Developer Search

```javascript
{
  name: 'Full-Stack JavaScript Projects',
  filters: {
    skills: [
      'JavaScript',
      'React',
      'Node.js',
      'MongoDB',
      'Express.js'
    ],
    category: 'Web Development',
    budget: {
      minAmount: 3000,
      maxAmount: 10000
    },
    duration: ['2-4-weeks', '1-3-months'],
    experienceLevel: ['intermediate', 'expert'],
    location: 'worldwide'
  },
  notificationSettings: {
    emailNotification: true,
    maxNotificationsPerDay: 5,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00'
  }
}
```

### Example 2: Mobile App Developer Search

```javascript
{
  name: 'React Native Mobile Apps',
  filters: {
    skills: ['React Native', 'JavaScript', 'Google Firebase'],
    category: 'Mobile Development',
    budget: {
      minAmount: 5000,
      maxAmount: 15000
    },
    duration: ['1-3-months', '3-6-months'],
    experienceLevel: ['expert'],
    location: 'worldwide'
  }
}
```

### Example 3: Designer Search

```javascript
{
  name: 'UI/UX Design Projects',
  filters: {
    skills: ['UI Design', 'UX Design', 'Figma', 'Prototyping'],
    category: 'Design',
    budget: {
      minAmount: 1000,
      maxAmount: 5000
    },
    location: 'worldwide'
  }
}
```

---

## Notification Settings Reference

### Email Notification
```javascript
notificationSettings: {
  emailNotification: true  // Send emails for matches
}
```

### Daily Limit
```javascript
notificationSettings: {
  maxNotificationsPerDay: 3  // Max 3 alerts per day
}
```

### Quiet Hours (No notifications 10 PM - 8 AM)
```javascript
notificationSettings: {
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00'
}
```

### Minimal Notifications
```javascript
notificationSettings: {
  emailNotification: false,
  maxNotificationsPerDay: 1
}
```

### Aggressive Notifications
```javascript
notificationSettings: {
  emailNotification: true,
  maxNotificationsPerDay: 10
}
```

---

## Error Reference

| HTTP Code | Error | Solution |
|-----------|-------|----------|
| 400 | Search name required | Provide a `name` field |
| 404 | Saved search not found | Verify search ID exists |
| 403 | Unauthorized | Can only access your own searches |
| 401 | Not authenticated | Include valid JWT token |
| 400 | Invalid filter values | Check budget ranges are positive |

---

## Performance Tips

1. **Use specific filters** - More specific searches match fewer jobs (better signal)
2. **Enable quiet hours** - Avoid notifications during sleep time
3. **Set daily limits** - Prevent alert fatigue with lower max notifications
4. **Review statistics** - Monitor which searches bring the most matches
5. **Delete inactive searches** - Reduce unnecessary processing

---

## Integration with UI Components

### Save Search Button
```javascript
<button onClick={async () => {
  const result = await createSavedSearch({
    name: currentFilters.name,
    filters: currentFilters
  });
  showSuccess(`Saved search "${result.name}" created!`);
}}>
  💾 Save This Search
</button>
```

### My Saved Searches List
```javascript
const [searches, setSearches] = useState([]);

useEffect(() => {
  const fetchSearches = async () => {
    const response = await fetch('/api/saved-searches');
    const data = await response.json();
    setSearches(data.data);
  };
  fetchSearches();
}, []);

return searches.map(search => (
  <div key={search._id}>
    <h3>{search.name}</h3>
    <p>Matches: {search.matchedJobsCount}</p>
    <button onClick={() => editSearch(search._id)}>Edit</button>
    <button onClick={() => deleteSearch(search._id)}>Delete</button>
  </div>
));
```

### Job Alert Notification Banner
```javascript
useEffect(() => {
  socket.on('job_alert', (alert) => {
    setAlertBanner({
      show: true,
      title: alert.title,
      link: `/jobs/${alert.jobId}`,
      autoHideSecs: 10
    });
  });
}, [socket]);
```

---

## Database Queries

### Get All Searches for Freelancer
```javascript
const searches = await SavedSearch.find({
  freelancer: freelancerId,
  isActive: true
}).sort({ createdAt: -1 });
```

### Find Searches Matching a Job
```javascript
const searches = await SavedSearch.find({ isActive: true });
const matches = searches.filter(s => s.matchesJob(job));
```

### Get Search Statistics
```javascript
const stats = {
  total: await SavedSearch.countDocuments({ freelancer: userId }),
  active: await SavedSearch.countDocuments({ 
    freelancer: userId, 
    isActive: true 
  }),
  jobsMatched: await SavedSearch.aggregate([
    { $match: { freelancer: userId } },
    { $group: { _id: null, total: { $sum: '$matchedJobsCount' } } }
  ])
};
```

---

## Related Resources

- [Full Documentation](./SAVED_JOBS_SYSTEM.md)
- [Job Posting API](./JOB_API_QUICK_REFERENCE.md)
- [Notification System](./NOTIFICATION_SYSTEM.md)
- [Socket.IO Events](./SOCKET_EVENTS.md)
