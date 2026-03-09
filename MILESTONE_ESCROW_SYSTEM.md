# Milestone & Escrow System Documentation

## Overview

The Milestone & Escrow system enables secure, phased payment processing for fixed-price contracts on Upwork-style freelance platforms. This system ensures client funds are held in escrow and released only after freelancer work is approved.

---

## 1. System Architecture

### 1.1 Data Model

```
Contract (fixed-price)
  ↓
  Milestones (multiple per contract)
    ├── Escrow Management (funds held from contract budget)
    ├── Work Submission (freelancer submits deliverables)
    ├── Client Approval (client reviews and approves/rejects)
    └── Payment Release (funds transferred to freelancer)
```

### 1.2 Status Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                   MILESTONE STATUS FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│  pending                                                          │
│    ↓                                                              │
│  submitted (freelancer submits work)                            │
│    ↓                                                              │
│  ├─ approved (client approves)                                  │
│  │   ↓                                                            │
│  │  paid (payment released to freelancer)                       │
│  │                                                               │
│  └─ rejected (client rejects, requires revision)                │
│      ↓                                                            │
│    submitted (freelancer resubmits after revision)             │
```

### 1.3 Escrow Flow

```
┌──────────────────────────────────────────────────────────┐
│             ESCROW & PAYMENT FLOW                        │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  1. Client creates contract with budget                  │
│     └─ Budget reserved for milestones                    │
│                                                           │
│  2. Client creates milestones                            │
│     ├─ Total milestones ≤ contract budget               │
│     └─ Escrow marked as "pending" (not yet held)        │
│                                                           │
│  3. Freelancer submits work for milestone                │
│     └─ Work documented with attachments                  │
│                                                           │
│  4. Client approves milestone work                       │
│     └─ Milestone ready for payment release               │
│                                                           │
│  5. System releases escrowed funds                       │
│     ├─ Calculate platform fee (10% default)             │
│     ├─ Transfer net amount to freelancer                │
│     ├─ Record payment transaction                        │
│     └─ Set paymentReleased flag (double-payment prevent) │
│                                                           │
│  6. Payment complete                                      │
│     └─ Funds reach freelancer account                    │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## 2. API Reference

### 2.1 Create Milestones

**Endpoint:** `POST /api/milestones`

**Authentication:** Required (Client only)

**Request Body:**
```json
{
  "contractId": "66f7a1c2b4d8e2f1a3c4d5e6",
  "milestones": [
    {
      "title": "Homepage Design",
      "description": "Design and prototyping for homepage",
      "amount": 500,
      "dueDate": "2024-03-15"
    },
    {
      "title": "Homepage Development",
      "description": "Build responsive homepage",
      "amount": 1000,
      "dueDate": "2024-04-15"
    }
  ]
}
```

**Validation Rules:**
- ✅ User must be the contract client
- ✅ Contract must be fixed-price type
- ✅ Total milestone amount ≤ contract budget
- ✅ Each milestone must have title and amount

**Response (201 Created):**
```json
{
  "status": "success",
  "message": "2 milestones created successfully",
  "data": {
    "milestones": [
      {
        "_id": "66f7a3c1b2d8e1f0a9c8d7e6",
        "contract": "66f7a1c2b4d8e2f1a3c4d5e6",
        "title": "Homepage Design",
        "description": "Design and prototyping for homepage",
        "amount": 500,
        "status": "pending",
        "dueDate": "2024-03-15",
        "escrow": {
          "isHeld": false,
          "heldAmount": 0,
          "paymentReleased": false
        },
        "submission": {
          "submittedAt": null,
          "submittedBy": null
        },
        "approval": {
          "approvedAt": null,
          "approvedBy": null
        },
        "statusHistory": [
          {
            "status": "pending",
            "changedAt": "2024-02-20T10:00:00Z",
            "changedBy": "66f7a0c1b2d8e1f0a9c8d7e5"
          }
        ]
      }
    ],
    "socketHint": {
      "note": "For real-time milestone updates, both client and freelancer should emit socket event 'contract:join'",
      "contractId": "66f7a1c2b4d8e2f1a3c4d5e6",
      "example": "socket.emit('contract:join', '66f7a1c2b4d8e2f1a3c4d5e6')"
    }
  }
}
```

