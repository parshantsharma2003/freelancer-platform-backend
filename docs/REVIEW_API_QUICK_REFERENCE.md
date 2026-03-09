# Review API Quick Reference

## Base URL
```
http://localhost:5001/api/reviews
```

## Authentication
All endpoints except `/users/:id/reviews` and `/ratings/:id` require:
```
Authorization: Bearer {token}
```

---

## Quick Navigation

| Action | Endpoint | Auth |
|--------|----------|------|
| Create review draft | POST / | ✅ Required |
| Submit review | POST /:contractId/submit | ✅ Required |
| Get pending reviews | GET /pending | ✅ Required |
| View visible reviews | GET /users/:id/reviews | ❌ Public |
| Get profile summary | GET /ratings/:id | ❌ Public |
| Respond to review | POST /:id/respond | ✅ Required |
| Mark helpful | POST /:id/helpful | ✅ Required |
| Admin: Flagged reviews | GET /admin/flagged | ✅ Admin |
| Admin: Flag review | POST /admin/:id/flag | ✅ Admin |
| Admin: Unflag review | POST /admin/:id/unflag | ✅ Admin |

---

## Common Flows

### Flow 1: Complete a Review

```javascript
// Step 1: Save draft
POST /api/reviews
{
  "contractId": "contract123",
  "revieweeId": "user456",
  "rating": 5,
  "comment": "Excellent work!",
  "skillRatings": {
    "communication": 5,
    "quality": 5,
    "professionalism": 5,
    "deadlines": 5,
    "value": 5
  }
}

// Step 2: Submit review
POST /api/reviews/contract123/submit
{ "revieweeId": "user456" }

// Step 3: Wait for other party to submit
// Then reviews become visible to each other
```

### Flow 2: Display User Rating

```javascript
// Get profile summary
GET /api/users/user456/ratings-summary

// Response:
{
  "overallRating": 4.67,
  "totalReviews": 15,
  "skillBreakdown": {
    "communication": 4.8,
    "quality": 4.6,
    "professionalism": 4.9,
    "deadlines": 4.5,
    "value": 4.4
  },
  "ratingDistribution": {
    "5": 12,
    "4": 2,
    "3": 1
  }
}

// Get detailed reviews
GET /api/users/user456/reviews
```

### Flow 3: Manage Pending Reviews

```javascript
// Show all pending in dashboard
GET /api/reviews/pending
{
  "reviews": [
    {
      "_id": "review1",
      "contract": "contract123",
      "reviewee": { "firstName": "Jane" },
      "submitted": false
    }
  ]
}

// Create draft
POST /api/reviews
{ "contractId": "contract123", "revieweeId": "...", ... }

// Review form allows save/submit
```

---

## Common Operations

### Create Review (Draft)

**cURL:**
```bash
curl -X POST http://localhost:5001/api/reviews \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "contract-id-123",
    "revieweeId": "freelancer-id-456",
    "rating": 4,
    "comment": "Great work, very professional",
    "skillRatings": {
      "communication": 5,
      "quality": 4,
      "professionalism": 5,
      "deadlines": 4,
      "value": 3
    },
    "pros": ["Fast delivery", "Quality work"],
    "cons": ["Minor typos"]
  }'
```

**JavaScript (Fetch):**
```javascript
const response = await fetch('/api/reviews', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contractId: 'contract123',
    revieweeId: 'user456',
    rating: 4,
    comment: 'Great work!',
    skillRatings: {
      communication: 5,
      quality: 4,
      professionalism: 5,
      deadlines: 4,
      value: 3
    }
  })
});

const result = await response.json();
console.log('Draft saved:', result.data.review._id);
```

**Response (201):**
```json
{
  "status": "success",
  "message": "Review draft saved. Call submit endpoint to make it final.",
  "data": {
    "review": {
      "_id": "review789",
      "contract": "contract123",
      "reviewer": "current-user",
      "reviewee": "user456",
      "rating": 4,
      "comment": "Great work!",
      "submitted": false,
      "isVisible": false,
      "flagged": false
    }
  }
}
```

---

### Submit Review (Make Final)

**cURL:**
```bash
curl -X POST http://localhost:5001/api/reviews/contract123/submit \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "revieweeId": "user456"
  }'
```

**JavaScript:**
```javascript
const response = await fetch('/api/reviews/contract123/submit', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    revieweeId: 'user456'
  })
});

const result = await response.json();

if (result.data.flagged) {
  console.log(`⚠️ Review flagged: ${result.data.flagReason}`);
  console.log('Will be reviewed by admin');
} else {
  console.log('✅ Review submitted successfully');
}
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Review submitted successfully",
  "data": {
    "review": {
      "_id": "review789",
      "submitted": true,
      "submittedAt": "2024-01-15T10:05:00Z",
      "isVisible": false,
      "flagged": false
    },
    "flagged": false,
    "flagReason": null
  }
}
```

**If Flagged:**
```json
{
  "status": "success",
  "message": "Review flagged for pattern: perfect-rating",
  "data": {
    "flagged": true,
    "flagReason": "perfect-rating"
  }
}
```

---

