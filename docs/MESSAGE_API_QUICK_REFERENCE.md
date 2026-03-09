# Message API Quick Reference

## Base URL
```
http://localhost:5001/api/messages
```

## Authentication
All endpoints require Bearer token in Authorization header:
```
Authorization: Bearer {token}
```

---

## Endpoints at a Glance

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/` | Send message |
| GET | `/can-message/:userId` | Check if messaging allowed |
| GET | `/conversations` | Get all conversations |
| GET | `/conversation/:conversationId` | Get messages in conversation |
| PUT | `/:id/read` | Mark message as read |
| DELETE | `/:id` | Delete message |
| GET | `/unread/count` | Get total unread count |
| GET | `/unread/by-conversation` | Get unread per conversation |
| GET | `/search` | Search messages |
| GET | `/:id/attachments/:index` | Get attachment metadata |
| GET | `/direct/:userId` | Direct messages with user |

---

## Common Operations

### 1. Send a Message

**Request:**
```bash
curl -X POST http://localhost:5001/api/messages \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "receiverId": "user123",
    "content": "Hello, how are you?",
    "messageType": "text"
  }'
```

**JavaScript (Fetch):**
```javascript
const response = await fetch('/api/messages', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    receiverId: 'user123',
    content: 'Hello, how are you?',
    messageType: 'text'
  })
});
const data = await response.json();
```

**With Attachment:**
```javascript
const response = await fetch('/api/messages', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    receiverId: 'user123',
    content: 'Here is the file:',
    messageType: 'file',
    attachments: [
      {
        name: 'proposal.pdf',
        url: 'https://cdn.example.com/proposal.pdf',
        size: 102400,
        type: 'application/pdf'
      }
    ]
  })
});
```

**Success Response (201):**
```json
{
  "status": "success",
  "message": "Message sent successfully",
  "data": {
    "message": {
      "_id": "msg123",
      "sender": { "_id": "user1", "firstName": "John" },
      "receiver": { "_id": "user2", "firstName": "Jane" },
      "conversation": { "_id": "conv123" },
      "content": "Hello, how are you?",
      "messageType": "text",
      "isRead": false,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

**Error: No Contract/Proposal (400):**
```json
{
  "status": "error",
  "message": "You can only message users you have a contract or active proposal with"
}
```

---

### 2. Check if Can Message

**Request:**
```bash
curl -X GET http://localhost:5001/api/messages/can-message/user456 \
  -H "Authorization: Bearer {token}"
```

**JavaScript:**
```javascript
const canMessageResponse = await fetch('/api/messages/can-message/user456', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const canMessage = await canMessageResponse.json();

if (canMessage.data.canMessage) {
  // Show message input form
} else {
  // Show error explaining why messaging not allowed
  console.log(canMessage.data.reason);
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "canMessage": true,
    "reason": {
      "allowed": true,
      "type": "contract",
      "contractId": "contract123"
    }
  }
}
```

---

### 3. Get All Conversations (Inbox)

**Request:**
```bash
curl -X GET http://localhost:5001/api/messages/conversations \
  -H "Authorization: Bearer {token}"
```

**JavaScript:**
```javascript
const response = await fetch('/api/messages/conversations', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();

data.data.conversations.forEach(conv => {
  console.log(`Chat with ${conv.participants[0].firstName}`);
  console.log(`Last message: ${conv.lastMessage.content}`);
  console.log(`Unread: ${conv.unreadCount[currentUserId] || 0}`);
});
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "conversations": [
      {
        "_id": "conv123",
        "participants": [
          { "_id": "user2", "firstName": "Jane", "lastName": "Doe" }
        ],
        "lastMessage": {
          "_id": "msg456",
          "content": "Thanks for the update!",
          "createdAt": "2024-01-15T10:30:00Z"
        },
        "lastMessageAt": "2024-01-15T10:30:00Z",
        "contract": { "_id": "contract123" },
        "unreadCount": { "user1": 2 }
      }
    ]
  }
}
```

---

### 4. Get Messages in Conversation

**Request:**
```bash
curl -X GET "http://localhost:5001/api/messages/conversation/conv123?page=1&limit=50" \
  -H "Authorization: Bearer {token}"
```

**JavaScript:**
```javascript
const response = await fetch('/api/messages/conversation/conv123?page=1&limit=50', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();

// Auto-marked as read by this endpoint!
console.log(`Loaded ${data.data.messages.length} messages`);
console.log(`Total: ${data.data.pagination.total}`);

data.data.messages.forEach(msg => {
  console.log(`${msg.sender.firstName}: ${msg.content}`);
});
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "messages": [
      {
        "_id": "msg1",
        "sender": { "_id": "user2", "firstName": "Jane" },
        "content": "Hi there!",
        "isRead": true,
        "readAt": "2024-01-15T10:31:00Z",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "total": 150,
      "page": 1,
      "limit": 50,
      "pages": 3
    }
  }
}
```

---

### 5. Mark Message as Read

**Request:**
```bash
curl -X PUT http://localhost:5001/api/messages/msg123/read \
  -H "Authorization: Bearer {token}"
```

**JavaScript:**
```javascript
const response = await fetch('/api/messages/msg123/read', {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();
console.log(`Message marked as read at ${data.data.message.readAt}`);
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Message marked as read",
  "data": {
    "message": {
      "_id": "msg123",
      "isRead": true,
      "readAt": "2024-01-15T10:35:00Z"
    }
  }
}
```

---

### 6. Delete Message

**Request:**
```bash
curl -X DELETE http://localhost:5001/api/messages/msg123 \
  -H "Authorization: Bearer {token}"
```

**JavaScript:**
```javascript
const response = await fetch('/api/messages/msg123', {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();
console.log(data.message); // "Message deleted successfully"
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Message deleted successfully"
}
```

---

### 7. Get Unread Count

**Request:**
```bash
curl -X GET http://localhost:5001/api/messages/unread/count \
  -H "Authorization: Bearer {token}"
```

**JavaScript:**
```javascript
const response = await fetch('/api/messages/unread/count', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();
console.log(`You have ${data.data.unreadCount} unread messages`);
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "unreadCount": 5
  }
}
```

---

### 8. Get Unread Per Conversation

**Request:**
```bash
curl -X GET http://localhost:5001/api/messages/unread/by-conversation \
  -H "Authorization: Bearer {token}"
```

**JavaScript:**
```javascript
const response = await fetch('/api/messages/unread/by-conversation', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();

Object.entries(data.data.unreadByConversation).forEach(([convId, count]) => {
  if (count > 0) {
    console.log(`${count} unread in conversation ${convId}`);
  }
});
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "unreadByConversation": {
      "conv123": 3,
      "conv456": 1,
      "conv789": 0
    }
  }
}
```

---

### 9. Search Messages

**Request:**
```bash
curl -X GET "http://localhost:5001/api/messages/search?q=budget" \
  -H "Authorization: Bearer {token}"
```

**With Conversation Filter:**
```bash
curl -X GET "http://localhost:5001/api/messages/search?q=project&conversationId=conv123" \
  -H "Authorization: Bearer {token}"
```

**JavaScript:**
```javascript
const response = await fetch('/api/messages/search?q=budget', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();

data.data.messages.forEach(msg => {
  console.log(`Found in ${msg.conversation._id}: ${msg.content}`);
});
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "messages": [
      {
        "_id": "msg1",
        "sender": { "_id": "user1", "firstName": "John" },
        "content": "What is the project budget?",
        "conversation": { "_id": "conv123" },
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

---

### 10. Get Attachment Metadata

**Request:**
```bash
curl -X GET http://localhost:5001/api/messages/msg123/attachments/0 \
  -H "Authorization: Bearer {token}"
```

**JavaScript:**
```javascript
const response = await fetch('/api/messages/msg123/attachments/0', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();

const attachment = data.data.attachment;
console.log(`File: ${attachment.name}`);
console.log(`Size: ${attachment.size} bytes`);
// Use attachment.url to download the file
window.open(attachment.url);
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "attachment": {
      "name": "proposal.pdf",
      "url": "https://cdn.example.com/file-123.pdf",
      "size": 102400,
      "type": "application/pdf",
      "uploadedAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

---

## Socket.io Events

### Subscribe to New Messages

**Client-side JavaScript:**
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5001', {
  auth: {
    token: localStorage.getItem('token')
  }
});

// Join user's personal room (automatic on connect)
// Listen for new messages
socket.on('message:new', (event) => {
  console.log('New message received!');
  console.log('From:', event.data.senderName);
  console.log('Content:', event.data.content);
  console.log('In conversation:', event.data.conversationId);
  
  // Update UI
  addMessageToUI(event.data);
  playNotificationSound();
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

**Event Payload:**
```javascript
{
  status: 'success',
  event: 'message:new',
  data: {
    messageId: 'msg123',
    senderId: 'user1',
    senderName: 'John Doe',
    receiverId: 'user2',
    conversationId: 'conv123',
    content: 'Hello!',
    messageType: 'text',
    contractId: 'contract123', // or null
    proposalId: null,
    attachmentsCount: 0,
    createdAt: '2024-01-15T10:30:00Z'
  },
  timestamp: '2024-01-15T10:30:00Z'
}
```

---

## Frontend Integration Pattern

### Complete Messaging Component

```javascript
import { useState, useEffect } from 'react';
import io from 'socket.io-client';

export const MessagingComponent = ({ userId, recipientId, token }) => {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [canMessage, setCanMessage] = useState(false);
  const [socket, setSocket] = useState(null);

  // Initialize socket
  useEffect(() => {
    const newSocket = io('http://localhost:5001', {
      auth: { token }
    });

    newSocket.on('message:new', (event) => {
      // Add received message to conversation
      if (activeConversation?._id === event.data.conversationId) {
        setMessages(prev => [...prev, event.data]);
      }
      // Update unread badge
      loadUnreadCount();
    });

    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, [token]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    loadUnreadCount();
  }, []);

  // Check if can message
  useEffect(() => {
    checkCanMessage();
  }, [recipientId]);

  const loadConversations = async () => {
    const response = await fetch('/api/messages/conversations', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    setConversations(data.data.conversations);
  };

  const loadMessages = async (conversationId) => {
    const response = await fetch(`/api/messages/conversation/${conversationId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    setMessages(data.data.messages);
    setActiveConversation(conversationId);
  };

  const loadUnreadCount = async () => {
    const response = await fetch('/api/messages/unread/count', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    setUnreadCount(data.data.unreadCount);
  };

  const checkCanMessage = async () => {
    if (!recipientId) return;
    const response = await fetch(`/api/messages/can-message/${recipientId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    setCanMessage(data.data.canMessage);
  };

  const sendMessage = async (content) => {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receiverId: recipientId,
        content,
        messageType: 'text'
      })
    });
    const data = await response.json();
    if (response.ok) {
      setMessages(prev => [...prev, data.data.message]);
    }
  };

  return (
    <div className="messaging-component">
      <div className="conversations-list">
        {conversations.map(conv => (
          <div
            key={conv._id}
            className="conversation-item"
            onClick={() => loadMessages(conv._id)}
          >
            <h4>{conv.participants[0].firstName}</h4>
            <p>{conv.lastMessage.content}</p>
            {conv.unreadCount[userId] > 0 && (
              <span className="badge">{conv.unreadCount[userId]}</span>
            )}
          </div>
        ))}
      </div>

      <div className="conversation-view">
        {canMessage ? (
          <>
            <div className="messages">
              {messages.map(msg => (
                <div key={msg._id} className="message">
                  <strong>{msg.sender.firstName}:</strong> {msg.content}
                  {msg.isRead && <span className="read-receipt">✓✓</span>}
                </div>
              ))}
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              sendMessage(e.target.content.value);
              e.target.reset();
            }}>
              <input
                name="content"
                placeholder="Type message..."
                required
              />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <p>You cannot message this user without an active contract or proposal</p>
        )}
      </div>

      <div className="unread-badge">
        {unreadCount} unread
      </div>
    </div>
  );
};
```

---

## Error Reference

| Error | Status | Cause |
|-------|--------|-------|
| Receiver ID required | 400 | Missing receiverId in body |
| Content required | 400 | Missing content in body |
| Cannot message yourself | 400 | Trying to message own account |
| No contract/proposal | 400 | No valid relationship exists |
| Conversation not found | 404 | Invalid conversationId |
| User not participant | 403 | User not in conversation |
| Message not found | 404 | Invalid messageId |
| Unauthorized | 401 | Missing or invalid token |

---

## Rate Limits

No specific rate limits on messaging endpoints, but general API rate limits apply:
- 100 requests per minute per IP
- Use pagination for bulk operations

---

## Best Practices

1. ✅ **Check canMessage before showing form**
   ```javascript
   const canSend = await checkCanMessage(userId);
   if (canSend) showMessageForm();
   ```

2. ✅ **Use Socket.io for real-time**
   - Don't poll `/api/messages/conversations` repeatedly
   - Listen to `message:new` socket events

3. ✅ **Handle pagination**
   ```javascript
   const page2 = await fetch('/api/messages/conversation/conv?page=2&limit=50');
   ```

4. ✅ **Display unread badges**
   - Get per-conversation unread via `/unread/by-conversation`
   - Update on socket `message:new` event

5. ✅ **Use metadata URLs**
   - Get attachment metadata from `/attachments/:index`
   - Let user click URL to download (no streaming needed)

6. ❌ **Don't** fetch all messages at once
   - Use pagination
   - Load on scroll

7. ❌ **Don't** poll for new messages
   - Use Socket.io events
   - More efficient and real-time
