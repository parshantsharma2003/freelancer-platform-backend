# Contract-Based Messaging System

## Overview

The Contract-Based Messaging System enables secure, authenticated communication between clients and freelancers on the platform. Messages are only allowed between users who have:
1. An active contract, OR
2. An active proposal (pending, shortlisted, accepted)

## Architecture

### 1. Database Schema

#### Message Model
```javascript
{
  sender: ObjectId (User ref),
  receiver: ObjectId (User ref),
  conversation: ObjectId (Conversation ref),
  contract: ObjectId (Contract ref, optional),
  proposal: ObjectId (Proposal ref, optional),
  content: String,
  messageType: String (enum: 'text', 'file', 'image'),
  attachments: [{
    name: String,
    url: String,
    size: Number,
    type: String (MIME type),
    uploadedAt: Date
  }],
  isRead: Boolean (default: false),
  readAt: Date (optional),
  isDeleted: {
    sender: Boolean,
    receiver: Boolean
  },
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes for Performance:**
- `(sender, receiver, createdAt)` - For direct message queries
- `(contract, createdAt)` - For contract-specific messages
- `(proposal, createdAt)` - For proposal-specific messages
- `(isRead, receiver)` - For unread message queries

#### Conversation Model
```javascript
{
  participants: [ObjectId] (User refs),
  contract: ObjectId (Contract ref, optional),
  proposal: ObjectId (Proposal ref, optional),
  lastMessage: ObjectId (Message ref),
  lastMessageAt: Date,
  unreadCount: Map<String, Number>, // userId -> count
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes for Performance:**
- `(contract)` - For contract conversations
- `(proposal)` - For proposal conversations

### 2. Service Layer (messageService.js)

#### Core Functions

##### canMessage(senderId, receiverId)
**Purpose:** Authorization gatekeeper - validates if two users can message

**Logic:**
1. Check if senderId === receiverId (prevent self-messaging)
2. Query Contract with status in ['active', 'pending', 'in-progress']
3. Query Proposal from senderId to receiverId's jobs
4. Query reverse Proposal from receiverId to senderId's jobs

**Returns:**
```javascript
{
  allowed: boolean,
  type: 'contract' | 'proposal',
  contractId: ObjectId | null,
  proposalId: ObjectId | null
}
```

**Throws Error if:**
- Trying to message yourself
- No contract or active proposal exists

##### sendMessage(senderId, receiverId, messageData)
**Purpose:** Safe message creation with authorization

**Process:**
1. Call canMessage() - BLOCKS if validation fails
2. Find or create conversation
3. Create message document with contract/proposal references
4. Populate sender, receiver, conversation refs
5. Update conversation lastMessage, lastMessageAt

**Returns:**
```javascript
{
  message: Message (populated),
  conversation: Conversation (updated)
}
```

##### getUserConversations(userId)
**Purpose:** Get all conversations for inbox view

**Features:**
- Populates participants, lastMessage, contract, proposal
- Sorted by lastMessageAt DESC (most recent first)
- Includes unread count for each conversation

**Returns:** Array of Conversation documents

##### getConversationMessages(conversationId, userId, page, limit)
**Purpose:** Paginated message retrieval for conversation view

**Validation:**
- Verify userId is in participants array
- Filter isDeleted[userId] !== true (soft delete)

**Process:**
1. Count total messages in conversation
2. Skip and limit for pagination
3. Sort by createdAt ASC (chronological order)
4. Populate sender, receiver refs

**Returns:**
```javascript
{
  messages: Message[],
  pagination: {
    total: number,
    page: number,
    limit: number,
    pages: number
  }
}
```

##### markMessageAsRead(messageId, userId)
**Purpose:** Mark single message as read

**Validation:**
- Verify userId is receiver

**Updates:**
- isRead = true
- readAt = current timestamp

**Returns:** Updated Message document

##### markConversationAsRead(conversationId, userId)
**Purpose:** Bulk mark all unread messages in conversation as read

**Process:**
1. Update all messages in conversation where receiver=userId and isRead=false
2. Set isRead=true and readAt=timestamp
3. Reset conversation.unreadCount[userId] = 0

**Returns:** Count of updated messages

##### deleteMessage(messageId, userId)
**Purpose:** Soft delete with dual tracking

**Process:**
1. Check if userId is sender or receiver
2. Mark isDeleted[sender] or isDeleted[receiver] = true
3. If BOTH marked deleted, hard delete from database

**Returns:** Updated or deleted Message

**Privacy Feature:** Each user can delete independently without affecting other user's view

##### getUnreadCount(userId)
**Purpose:** Get total unread message count

**Query:** Count messages where receiver=userId AND isRead=false

**Returns:** Number

##### getUnreadByConversation(userId)
**Purpose:** Get unread breakdown per conversation

**Returns:**
```javascript
{
  conversationId: unreadCount,
  conversationId2: unreadCount2,
  ...
}
```

##### searchMessages(userId, query, conversationId)
**Purpose:** Text search through messages

**Query:** Uses regex with case-insensitive flag
- Pattern: `{$regex: query, $options: 'i'}`

**Optional Filter:** Limit to specific conversation if conversationId provided

**Returns:** Array of Message documents matching search

##### getAttachmentMetadata(messageId, index)
**Purpose:** Retrieve attachment metadata ONLY (security enforced)

**Returns:**
```javascript
{
  name: String,
  url: String,
  size: Number,
  type: String,
  uploadedAt: Date
}
```

**Security Note:** NO raw file data is ever included - only metadata for the frontend to download using the URL

##### getDirectMessages(userId, otherUserId, page, limit)
**Purpose:** Get direct messages between two specific users

**Feature:** Doesn't require conversation lookup - useful for quick messaging

**Returns:** Paginated message array with conversation info

### 3. Controller Layer (messageController.js)

#### Endpoints

##### POST /api/messages
**Send a Message**

**Request:**
```json
{
  "receiverId": "ObjectId",
  "content": "Message text",
  "messageType": "text",
  "attachments": [
    {
      "name": "file.pdf",
      "url": "https://...",
      "size": 1024,
      "type": "application/pdf"
    }
  ]
}
```

**Validation:**
- receiverId and content are required
- calls canMessage() internally (blocks if not allowed)

**Socket Broadcast:**
- Emits `message:new` to `user:${receiverId}` room
- Payload includes messageId, senderId, senderName, content, timestamps

**Response:**
```json
{
  "status": "success",
  "message": "Message sent successfully",
  "data": {
    "message": { ...full message doc... }
  }
}
```

##### GET /api/messages/can-message/:userId
**Check if Messaging is Allowed**

**Purpose:** Frontend checks before showing message form

**Returns:**
```json
{
  "status": "success",
  "data": {
    "canMessage": boolean,
    "reason": {
      "allowed": boolean,
      "type": "contract" | "proposal",
      "contractId": ObjectId | null,
      "proposalId": ObjectId | null
    }
  }
}
```

##### GET /api/messages/conversations
**Get All Conversations**

**Purpose:** Inbox view - all conversations sorted by latest

**Returns:**
```json
{
  "status": "success",
  "data": {
    "conversations": [
      {
        "_id": "...",
        "participants": [{_id, firstName, lastName, ...}],
        "lastMessage": {...full message doc...},
        "contract": {...contract doc...},
        "proposal": {...proposal doc...},
        "unreadCount": {...}
      }
    ]
  }
}
```

##### GET /api/messages/conversation/:conversationId?page=1&limit=50
**Get Conversation Messages**

**Auto-marks:** Entire conversation as read for current user

**Query Params:**
- page: Number (default: 1)
- limit: Number (default: 50)

**Returns:**
```json
{
  "status": "success",
  "data": {
    "messages": [...],
    "pagination": {
      "total": number,
      "page": number,
      "limit": number,
      "pages": number
    }
  }
}
```

##### PUT /api/messages/:id/read
**Mark Single Message as Read**

**Returns:**
```json
{
  "status": "success",
  "message": "Message marked as read",
  "data": {
    "message": {...updated message...}
  }
}
```

##### DELETE /api/messages/:id
**Delete Message**

**Process:** Soft delete (dual-tracked)

**Returns:**
```json
{
  "status": "success",
  "message": "Message deleted successfully"
}
```

##### GET /api/messages/unread/count
**Get Total Unread Count**

**Returns:**
```json
{
  "status": "success",
  "data": {
    "unreadCount": number
  }
}
```

##### GET /api/messages/unread/by-conversation
**Get Unread Count Per Conversation**

**Returns:**
```json
{
  "status": "success",
  "data": {
    "unreadByConversation": {
      "conversationId1": 3,
      "conversationId2": 1
    }
  }
}
```

##### GET /api/messages/search?q=search+term&conversationId=optional
**Search Messages**

**Query Params:**
- q: String (required) - search term
- conversationId: ObjectId (optional) - limit search to conversation

**Returns:**
```json
{
  "status": "success",
  "data": {
    "messages": [...]
  }
}
```

##### GET /api/messages/:id/attachments/:index
**Get Attachment Metadata**

**Path Params:**
- id: Message ID
- index: Attachment index in array

**Returns:**
```json
{
  "status": "success",
  "data": {
    "attachment": {
      "name": string,
      "url": string,
      "size": number,
      "type": string,
      "uploadedAt": date
    }
  }
}
```

##### GET /api/messages/direct/:userId?page=1&limit=50
**Get Direct Messages**

**Purpose:** Messages between two specific users

**Returns:**
```json
{
  "status": "success",
  "data": {
    "messages": [...],
    "pagination": {...}
  }
}
```

## Socket.io Events

### Broadcasting

#### message:new
**Emitted to:** `user:${receiverId}` room
**Payload:**
```javascript
{
  status: 'success',
  event: 'message:new',
  data: {
    messageId: ObjectId,
    senderId: ObjectId,
    senderName: string,
    receiverId: ObjectId,
    conversationId: ObjectId,
    content: string,
    messageType: string,
    contractId: ObjectId | null,
    proposalId: ObjectId | null,
    attachmentsCount: number,
    createdAt: Date
  },
  timestamp: Date
}
```

**Triggered by:** sendMessage() controller

## Security Features

### 1. Authorization Validation
- **canMessage()** ensures contract or active proposal exists
- No messaging between unauthorized users
- Clear error messages for blocked messaging

### 2. Data Privacy
- **Soft Delete:** Each user deletes independently
- **Read Status:** Only receiver can mark as read
- **Conversation Access:** Only participants can view messages

### 3. File Security
- **getAttachmentMetadata()** returns metadata ONLY
- No raw file data in database
- Frontend must use URL from metadata to download files

### 4. User Verification
- All endpoints require authentication (protect middleware)
- ObjectId validation on path parameters
- User ID from JWT token for authorization

## Flow Diagrams

### Message Sending Flow
```
POST /api/messages
    ↓
canMessage(senderId, receiverId)
    ├─→ Check Contract (active|pending|in-progress)
    ├─→ Check Proposal (senderId → receiverId's job)
    └─→ Check Reverse Proposal (receiverId → senderId's job)
    ↓
sendMessage() service
    ├─→ Create/Update Conversation
    ├─→ Create Message with contract/proposal refs
    └─→ Populate sender, receiver
    ↓
Socket Broadcast
    └─→ emit 'message:new' to receiver's room
    ↓
Response with Message
```

### Authorization Decision Tree
```
Can User A message User B?
├─ Contract exists? (both ways, active|pending|in-progress)
│  └─ YES → Allow (type: 'contract')
├─ Proposal from A → B's job?
│  └─ YES, status active → Allow (type: 'proposal')
├─ Proposal from B → A's job?
│  └─ YES, status active → Allow (type: 'proposal')
└─ NO → Block with error
```

## Error Handling

### Validation Errors
```json
{
  "status": "error",
  "message": "Receiver ID and content are required"
}
```

### Authorization Errors
```json
{
  "status": "error",
  "message": "Cannot message yourself"
}
```

```json
{
  "status": "error",
  "message": "You can only message users you have a contract or active proposal with"
}
```

### Database Errors
```json
{
  "status": "error",
  "message": "Conversation not found"
}
```

## Performance Optimizations

1. **Indexed Queries:**
   - Direct message lookup: `(sender, receiver, createdAt)`
   - Contract messages: `(contract, createdAt)`
   - Unread queries: `(isRead, receiver)`

2. **Pagination:**
   - All message lists support page/limit parameters
   - Default limit: 50 messages

3. **Soft Delete:**
   - No hard deletes unless both users delete
   - Maintains conversation history

4. **Conversation Caching:**
   - lastMessage and lastMessageAt tracked
   - Prevents expensive sorting on inbox list

## Testing Recommendations

### Unit Tests
- [ ] canMessage() with contracts
- [ ] canMessage() with proposals
- [ ] canMessage() blocking self-messaging
- [ ] sendMessage() with authorization
- [ ] markMessageAsRead() timestamp
- [ ] deleteMessage() dual-delete logic
- [ ] searchMessages() regex matching
- [ ] getAttachmentMetadata() metadata-only

### Integration Tests
- [ ] Send message → Socket broadcast
- [ ] Get conversation → Auto-mark read
- [ ] Search across messages
- [ ] Soft delete by both users

### Security Tests
- [ ] Unauthorized user can't send message
- [ ] Unauthorized user can't access conversation
- [ ] Attachment URL is returned (no raw data)
- [ ] Receiver can't mark sender's deletion
