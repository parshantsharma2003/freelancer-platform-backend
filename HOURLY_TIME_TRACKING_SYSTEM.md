# Hourly Contract Time Tracking System Documentation

## Overview

The Hourly Contract Time Tracking system enables precise, transparent time logging and billing for hourly-rate contracts. Freelancers log work time in real-time, clients approve hours, and weekly payments are automatically processed from client balance.

---

## 1. System Architecture

### 1.1 Data Models

```
Contract (hourly type)
  ├── budget.hourlyRate ($/hour)
  ├── budget.weeklyHourLimit (default: 40)
  └── timeTracking
      ├── totalHours
      ├── approvedHours
      └── currentWeekHours

TimeEntry (1..* per Contract)
  ├── startTime / endTime
  ├── duration (calculated in minutes)
  ├── billableAmount (duration × hourlyRate)
  ├── status (active | stopped | submitted | approved | rejected)
  ├── approvedBy (client)
  └── pauses (pause/resume tracking)

Invoice (weekly summary)
  ├── weekStartDate / weekEndDate
  ├── totalHours / approvedHours
  ├── subtotal / platformFee / total
  └── status (draft | issued | paid)
```

### 1.2 Time Entry Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│              TIME ENTRY STATUS FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Active (freelancer working)                                     │
│    ├─ Can pause/resume                                           │
│    └─ Can stop (marked as "stopped")                            │
│       ↓                                                            │
│  Stopped (duration calculated)                                   │
│    ├─ CLIENT: Can approve → Approved                            │
│    └─ CLIENT: Can reject → Rejected                             │
│       ↓                                                            │
│  Approved (awaits weekly payment)                               │
│    └─ Auto-paid via weekly payment process                     │
│                                                                   │
│  Rejected (not billable)                                         │
│    └─ Can resubmit or request revision                          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Weekly Payment Flow

```
┌────────────────────────────────────────────────────────┐
│          HOURLY CONTRACT PAYMENT FLOW                  │
├────────────────────────────────────────────────────────┤
│                                                         │
│  Phase 1: Time Tracking (Mon-Sun)                     │
│  ├─ Freelancer: POST /api/time-entries/start          │
│  ├─ Freelancer: POST /api/time-entries/:id/stop       │
│  └─ Status: active → stopped                           │
│                                                         │
│  Phase 2: Client Approval (Anytime)                   │
│  ├─ Client: POST /api/time-entries/:id/approve        │
│  └─ Status: stopped → approved                         │
│                                                         │
│  Phase 3: Weekly Invoice Generation                   │
│  ├─ GET /api/time-entries/:contractId/invoice        │
│  ├─ Aggregates all approved hours for week            │
│  └─ Creates weekly invoice summary                    │
│                                                         │
│  Phase 4: Automatic Payment Processing                │
│  ├─ POST /api/time-entries/:contractId/pay-weekly    │
│  ├─ Verify client balance ≥ total amount             │
│  ├─ Deduct from client balance                        │
│  ├─ Add to freelancer balance (net amount)            │
│  └─ Record payment transaction                        │
│                                                         │
├────────────────────────────────────────────────────────┤
│  BUDGET CHECK: Enforce weekly hour limits             │
│  ├─ GET /api/time-entries/:contractId/limit          │
│  ├─ Returns: currentHours, limit, remaining           │
│  └─ Prevents approving over limit                     │
│                                                         │
└────────────────────────────────────────────────────────┘
```

---

## 2. API Reference

### 2.1 Start Time Entry

**Endpoint:** `POST /api/time-entries/start`

**Authentication:** Required (Freelancer only)

**Request Body:**
```json
{
  "contractId": "66f7a1c2b4d8e2f1a3c4d5e6",
  "description": "Working on homepage mockups"
}
```

**Validation Rules:**
- ✅ User must be the contract freelancer
- ✅ Contract must be hourly type
- ✅ Contract must be active
- ✅ Cannot start if another entry already active
- ✅ Description is optional

