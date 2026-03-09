# Dispute Resolution System

## Overview

The Dispute Resolution System provides a structured workflow for resolving conflicts between clients and freelancers. When a dispute is raised, the contract's escrow payment is automatically frozen, preventing any fund transfers until the dispute is resolved or rejected by an administrator.

**Key Features:**
- Automatic escrow freezing on dispute creation
- Evidence submission by both parties
- Admin-only dispute resolution with multiple outcome types
- Access control - only involved parties can view disputes
- Comprehensive audit trail with timestamps
- Statistics and analytics for admin dashboard

---

## Core Concepts

### Dispute Lifecycle

```
┌─────────────┐
│    OPEN     │  ← Dispute created, escrow FROZEN
└──────┬──────┘
       │
       ├──→ Admin Reviews
       │    (with evidence)
       │
       ├──────────────────────────────────────────────────┐
       │                                                  │
   ┌───▼──────────────┐                          ┌───────▼──────┐
   │    RESOLVED      │                          │   REJECTED   │
   │ (escrow released)│                          │(escrow freed) │
   └──────────────────┘                          └──────────────┘
```

### Escrow Freezing Mechanism

When a dispute is raised:

1. **Dispute Created** - New dispute document created with `status: 'open'`
2. **Escrow Frozen** - Associated contract payment record is immediately frozen:
   - `payment.frozen = true`
   - `payment.frozenReason = 'dispute_opened'`
   - `payment.frozenAt = <current timestamp>`
   - **No payment can be released while frozen**

When dispute is resolved or rejected:

3. **Escrow Unfrozen** - Associated payment unfrozen:
   - `payment.frozen = false`
   - `payment.frozenAt = null`
   - **Payment can now be released** based on resolution outcome

### Evidence Array

Evidence is embedded within the dispute document. Each evidence item contains:

```javascript
{
  uploadedBy: ObjectId,        // User ID of uploader
  title: String,               // Evidence title (required)
  description: String,         // Detailed description
  fileUrl: String,             // URL to uploaded file (required)
  fileName: String,            // Original filename
  fileSize: Number,            // File size in bytes
  fileType: String,            // MIME type
  uploadedAt: Date             // Auto-populated timestamp
}
```

**Rules:**
- Only involved parties (client or freelancer) can add evidence
- Evidence can only be added while dispute is `open`
- Both parties can submit multiple pieces of evidence
- Evidence is immutable once added

### Resolution Outcomes

Administrators can resolve disputes using one of four outcomes:

#### 1. `refund-client`
- Refunds escrow to client
- Contract is marked with dispute outcome
- Payment status: `'refunded'`
- Use case: Client's work wasn't delivered

#### 2. `approve-freelancer`
- Releases escrow to freelancer
- Contract marked as completed
- Payment status: `'completed'`
- Use case: Freelancer work was acceptable despite client claim

#### 3. `split-payment`
- Splits escrow between client and freelancer
- Manual split amounts required in resolution notes
- Payment status: `'custom-handling'`
- Use case: Partial refund or shared responsibility

#### 4. `custom`
- Custom resolution handling
- Admin describes resolution in notes
- Payment status: `'custom-handling'`
- Use case: Complex scenarios needing custom logic

---

## Data Model

### Dispute Schema

