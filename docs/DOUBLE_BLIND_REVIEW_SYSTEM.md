# Double-Blind Review System

## Overview

The Double-Blind Review System ensures fair, unbiased feedback between clients and freelancers by keeping reviews hidden until **both parties have submitted their reviews**. Once both submit, reviews become mutually visible and can be seen in user profiles.

This system includes **suspicious pattern detection** to flag potentially fraudulent or manipulative reviews.

## Key Principles

1. **Double-Blind:** Reviews are not visible until both parties submit
2. **Mutual Visibility:** Once both submit, both can see the other's review
3. **Public Visibility:** After double-blind period, reviews appear on user profiles
4. **Fair Feedback:** Each party can review without bias from the other's review
5. **Fraud Detection:** Automated pattern detection flags suspicious reviews for admin review

## Architecture

### Data Model

```javascript
Review {
  // Relationship
  contract: ObjectId,
  reviewer: ObjectId,
  reviewee: ObjectId,

  // Rating data
  rating: { overall: 1-5, communication, quality, professionalism, deadlines, value },
  comment: String (max 2000 chars),
  skillRatings: [{ skill, rating }],
  pros: [String],
  cons: [String],

  // Double-blind tracking
  submitted: Boolean,
  submittedAt: Date,
  isVisible: Boolean,
  visibleAt: Date,

  // Suspicious pattern detection
  flagged: Boolean,
  flagReason: String (enum),
  flaggedAt: Date,

  // Admin review
  reviewedByAdmin: Boolean,
  adminNotes: String,
  adminReviewedAt: Date,
  adminReviewedBy: ObjectId,

  // User response
  response: {
    content: String,
    respondedAt: Date
  },

  // Helpful votes
  helpfulCount: Number,
  markedHelpfulBy: [ObjectId],

  timestamps
}
```

### Double-Blind Visibility Logic

**A review is visible to:**

1. **Reviewer** - Can see their own review once submitted (even during blind period)
2. **Reviewee** - Once BOTH reviews for the contract are submitted
3. **Public** - Once BOTH reviews for the contract are submitted
4. **Admin** - Always visible to admin users

```
Timeline:
┌─────────────────────┬──────────────────┬────────────────┐
│   Blind Period      │  After Submission │ Admin Action   │
├─────────────────────┼──────────────────┼────────────────┤
│ Review 1 submitted  │ Both visible      │ Flagged?       │
│ Review 2 drafting   │ Public profile    │ Under review   │
│ Can't see each      │ Auto-visible      │ Approved/Reject
│                     │ No admin action   │                │
└─────────────────────┴──────────────────┴────────────────┘
```

## Suspicious Pattern Detection

### Automated Detection Rules

#### Rule 1: Perfect Ratings
**Trigger:** 5/5 across all metrics
**Risk:** Potential fake positive reviews
**Action:** Flag with `perfect-rating`

#### Rule 2: All 5-Star Reviews from Reviewer
**Trigger:** User has ≥3 reviews, all are 5 stars
**Risk:** Possible review fraud ring
**Action:** Flag with `all-5-star-reviews`

#### Rule 3: Extreme Variance
**Trigger:** 
- High rating (4-5) + negative comment keywords (poor, bad, awful, etc.)
- Low rating (1-2) + no negative keywords

**Risk:** Inconsistent, potentially automated reviews
**Action:** Flag with `extreme-variance`

#### Rule 4: Inconsistent Skill Ratings
**Trigger:** Skill rating gap ≥ 4 (e.g., 5 and 1)
**Risk:** Careless or automated review
**Action:** Flag with `inconsistent-ratings`

#### Rule 5: Rapid Submission
**Trigger:** Review submitted within 1 hour of previous review by same user
**Risk:** Bulk review operations
**Action:** Flag with `rapid-submission`

### Flag Reasons

```
perfect-rating           → All metrics 5/5
extreme-variance         → Rating conflicts with comment tone
rapid-submission         → Multiple reviews in short time
all-5-star-reviews       → Pattern of perfect reviews
inconsistent-ratings     → Wide gap in skill ratings
similar-comments         → Potentially copy-pasted reviews (future)
```

## API Endpoints

### Draft Review Creation

**POST /api/reviews**

Create or update a review draft (not yet submitted).

