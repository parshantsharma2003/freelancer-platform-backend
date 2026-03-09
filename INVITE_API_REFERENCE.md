# JOB INVITATION - API TESTING REFERENCE

## 🧪 cURL Command Examples

### 1. Send Single Invitation
```bash
curl -X POST http://localhost:5001/api/jobs/JOB_ID/invite \
  -H "Authorization: Bearer CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "freelancerId": "FREELANCER_ID",
    "message": "We love your portfolio and think you would be perfect for this project!"
  }'
```

**Success Response (201):**
```json
{
  "status": "success",
  "message": "Invitation sent successfully",
  "data": {
    "invite": {
      "_id": "invite_123456",
      "job": {
        "_id": "job_123",
        "title": "Build React Dashboard",
        "description": "Full-stack react dashboard",
        "budget": {
          "type": "fixed",
          "amount": 5000
        }
      },
      "freelancer": {
        "_id": "freelancer_123",
        "firstName": "John",
        "lastName": "Developer",
        "avatar": "https://..."
      },
      "client": {
        "_id": "client_123",
        "firstName": "Jane",
        "lastName": "Client",
        "avatar": "https://..."
      },
      "status": "sent",
      "message": "We love your portfolio...",
      "expiresAt": "2026-02-22T10:30:00Z",
      "sentAt": "2026-02-15T10:30:00Z"
    }
  }
}
```

---

### 2. Bulk Invite Multiple Freelancers
```bash
curl -X POST http://localhost:5001/api/jobs/JOB_ID/invite-bulk \
  -H "Authorization: Bearer CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "freelancerIds": [
      "freelancer_id_1",
      "freelancer_id_2",
      "freelancer_id_3"
    ],
    "message": "We are looking for talented developers..."
  }'
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Bulk invitations sent",
  "data": {
    "results": {
      "successful": [
        "freelancer_id_1",
        "freelancer_id_2"
      ],
      "failed": [
        {
          "freelancerId": "freelancer_id_3",
          "reason": "Invitation already sent"
        }
      ]
    }
  }
}
```

---

### 3. Get All Invites for a Job
```bash
curl -X GET "http://localhost:5001/api/jobs/JOB_ID/invites" \
  -H "Authorization: Bearer CLIENT_TOKEN"
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "invites": [
      {
        "_id": "invite_001",
        "freelancer": {
          "_id": "freelancer_123",
          "firstName": "John",
          "lastName": "Developer",
          "avatar": "https://...",
          "rating": 4.8,
          "skills": ["React", "Node.js", "MongoDB"]
        },
        "status": "sent",
        "createdAt": "2026-02-15T09:00:00Z"
      },
      {
        "_id": "invite_002",
        "freelancer": {
          "_id": "freelancer_456",
          "firstName": "Sarah",
          "lastName": "Coder",
          "avatar": "https://...",
          "rating": 4.9,
          "skills": ["React", "TypeScript", "AWS"]
        },
        "status": "accepted",
        "createdAt": "2026-02-15T08:00:00Z",
        "respondedAt": "2026-02-15T10:00:00Z"
      },
      {
        "_id": "invite_003",
        "freelancer": {
          "_id": "freelancer_789",
          "firstName": "Mike",
          "lastName": "Builder",
          "avatar": "https://...",
          "rating": 4.5,
          "skills": ["Vue.js", "Node.js"]
        },
        "status": "declined",
        "createdAt": "2026-02-15T07:00:00Z",
        "respondedAt": "2026-02-15T11:00:00Z",
        "declineReason": "Already committed to another project"
      }
    ],
    "count": 3
  }
}
```

---

### 4. Get Invitation Statistics
```bash
curl -X GET "http://localhost:5001/api/jobs/JOB_ID/invite-stats" \
  -H "Authorization: Bearer CLIENT_TOKEN"
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "stats": {
      "total": 10,
      "sent": 5,
      "accepted": 3,
      "declined": 1,
      "expired": 1
    }
  }
}
```

---