### Get Visible Reviews (Profile View)

**cURL:**
```bash
curl -X GET "http://localhost:5001/api/users/user456/reviews?page=1&limit=10"
```

**JavaScript:**
```javascript
async function displayUserReviews(userId) {
  const response = await fetch(`/api/users/${userId}/reviews`);
  const data = await response.json();

  console.log(`Total reviews: ${data.data.pagination.total}`);
  console.log(`Showing page ${data.data.pagination.page} of ${data.data.pagination.pages}`);

  data.data.reviews.forEach(review => {
    console.log(`
      ⭐ ${review.rating}/5 - ${review.reviewer.firstName} ${review.reviewer.lastName}
      ${review.comment}
      ${review.response ? `Response: ${review.response.content}` : ''}
    `);
  });
}

displayUserReviews('user456');
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "reviews": [
      {
        "_id": "review789",
        "reviewer": {
          "_id": "user1",
          "firstName": "John",
          "lastName": "Doe"
        },
        "rating": 4,
        "comment": "Great work, very professional",
        "skillRatings": {
          "communication": 5,
          "quality": 4,
          "professionalism": 5,
          "deadlines": 4,
          "value": 3
        },
        "pros": ["Fast", "Quality"],
        "cons": ["Minor issue"],
        "isVisible": true,
        "response": {
          "content": "Thank you!",
          "respondedAt": "2024-01-15T10:15:00Z"
        },
        "helpfulCount": 3,
        "createdAt": "2024-01-15T10:00:00Z"
      }
    ],
    "pagination": {
      "total": 12,
      "page": 1,
      "limit": 10,
      "pages": 2
    }
  }
}
```

---

### Get Rating Summary (Profile Header)

**cURL:**
```bash
curl -X GET http://localhost:5001/api/reviews/ratings/user456
```

**JavaScript:**
```javascript
async function displayRatingBadge(userId) {
  const response = await fetch(`/api/reviews/ratings/${userId}`);
  const data = await response.json();
  const rating = data.data;

  // Display in UI
  document.querySelector('.rating-badge').innerHTML = `
    <div class="stars">${'⭐'.repeat(Math.round(rating.overallRating))}</div>
    <div class="rating">${rating.overallRating.toFixed(2)}</div>
    <div class="count">(${rating.totalReviews} reviews)</div>
    <div class="breakdown">
      Avg communication: ${rating.skillBreakdown.communication}
      Avg quality: ${rating.skillBreakdown.quality}
    </div>
  `;
}

displayRatingBadge('user456');
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "overallRating": 4.67,
    "totalReviews": 15,
    "skillBreakdown": {
      "communication": 4.8,
      "quality": 4.6,
      "professionalism": 4.9,
      "deadlines": 4.5,
      "value": 4.4
    },
    "ratingDistribution": {
      "5": 12,
      "4": 2,
      "3": 1,
      "2": 0,
      "1": 0
    }
  }
}
```

---

### Get Pending Reviews (Dashboard)

**cURL:**
```bash
curl -X GET http://localhost:5001/api/reviews/pending \
  -H "Authorization: Bearer {token}"
```

**JavaScript:**
```javascript
async function showPendingReviews() {
  const response = await fetch('/api/reviews/pending', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();

  if (data.data.reviews.length === 0) {
    console.log('No pending reviews!');
    return;
  }

  console.log(`You have ${data.data.reviews.length} pending reviews:`);
  
  data.data.reviews.forEach(review => {
    console.log(`
      Review for: ${review.reviewee.firstName}
      Contract: ${review.contract}
      Created: ${new Date(review.createdAt).toLocaleDateString()}
    `);
  });
}

showPendingReviews();
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "reviews": [
      {
        "_id": "review123",
        "contract": "contract456",
        "reviewee": {
          "_id": "user789",
          "firstName": "Jane",
          "lastName": "Smith"
        },
        "submitted": false,
        "createdAt": "2024-01-14T15:00:00Z"
      }
    ]
  }
}
```

---

### Respond to Review

**cURL:**
```bash
curl -X POST http://localhost:5001/api/reviews/review789/respond \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Thank you for the feedback! I really appreciate your kind words."
  }'
```

**JavaScript:**
```javascript
async function respondToReview(reviewId, responseText) {
  const response = await fetch(`/api/reviews/${reviewId}/respond`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: responseText
    })
  });

  const result = await response.json();
  console.log('Response posted!');
}

respondToReview('review789', 'Thank you!');
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Response added successfully",
  "data": {
    "review": {
      "_id": "review789",
      "response": {
        "content": "Thank you!",
        "respondedAt": "2024-01-15T10:15:00Z"
      }
    }
  }
}
```

---

### Mark Review Helpful

**cURL:**
```bash
curl -X POST http://localhost:5001/api/reviews/review789/helpful \
  -H "Authorization: Bearer {token}"
```

**JavaScript:**
```javascript
async function markHelpful(reviewId) {
  const response = await fetch(`/api/reviews/${reviewId}/helpful`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const result = await response.json();
  console.log(`Helpful count: ${result.data.review.helpfulCount}`);
}

markHelpful('review789');
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Marked as helpful",
  "data": {
    "review": {
      "_id": "review789",
      "helpfulCount": 5,
      "markedHelpfulBy": ["user1", "user2", "user3", "user4", "user5"]
    }
  }
}
```