**Request:**
```json
{
  "contractId": "contract123",
  "revieweeId": "user456",
  "rating": 4,
  "comment": "Great work, very professional",
  "skillRatings": {
    "communication": 5,
    "quality": 4,
    "professionalism": 5,
    "deadlines": 4,
    "value": 3
  },
  "pros": ["Responsive", "Quality work"],
  "cons": ["Slightly late delivery"]
}
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
      "reviewer": "user1",
      "reviewee": "user456",
      "rating": 4,
      "comment": "...",
      "submitted": false,
      "isVisible": false,
      "flagged": false,
      "createdAt": "2024-01-15T10:00:00Z"
    }
  }
}
```

**Constraints:**
- Contract must be completed
- User must be client or freelancer in contract
- Can update draft freely until submission
- One review per person per contract

### Submit Review

**POST /api/reviews/:contractId/submit**

Submit a review (triggers double-blind and suspicious pattern detection).

**Request:**
```json
{
  "revieweeId": "user456"
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

**If Suspicious Pattern Detected:**
```json
{
  "status": "success",
  "message": "Review flagged for pattern: perfect-rating",
  "data": {
    "review": { ... },
    "flagged": true,
    "flagReason": "perfect-rating"
  }
}
```

**After Submission:**
1. Review marked as submitted
2. Suspicious pattern detection runs
3. If both reviews submitted → both become visible
4. Flagged reviews go to admin review queue

### Get Visible Reviews (Double-Blind)

**GET /api/users/:userId/reviews?page=1&limit=10**

Get only visible reviews for a user (after double-blind period).

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
        "comment": "Great work",
        "skillRatings": { ... },
        "pros": [...],
        "cons": [...],
        "isVisible": true,
        "visibleAt": "2024-01-15T10:10:00Z",
        "response": { ... },
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

**Key Features:**
- Returns ONLY visible reviews
- Sorted by creation date (newest first)
- Includes reviewer info (public profile)
- Includes any response from reviewee
- Used for public profile display

### Get Aggregated Ratings

**GET /api/users/:userId/ratings-summary**

Get summary statistics for user profile.

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

**Usage:**
- Display in user profile header
- Show rating stars and count
- Used for sorting/filtering

### Get Pending Reviews

**GET /api/reviews/pending**

Get reviews current user needs to submit.

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
        "rating": 0,
        "comment": "",
        "submitted": false,
        "createdAt": "2024-01-14T15:00:00Z"
      }
    ]
  }
}
```

**Use Case:**
- Show users pending reviews to complete
- Notification: "You have 3 pending reviews"
- Queue view for review submission

### Respond to Review

**POST /api/reviews/:id/respond**

Add a response to a review (after it's visible).

**Request:**
```json
{
  "content": "Thank you for the feedback, I appreciate it!"
}
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
        "content": "Thank you...",
        "respondedAt": "2024-01-15T10:15:00Z"
      }
    }
  }
}
```

**Constraints:**
- Only reviewee can respond
- Review must be visible
- One response per review

### Mark Review Helpful

**POST /api/reviews/:id/helpful**

Mark a review as helpful (vote system).

**Response (200):**
```json
{
  "status": "success",
  "message": "Marked as helpful",
  "data": {
    "review": {
      "_id": "review789",
      "helpfulCount": 5,
      "markedHelpfulBy": ["user1", "user2", ...]
    }
  }
}
```

### Admin: Get Flagged Reviews

**GET /api/admin/reviews/flagged?page=1&limit=20**

Get flagged reviews for admin moderation.

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "reviews": [
      {
        "_id": "review123",
        "reviewer": { ... },
        "reviewee": { ... },
        "flagReason": "extreme-variance",
        "flaggedAt": "2024-01-15T10:07:00Z",
        "reviewedByAdmin": false,
        "rating": 5,
        "comment": "Terrible work, worst experience ever"
      }
    ],
    "pagination": { ... }
  }
}
```

### Admin: Flag Review

**POST /api/admin/reviews/:id/flag**

Manually flag a review (override auto-detection).

**Request:**
```json
{
  "reason": "suspicious-pattern",
  "notes": "User has been flagged before for similar behavior"
}
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
      "adminNotes": "...",
      "adminReviewedAt": "2024-01-15T10:25:00Z"
    }
  }
}
```

### Admin: Unflag Review

**POST /api/admin/reviews/:id/unflag**

Unflag a review (approved by admin).

**Request:**
```json
{
  "notes": "Review verified as legitimate"
}
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

## Review Visibility Timeline

