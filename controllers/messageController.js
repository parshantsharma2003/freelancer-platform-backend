import { asyncHandler } from '../middleware/errorHandler.js';
import * as messageService from '../services/messageService.js';

// @desc    Send a message (with contract/proposal validation)
// @route   POST /api/messages
// @access  Private
export const sendMessage = asyncHandler(async (req, res) => {
  const { receiverId, contractId, content, messageType, attachments } = req.body;

  if (!receiverId || !content) {
    return res.status(400).json({
      status: 'error',
      message: 'Receiver ID and content are required'
    });
  }

  // Send message with contract/proposal validation
  const result = await messageService.sendMessage(req.user._id, receiverId, {
    contractId,
    content,
    messageType,
    attachments
  });

  // 📡 BROADCAST MESSAGE TO RECEIVER VIA SOCKET
  try {
    const socketBroadcast = req.app.get('socketBroadcast');
    if (socketBroadcast) {
      socketBroadcast.broadcastContractMessage(result.message);
    }
  } catch (socketError) {
    console.log('[Socket] Message broadcast failed:', socketError.message);
  }

  res.status(201).json({
    status: 'success',
    message: 'Message sent successfully',
    data: { message: result.message }
  });
});

// @desc    Check if user can message another user
// @route   GET /api/messages/can-message/:userId
// @access  Private
export const checkCanMessage = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const result = await messageService.canMessage(req.user._id, userId);

  res.status(200).json({
    status: 'success',
    data: { canMessage: result.allowed, reason: result }
  });
});


// @desc    Get conversations
// @route   GET /api/messages/conversations
// @access  Private
export const getConversations = asyncHandler(async (req, res) => {
  const conversations = await messageService.getUserConversations(req.user._id, req.user.role);

  res.status(200).json({
    status: 'success',
    data: { conversations }
  });
});

// @desc    Get messages for a conversation
// @route   GET /api/messages/conversation/:conversationId
// @access  Private
export const getMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const result = await messageService.getConversationMessages(
    conversationId,
    req.user._id,
    parseInt(page),
    parseInt(limit),
    req.user.role
  );

  // Mark all as read
  const readResult = await messageService.markConversationAsRead(conversationId, req.user._id, req.user.role);

  try {
    const socketBroadcast = req.app.get('socketBroadcast');
    if (socketBroadcast && readResult.conversation) {
      socketBroadcast.broadcastReadReceipt(readResult.conversation, req.user._id);
    }
  } catch (socketError) {
    console.log('[Socket] Read receipt broadcast failed:', socketError.message);
  }

  res.status(200).json({
    status: 'success',
    data: result
  });
});


// @desc    Mark message as read
// @route   PUT /api/messages/:id/read
// @access  Private
export const markAsRead = asyncHandler(async (req, res) => {
  const message = await messageService.markMessageAsRead(req.params.id, req.user._id);

  res.status(200).json({
    status: 'success',
    message: 'Message marked as read',
    data: { message }
  });
});

// @desc    Delete message
// @route   DELETE /api/messages/:id
// @access  Private
export const deleteMessage = asyncHandler(async (req, res) => {
  const message = await messageService.deleteMessage(req.params.id, req.user._id);

  res.status(200).json({
    status: 'success',
    message: 'Message deleted successfully'
  });
});

// @desc    Get unread message count
// @route   GET /api/messages/unread/count
// @access  Private
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await messageService.getUnreadCount(req.user._id);

  res.status(200).json({
    status: 'success',
    data: { unreadCount: count }
  });
});

// @desc    Get unread messages by conversation
// @route   GET /api/messages/unread/by-conversation
// @access  Private
export const getUnreadByConversation = asyncHandler(async (req, res) => {
  const unreadByConversation = await messageService.getUnreadByConversation(req.user._id);

  res.status(200).json({
    status: 'success',
    data: { unreadByConversation }
  });
});

// @desc    Search messages
// @route   GET /api/messages/search
// @access  Private
export const searchMessages = asyncHandler(async (req, res) => {
  const { q, conversationId } = req.query;

  if (!q) {
    return res.status(400).json({
      status: 'error',
      message: 'Search query is required'
    });
  }

  const messages = await messageService.searchMessages(req.user._id, q, conversationId, req.user.role);

  res.status(200).json({
    status: 'success',
    data: { messages }
  });
});

// @desc    Get attachment metadata
// @route   GET /api/messages/:id/attachments/:index
// @access  Private
export const getAttachmentMetadata = asyncHandler(async (req, res) => {
  const { id, index } = req.params;

  const attachment = await messageService.getAttachmentMetadata(id, parseInt(index));

  res.status(200).json({
    status: 'success',
    data: { attachment }
  });
});

// @desc    Get direct messages between two users
// @route   GET /api/messages/direct/:userId
// @access  Private
export const getDirectMessages = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const result = await messageService.getDirectMessages(
    req.user._id,
    userId,
    parseInt(page),
    parseInt(limit)
  );

  res.status(200).json({
    status: 'success',
    data: result
  });
});

// @desc    Get contract chat threads
// @route   GET /api/chats
// @access  Private
export const getChats = asyncHandler(async (req, res) => {
  const chats = await messageService.getChatThreads(req.user._id, req.user.role);

  res.status(200).json({
    status: 'success',
    data: { chats }
  });
});

// @desc    Get full contract message history
// @route   GET /api/chats/:contractId/messages
// @access  Private
export const getContractMessages = asyncHandler(async (req, res) => {
  const { contractId } = req.params;

  const result = await messageService.getContractMessages(contractId, req.user._id, req.user.role);
  await messageService.markContractAsRead(contractId, req.user._id, req.user.role);

  try {
    const socketBroadcast = req.app.get('socketBroadcast');
    if (socketBroadcast) {
      socketBroadcast.broadcastContractReadReceipt(contractId, req.user._id);
    }
  } catch (socketError) {
    console.log('[Socket] Contract read receipt broadcast failed:', socketError.message);
  }

  res.status(200).json({
    status: 'success',
    data: {
      contract: result.contract,
      conversation: result.conversation,
      messages: result.messages,
      isReadOnly: result.isReadOnly
    }
  });
});

// @desc    Send contract chat message
// @route   POST /api/chats/:contractId/messages
// @access  Private
export const sendContractMessage = asyncHandler(async (req, res) => {
  const { contractId } = req.params;
  const { content, messageType, attachments } = req.body;

  if (!content) {
    return res.status(400).json({
      status: 'error',
      message: 'Message content is required'
    });
  }

  const result = await messageService.sendContractMessage(contractId, req.user._id, {
    content,
    messageType,
    attachments
  });

  try {
    const socketBroadcast = req.app.get('socketBroadcast');
    if (socketBroadcast) {
      socketBroadcast.broadcastContractMessage(result.message);
    }
  } catch (socketError) {
    console.log('[Socket] Contract message broadcast failed:', socketError.message);
  }

  res.status(201).json({
    status: 'success',
    message: 'Message sent successfully',
    data: {
      message: result.message,
      contractId
    }
  });
});