---

## Admin Operations

### Get Flagged Reviews

**CURL:**
```bash
curl -X GET "http://localhost:5001/api/admin/reviews/flagged?page=1&limit=20" \
  -H "Authorization: Bearer {admin-token}"
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "reviews": [
      {
        "_id": "review123",
        "reviewer": { "firstName": "John", "lastName": "Doe" },
        "reviewee": { "firstName": "Jane", "lastName": "Smith" },
        "flagReason": "extreme-variance",
        "flaggedAt": "2024-01-15T10:07:00Z",
        "rating": 5,
        "comment": "Terrible, worst experience ever!",
        "reviewedByAdmin": false
      }
    ],
    "pagination": {
      "total": 3,
      "page": 1,
      "limit": 20,
      "pages": 1
    }
  }
}
```

### Flag Review (Manual)

**CURL:**
```bash
curl -X POST http://localhost:5001/api/admin/reviews/review123/flag \
  -H "Authorization: Bearer {admin-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "suspicious-pattern",
    "notes": "User has history of manipulative reviews"
  }'
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Review flagged successfully",
  "data": {
    "review": {
      "_id": "review123",
      "flagged": true,
      "flagReason": "suspicious-pattern",
      "reviewedByAdmin": true,
      "adminNotes": "User has history...",
      "adminReviewedAt": "2024-01-15T10:25:00Z"
    }
  }
}
```

### Unflag Review (Approve)

**CURL:**
```bash
curl -X POST http://localhost:5001/api/admin/reviews/review123/unflag \
  -H "Authorization: Bearer {admin-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Review verified as legitimate, user provided context"
  }'
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Review unflagged successfully",
  "data": {
    "review": {
      "_id": "review123",
      "flagged": false,
      "reviewedByAdmin": true,
      "adminReviewedAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

---

## Error Reference

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Missing required fields | contractId, revieweeId, rating, comment not provided |
| 400 | Rating must be 1-5 | Invalid rating value |
| 400 | Contract not completed | Can't review incomplete contracts |
| 400 | Invalid reviewee | Reviewee not the other party |
| 400 | You already reviewed | One review per person per contract |
| 403 | Not authorized | User not in contract or not reviewee |
| 404 | Review not found | Invalid review ID |
| 400 | Can't respond | Can only respond to visible reviews |

---

## Best Practices

### Frontend Implementation

```javascript
// 1. Check pending reviews on dashboard load
const pending = await fetch('/api/reviews/pending');
if (pending.data.reviews.length > 0) {
  showNotification(`${pending.data.reviews.length} contract(s) need review!`);
}

// 2. Show rating summary on profiles
const summary = await fetch(`/api/reviews/ratings/${userId}`);
displayRatingStars(summary.data.overallRating);
displaySkillBreakdown(summary.data.skillBreakdown);

// 3. Display visible reviews
const reviews = await fetch(`/api/users/${userId}/reviews`);
displayReviews(reviews.data.reviews);

// 4. Handle review submission
const draft = await fetch('/api/reviews', {
  method: 'POST',
  body: JSON.stringify({ ... })
});

const submitted = await fetch(`/api/reviews/${contractId}/submit`, {
  method: 'POST',
  body: JSON.stringify({ revieweeId })
});

if (submitted.data.flagged) {
  alert('Review submitted but flagged for review by admin');
} else {
  alert('Review submitted! Both parties must submit for visibility.');
}
```

### Display Pending Reviews Badge
```javascript
// Show count in navbar
const pending = await fetch('/api/reviews/pending');
navbar.reviewBadge.textContent = pending.data.reviews.length;
```

### Profile Page Components
```javascript
// 1. Rating header
<RatingBadge userId={userId} />

// 2. Detailed reviews
<ReviewsList userId={userId} />

// 3. Pagination
<Pagination 
  page={page}
  pages={pages}
  onPageChange={loadNewPage}
/>
```

---

## Testing Against API

### Test Perfect Rating Detection
```bash
# This should be flagged
curl -X POST http://localhost:5001/api/reviews/contract1/submit \
  -H "Authorization: Bearer {token}" \
  -d '{
    "rating": 5,
    "comment": "Perfect",
    "skillRatings": {
      "communication": 5,
      "quality": 5,
      "professionalism": 5,
      "deadlines": 5,
      "value": 5
    }
  }'
# Response flags: "perfect-rating"
```

### Test Extreme Variance Detection
```bash
# This should be flagged
curl -X POST http://localhost:5001/api/reviews/contract2/submit \
  -d '{
    "rating": 5,
    "comment": "Terrible work, awful experience, never again"
  }'
# Response flags: "extreme-variance"
```

---

## Performance Notes

- Reviews indexed by: reviewee, contract, isVisible, datesubmitted
- Pagination: Default limit 10, max 100
- Aggregation: Ratings calculated on-demand (cached in future)
- Pattern detection: Runs on submit (~50ms for average user history)