**Response (201 Created):**
```json
{
  "status": "success",
  "message": "Time entry started",
  "data": {
    "timeEntry": {
      "_id": "66f7a4c1b2d8e1f0a9c8d7e7",
      "contract": "66f7a1c2b4d8e2f1a3c4d5e6",
      "freelancer": "66f7a1c2b4d8e2f1a3c4d5e7",
      "startTime": "2024-02-15T09:30:00Z",
      "endTime": null,
      "duration": 0,
      "description": "Working on homepage mockups",
      "status": "active",
      "hourlyRate": 75,
      "approvedBy": null,
      "billableAmount": 0,
      "weekStartDate": "2024-02-12T00:00:00Z",
      "weekEndDate": "2024-02-18T23:59:59Z"
    }
  }
}
```

**Socket Events:**
- 📢 `notifyUser`: Personal notification to client
- 📢 `broadcastTimeEntryStarted`: Broadcast to `contract:contractId` room

---

### 2.2 Stop Time Entry

**Endpoint:** `POST /api/time-entries/:id/stop`

**Authentication:** Required (Freelancer only)

**Request Body:**
```json
{}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Time entry stopped",
  "data": {
    "timeEntry": {
      "_id": "66f7a4c1b2d8e1f0a9c8d7e7",
      "status": "stopped",
      "startTime": "2024-02-15T09:30:00Z",
      "endTime": "2024-02-15T10:45:00Z",
      "duration": 75,
      "billableAmount": 93.75,
      "platformFee": 9.38,
      "netAmount": 84.38,
      "hourlyRate": 75
    },
    "summary": {
      "duration": 75,
      "durationHours": "1.25",
      "billableAmount": 93.75,
      "platformFee": 9.38,
      "netAmount": 84.38
    }
  }
}
```

**Calculations:**
- Duration = minutes between start and end (minus pauses)
- Billable Amount = (duration ÷ 60) × hourlyRate
- Platform Fee = billableAmount × 10%
- Net Amount = billableAmount - platformFee

**Socket Events:**
- 📢 `broadcastTimeEntryStopped`: Broadcast to `user:clientId`

---

### 2.3 Pause Time Entry

**Endpoint:** `POST /api/time-entries/:id/pause`

**Authentication:** Required (Freelancer only)

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Time entry paused",
  "data": {
    "timeEntry": {
      "_id": "66f7a4c1b2d8e1f0a9c8d7e7",
      "status": "paused",
      "pauses": [
        {
          "pausedAt": "2024-02-15T10:00:00Z",
          "resumedAt": null,
          "durationPaused": 0
        }
      ]
    }
  }
}
```

---

### 2.4 Resume Time Entry

**Endpoint:** `POST /api/time-entries/:id/resume`

**Authentication:** Required (Freelancer only)

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Time entry resumed",
  "data": {
    "timeEntry": {
      "_id": "66f7a4c1b2d8e1f0a9c8d7e7",
      "status": "active",
      "pauses": [
        {
          "pausedAt": "2024-02-15T10:00:00Z",
          "resumedAt": "2024-02-15T10:15:00Z",
          "durationPaused": 15
        }
      ]
    }
  }
}
```

---

### 2.5 Approve Time Entry

**Endpoint:** `POST /api/time-entries/:id/approve`

**Authentication:** Required (Client only)

**Request Body:**
```json
{}
```