### 5. Get Freelancer's Invitations
```bash
# Get all invites
curl -X GET "http://localhost:5001/api/invites" \
  -H "Authorization: Bearer FREELANCER_TOKEN"

# Get only sent (active) invites
curl -X GET "http://localhost:5001/api/invites?status=sent" \
  -H "Authorization: Bearer FREELANCER_TOKEN"

# Get accepted invites
curl -X GET "http://localhost:5001/api/invites?status=accepted" \
  -H "Authorization: Bearer FREELANCER_TOKEN"

# Get declined invites
curl -X GET "http://localhost:5001/api/invites?status=declined" \
  -H "Authorization: Bearer FREELANCER_TOKEN"

# Get expired invites
curl -X GET "http://localhost:5001/api/invites?status=expired" \
  -H "Authorization: Bearer FREELANCER_TOKEN"
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "invites": [
      {
        "_id": "invite_abc123",
        "job": {
          "_id": "job_def456",
          "title": "Build Mobile App",
          "description": "iOS and Android native apps...",
          "category": "Mobile Development",
          "budget": {
            "type": "fixed",
            "amount": 10000
          },
          "experienceLevel": "intermediate",
          "skills": ["React Native", "TypeScript", "Firebase"]
        },
        "client": {
          "_id": "client_ghi789",
          "firstName": "Alice",
          "lastName": "Startup",
          "avatar": "https://..."
        },
        "status": "sent",
        "message": "Your React Native skills are exactly what we need!",
        "expiresAt": "2026-02-22T14:30:00Z",
        "sentAt": "2026-02-15T14:30:00Z"
      }
    ],
    "count": 1
  }
}
```

---

### 6. Get Single Invitation Details
```bash
curl -X GET "http://localhost:5001/api/invites/INVITE_ID" \
  -H "Authorization: Bearer TOKEN"
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "invite": {
      "_id": "invite_abc123",
      "job": {
        "_id": "job_def456",
        "title": "Build Mobile App",
        "description": "...",
        "budget": {
          "type": "fixed",
          "amount": 10000
        }
      },
      "client": {
        "_id": "client_123",
        "firstName": "Alice",
        "lastName": "Startup"
      },
      "freelancer": {
        "_id": "freelancer_456",
        "firstName": "John",
        "lastName": "Developer"
      },
      "status": "sent",
      "message": "Your React Native skills are exactly what we need!",
      "expiresAt": "2026-02-22T14:30:00Z",
      "sentAt": "2026-02-15T14:30:00Z"
    }
  }
}
```

---

### 7. Accept Invitation
```bash
curl -X POST "http://localhost:5001/api/invites/INVITE_ID/respond" \
  -H "Authorization: Bearer FREELANCER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "response": "accepted"
  }'
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Invitation accepted",
  "data": {
    "invite": {
      "_id": "invite_abc123",
      "status": "accepted",
      "respondedAt": "2026-02-15T15:45:00Z"
    }
  }
}
```

---

### 8. Decline Invitation
```bash
curl -X POST "http://localhost:5001/api/invites/INVITE_ID/respond" \
  -H "Authorization: Bearer FREELANCER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "response": "declined",
    "declineReason": "Already committed to a long-term project"
  }'
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Invitation declined",
  "data": {
    "invite": {
      "_id": "invite_abc123",
      "status": "declined",
      "declineReason": "Already committed to a long-term project",
      "respondedAt": "2026-02-15T15:50:00Z"
    }
  }
}
```

---

### 9. Cancel Invitation
```bash
curl -X DELETE "http://localhost:5001/api/invites/INVITE_ID" \
  -H "Authorization: Bearer CLIENT_TOKEN"
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Invite cancelled successfully"
}
```

---

### 10. Job Feed (Visibility Filtering)
```bash
# Get visible public + invited jobs (as logged-in freelancer)
curl -X GET "http://localhost:5001/api/jobs?status=open" \
  -H "Authorization: Bearer FREELANCER_TOKEN"

# Get only public jobs (no auth)
curl -X GET "http://localhost:5001/api/jobs?status=open"
```

**Response includes:**
- All public jobs
- Any invite-only jobs freelancer is invited to

---

## 🔴 Error Responses

### 400 - Bad Request
```json
{
  "status": "error",
  "message": "Freelancer ID is required"
}
```

### 403 - Forbidden
```json
{
  "status": "error",
  "message": "Not authorized to invite for this job"
}
```

### 404 - Not Found
```json
{
  "status": "error",
  "message": "Invite not found"
}
```

### 409 - Conflict (Duplicate)
```json
{
  "status": "error",
  "message": "Invitation already sent to this freelancer"
}
```

### 410 - Gone (Expired)
```json
{
  "status": "error",
  "message": "This invitation has expired"
}
```

---

## 📱 JavaScript Fetch Examples

### Send Invitation
```javascript
async function sendInvite(jobId, freelancerId, message) {
  const token = localStorage.getItem('token');
  
  const response = await fetch(
    `http://localhost:5001/api/jobs/${jobId}/invite`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        freelancerId,
        message
      })
    }
  );
  
  const data = await response.json();
  if (data.status === 'success') {
    console.log('Invitation sent:', data.data.invite);
  }
  return data;
}