**Socket Events:**
- 📢 Triggered: `notifyUser` to freelancer via `user:freelancerId` room

---

### 2.2 Get Milestones

**Endpoint:** `GET /api/milestones?contractId=xxx`

**Authentication:** Required (Client or Freelancer)

**Query Parameters:**
- `contractId` (required): The contract ID to fetch milestones for

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "milestones": [
      {
        "_id": "66f7a3c1b2d8e1f0a9c8d7e6",
        "contract": {...},
        "title": "Homepage Design",
        "amount": 500,
        "status": "submitted",
        "submission": {
          "submittedAt": "2024-02-21T14:30:00Z",
          "submittedBy": {...},
          "description": "Homepage design mockups completed",
          "attachments": ["mockup-v1.pdf", "mockup-v2.pdf"]
        },
        "statusHistory": [...]
      }
    ],
    "progressStats": {
      "total": 2,
      "completed": 0,
      "inReview": 1,
      "pending": 1,
      "percentComplete": 50,
      "totalBudget": 1500,
      "spentSoFar": 500,
      "remaining": 1000
    }
  }
}
```

---

### 2.3 Get Single Milestone

**Endpoint:** `GET /api/milestones/:id`

**Authentication:** Required

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "milestone": {
      "_id": "66f7a3c1b2d8e1f0a9c8d7e6",
      "contract": { /* full contract details */ },
      "title": "Homepage Design",
      "description": "Design homepage mockups",
      "amount": 500,
      "status": "submitted",
      "dueDate": "2024-03-15",
      "submission": {
        "submittedAt": "2024-02-21T14:30:00Z",
        "submittedBy": { /* freelancer details */ },
        "description": "Completed 3 design variations",
        "attachments": ["mockup1.pdf", "mockup2.pdf", "mockup3.pdf"],
        "submissionNotes": "Ready for review"
      },
      "approval": {
        "approvedAt": null,
        "approvedBy": null,
        "feedback": null,
        "revisionRequested": false,
        "revisionNotes": null
      },
      "escrow": {
        "isHeld": true,
        "heldAmount": 500,
        "heldAt": "2024-02-20T10:00:00Z",
        "paymentReleased": false
      },
      "payment": {
        "paymentId": null,
        "stripeTransferId": null,
        "platformFee": 0,
        "netAmount": 0,
        "paidAt": null
      },
      "statusHistory": [...]
    }
  }
}
```

---

### 2.4 Submit Milestone Work

**Endpoint:** `POST /api/milestones/:id/submit`

**Authentication:** Required (Freelancer only)

**Request Body:**
```json
{
  "description": "Design mockups completed for homepage review",
  "attachments": [
    "designs/mockup-desktop.pdf",
    "designs/mockup-mobile.pdf",
    "designs/design-notes.docx"
  ],
  "notes": "Used Figma for design, exported as PDF. Mobile responsive."
}
```

**Validation Rules:**
- ✅ User must be the contract freelancer
- ✅ Milestone must be in 'pending' status (or resubmitted after revision)
- ✅ Description is required
- ✅ Attachments are optional

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Milestone work submitted successfully",
  "data": {
    "milestone": {
      "_id": "66f7a3c1b2d8e1f0a9c8d7e6",
      "status": "submitted",
      "submission": {
        "submittedAt": "2024-02-21T14:30:00Z",
        "submittedBy": "66f7a1c2b4d8e2f1a3c4d5e7",
        "description": "Design mockups completed...",
        "attachments": ["designs/mockup-desktop.pdf", ...],
        "submissionNotes": "Used Figma..."
      },
      "statusHistory": [
        {
          "status": "submitted",
          "changedAt": "2024-02-21T14:30:00Z",
          "changedBy": "66f7a1c2b4d8e2f1a3c4d5e7"
        }
      ]
    }
  }
}
```

**Socket Events:**
- 📢 `broadcastMilestoneStatusChange`: Broadcast to `contract:contractId` room
- 📢 `notifyUser`: Personal notification to client

---

### 2.5 Approve Milestone Work

**Endpoint:** `POST /api/milestones/:id/approve`

**Authentication:** Required (Client only)

**Request Body:**
```json
{
  "feedback": "Great work! Designs look clean and match our requirements.",
  "revisionRequested": false,
  "revisionNotes": null
}
```

OR (with revision request):

```json
{
  "feedback": "Good starting point, but needs some adjustments",
  "revisionRequested": true,
  "revisionNotes": "Please reduce font size for mobile view and adjust color scheme to match brand guidelines"
}
```

**Validation Rules:**
- ✅ User must be the contract client
- ✅ Milestone must be in 'submitted' status
- ✅ Cannot approve if already paid

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Milestone approved. Payment will be released shortly.",
  "data": {
    "milestone": {
      "_id": "66f7a3c1b2d8e1f0a9c8d7e6",
      "status": "approved",
      "approval": {
        "approvedAt": "2024-02-22T10:00:00Z",
        "approvedBy": "66f7a1c2b4d8e2f1a3c4d5e6",
        "feedback": "Great work! Designs look clean...",
        "revisionRequested": false,
        "revisionNotes": null
      }
    },
    "requiresRevision": false,
    "readyForPayment": true
  }
}
```

