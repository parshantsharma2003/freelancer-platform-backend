# Time Tracking API - Quick Copy-Paste Reference

## Curl Command Examples

Replace `YOUR_TOKEN`, `CONTRACT_ID`, `ENTRY_ID` with actual values.

---

### 1. START TIME ENTRY

```bash
curl -X POST http://localhost:5001/api/time-entries/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "CONTRACT_ID",
    "description": "Working on homepage design"
  }'
```

**Response:**
```json
{
  "status": "success",
  "message": "Time entry started",
  "data": {
    "timeEntry": {
      "_id": "ENTRY_ID",
      "status": "active",
      "startTime": "2024-02-15T09:30:00.000Z",
      "hourlyRate": 75
    }
  }
}
```

---

### 2. STOP TIME ENTRY

```bash
curl -X POST http://localhost:5001/api/time-entries/ENTRY_ID/stop \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "message": "Time entry stopped",
  "data": {
    "timeEntry": {
      "status": "stopped",
      "duration": 90,
      "billableAmount": 112.5,
      "platformFee": 11.25,
      "netAmount": 101.25
    },
    "summary": {
      "durationHours": "1.5"
    }
  }
}
```

---

### 3. PAUSE TIME ENTRY

```bash
curl -X POST http://localhost:5001/api/time-entries/ENTRY_ID/pause \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "message": "Time entry paused",
  "data": {
    "timeEntry": {
      "status": "paused"
    }
  }
}
```

---

### 4. RESUME TIME ENTRY

```bash
curl -X POST http://localhost:5001/api/time-entries/ENTRY_ID/resume \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "message": "Time entry resumed",
  "data": {
    "timeEntry": {
      "status": "active"
    }
  }
}
```

---

### 5. APPROVE TIME ENTRY (Client)

```bash
curl -X POST http://localhost:5001/api/time-entries/ENTRY_ID/approve \
  -H "Authorization: Bearer CLIENT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "status": "success",
  "message": "Time entry approved",
  "data": {
    "timeEntry": {
      "status": "approved",
      "billableAmount": 112.5,
      "approvedAt": "2024-02-15T10:45:00.000Z"
    }
  }
}
```

---

### 6. REJECT TIME ENTRY (Client)

```bash
curl -X POST http://localhost:5001/api/time-entries/ENTRY_ID/reject \
  -H "Authorization: Bearer CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Duration does not match project timestamps"
  }'
```

**Response:**
```json
{
  "status": "success",
  "message": "Time entry rejected",
  "data": {
    "timeEntry": {
      "status": "rejected"
    }
  }
}
```

---

### 7. GET ALL TIME ENTRIES FOR CONTRACT

```bash
curl http://localhost:5001/api/time-entries?contractId=CONTRACT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "timeEntries": [
      {
        "_id": "ENTRY_ID",
        "status": "approved",
        "duration": 90,
        "billableAmount": 112.5
      }
    ],
    "stats": {
      "total": 1,
      "approved": 1,
      "rejected": 0,
      "pending": 0,
      "approvedHours": 1.5,
      "approvedAmount": 112.5
    }
  }
}
```

---

### 8. GET ACTIVE TIME ENTRY (Freelancer)

```bash
curl http://localhost:5001/api/time-entries/active/CONTRACT_ID \
  -H "Authorization: Bearer FREELANCER_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "timeEntry": {
      "_id": "ENTRY_ID",
      "status": "active",
      "startTime": "2024-02-15T09:30:00.000Z",
      "description": "Working on homepage design"
    },
    "elapsed": {
      "minutes": 45,
      "hours": "0.75"
    }
  }
}
```

**Or null if no active entry:**
```json
{
  "status": "success",
  "data": {
    "timeEntry": null
  }
}
```

---

### 9. GET SINGLE TIME ENTRY

```bash
curl http://localhost:5001/api/time-entries/ENTRY_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "timeEntry": {
      "_id": "ENTRY_ID",
      "contract": { ... },
      "freelancer": { ... },
      "client": { ... },
      "startTime": "2024-02-15T09:30:00.000Z",
      "endTime": "2024-02-15T11:00:00.000Z",
      "duration": 90,
      "status": "approved",
      "billableAmount": 112.5,
      "platformFee": 11.25,
      "netAmount": 101.25,
      "approvedAt": "2024-02-15T11:15:00.000Z"
    }
  }
}
```