// Usage
sendInvite('job_id_123', 'freelancer_id_456', 'Great profile!');
```

### Get Freelancer's Invites
```javascript
async function getMyInvites(status = null) {
  const token = localStorage.getItem('token');
  let url = 'http://localhost:5001/api/invites';
  
  if (status) {
    url += `?status=${status}`;
  }
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  return data.data.invites;
}

// Usage
const activeinvites = await getMyInvites('sent');
const acceptedInvites = await getMyInvites('accepted');
```

### Respond to Invitation
```javascript
async function respondToInvite(inviteId, response, reason = '') {
  const token = localStorage.getItem('token');
  
  const body = { response };
  if (reason) body.declineReason = reason;
  
  const result = await fetch(
    `http://localhost:5001/api/invites/${inviteId}/respond`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );
  
  return result.json();
}

// Accept
respondToInvite('invite_id_123', 'accepted');

// Decline
respondToInvite('invite_id_123', 'declined', 'Too busy right now');
```

### Listen to Socket Events
```javascript
// Connect with authentication
const socket = io('http://localhost:5001', {
  auth: {
    token: localStorage.getItem('token')
  }
});

// Freelancer listens for invites
socket.on('job:invited', (data) => {
  console.log('New job invite!', {
    jobTitle: data.data.jobTitle,
    clientName: data.data.clientName,
    budget: data.data.jobBudget,
    expiresAt: data.data.expiresAt
  });
  
  // Show notification
  showNotification({
    type: 'success',
    title: 'Job Invitation',
    message: `${data.data.clientName} invited you to: ${data.data.jobTitle}`
  });
});

// Client listens for responses
socket.on('invite:responded', (data) => {
  console.log('Invite response:', {
    freelancerName: data.data.freelancerName,
    response: data.data.response,  // 'accepted' or 'declined'
    jobTitle: data.data.jobTitle
  });
  
  // Update invite status in UI
  updateInviteStatus(data.data.inviteId, data.data.response);
});
```

---

## 🔑 Test Tokens

For testing, use tokens with appropriate roles:

```bash
# Client Token (has clientOnly access)
CLIENT_TOKEN=eyJhbGciOiJIUzI1NiIs...

# Freelancer Token (has freelancer access)
FREELANCER_TOKEN=eyJhbGciOiJIUzI1NiIs...

# Admin Token (has admin access)
ADMIN_TOKEN=eyJhbGciOiJIUzI1NiIs...
```

---

## ✅ Complete Workflow Test

```bash
#!/bin/bash

# Setup
JOB_ID="job_123456"
FREELANCER_ID="freelancer_789"
CLIENT_TOKEN="your_client_token"
FREELANCER_TOKEN="your_freelancer_token"

# 1. Send Invitation
echo "1️⃣ Sending invitation..."
INVITE=$(curl -s -X POST http://localhost:5001/api/jobs/$JOB_ID/invite \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"freelancerId\":\"$FREELANCER_ID\",\"message\":\"Perfect match!\"}")

INVITE_ID=$(echo $INVITE | jq -r '.data.invite._id')
echo "✅ Invite created: $INVITE_ID"

# 2. Get invites as freelancer
echo -e "\n2️⃣ Freelancer checking invites..."
curl -s -X GET http://localhost:5001/api/invites?status=sent \
  -H "Authorization: Bearer $FREELANCER_TOKEN" | jq '.'

# 3. Accept invitation
echo -e "\n3️⃣ Accepting invitation..."
curl -s -X POST http://localhost:5001/api/invites/$INVITE_ID/respond \
  -H "Authorization: Bearer $FREELANCER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"response":"accepted"}' | jq '.'

# 4. Check stats
echo -e "\n4️⃣ Getting job stats..."
curl -s -X GET http://localhost:5001/api/jobs/$JOB_ID/invite-stats \
  -H "Authorization: Bearer $CLIENT_TOKEN" | jq '.'

echo -e "\n✅ Complete workflow test finished!"
```

---

## 📊 Status Codes

| Code | Meaning |
|------|---------|
| 201 | Invitation created successfully |
| 200 | OK (GET, POST responses) |
| 400 | Bad request (missing fields) |
| 403 | Forbidden (not authorized) |
| 404 | Not found |
| 409 | Conflict (duplicate) |
| 410 | Gone/Expired (invitation expired) |

---

**Last Updated:** February 15, 2026  
**Version:** 1.0
