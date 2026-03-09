# Dispute Resolution API - Quick Reference

## Quick Navigation

| Purpose | Method | Endpoint | Auth |
|---------|--------|----------|------|
| Create Dispute | POST | `/api/disputes` | ✓ |
| Add Evidence | POST | `/api/disputes/:id/evidence` | ✓ |
| Get My Disputes | GET | `/api/disputes` | ✓ |
| Get Dispute Details | GET | `/api/disputes/:id` | ✓ |
| Get Open Disputes | GET | `/api/admin/disputes/open` | ✓ Admin |
| Get Resolved Disputes | GET | `/api/admin/disputes/resolved` | ✓ Admin |
| Get Statistics | GET | `/api/admin/disputes/stats` | ✓ Admin |
| Resolve Dispute | PATCH | `/api/disputes/:id/resolve` | ✓ Admin |
| Reject Dispute | PATCH | `/api/disputes/:id/reject` | ✓ Admin |

---

## User Workflows

### 1. Create and Track a Dispute

**JavaScript:**
```javascript
// Step 1: Raise a dispute
const raiseDisputeResponse = await fetch('/api/disputes', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    contractId: '507f1f77bcf86cd799439011',
    reason: 'Freelancer did not deliver quality work as specified'
  })
});

const dispute = await raiseDisputeResponse.json();
console.log(`Dispute created: ${dispute.data._id}`);
console.log(`Status: ${dispute.message}`); // "Escrow has been frozen"

// Step 2: Add evidence (if needed)
const evidenceResponse = await fetch(`/api/disputes/${dispute.data._id}/evidence`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    title: 'Screenshot of incomplete work',
    description: 'The sidebar component was never implemented',
    fileUrl: 'https://storage.example.com/evidence/screenshot.png',
    fileName: 'screenshot.png',
    fileSize: 245000,
    fileType: 'image/png'
  })
});

const updatedDispute = await evidenceResponse.json();
console.log(`Evidence added. Total evidence: ${updatedDispute.data.evidence.length}`);

// Step 3: Check dispute status
const getDisputeResponse = await fetch(`/api/disputes/${dispute.data._id}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const disputeDetails = await getDisputeResponse.json();
console.log(`Current status: ${disputeDetails.data.status}`);
console.log(`Escrow frozen: ${disputeDetails.data.escrowFrozen}`);
```

**cURL:**
```bash
# Raise dispute
curl -X POST http://localhost:5000/api/disputes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "contractId": "507f1f77bcf86cd799439011",
    "reason": "Freelancer did not deliver quality work as specified"
  }'

# Add evidence
curl -X POST http://localhost:5000/api/disputes/507f1f77bcf86cd799439012/evidence \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Screenshot of incomplete work",
    "fileUrl": "https://storage.example.com/screenshot.png"
  }'

# Get dispute details
curl -X GET http://localhost:5000/api/disputes/507f1f77bcf86cd799439012 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. View All My Disputes

**JavaScript:**
```javascript
const response = await fetch('/api/disputes?page=1&limit=10', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const result = await response.json();
result.data.disputes.forEach(dispute => {
  console.log(`${dispute._id}: ${dispute.status} (created ${dispute.createdAt})`);
  console.log(`  Evidence count: ${dispute.evidence.length}`);
  console.log(`  Reason: ${dispute.reason}`);
});

console.log(`\nPage ${result.data.pagination.page} of ${result.data.pagination.pages}`);
```

**cURL:**
```bash
curl -X GET 'http://localhost:5000/api/disputes?page=1&limit=10' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Admin Workflows

### 3. Review and Resolve Disputes

**JavaScript:**
```javascript
// Step 1: Get open disputes
const openResponse = await fetch('/api/admin/disputes/open?page=1&limit=20', {
  headers: { 'Authorization': `Bearer ${adminToken}` }
});

const openDisputes = await openResponse.json();
console.log(`Found ${openDisputes.data.pagination.total} open disputes`);

// Step 2: View specific dispute with full details
const disputeId = openDisputes.data.disputes[0]._id;
const detailResponse = await fetch(`/api/disputes/${disputeId}`, {
  headers: { 'Authorization': `Bearer ${adminToken}` }
});

const dispute = await detailResponse.json();
console.log(`\nDispute Details:`);
console.log(`  Client: ${dispute.data.client.name}`);
console.log(`  Freelancer: ${dispute.data.freelancer.name}`);
console.log(`  Amount: $${dispute.data.contract.amount}`);
console.log(`  Evidence count: ${dispute.data.evidence.length}`);