**Validation Rules:**
- ✅ User must be the contract client
- ✅ Entry must be in 'stopped' status
- ✅ Approving must not exceed weekly hour limit
- ✅ Contract budget must be sufficient

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Time entry approved",
  "data": {
    "timeEntry": {
      "_id": "66f7a4c1b2d8e1f0a9c8d7e7",
      "status": "approved",
      "duration": 75,
      "durationHours": "1.25",
      "billableAmount": 93.75,
      "approvedAt": "2024-02-15T11:00:00Z",
      "approvedBy": "66f7a1c2b4d8e2f1a3c4d5e6"
    }
  }
}
```

**Side Effects:**
- ✅ Updates contract: approvedHours, pendingHours, currentWeekHours
- ✅ Updates contract: totalEarnings
- ✅ Marks entry as approved for payment

**Socket Events:**
- 📢 `broadcastTimeEntryApproved`: Broadcast to `user:freelancerId`

---

### 2.6 Reject Time Entry

**Endpoint:** `POST /api/time-entries/:id/reject`

**Authentication:** Required (Client only)

**Request Body:**
```json
{
  "reason": "Duration seems inaccurate, please resubmit"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Time entry rejected",
  "data": {
    "timeEntry": {
      "_id": "66f7a4c1b2d8e1f0a9c8d7e7",
      "status": "rejected",
      "description": "Duration seems inaccurate, please resubmit"
    }
  }
}
```

---

### 2.7 Get Time Entries

**Endpoint:** `GET /api/time-entries?contractId=xxx`

**Authentication:** Required

**Query Parameters:**
- `contractId` (required): Contract ID

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "timeEntries": [
      {
        "_id": "66f7a4c1b2d8e1f0a9c8d7e7",
        "status": "approved",
        "duration": 75,
        "billableAmount": 93.75,
        "approvedAt": "2024-02-15T11:00:00Z"
      }
    ],
    "stats": {
      "total": 1,
      "approved": 1,
      "rejected": 0,
      "pending": 0,
      "totalHours": 1.25,
      "approvedHours": 1.25,
      "totalBillableAmount": 93.75,
      "approvedAmount": 93.75
    }
  }
}
```

---

### 2.8 Get Active Time Entry

**Endpoint:** `GET /api/time-entries/active/:contractId`

**Authentication:** Required (Freelancer only)

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "timeEntry": {
      "_id": "66f7a4c1b2d8e1f0a9c8d7e7",
      "status": "active",
      "startTime": "2024-02-15T09:30:00Z",
      "description": "Working on homepage mockups"
    },
    "elapsed": {
      "minutes": 45,
      "hours": "0.75"
    }
  }
}
```

**Returns null if no active entry.**

---

### 2.9 Get Weekly Time Entries

**Endpoint:** `GET /api/time-entries/weekly/:contractId`

**Authentication:** Required

**Query Parameters:**
- `weekDate` (optional): Date within week (defaults to current week, ISO 8601 string)

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "weekly": {
      "weekStart": "2024-02-12T00:00:00Z",
      "weekEnd": "2024-02-18T23:59:59Z",
      "totalHours": 15.5,
      "approvedHours": 12.0,
      "rejectedHours": 1.0,
      "pendingHours": 2.5,
      "totalBillableAmount": 1162.50,
      "approvedAmount": 900.00,
      "entries": [...]
    },
    "weeklyLimit": 40
  }
}
```

---

### 2.10 Check Weekly Hour Limit

**Endpoint:** `GET /api/time-entries/:contractId/limit`

**Authentication:** Required (Freelancer only)

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "limit": {
      "currentWeekHours": 8.5,
      "weeklyLimit": 40,
      "hoursRemaining": 31.5,
      "limitExceeded": false
    }
  }
}
```

---

### 2.11 Get Weekly Invoice

**Endpoint:** `GET /api/time-entries/:contractId/invoice`

**Authentication:** Required

**Query Parameters:**
- `weekDate` (optional): Date within week (defaults to current week)

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "invoice": {
      "contract": {
        "id": "66f7a1c2b4d8e2f1a3c4d5e6",
        "title": "Website Redesign"
      },
      "client": {
        "id": "66f7a1c2b4d8e2f1a3c4d5e6",
        "name": "John Smith",
        "email": "john@example.com"
      },
      "freelancer": {
        "id": "66f7a1c2b4d8e2f1a3c4d5e7",
        "name": "Jane Developer",
        "email": "jane@example.com"
      },
      "week": {
        "weekStart": "2024-02-12T00:00:00Z",
        "weekEnd": "2024-02-18T23:59:59Z",
        "totalHours": 40,
        "approvedHours": 40,
        "rejectedHours": 0,
        "pendingHours": 0,
        "totalBillableAmount": 3000,
        "approvedAmount": 3000
      },
      "invoiceDate": "2024-02-19T00:00:00Z",
      "dueDate": "2024-02-26T00:00:00Z",
      "hourlyRate": 75,
      "platformFeePercent": 10
    }
  }
}
```