**Response (Revision Requested):**
```json
{
  "status": "success",
  "message": "Revision requested",
  "data": {
    "milestone": {
      "_id": "66f7a3c1b2d8e1f0a9c8d7e6",
      "status": "rejected",
      "approval": {
        "approvedAt": null,
        "revisionRequested": true,
        "revisionNotes": "Please reduce font size for mobile view..."
      }
    },
    "requiresRevision": true
  }
}
```

**Socket Events:**
- 📢 `broadcastMilestoneStatusChange`: Broadcast to `contract:contractId` room
- 📢 `notifyUser`: Personal notification to freelancer

---

### 2.6 Release Milestone Payment

**Endpoint:** `POST /api/milestones/:id/release-payment`

**Authentication:** Required (Client triggers)

**Request Body:**
```json
{}
```

**Validation Rules:**
- ✅ User must be the contract client
- ✅ Milestone must be in 'approved' status
- ✅ Cannot release if already paid (paymentReleased flag check)

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Payment released successfully",
  "data": {
    "milestone": {
      "_id": "66f7a3c1b2d8e1f0a9c8d7e6",
      "status": "paid",
      "escrow": {
        "isHeld": false,
        "paymentReleased": true,
        "releasedAt": "2024-02-22T11:00:00Z"
      },
      "payment": {
        "paymentId": "pay_1234567890",
        "stripeTransferId": "tr_1234567890",
        "platformFee": 50,
        "netAmount": 450,
        "paidAt": "2024-02-22T11:00:00Z"
      }
    },
    "payment": {
      "_id": "66f7a4c1b2d8e1f0a9c8d7e7",
      "type": "milestone_release",
      "milestone": "66f7a3c1b2d8e1f0a9c8d7e6",
      "amount": 500,
      "platformFee": 50,
      "netAmount": 450,
      "status": "completed"
    },
    "released": {
      "grossAmount": 500,
      "platformFee": 50,
      "netAmount": 450
    }
  }
}
```

**Socket Events:**
- 📢 `broadcastMilestoneStatusChange`: Broadcast to `contract:contractId` room
- 📢 `broadcastMilestonePaymentReleased`: Broadcast to `user:freelancerId` room

---

### 2.7 Get Contract Progress

**Endpoint:** `GET /api/milestones/contract/:contractId/progress`

**Authentication:** Required

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "progress": {
      "contractId": "66f7a1c2b4d8e2f1a3c4d5e6",
      "totalMilestones": 3,
      "completedMilestones": 1,
      "inReviewMilestones": 1,
      "pendingMilestones": 1,
      "percentComplete": 33.33,
      "totalBudget": 1500,
      "releasedFunds": 500,
      "pendingFunds": 1000,
      "milestones": [
        {
          "title": "Homepage Design",
          "amount": 500,
          "status": "paid",
          "releasedAt": "2024-02-22T11:00:00Z"
        },
        {
          "title": "Homepage Development",
          "amount": 1000,
          "status": "submitted"
        },
        {
          "title": "Testing & QA",
          "amount": 0,
          "status": "pending"
        }
      ]
    }
  }
}
```