---

### 10. GET WEEKLY TIME ENTRIES

```bash
curl "http://localhost:5001/api/time-entries/weekly/CONTRACT_ID?weekDate=2024-02-15" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "weekly": {
      "weekStart": "2024-02-12T00:00:00.000Z",
      "weekEnd": "2024-02-18T23:59:59.999Z",
      "totalHours": 12.5,
      "approvedHours": 10,
      "rejectedHours": 1,
      "pendingHours": 1.5,
      "totalBillableAmount": 937.5,
      "approvedAmount": 750,
      "entries": [...]
    },
    "weeklyLimit": 40
  }
}
```

---

### 11. CHECK WEEKLY HOUR LIMIT (Freelancer)

```bash
curl http://localhost:5001/api/time-entries/CONTRACT_ID/limit \
  -H "Authorization: Bearer FREELANCER_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "limit": {
      "currentWeekHours": 32.5,
      "weeklyLimit": 40,
      "hoursRemaining": 7.5,
      "limitExceeded": false
    }
  }
}
```

---

### 12. GET WEEKLY INVOICE

```bash
curl "http://localhost:5001/api/time-entries/CONTRACT_ID/invoice?weekDate=2024-02-15" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "invoice": {
      "contract": {
        "id": "CONTRACT_ID",
        "title": "Website Redesign"
      },
      "client": {
        "id": "CLIENT_ID",
        "name": "John Smith",
        "email": "john@example.com"
      },
      "freelancer": {
        "id": "FREELANCER_ID",
        "name": "Jane Developer",
        "email": "jane@example.com"
      },
      "week": {
        "weekStart": "2024-02-12T00:00:00.000Z",
        "weekEnd": "2024-02-18T23:59:59.999Z",
        "totalHours": 40,
        "approvedHours": 40,
        "totalBillableAmount": 3000,
        "approvedAmount": 3000
      },
      "invoiceDate": "2024-02-19T00:00:00.000Z",
      "dueDate": "2024-02-26T00:00:00.000Z",
      "hourlyRate": 75,
      "platformFeePercent": 10
    }
  }
}
```

---

### 13. PROCESS WEEKLY PAYMENT (Client)

```bash
curl -X POST http://localhost:5001/api/time-entries/CONTRACT_ID/pay-weekly \
  -H "Authorization: Bearer CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weekDate": "2024-02-15"
  }'
```

**Response:**
```json
{
  "status": "success",
  "message": "Weekly payment processed",
  "data": {
    "payment": {
      "contract": "CONTRACT_ID",
      "weekStart": "2024-02-12T00:00:00.000Z",
      "weekEnd": "2024-02-18T23:59:59.999Z",
      "hours": 40,
      "amount": 3000,
      "clientBalance": 7500,
      "freelancerBalance": 3000,
      "date": "2024-02-19T10:30:00.000Z"
    }
  }
}
```

---

## Error Examples

### 1. No Active Entry
```json
{
  "status": "error",
  "message": "You already have an active time entry. Stop it before starting a new one."
}
```

### 2. Week Hour Limit Exceeded
```json
{
  "status": "error",
  "message": "Approving this entry would exceed weekly limit of 40 hours",
  "errorCode": "WEEKLY_LIMIT_EXCEEDED",
  "details": {
    "currentWeekHours": 32.5,
    "entryHours": 9.5,
    "weeklyLimit": 40,
    "total": 42
  }
}
```

### 3. Insufficient Client Balance
```json
{
  "status": "error",
  "message": "Insufficient client balance for payment"
}
```

### 4. Unauthorized (Not Freelancer)
```json
{
  "status": "error",
  "message": "Only freelancer can log time"
}
```

### 5. Invalid Contract Type
```json
{
  "status": "error",
  "message": "Time logging only available for hourly contracts"
}
```

---

## JavaScript Fetch Examples

### Start Timer
```javascript
const response = await fetch('/api/time-entries/start', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contractId: contractId,
    description: 'Working on homepage design'
  })
});

const data = await response.json();
console.log(data.data.timeEntry._id); // Extract entry ID
```