---

### 2.12 Process Weekly Payment

**Endpoint:** `POST /api/time-entries/:contractId/pay-weekly`

**Authentication:** Required (Client only)

**Request Body:**
```json
{
  "weekDate": "2024-02-15T00:00:00Z"
}
```

**Validation Rules:**
- ✅ User must be the contract client
- ✅ Client must have sufficient balance
- ✅ Only approved hours are paid

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Weekly payment processed",
  "data": {
    "payment": {
      "contract": "66f7a1c2b4d8e2f1a3c4d5e6",
      "weekStart": "2024-02-12T00:00:00Z",
      "weekEnd": "2024-02-18T23:59:59Z",
      "hours": 40,
      "amount": 3000,
      "clientBalance": 7500,
      "freelancerBalance": 3000,
      "date": "2024-02-19T10:30:00Z"
    }
  }
}
```

**Side Effects:**
- ✅ Deduct approved amount from client balance
- ✅ Add amount to freelancer balance
- ✅ Update contract totalPaid
- ✅ Create Payment record

**Socket Events:**
- 📢 `broadcastWeeklyPaymentProcessed`: Broadcast to `user:freelancerId`

---

### 2.13 Get Single Time Entry

**Endpoint:** `GET /api/time-entries/:id`

**Authentication:** Required

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "timeEntry": {
      "_id": "66f7a4c1b2d8e1f0a9c8d7e7",
      "contract": { /* full contract */ },
      "freelancer": { /* freelancer details */ },
      "client": { /* client details */ },
      "startTime": "2024-02-15T09:30:00Z",
      "endTime": "2024-02-15T17:45:00Z",
      "duration": 495,
      "durationHours": 8.25,
      "status": "approved",
      "billableAmount": 618.75,
      "platformFee": 61.88,
      "netAmount": 556.88,
      "approvedAt": "2024-02-15T18:00:00Z",
      "pauses": [
        {
          "pausedAt": "2024-02-15T12:00:00Z",
          "resumedAt": "2024-02-15T13:00:00Z",
          "durationPaused": 60
        }
      ]
    }
  }
}
```

---

## 3. Security & Authorization

### 3.1 Role-Based Access

| Operation | Freelancer | Client | Admin |
|-----------|-----------|--------|-------|
| Start time entry | ✅ (own contract) | ❌ | ✅ |
| Stop time entry | ✅ (own entry) | ❌ | ✅ |
| Pause/Resume entry | ✅ (own entry) | ❌ | ✅ |
| Approve time entry | ❌ | ✅ (own contract) | ✅ |
| Reject time entry | ❌ | ✅ (own contract) | ✅ |
| View time entries | ✅ (own) | ✅ (contract) | ✅ |
| Check hour limit | ✅ (own contract) | ❌ | ✅ |
| Process payment | ❌ | ✅ (own contract) | ✅ |

### 3.2 Contract Validation

Every time entry endpoint verifies:
1. ✅ Contract exists and is hourly type
2. ✅ Contract is active
3. ✅ User is client or freelancer in the contract
4. ✅ Weekly hour limit is not exceeded (on approval)

### 3.3 Budget Protection

- ✅ Cannot approve entries that exceed weekly hour limit
- ✅ Platform fees calculated before freelancer receives funds
- ✅ Client balance checked before automatic payment