---

## 3. Socket.io Real-Time Updates

### 3.1 Joining Contract Room

**Purpose:** Subscribe to real-time milestone updates for a specific contract

**Event:** `contract:join`

**Frontend Usage:**
```javascript
// When viewing a contract, join the room
socket.emit('contract:join', contractId);

// Listen for success
socket.on('contract:joined', (data) => {
  console.log('Joined contract room:', data.contractId);
});

// Listen for errors
socket.on('contract:join-error', (data) => {
  console.error('Failed to join contract:', data.message);
});
```

### 3.2 Milestone Status Changes

**Event:** `milestone:status-changed`

**Emitted to:** `contract:contractId` room

**Payload:**
```json
{
  "status": "success",
  "event": "milestone:status-changed",
  "data": {
    "milestoneId": "66f7a3c1b2d8e1f0a9c8d7e6",
    "contractId": "66f7a1c2b4d8e2f1a3c4d5e6",
    "newStatus": "approved",
    "title": "Homepage Design",
    "amount": 500,
    "changedAt": "2024-02-22T10:00:00Z",
    "changedBy": "66f7a1c2b4d8e2f1a3c4d5e6",
    "message": "Milestone: Homepage Design approved"
  },
  "timestamp": "2024-02-22T10:00:00Z"
}
```

**Frontend Listener:**
```javascript
socket.on('milestone:status-changed', (data) => {
  console.log(`Milestone ${data.data.title} is now ${data.data.newStatus}`);
  // Update UI, refresh milestone list, etc.
});
```

### 3.3 Payment Released

**Event:** `milestone:payment-released`

**Emitted to:** `user:freelancerId` room

**Payload:**
```json
{
  "status": "success",
  "event": "milestone:payment-released",
  "data": {
    "milestoneId": "66f7a3c1b2d8e1f0a9c8d7e6",
    "contractId": "66f7a1c2b4d8e2f1a3c4d5e6",
    "grossAmount": 500,
    "netAmount": 450,
    "platformFee": 50,
    "title": "Homepage Design",
    "paidAt": "2024-02-22T11:00:00Z"
  },
  "timestamp": "2024-02-22T11:00:00Z"
}
```

**Frontend Listener:**
```javascript
socket.on('milestone:payment-released', (data) => {
  console.log(`Payment of $${data.data.netAmount} received for ${data.data.title}`);
  // Update earnings, show notification, etc.
});
```

### 3.4 Leaving Contract Room

**Event:** `contract:leave`

**Frontend Usage:**
```javascript
// When leaving contract view
socket.emit('contract:leave', contractId);

socket.on('contract:left', (data) => {
  console.log('Left contract room:', data.contractId);
});
```

---

## 4. Security & Authorization

### 4.1 Role-Based Access

| Operation | Client | Freelancer | Admin |
|-----------|--------|------------|-------|
| Create milestones | ✅ | ❌ | ✅ |
| View milestones | ✅ | ✅ | ✅ |
| Submit work | ❌ | ✅ | ✅ |
| Approve work | ✅ | ❌ | ✅ |
| Release payment | ✅ | ❌ | ✅ |
| View progress | ✅ | ✅ | ✅ |

### 4.2 Double-Payment Prevention

**Mechanism:** `escrow.paymentReleased` boolean flag

**Flow:**
```javascript
// In releaseEscrowFunds():
if (milestone.escrow.paymentReleased) {
  throw new Error('Funds have already been released');
}

// Set flag after payment release
milestone.escrow.paymentReleased = true;
await milestone.save();
```

**Additional Check in Controller:**
```javascript
// Before releasing payment
if (await isAlreadyPaid(milestoneId)) {
  return res.status(400).json({
    status: 'error',
    message: 'Payment has already been released for this milestone'
  });
}
```

### 4.3 Authorization Checks

All milestone endpoints verify:
1. ✅ User is authenticated (JWT token valid)
2. ✅ User has correct role (client/freelancer)
3. ✅ User is part of the contract (client or freelancer)
4. ✅ Milestone status is valid for the operation
5. ✅ No duplicate operations (for payment)

---

## 5. Data Integrity & Validation

### 5.1 Budget Validation