// Step 3: Admin resolves dispute
const resolveResponse = await fetch(`/api/disputes/${disputeId}/resolve`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  },
  body: JSON.stringify({
    resolution: 'approve-freelancer',
    resolutionNotes: 'Reviewed all evidence. Freelancer fulfilled all contract requirements. Client did not provide evidence of non-delivery.'
  })
});

const resolved = await resolveResponse.json();
console.log(`\n${resolved.message}`); // "Escrow has been unfrozen"
console.log(`Resolution: ${resolved.data.resolvingReason}`);
console.log(`Resolved by: ${resolved.data.resolvedBy}`);
```

**cURL:**
```bash
# Get open disputes
curl -X GET 'http://localhost:5000/api/admin/disputes/open?page=1&limit=20' \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Get dispute details
curl -X GET http://localhost:5000/api/disputes/507f1f77bcf86cd799439012 \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Resolve dispute
curl -X PATCH http://localhost:5000/api/disputes/507f1f77bcf86cd799439012/resolve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{
    "resolution": "approve-freelancer",
    "resolutionNotes": "Freelancer fulfilled all requirements"
  }'
```

### 4. View Dispute Statistics

**JavaScript:**
```javascript
const response = await fetch('/api/admin/disputes/stats', {
  headers: { 'Authorization': `Bearer ${adminToken}` }
});

const stats = await response.json();
const data = stats.data;

console.log(`Dispute Statistics:`);
console.log(`  Total Disputes: ${data.total}`);
console.log(`  Open: ${data.open}`);
console.log(`  Resolved: ${data.resolved}`);
console.log(`  Rejected: ${data.rejected}`);
console.log(`  Frozen Escrows: ${data.frozenEscrows}`);
console.log(`  Avg Resolution Time: ${data.avgResolutionTimeHours} hours`);
console.log(`  Resolution Rate: ${data.resolutionRate}%`);

// Display in dashboard
displayDashboard({
  totalDisputes: data.total,
  openCount: data.open,
  completedCount: data.resolved + data.rejected,
  frozenAmount: data.frozenEscrows,
  avgTime: Math.round(data.avgResolutionTimeHours),
  successRate: data.resolutionRate
});
```

**cURL:**
```bash
curl -X GET http://localhost:5000/api/admin/disputes/stats \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### 5. View Historical Resolutions

**JavaScript:**
```javascript
const response = await fetch('/api/admin/disputes/resolved?page=1&limit=20', {
  headers: { 'Authorization': `Bearer ${adminToken}` }
});

const result = await response.json();
const disputes = result.data.disputes;

console.log(`Resolved Disputes:`);
disputes.forEach(dispute => {
  console.log(`\n  ID: ${dispute._id}`);
  console.log(`  Status: ${dispute.status}`);
  console.log(`  Resolution: ${dispute.resolvingReason}`);
  console.log(`  Resolved: ${new Date(dispute.resolvedAt).toLocaleDateString()}`);
  console.log(`  Notes: ${dispute.resolutionNotes}`);
});
```

---

## Resolution Types Reference

### Outcome: Refund Client
**When to use:** Freelancer failed to deliver or work is unacceptable

**Request:**
```javascript
{
  "resolution": "refund-client",
  "resolutionNotes": "Freelancer failed to deliver the agreed deliverables"
}
```

**Result:**
- Payment refunded to client
- Freelancer receives no funds
- Contract marked with dispute outcome

---

### Outcome: Approve Freelancer
**When to use:** Freelancer delivered acceptable work, client's claim invalid

**Request:**
```javascript
{
  "resolution": "approve-freelancer",
  "resolutionNotes": "Evidence shows freelancer met all specification requirements"
}
```

**Result:**
- Escrow released to freelancer
- Payment completed
- Contract marked complete

---

### Outcome: Split Payment
**When to use:** Both parties partially at fault, split responsibility

**Request:**
```javascript
{
  "resolution": "split-payment",
  "resolutionNotes": "Partial refund 30% to client, 70% to freelancer due to minor issues"
}
```

**Result:**
- Payment marked for custom handling
- Manual split processed by admin
- Escrow released with split amounts

---

### Outcome: Custom
**When to use:** Complex scenario requiring custom handling

**Request:**
```javascript
{
  "resolution": "custom",
  "resolutionNotes": "Escalated to senior team lead for review due to contractual ambiguity"
}
```

**Result:**
- Payment marked for custom handling
- Admin handles manually per notes
- Escrow released for manual decision

---

## Common Errors

### 400: Validation Error - Missing Field
```json
{
  "success": false,
  "error": "contractId is required"
}
```
**Fix:** Ensure all required fields are provided