---

## 4. Billing & Fee Calculation

### 4.1 Standard Billing Formula

```
Duration (hours) = Duration (minutes) / 60

Billable Amount = Duration (hours) × Hourly Rate

Platform Fee = Billable Amount × 10%

Net Amount = Billable Amount - Platform Fee

Freelancer Receives = Net Amount
```

### 4.2 Example Calculation

```
Hourly Rate: $75/hour
Duration: 1 hour 15 minutes (75 minutes)

Duration (hours) = 75 / 60 = 1.25 hours
Billable Amount = 1.25 × $75 = $93.75
Platform Fee (10%) = $93.75 × 0.10 = $9.375 ≈ $9.38
Net Amount = $93.75 - $9.38 = $84.37

Freelancer Receives: $84.37
Client Paid: $93.75
Platform Earned: $9.38
```

### 4.3 Weekly Invoice Example

```
Week of Feb 12-18, 2024

Monday:   8 hours @ $75/hr = $600
Tuesday:  8 hours @ $75/hr = $600
Wednesday: 8 hours @ $75/hr = $600
Thursday:  8 hours @ $75/hr = $600
Friday:    8 hours @ $75/hr = $600

Total: 40 hours
Subtotal: $3,000
Platform Fee (10%): $300
Net Amount: $2,700
```

---

## 5. Weekly Hour Limits

### 5.1 Enforcement

```javascript
// When client approves a time entry
if (approvedHours + newEntryHours > weeklyLimit) {
  REJECT with error
}
```

### 5.2 Checking Limits

**Endpoint:** `GET /api/time-entries/:contractId/limit`

**Response:**
```json
{
  "limit": {
    "currentWeekHours": 32.5,
    "weeklyLimit": 40,
    "hoursRemaining": 7.5,
    "limitExceeded": false
  }
}
```

### 5.3 Week Definition

- **Week Start:** Monday 12:00 AM UTC
- **Week End:** Sunday 11:59:59 PM UTC
- **Query by Date:** Defaults to current week, can specify any date in week

---

## 6. Pause & Resume Functionality

### 6.1 Use Case

Freelancer takes a break during active time entry:

```
09:00 - 09:30: Work (30 minutes)
09:30 - 10:00: PAUSE (30-minute break)
10:00 - 12:00: Work (120 minutes)
12:00 - STOP

Total Paused: 30 minutes
Total Working: 150 minutes = 2.5 hours
Billable: 2.5 hours × $75 = $187.50
```

### 6.2 Pause Tracking

```json
{
  "pauses": [
    {
      "pausedAt": "2024-02-15T09:30:00Z",
      "resumedAt": "2024-02-15T10:00:00Z",
      "durationPaused": 30
    }
  ]
}
```

---

## 7. Socket.io Real-Time Events

### 7.1 Time Entry Started

**Event:** `timeentry:started`

**Emitted to:** `contract:contractId` room

**Payload:**
```json
{
  "status": "success",
  "event": "timeentry:started",
  "data": {
    "timeEntryId": "66f7a4c1b2d8e1f0a9c8d7e7",
    "contractId": "66f7a1c2b4d8e2f1a3c4d5e6",
    "startTime": "2024-02-15T09:30:00Z",
    "description": "Working on homepage mockups",
    "message": "Freelancer started time tracking..."
  },
  "timestamp": "2024-02-15T09:30:00Z"
}
```

### 7.2 Time Entry Stopped

**Event:** `timeentry:stopped`

**Emitted to:** `user:clientId` room

**Payload:**
```json
{
  "status": "success",
  "event": "timeentry:stopped",
  "data": {
    "timeEntryId": "66f7a4c1b2d8e1f0a9c8d7e7",
    "contractId": "66f7a1c2b4d8e2f1a3c4d5e6",
    "duration": 75,
    "durationHours": "1.25",
    "billableAmount": 93.75,
    "platformFee": 9.38,
    "netAmount": 84.38,
    "message": "1.25 hours logged - awaiting approval"
  },
  "timestamp": "2024-02-15T10:45:00Z"
}
```