```javascript
// When creating milestones
const totalAmount = milestonesData.reduce((sum, m) => sum + m.amount, 0);
if (totalAmount > contract.budget.amount) {
  throw new Error('Total milestone amount exceeds contract budget');
}
```

### 5.2 Status Transition Validation

```javascript
// Only allow transitions:
// pending → submitted
// submitted → approved OR rejected
// approved → paid
// rejected → submitted (resubmission)

const validTransitions = {
  'pending': ['submitted'],
  'submitted': ['approved', 'rejected'],
  'approved': ['paid'],
  'rejected': ['submitted'],
  'paid': []
};
```

### 5.3 Immutable Fields

Once a milestone is `submitted`, the client cannot modify:
- ✅ Freelancer submission details
- ✅ Submitted attachments

Once a milestone is `approved`, the client cannot modify:
- ✅ Any milestone terms or amounts

---

## 6. Audit Trail

Every milestone change is logged in `statusHistory`:

```json
{
  "statusHistory": [
    {
      "status": "pending",
      "changedAt": "2024-02-20T10:00:00Z",
      "changedBy": "66f7a1c2b4d8e2f1a3c4d5e6"
    },
    {
      "status": "submitted",
      "changedAt": "2024-02-21T14:30:00Z",
      "changedBy": "66f7a1c2b4d8e2f1a3c4d5e7"
    },
    {
      "status": "approved",
      "changedAt": "2024-02-22T10:00:00Z",
      "changedBy": "66f7a1c2b4d8e2f1a3c4d5e6"
    },
    {
      "status": "paid",
      "changedAt": "2024-02-22T11:00:00Z",
      "changedBy": "system"
    }
  ]
}
```

---

## 7. Testing Workflow

### 7.1 Complete Milestone Lifecycle (Happy Path)

```bash
# 1. Create contract (fixed-price: $1500)
POST /api/contracts
{
  "type": "fixed",
  "amount": 1500,
  ...
}

# 2. Create milestones
POST /api/milestones
{
  "contractId": "contract123",
  "milestones": [
    { "title": "Design", "amount": 500 },
    { "title": "Development", "amount": 1000 }
  ]
}

# 3. Freelancer submits work
POST /api/milestones/milestone123/submit
{
  "description": "Designs completed",
  "attachments": ["design.pdf"]
}

# 4. Client approves
POST /api/milestones/milestone123/approve
{
  "feedback": "Looks great!",
  "revisionRequested": false
}

# 5. Release payment
POST /api/milestones/milestone123/release-payment

# 6. Verify payment
GET /api/milestones/milestone123
# Returns status: "paid", paymentReleased: true
```

### 7.2 Revision Workflow

```bash
# 1-2. (Same as above)

# 3. Client requests revision
POST /api/milestones/milestone123/approve
{
  "feedback": "Good but needs adjustments",
  "revisionRequested": true,
  "revisionNotes": "Only adjust font size"
}

# 4. Milestone now in 'rejected' status
# Freelancer gets notified via socket: milestone:status-changed

# 5. Freelancer resubmits
POST /api/milestones/milestone123/submit
{
  "description": "Updated designs with font adjustment",
  "attachments": ["design-v2.pdf"]
}

# 6. Client approves again
POST /api/milestones/milestone123/approve
{
  "feedback": "Perfect!",
  "revisionRequested": false
}

# 7. Release payment (same as above)
```

### 7.3 Double-Payment Prevention Test

```bash
# 1-5. (Complete milestone)

# 6. Try to release payment again
POST /api/milestones/milestone123/release-payment

# Returns:
# {
#   "status": "error",
#   "message": "Payment has already been released for this milestone"
# }
```

---

## 8. Error Handling

### 8.1 Common Error Codes

| HTTP | Error | Cause |
|------|-------|-------|
| 400 | Budget exceeded | Total milestones > contract budget |
| 400 | Invalid status | Milestone not in required status |
| 400 | Already paid | Payment already released (double-payment) |
| 403 | Unauthorized | User not part of contract |
| 404 | Not found | Milestone/contract doesn't exist |
| 500 | Server error | Unexpected error |

### 8.2 Error Response Format