```
Contract Completed
        ↓
User 1 Submits Review ──────────┐
        ↓                         │
User 1 can see their review      │
(not visible to User 2 yet)      │
        ↓                         ↓
User 2 Submits Review ───→ BOTH VISIBLE
        ↓
Pattern Detection
        ↓
Flagged? ─→ YES → Admin Review Queue
        │
        └─→ NO → Auto-published to profiles
        ↓
Reviews appear in:
- User 2's profile
- User 1's profile
- Search results
- Public view
```

## Security & Fairness

### Authorization Checks
- ✅ Only contract parties can review
- ✅ Cannot review yourself
- ✅ Can only review completed contracts
- ✅ One review per person per contract
- ✅ Reviewee must be the other party

### Data Protection
- ✅ Reviews hidden during blind period
- ✅ Suspicious reviews flagged before publication
- ✅ Admin approval on flagged reviews
- ✅ Immutable review submission timestamps
- ✅ Response tracking with timestamps

### Fairness Features
- ✅ Double-blind prevents retaliation
- ✅ Can't see other's review before submitting
- ✅ Automated pattern detection
- ✅ Admin review of suspicious patterns
- ✅ Appeals process through admin

## Frontend Integration

### Review Submission Workflow

```javascript
// 1. Show pending reviews
const pending = await fetch('/api/reviews/pending');

// 2. User drafts review
const draft = await fetch('/api/reviews', {
  method: 'POST',
  body: JSON.stringify({
    contractId, revieweeId, rating, comment, ...
  })
});

// 3. User submits review
const submitted = await fetch(`/api/reviews/${contractId}/submit`, {
  method: 'POST',
  body: JSON.stringify({ revieweeId })
});

// 4. Check if both submitted (visible now)
if (submitted.data.visibleAt) {
  // Show review to reviewee
}
```

### Display on Profile

```javascript
// Get visible reviews
const reviews = await fetch('/api/users/{userId}/reviews');

// Get rating summary
const summary = await fetch('/api/users/{userId}/ratings-summary');

// Display
console.log(`Rating: ${summary.overallRating}/5`);
console.log(`Reviews: ${summary.totalReviews}`);
reviews.forEach(review => {
  console.log(`${review.reviewer.firstName}: ${review.comment}`);
});
```

### Track Pending

```javascript
// Show notification badge
const pending = await fetch('/api/reviews/pending');
if (pending.data.reviews.length > 0) {
  showNotification(`You have ${pending.data.reviews.length} pending reviews`);
}
```

## Error Handling

| Error | Status | Cause |
|-------|--------|-------|
| Contract not completed | 400 | Review submitted before contract completion |
| Invalid reviewee | 400 | Reviewee is not the other contract party |
| Review already exists | 400 | User already reviewed this contract |
| Review not found | 404 | Invalid review ID |
| Unauthorized | 403 | User is not party to contract |
| Pattern detected | 200 | Submitted but flagged for admin review |

## Best Practices

### For Users
1. ✅ Complete reviews soon after contract completion
2. ✅ Be fair and constructive in feedback
3. ✅ Match ratings to comment tone
4. ✅ Use specific examples
5. ✅ Don't review to retaliate

### For Developers
1. ✅ Show pending reviews prominently
2. ✅ Explain double-blind system to users
3. ✅ Display rating aggregates on profiles
4. ✅ Implement helpful voting
5. ✅ Show when reviews will be visible

### For Admin
1. ✅ Review flagged reviews within 24 hours
2. ✅ Investigate patterns in user reviews
3. ✅ Document reasoning for approvals
4. ✅ Build case for repeat offenders
5. ✅ Monitor for fraud rings

## Testing Checklist

- [ ] Completed contract can receive review
- [ ] Incomplete contract blocks review
- [ ] Non-party cannot review
- [ ] Self-review prevented
- [ ] Draft saved without submission
- [ ] Submitted review triggers pattern detection
- [ ] Flagged review sends to admin queue
- [ ] Both submit → reviews become visible
- [ ] Reviewee notified of visible reviews
- [ ] Perfect rating flagged
- [ ] Rapid submission flagged
- [ ] Extreme variance flagged
- [ ] Admin can unflag reviews
- [ ] Rating aggregation correct
- [ ] Response tracking works
- [ ] Helpful voting prevents duplicates

## Monitoring

### Key Metrics
- Average reviews per contract: ~0.7 (some don't review)
- Flagged review rate: <5% (adjust thresholds)
- Admin unflag rate: Goal < 30% (false positives)
- Average rating drift: Should be stable
- Review response rate: For high visibility

### Admin Dashboard (Future)
- Flagged reviews queue
- User review patterns
- Fraud detection alerts
- Rating distribution trends
- Contract completion tracking