```javascript
{
  _id: ObjectId,
  contract: ObjectId,          // Reference to Contract
  client: ObjectId,            // Contract client ID
  freelancer: ObjectId,        // Contract freelancer ID
  raisedBy: ObjectId,          // User who raised dispute (client/freelancer)
  
  // Dispute Details
  reason: String,              // Dispute reason (min 10 chars, required)
  description: String,         // Detailed description
  status: String,              // 'open' | 'resolved' | 'rejected'
  
  // Evidence
  evidence: [
    {
      uploadedBy: ObjectId,
      title: String,
      description: String,
      fileUrl: String,
      fileName: String,
      fileSize: Number,
      fileType: String,
      uploadedAt: Date
    }
  ],
  
  // Escrow Freezing
  escrowFrozen: Boolean,       // true if escrow is frozen
  frozenAt: Date,              // When escrow was frozen
  unfrozenAt: Date,            // When escrow was unfrozen
  
  // Resolution
  status: String,              // 'open' | 'resolved' | 'rejected'
  resolutionNotes: String,     // Admin notes on resolution
  resolvingReason: String,     // 'refund-client' | 'approve-freelancer' | 'split-payment' | 'custom'
  resolvedBy: ObjectId,        // Admin user ID
  resolvedAt: Date,            // Resolution timestamp
  
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes for Performance

```javascript
// Query optimization indexes
- (contract, status)           // Get disputes by contract and status
- (contract, raisedBy)         // Find specific user's dispute on contract
- (raisedBy, createdAt DESC)   // User's disputes timeline
- (status, createdAt DESC)     // Admin queue by status
- (escrowFrozen)               // Find all frozen escrows
- (resolvedAt DESC)            // Admin resolution history
```

---

## API Endpoints

### User Endpoints (Protected - requires authentication)

#### 1. Create Dispute
```
POST /api/disputes
Content-Type: application/json
Authorization: Bearer <token>

{
  "contractId": "507f1f77bcf86cd799439011",
  "reason": "Freelancer did not deliver quality work as specified"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Escrow has been frozen",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "contract": "507f1f77bcf86cd799439011",
    "raisedBy": "507f1f77bcf86cd799439001",
    "status": "open",
    "reason": "Freelancer did not deliver quality work as specified",
    "escrowFrozen": true,
    "frozenAt": "2024-01-15T10:30:00Z",
    "evidence": [],
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Validations:**
- `contractId` required and must be valid MongoDB ObjectId
- `reason` required, minimum 10 characters
- User must be client or freelancer on contract
- Only one open dispute allowed per contract
- Contract must exist

**Error Responses:**
- 400: Validation error (missing/invalid fields)
- 400: User not involved in contract
- 400: Contract already has open dispute
- 404: Contract not found

---

#### 2. Add Evidence to Dispute
```
POST /api/disputes/:id/evidence
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Screenshot of incomplete work",
  "description": "Shows the sidebar component was never implemented",
  "fileUrl": "https://storage.example.com/evidence/screenshot.png",
  "fileName": "screenshot.png",
  "fileSize": 245000,
  "fileType": "image/png"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "evidence": [
      {
        "uploadedBy": "507f1f77bcf86cd799439001",
        "title": "Screenshot of incomplete work",
        "description": "Shows the sidebar component was never implemented",
        "fileUrl": "https://storage.example.com/evidence/screenshot.png",
        "fileName": "screenshot.png",
        "fileSize": 245000,
        "fileType": "image/png",
        "uploadedAt": "2024-01-15T11:45:00Z"
      }
    ]
  }
}
```

**Validations:**
- User must be involved in dispute (client or freelancer)
- Dispute must be in `open` status
- `title` required
- `fileUrl` required
- All file metadata optional but recommended

**Error Responses:**
- 400: Validation error
- 403: User not involved in dispute
- 404: Dispute not found

---

#### 3. Get My Disputes
```
GET /api/disputes?page=1&limit=10
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "disputes": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "contract": "507f1f77bcf86cd799439011",
        "raisedBy": "507f1f77bcf86cd799439001",
        "status": "open",
        "reason": "Freelancer did not deliver quality work",
        "escrowFrozen": true,
        "evidence": [],
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "total": 5,
      "page": 1,
      "pages": 1,
      "limit": 10
    }
  }
}
```

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 10) - Results per page

**Notes:**
- Returns disputes where user is client or freelancer
- Sorted by creation date (newest first)

---