```json
{
  "status": "error",
  "message": "Descriptive error message",
  "errorCode": "SPECIFIC_ERROR",
  "details": {
    "field": "specific details about error"
  }
}
```

---

## 9. Production Considerations

### 9.1 Stripe Integration Checklist

- [ ] Test with Stripe test mode
- [ ] Implement webhook signature verification
- [ ] Handle payment_intent.succeeded webhooks
- [ ] Store Stripe transfer IDs for reconciliation
- [ ] Implement retry logic for failed transfers
- [ ] Add logging for transaction tracking
- [ ] Validate Stripe account IDs for freelancers

### 9.2 Monitoring & Logging

- [ ] Log all milestone status changes
- [ ] Track payment release timestamps
- [ ] Monitor escrow balance discrepancies
- [ ] Alert on double-payment attempts
- [ ] Set up dashboards for payment metrics

### 9.3 Compliance

- [ ] Store audit trails for dispute resolution
- [ ] Implement refund workflow (on contract cancellation)
- [ ] Comply with payment processor requirements
- [ ] Generate payment statements for tax purposes
- [ ] Ensure GDPR compliance for EU users

---

## 10. Frontend Integration Example

```javascript
// React component example
import { useSocket } from '@/hooks/useSocket';
import { useMilestones } from '@/hooks/useMilestones';

export function MilestoneWorkflow({ contractId }) {
  const socket = useSocket();
  const { milestones, submitWork, approveMilestone, releasePayment } = useMilestones();

  useEffect(() => {
    // Join contract room for real-time updates
    socket.emit('contract:join', contractId);

    // Listen for real-time updates
    socket.on('milestone:status-changed', (data) => {
      console.log('Milestone updated:', data.data);
      // Refresh milestone list
      refreshMilestones();
    });

    return () => {
      socket.emit('contract:leave', contractId);
      socket.off('milestone:status-changed');
    };
  }, [contractId]);

  const handleSubmitWork = async (milestoneId, submission) => {
    await submitWork(milestoneId, submission);
    // Socket event will trigger UI update
  };

  const handleApproveMilestone = async (milestoneId) => {
    await approveMilestone(milestoneId, { revisionRequested: false });
    // Socket event will trigger UI update
  };

  const handleReleasePayment = async (milestoneId) => {
    await releasePayment(milestoneId);
    // Socket event will trigger UI update
  };

  return (
    <div>
      {milestones.map(milestone => (
        <MilestoneCard
          key={milestone._id}
          milestone={milestone}
          onSubmit={handleSubmitWork}
          onApprove={handleApproveMilestone}
          onRelease={handleReleasePayment}
        />
      ))}
    </div>
  );
}
```

---

## 11. FAQ

**Q: What happens if a freelancer fails to submit work?**
A: The client can manually reject the milestone, resetting it to 'pending' so the freelancer can resubmit.

**Q: Can milestones be modified after creation?**
A: No. Once created, milestone terms are immutable. To change amounts, the contract must be renegotiated.

**Q: How long can a client take to approve work?**
A: There's no time limit currently. Consider adding SLAs in future versions.

**Q: What if a dispute occurs during a milestone?**
A: Contact support for manual intervention. Escalate to dispute system if needed.

**Q: Are platform fees deducted automatically?**
A: Yes, using the platformFeePercent (default 10%) during payment release.

**Q: Can freelancers see how much they'll receive after fees?**
A: Yes, in the milestone details the netAmount is calculated and shown.

---

## 12. Troubleshooting

### Real-time updates not working?
- ✅ Verify client called `socket.emit('contract:join', contractId)`
- ✅ Check browser console for socket connection errors
- ✅ Verify backend socket events are being emitted (check console logs)

### Payment release fails?
- ✅ Verify milestone status is 'approved'
- ✅ Check paymentReleased flag isn't already true
- ✅ Verify user is the contract client
- ✅ Check Stripe account is configured (in production)

### Budget validation errors?
- ✅ Verify total milestones ≤ contract budget
- ✅ Check contract budget type is 'fixed'

### Authorization errors?
- ✅ Verify JWT token is valid
- ✅ Confirm user is part of the contract
- ✅ Check user role matches required role

---

**Last Updated:** February 2024  
**Version:** 1.0  
**Author:** Freelancer Platform Team