### 7.3 Time Entry Approved

**Event:** `timeentry:approved`

**Emitted to:** `user:freelancerId` room

**Payload:**
```json
{
  "status": "success",
  "event": "timeentry:approved",
  "data": {
    "timeEntryId": "66f7a4c1b2d8e1f0a9c8d7e7",
    "contractId": "66f7a1c2b4d8e2f1a3c4d5e6",
    "approved": true,
    "billableAmount": 93.75,
    "message": "Your time entry has been approved for $93.75"
  },
  "timestamp": "2024-02-15T11:00:00Z"
}
```

### 7.4 Weekly Payment Processed

**Event:** `timeentry:payment-processed`

**Emitted to:** `user:freelancerId` room

**Payload:**
```json
{
  "status": "success",
  "event": "timeentry:payment-processed",
  "data": {
    "contractId": "66f7a1c2b4d8e2f1a3c4d5e6",
    "weekStart": "2024-02-12T00:00:00Z",
    "weekEnd": "2024-02-18T23:59:59Z",
    "hours": 40,
    "amount": 2700,
    "message": "Weekly payment processed: $2700 for 40 hours"
  },
  "timestamp": "2024-02-19T10:30:00Z"
}
```

---

## 8. Testing Workflow

### 8.1 Complete Time Entry Lifecycle (Happy Path)

```bash
# 1. Create contract (hourly: $75/hr, 40 hour/week limit)
POST /api/contracts
{
  "budget": {
    "type": "hourly",
    "hourlyRate": 75,
    "weeklyHourLimit": 40
  }
}

# 2. Freelancer starts time entry
POST /api/time-entries/start
{
  "contractId": "contract123",
  "description": "Homepage design work"
}
# Response: timeEntry with status "active", _id: "entry123"

# 3. Freelancer pauses (break)
POST /api/time-entries/entry123/pause

# 4. Freelancer resumes
POST /api/time-entries/entry123/resume

# 5. Freelancer stops
POST /api/time-entries/entry123/stop
# Response: duration=120 min (2 hrs), billableAmount=$150

# 6. Client checks pending entries
GET /api/time-entries?contractId=contract123
# Returns: 1 pending entry with stats

# 7. Client approves
POST /api/time-entries/entry123/approve
# Updates contract.timeTracking.approvedHours += 2

# 8. Check weekly stats
GET /api/time-entries/weekly/contract123
# Returns: 2 hours approved, $150 total, $135 net

# 9. Process weekly payment
POST /api/time-entries/contract123/pay-weekly
# Client balance -= $150
# Freelancer balance += $135

# 10. Verify
GET /api/time-entries/entry123
# Status: approved, approvedAt: timestamp, approvedBy: client_id
```

### 8.2 Rejection Workflow

```bash
# 1-5. (Same as above)

# 6. Client rejects with reason
POST /api/time-entries/entry123/reject
{
  "reason": "Timestamps don't align with Slack activity"
}

# 7. Freelancer sees rejection notification
# Socket event: timeentry:rejected with reason

# 8. Freelancer can resubmit (same entry, different approach)
# Or explain discrepancy in communication
```

### 8.3 Weekly Hour Limit Test

```bash
# 1. Contract has weeklyLimit: 40 hours

# 2. Client approves entries Mon-Thu: 32 hours
GET /api/time-entries/:contractId/limit
# Response: hoursRemaining: 8, limitExceeded: false

# 3. Friday: Freelancer works 10 hours
POST /api/time-entries/entry123/approve
# ERROR: "Approving this entry would exceed weekly limit of 40 hours"

# 4. Client can only approve 8 hours max on Friday
```

---

## 9. Error Handling

### 9.1 Common Error Codes