#### 4. Get Specific Dispute
```
GET /api/disputes/:id
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "contract": {
      "_id": "507f1f77bcf86cd799439011",
      "title": "React Dashboard Project",
      "amount": 5000
    },
    "client": {
      "_id": "507f1f77bcf86cd799439001",
      "name": "John Client",
      "avatar": "https://..."
    },
    "freelancer": {
      "_id": "507f1f77bcf86cd799439002",
      "name": "Jane Dev",
      "avatar": "https://..."
    },
    "raisedBy": "507f1f77bcf86cd799439001",
    "status": "open",
    "reason": "Freelancer did not deliver quality work",
    "description": "Components are not responsive and have bugs",
    "evidence": [
      {
        "uploadedBy": "507f1f77bcf86cd799439001",
        "title": "Screenshot of incomplete work",
        "fileUrl": "https://...",
        "uploadedAt": "2024-01-15T11:45:00Z"
      }
    ],
    "escrowFrozen": true,
    "frozenAt": "2024-01-15T10:30:00Z",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Error Responses:**
- 403: User not involved in dispute (not client, freelancer, or admin)
- 404: Dispute not found

---

### Admin Endpoints (Protected - requires authentication, TODO: admin role validation)

#### 5. Get Open Disputes (Admin Queue)
```
GET /api/admin/disputes/open?page=1&limit=20
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "disputes": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "contract": {
          "_id": "507f1f77bcf86cd799439011",
          "title": "React Dashboard Project",
          "amount": 5000
        },
        "raisedBy": "507f1f77bcf86cd799439001",
        "status": "open",
        "reason": "Freelancer did not deliver quality work",
        "evidence": [
          {
            "uploadedBy": "507f1f77bcf86cd799439001",
            "title": "Evidence screenshot"
          }
        ],
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "total": 15,
      "page": 1,
      "pages": 1,
      "limit": 20
    }
  }
}
```

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 20)

**Notes:**
- Only returns disputes with `status: 'open'`
- Sorted by creation date (newest first)
- Used for admin dispute resolution dashboard

---

#### 6. Get Resolved Disputes (Admin History)
```
GET /api/admin/disputes/resolved?page=1&limit=20
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "disputes": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "contract": "507f1f77bcf86cd799439011",
        "status": "resolved",
        "resolutionNotes": "Freelancer work was acceptable despite client concerns",
        "resolvingReason": "approve-freelancer",
        "resolvedBy": "507f1f77bcf86cd799439099",
        "resolvedAt": "2024-01-16T14:20:00Z"
      }
    ],
    "pagination": {
      "total": 42,
      "page": 1,
      "pages": 3,
      "limit": 20
    }
  }
}
```

**Notes:**
- Returns disputes with `status: 'resolved'` OR `status: 'rejected'`
- Sorted by resolution date (newest first)
- Used for audit trail and historical data

---

#### 7. Get Dispute Statistics
```
GET /api/admin/disputes/stats
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "total": 52,
    "open": 8,
    "resolved": 40,
    "rejected": 4,
    "frozenEscrows": 8,
    "avgResolutionTimeHours": 48.5,
    "resolutionRate": 84.6
  }
}
```

**Fields:**
- `total` - Total disputes in system
- `open` - Currently open disputes awaiting resolution
- `resolved` - Disputes with resolution outcome
- `rejected` - Disputes marked as invalid/rejected
- `frozenEscrows` - Number of escrows currently frozen
- `avgResolutionTimeHours` - Average time from open to resolved
- `resolutionRate` - Percentage of disputes resolved/rejected vs total

---

#### 8. Resolve Dispute
```
PATCH /api/disputes/:id/resolve
Content-Type: application/json
Authorization: Bearer <token>