### Stop Timer and Get Summary
```javascript
const response = await fetch(`/api/time-entries/${entryId}/stop`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
const { duration, billableAmount, netAmount } = data.data.summary;
console.log(`Worked: ${(duration/60).toFixed(2)} hours`);
console.log(`Earned: $${netAmount}`);
```

### Approve Entry
```javascript
const response = await fetch(`/api/time-entries/${entryId}/approve`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${clientToken}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
if (data.status === 'success') {
  console.log('Entry approved for $' + data.data.timeEntry.billableAmount);
}
```

### Check Hour Limit
```javascript
const response = await fetch(
  `/api/time-entries/${contractId}/limit`,
  { headers: { 'Authorization': `Bearer ${token}` } }
);

const data = await response.json();
const { currentWeekHours, hoursRemaining, limitExceeded } = data.data.limit;

if (limitExceeded) {
  alert('Weekly hour limit exceeded!');
} else {
  console.log(`${hoursRemaining} hours remaining this week`);
}
```

### Process Weekly Payment
```javascript
const response = await fetch(
  `/api/time-entries/${contractId}/pay-weekly`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${clientToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      weekDate: new Date().toISOString()
    })
  }
);

const data = await response.json();
console.log(`Paid $${data.data.payment.amount} for ${data.data.payment.hours} hours`);
```

---

## Socket.io Event Listeners

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5001', {
  auth: {
    token: localStorage.getItem('token')
  }
});

// Time entry started
socket.on('timeentry:started', (data) => {
  console.log('Freelancer started:', data.data.description);
  // Update UI: show timer is running
});

// Time entry stopped
socket.on('timeentry:stopped', (data) => {
  console.log(`Stopped: ${data.data.durationHours} hours`);
  console.log(`Billable: $${data.data.billableAmount}`);
  // Update UI: show pending approval
});

// Approval notification
socket.on('timeentry:approved', (data) => {
  console.log(`Entry approved for $${data.data.billableAmount}`);
  // Update UI: show entry is approved
});

// Payment notification
socket.on('timeentry:payment-processed', (data) => {
  console.log(`Payment: $${data.data.amount} for ${data.data.hours} hours`);
  // Update UI: update balance, show payment history
});
```

---

## Postman Collection (Skeleton)

Save this as `time-tracking.postman_collection.json`:

```json
{
  "info": {
    "name": "Time Tracking API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Start Timer",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/time-entries/start",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"contractId\": \"{{contractId}}\", \"description\": \"Working\"}"
        }
      }
    },
    {
      "name": "Stop Timer",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/time-entries/{{entryId}}/stop",
        "header": {
          "key": "Authorization",
          "value": "Bearer {{token}}"
        }
      }
    },
    {
      "name": "Approve Entry",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/time-entries/{{entryId}}/approve",
        "header": {
          "key": "Authorization",
          "value": "Bearer {{clientToken}}"
        }
      }
    },
    {
      "name": "Get Weekly Stats",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/api/time-entries/weekly/{{contractId}}",
        "header": {
          "key": "Authorization",
          "value": "Bearer {{token}}"
        }
      }
    },
    {
      "name": "Process Payment",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/time-entries/{{contractId}}/pay-weekly",
        "header": {
          "key": "Authorization",
          "value": "Bearer {{clientToken}}"
        },
        "body": {
          "mode": "raw",
          "raw": "{\"weekDate\": \"2024-02-15\"}"
        }
      }
    }
  ],
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:5001"
    },
    {
      "key": "token",
      "value": ""
    },
    {
      "key": "clientToken",
      "value": ""
    },
    {
      "key": "contractId",
      "value": ""
    },
    {
      "key": "entryId",
      "value": ""
    }
  ]
}
```

---

## Environment Variables (.env)

```bash
# Server Core
PORT=5001
NODE_ENV=development
MONGO_URI=mongodb+srv://<your-production-cluster>/freelancer-platform

# JWT
JWT_SECRET=your-super-secret-key-here
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d

# Time Tracking
TIME_ENTRY_PLATFORM_FEE=10
WEEKLY_HOUR_LIMIT_DEFAULT=40

# Socket.io
SOCKET_CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000
```

---

**Quick Reference Generated:** February 2024  
**All 13 Endpoints Included**  
**Ready for Copy-Paste Testing**