| HTTP | Error | Cause |
|------|-------|-------|
| 400 | Already active | Freelancer has active entry on contract |
| 400 | Invalid status | Entry not in required status |
| 400 | Hour limit exceeded | Approval would exceed weekly limit |
| 400 | Invalid contract type | Must be hourly contract |
| 403 | Unauthorized | User not part of contract |
| 404 | Not found | Time entry/contract doesn't exist |
| 500 | Server error | Unexpected error |

### 9.2 Example Error Response

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

---

## 10. Production Considerations

### 10.1 Database Optimization

- ✅ Indexes on (contract, freelancer), (contract, weekStartDate)
- ✅ Partial indexes on status for active/pending queries
- ✅ Archive old time entries to separate collection after 6 months

### 10.2 Data Integrity

- ✅ Validate hour calculations in post-save hooks
- ✅ Prevent concurrent time entries via unique index
- ✅ Lock contracts during payment processing
- ✅ Audit all approvals and rejections

### 10.3 Payment Safety

- ✅ Store client balance snapshots before payment
- ✅ Implement payment reversal if transfer fails
- ✅ Reconciliation reports weekly
- ✅ PCI compliance for balance storage

### 10.4 Fraud Prevention

- ✅ Detected suspicious patterns (e.g., 24-hour sessions)
- ✅ Alert on entries exceeding historical average
- ✅ Require client approval within 7 days
- ✅ Log all approvals with client IP/timestamp

---

## 11. Frontend Integration Example

```javascript
// React Hook for Time Tracking
import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';

export function useTimeTracking(contractId) {
  const socket = useSocket();
  const [activeEntry, setActiveEntry] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  // Start timer
  const startTimer = async (description) => {
    const response = await fetch('/api/time-entries/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId, description })
    });
    const data = await response.json();
    setActiveEntry(data.data.timeEntry);
  };

  // Stop timer
  const stopTimer = async () => {
    const response = await fetch(`/api/time-entries/${activeEntry._id}/stop`, {
      method: 'POST'
    });
    const data = await response.json();
    setActiveEntry(null);
    return data.data.timeEntry;
  };

  // Update elapsed time every second
  useEffect(() => {
    if (!activeEntry) return;
    
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(activeEntry.startTime)) / 1000);
      setElapsed(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeEntry]);

  // Listen for approval notifications
  useEffect(() => {
    socket.on('timeentry:approved', (data) => {
      console.log(`Entry approved for $${data.data.billableAmount}`);
      // Update UI with approval notification
    });

    return () => socket.off('timeentry:approved');
  }, [socket]);

  return {
    activeEntry,
    elapsed,
    startTimer,
    stopTimer
  };
}

// Usage in component
export function TimerWidget({ contractId }) {
  const { activeEntry, elapsed, startTimer, stopTimer } = useTimeTracking(contractId);

  return (
    <div>
      {activeEntry ? (
        <>
          <p>⏱️ {formatSeconds(elapsed)}</p>
          <button onClick={stopTimer}>Stop</button>
        </>
      ) : (
        <button onClick={() => startTimer('Working')}>Start</button>
      )}
    </div>
  );
}
```

---

## 12. Troubleshooting

### Cannot start time entry
- ✅ Verify contract is hourly type
- ✅ Verify contract status is active
- ✅ Check no other active entry exists on contract

### Payment fails
- ✅ Verify client balance ≥ total amount
- ✅ Check all entries are approved
- ✅ Verify weekly date is correct

### Hour limit exceeded
- ✅ Check current week hours via GET /limit
- ✅ Client must reject some entries
- ✅ Freelancer and client discuss renegotiation

### Socket events not received
- ✅ Verify socket connected (check console for errors)
- ✅ Freelancer should join `contract:contractId` room
- ✅ Check backend socket broadcast methods are called

---

**Last Updated:** February 2024  
**Version:** 1.0  
**Author:** Freelancer Platform Team