{
  "resolution": "approve-freelancer",
  "resolutionNotes": "Evidence review shows freelancer fulfilled all requirements. Client initiated dispute without cause."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Escrow has been unfrozen",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "status": "resolved",
    "resolvingReason": "approve-freelancer",
    "resolutionNotes": "Evidence review shows freelancer fulfilled all requirements...",
    "resolvedBy": "507f1f77bcf86cd799439099",
    "resolvedAt": "2024-01-16T14:20:00Z",
    "escrowFrozen": false,
    "unfrozenAt": "2024-01-16T14:20:00Z"
  }
}
```

**Request Body:**
- `resolution` (required) - One of: `'refund-client'`, `'approve-freelancer'`, `'split-payment'`, `'custom'`
- `resolutionNotes` (optional) - Admin's explanation of decision (max 3000 chars)

**Side Effects:**
1. Dispute status changed to `'resolved'`
2. Escrow unfrozen - payment can now be released
3. Payment status updated based on resolution type:
   - `refund-client` → payment status `'refunded'`
   - `approve-freelancer` → payment status `'completed'`
   - `split-payment` → payment status `'custom-handling'`
   - `custom` → payment status `'custom-handling'`
4. Contract updated with dispute outcome

**Error Responses:**
- 400: Dispute not in `open` status
- 400: Invalid resolution type
- 404: Dispute not found

---

#### 9. Reject Dispute
```
PATCH /api/disputes/:id/reject
Content-Type: application/json
Authorization: Bearer <token>

{
  "resolutionNotes": "Dispute lacks sufficient evidence. Client must provide proof of non-delivery."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "status": "rejected",
    "resolutionNotes": "Dispute lacks sufficient evidence...",
    "resolvedBy": "507f1f77bcf86cd799439099",
    "resolvedAt": "2024-01-16T14:20:00Z",
    "escrowFrozen": false,
    "unfrozenAt": "2024-01-16T14:20:00Z"
  }
}
```

**Request Body:**
- `resolutionNotes` (optional) - Reason for rejection

**Side Effects:**
1. Dispute status changed to `'rejected'` (distinct from resolution)
2. Escrow unfrozen - normal payment release resumes
3. Contract status returned to `'completed'`
4. Payment can proceed without special handling

**Note:** Rejection differs from resolution in that it invalidates the dispute entirely.

---

## Workflow Examples

### Example 1: Client Request Refund
```
Client Job Status: Completed (payment in escrow)
             ↓
Client Raises Dispute
  - reason: "Freelancer did not follow specifications"
  - Escrow FROZEN automatically
             ↓
Both Parties Submit Evidence
  - Client: Screenshots showing issues
  - Freelancer: Messages proving specification was clear
             ↓
Admin Reviews at GET /api/admin/disputes/open
             ↓
Admin Resolves: "approve-freelancer"
  - Escrow UNFROZEN
  - Payment status: 'completed'
  - Funds released to freelancer
```

### Example 2: Freelancer Requests Help
```
Freelancer Job Status: Completed (payment in escrow)
             ↓
Freelancer Raises Dispute
  - reason: "Client refusing to mark job complete"
  - Escrow FROZEN automatically
             ↓
Freelancer Submits Evidence
  - Proof of delivery
  - Project screenshots
             ↓
Admin Reviews Case
             ↓
Admin Resolves: "approve-freelancer"
  - Escrow UNFROZEN
  - Payment status: 'completed'
  - Funds released to freelancer
  - Contract marked complete
```

### Example 3: Partial Refund Scenario
```
Contract Dispute Opened
  - Escrow FROZEN
             ↓
Evidence Submitted
             ↓
Admin Reviews: Work partially complete
             ↓
Admin Resolves: "split-payment"
  - Escrow UNFROZEN
  - Payment status: 'custom-handling'
  - Admin notes: "50% to freelancer, 50% to client"
  - Manual split processed