---

### 400: User Not Involved
```json
{
  "success": false,
  "error": "You are not involved in this contract"
}
```
**Fix:** Only client or freelancer on contract can raise dispute

---

### 400: Existing Open Dispute
```json
{
  "success": false,
  "error": "This contract already has an open dispute"
}
```
**Fix:** Resolve or reject existing dispute first

---

### 400: Reason Too Short
```json
{
  "success": false,
  "error": "Reason must be at least 10 characters"
}
```
**Fix:** Provide detailed reason (minimum 10 characters)

---

### 403: Unauthorized
```json
{
  "success": false,
  "error": "You are not involved in this dispute"
}
```
**Fix:** Only involved parties can view disputes

---

### 404: Not Found
```json
{
  "success": false,
  "error": "Dispute not found"
}
```
**Fix:** Verify dispute ID and that dispute exists

---

## Escrow State Transitions

```
Contract Created
│
├─→ No Dispute
│   └─→ Payment in escrow
│       └─→ Job marked complete → Payment RELEASED
│
└─→ Dispute Raised
    └─→ Escrow FROZEN (frozenAt set)
    │   └─→ Status: OPEN
    │       └─→ Evidence submitted by both parties
    │
    ├─→ Admin Resolves
    │   └─→ Escrow UNFROZEN (unfrozenAt set)
    │   │
    │   ├─→ refund-client
    │   │   └─→ Payment released to CLIENT
    │   │
    │   ├─→ approve-freelancer
    │   │   └─→ Payment released to FREELANCER
    │   │
    │   └─→ split-payment/custom
    │       └─→ Payment released per ADMIN instructions
    │
    └─→ Admin Rejects
        └─→ Escrow UNFROZEN
            └─→ Normal payment release proceeds
```

---

## Database Query Examples

### Find All Open Disputes
```javascript
Dispute.find({ status: 'open' })
  .populate('contract client freelancer')
  .sort({ createdAt: -1 });
```

### Find Frozen Escrows
```javascript
Dispute.find({ escrowFrozen: true })
  .select('contract escrowFrozen frozenAt');
```

### Get User's Disputes
```javascript
Dispute.find({
  $or: [
    { client: userId },
    { freelancer: userId }
  ]
})
.populate('contract')
.sort({ createdAt: -1 });
```

### Get Disputes by Contract
```javascript
Dispute.find({ contract: contractId })
  .select('status raisedBy createdAt');
```

---

## Integration Checklist

- [ ] Frontend: Render "Create Dispute" button on completed contracts
- [ ] Frontend: Display dispute status in contract details
- [ ] Frontend: Show "Escrow Frozen" warning when dispute is active
- [ ] Frontend: Build evidence submission form
- [ ] Frontend: Create admin dispute queue dashboard
- [ ] Frontend: Create dispute detail view for admin resolution
- [ ] Frontend: Add dispute statistics widget
- [ ] Backend: Connect Payment model to check `frozen` flag
- [ ] Backend: Connect Contract model to track dispute outcomes
- [ ] Testing: Test all 9 endpoints with valid/invalid data
- [ ] Testing: Verify escrow freezing behavior
- [ ] Testing: Verify access control on all endpoints

---

## Performance Considerations

**Indexes Available:**
- `(contract, status)` - Fast lookup by contract and status
- `(contract, raisedBy)` - Find specific user's dispute on contract
- `(raisedBy, createdAt DESC)` - User's dispute history
- `(status, createdAt DESC)` - Admin queue ordering
- `(escrowFrozen)` - Find frozen escrows
- `(resolvedAt DESC)` - Resolution history

**Pagination Defaults:**
- User endpoints: 10 results per page
- Admin endpoints: 20 results per page

**Best Practices:**
- Always paginate when fetching multiple disputes
- Use specific filters in admin queries
- Aggregate stats with caching for frequently accessed data
- Index searches by contract when dealing with single contract

---

## Related Documents

- [Dispute Resolution System](./DISPUTE_RESOLUTION_SYSTEM.md) - Full documentation
- [Contract Management](./CONTRACT_API_QUICK_REFERENCE.md) - Contract endpoints
- [Payment System](./PAYMENT_SYSTEM.md) - Escrow and payment details
- [Review System](./REVIEW_API_QUICK_REFERENCE.md) - Review management

---

## Support

For issues or questions:
1. Check the [Common Errors](#common-errors) section
2. Review [Dispute Resolution System](./DISPUTE_RESOLUTION_SYSTEM.md) for detailed documentation
3. Verify all required fields are provided
4. Check authorization tokens and admin status