```

---

## Security Features

### Authorization

1. **User Endpoint Access:**
   - Only authenticated users can raise disputes
   - Only contract parties (client/freelancer) can view their disputes
   - `getDispute()` validates via `isUserInvolved(userId)`
   - Returns 403 Forbidden if unauthorized

2. **Admin Endpoint Access:**
   - All admin endpoints have `TODO: Add admin role check` (when User model has role field)
   - Currently protected with `protect` middleware (requires login)
   - Must implement role-based access control

3. **Evidence Submission:**
   - Only involved parties can add evidence
   - `canUserAddEvidence(userId)` validates both conditions:
     - User is involved in dispute
     - Dispute status is 'open'

### Data Integrity

1. **Escrow Freezing:**
   - Automatic on dispute creation
   - Prevents any payment release while frozen
   - Payment model checks `frozen` flag before release

2. **Immutable Records:**
   - Evidence cannot be modified after submission
   - Timestamps auto-recorded: `uploadedAt`, `frozenAt`, `resolvedAt`
   - Admin actions recorded: `resolvedBy` audit trail

3. **Status Flow:**
   - Only 'open' disputes can be resolved/rejected
   - No transition back to 'open' from 'resolved'/'rejected'
   - Prevents duplicate resolutions

---

## Integration Points

### Frontend Dashboard

**Client/Freelancer View:**
```javascript
// Get my disputes
GET /api/disputes

// View specific dispute with evidence
GET /api/disputes/:id

// Add evidence
POST /api/disputes/:id/evidence
```

**Admin Dashboard:**
```javascript
// Open disputes queue
GET /api/admin/disputes/open

// Historical resolutions
GET /api/admin/disputes/resolved

// Dashboard metrics
GET /api/admin/disputes/stats
```

### Payment System Integration

When dispute is closed, payment system checks:
```javascript
if (payment.frozen && payment.disputeId) {
  // Cannot release payment
  throw new Error('Payment is frozen due to open dispute');
}

// After dispute resolution:
if (!payment.frozen) {
  // Process payment release based on status
  switch (payment.status) {
    case 'refunded': return releaseToClient();
    case 'completed': return releaseToFreelancer();
    case 'custom-handling': return awaitAdminAction();
  }
}
```

### Contract System Integration

Disputes reference contracts:
```javascript
{
  contract: contractId,      // Link to contract
  client: contract.client,
  freelancer: contract.freelancer,
  status: 'open',            // Parallel to contract
  ...
}
```

---

## Error Handling

Common error scenarios and responses:

| Scenario | Status | Error |
|----------|--------|-------|
| Missing contractId | 400 | "contractId is required" |
| Invalid contractId format | 400 | "Invalid contract ID format" |
| Contract not found | 404 | "Contract not found" |
| User not involved in contract | 400 | "You are not involved in this contract" |
| Existing open dispute | 400 | "This contract already has an open dispute" |
| Reason too short | 400 | "Reason must be at least 10 characters" |
| User not involved in dispute | 403 | "You are not involved in this dispute" |
| Dispute not found | 404 | "Dispute not found" |
| Adding evidence to resolved dispute | 400 | "Cannot add evidence to a resolved dispute" |
| Invalid resolution type | 400 | "Invalid resolution type" |

---

## Testing Checklist

- [ ] Create dispute with valid contract
- [ ] Verify escrow frozen immediately
- [ ] Add evidence by both parties
- [ ] Retrieve dispute with access control
- [ ] Admin resolves with refund outcome
- [ ] Verify escrow unfrozen after resolution
- [ ] Check payment status updated correctly
- [ ] Verify rejected disputes unfreeze escrow
- [ ] Test pagination on admin endpoints
- [ ] Verify dispute stats accuracy
- [ ] Test authorization on protected endpoints
- [ ] Verify error messages are clear

---

## Future Enhancements

1. **Automatic Resolution:** Implement timeout-based automatic resolution
2. **Escalation:** Multi-tier review process for complex disputes
3. **Mediation:** Third-party mediator involvement workflow
4. **Appeals:** Allow parties to appeal resolution within timeframe
5. **Notifications:** Real-time notifications for all dispute events
6. **Analytics:** Dispute pattern detection and reporting
7. **Webhook Events:** Notify external systems of status changes
