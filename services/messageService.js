import { Message, Conversation } from '../models/Message.js';
import Contract from '../models/Contract.js';
import User from '../models/User.js';

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isParticipant = (contract, userId) => {
  const uid = userId.toString();
  return (
    contract.client.toString() === uid ||
    contract.freelancer.toString() === uid
  );
};

const resolveReceiverFromContract = (contract, senderId) => {
  const sender = senderId.toString();
  if (contract.client.toString() === sender) return contract.freelancer;
  if (contract.freelancer.toString() === sender) return contract.client;
  return null;
};

const getAccessibleContract = async ({ contractId, senderId, receiverId, activeOnly = false }) => {
  let query = null;

  if (contractId) {
    query = { _id: contractId };
  } else if (senderId && receiverId) {
    query = {
      $or: [
        { client: senderId, freelancer: receiverId },
        { client: receiverId, freelancer: senderId }
      ]
    };
  }

  if (!query) {
    throw createHttpError('Contract context is required for messaging', 400);
  }

  const contract = await Contract.findOne(query);

  if (!contract) {
    throw createHttpError('Messaging is only allowed for accepted contracts', 403);
  }

  if (activeOnly && contract.status !== 'active') {
    throw createHttpError('Chat is read-only for non-active contracts', 403);
  }

  return contract;
};

const findOrCreateContractConversation = async (contract) => {
  let conversation = await Conversation.findOne({ contract: contract._id });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [contract.client, contract.freelancer],
      contract: contract._id,
      unreadCount: {
        [contract.client.toString()]: 0,
        [contract.freelancer.toString()]: 0
      }
    });
  }

  return conversation;
};

export const canMessage = async (senderId, receiverId) => {
  if (senderId.toString() === receiverId.toString()) {
    return { allowed: false, reason: 'Cannot message yourself' };
  }

  const contract = await Contract.findOne({
    $or: [
      { client: senderId, freelancer: receiverId },
      { client: receiverId, freelancer: senderId }
    ],
    status: 'active'
  }).select('_id status');

  if (!contract) {
    return { allowed: false, reason: 'No active contract exists' };
  }

  return { allowed: true, type: 'contract', contractId: contract._id };
};

export const sendMessage = async (senderId, receiverId, messageData) => {
  const contract = await getAccessibleContract({
    contractId: messageData.contractId,
    senderId,
    receiverId,
    activeOnly: true
  });

  if (!isParticipant(contract, senderId) || !isParticipant(contract, receiverId)) {
    throw createHttpError('Unauthorized: users must belong to the contract', 403);
  }

  const senderUser = await User.findById(senderId).select('role');
  const conversation = await findOrCreateContractConversation(contract);

  const safeMessageType = ['text', 'file'].includes(messageData.messageType)
    ? messageData.messageType
    : 'text';

  const message = await Message.create({
    conversation: conversation._id,
    sender: senderId,
    receiver: receiverId,
    content: messageData.content,
    messageType: safeMessageType,
    senderRole: senderUser?.role || 'client',
    attachments: messageData.attachments || [],
    contract: contract._id
  });

  conversation.lastMessage = message._id;
  conversation.lastMessageAt = new Date();
  const receiverKey = receiverId.toString();
  const senderKey = senderId.toString();
  const currentUnread = conversation.unreadCount.get(receiverKey) || 0;
  conversation.unreadCount.set(receiverKey, currentUnread + 1);
  conversation.unreadCount.set(senderKey, 0);
  await conversation.save();

  const populatedMessage = await Message.findById(message._id)
    .populate('sender', 'firstName lastName avatar')
    .populate('receiver', 'firstName lastName avatar')
    .populate('conversation', '_id contract')
    .populate('contract', '_id status');

  return { message: populatedMessage, conversation, contract };
};

export const sendContractMessage = async (contractId, senderId, messageData) => {
  const contract = await getAccessibleContract({
    contractId,
    activeOnly: true
  });

  if (!isParticipant(contract, senderId)) {
    throw createHttpError('Forbidden: Not authorized for this contract chat', 403);
  }

  const resolvedReceiver = resolveReceiverFromContract(contract, senderId);
  if (!resolvedReceiver) {
    throw createHttpError('Invalid contract participants', 400);
  }

  return sendMessage(senderId, resolvedReceiver, {
    ...messageData,
    contractId: contract._id
  });
};

export const getUserConversations = async (userId, userRole = 'client') => {
  const query = userRole === 'super_admin'
    ? { contract: { $ne: null } }
    : { participants: userId, contract: { $ne: null } };

  const conversations = await Conversation.find(query)
    .populate('participants', 'firstName lastName avatar role')
    .populate('lastMessage')
    .populate('contract', 'title status client freelancer job')
    .sort({ lastMessageAt: -1, updatedAt: -1 });

  return conversations;
};

export const getChatThreads = async (userId, userRole = 'client') => {
  const contractQuery = userRole === 'super_admin'
    ? {}
    : {
        $or: [
          { client: userId },
          { freelancer: userId }
        ]
      };

  const contracts = await Contract.find(contractQuery)
    .populate('client', 'firstName lastName avatar role')
    .populate('freelancer', 'firstName lastName avatar role')
    .populate('job', 'title')
    .sort({ updatedAt: -1, createdAt: -1 });

  if (!contracts.length) return [];

  const contractIds = contracts.map((contract) => contract._id);

  const conversations = await Conversation.find({
    contract: { $in: contractIds }
  })
    .populate('participants', 'firstName lastName avatar role')
    .populate('lastMessage')
    .populate('contract', 'title status client freelancer job');

  const conversationByContract = new Map(
    conversations.map((conversation) => [conversation.contract?._id?.toString(), conversation])
  );

  return contracts.map((contract) => {
    const conversation = conversationByContract.get(contract._id.toString()) || null;

    // Determine the other participant - compare currentUser to both client and freelancer
    let otherParticipant = null;
    if (userRole !== 'super_admin') {
      if (contract.client?._id?.toString() === userId.toString()) {
        // Current user is the client, so other participant is freelancer
        otherParticipant = contract.freelancer || null;
      } else if (contract.freelancer?._id?.toString() === userId.toString()) {
        // Current user is the freelancer, so other participant is client
        otherParticipant = contract.client || null;
      }
    }

    const participants = conversation?.participants?.length
      ? conversation.participants
      : [contract.client, contract.freelancer];

    const unreadCount = userRole === 'super_admin'
      ? 0
      : (conversation?.unreadCount?.get?.(userId.toString()) || 0);

    return {
      _id: conversation?._id || `contract-${contract._id}`,
      contract,
      participant: otherParticipant,
      participants,
      lastMessage: conversation?.lastMessage || null,
      lastMessageAt: conversation?.lastMessageAt || contract.updatedAt || contract.createdAt,
      unreadCount,
      isReadOnly: userRole === 'super_admin' || contract.status !== 'active'
    };
  });
};

export const getConversationMessages = async (conversationId, userId, page = 1, limit = 50, userRole = 'client') => {
  const conversation = await Conversation.findById(conversationId)
    .populate('contract', 'status client freelancer');

  if (!conversation || !conversation.contract) {
    throw createHttpError('Conversation not found', 404);
  }

  const participantIds = conversation.participants.map((id) => id.toString());
  if (!participantIds.includes(userId.toString()) && userRole !== 'super_admin') {
    throw createHttpError('Not authorized to view this conversation', 403);
  }

  const skip = (page - 1) * limit;

  const messages = await Message.find({
    conversation: conversationId
  })
    .populate('sender', 'firstName lastName avatar')
    .populate('receiver', 'firstName lastName avatar')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit);

  const total = await Message.countDocuments({ conversation: conversationId });

  return {
    messages,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

export const getContractMessages = async (contractId, userId, userRole = 'client') => {
  const contract = await getAccessibleContract({ contractId });

  if (!isParticipant(contract, userId) && userRole !== 'super_admin') {
    throw createHttpError('Forbidden: Not authorized for this contract chat', 403);
  }

  const conversation = await findOrCreateContractConversation(contract);

  const messages = await Message.find({
    contract: contract._id,
    conversation: conversation._id
  })
    .populate('sender', 'firstName lastName avatar role')
    .populate('receiver', 'firstName lastName avatar role')
    .sort({ createdAt: 1 });

  return {
    contract,
    conversation,
    messages,
    isReadOnly: userRole === 'super_admin' || contract.status !== 'active'
  };
};

export const markMessageAsRead = async (messageId, userId) => {
  const message = await Message.findById(messageId);

  if (!message) {
    throw createHttpError('Message not found', 404);
  }

  if (message.receiver.toString() !== userId.toString()) {
    throw createHttpError('Only receiver can mark message as read', 403);
  }

  message.isRead = true;
  message.readAt = new Date();
  await message.save();

  return message;
};

export const markConversationAsRead = async (conversationId, userId, userRole = 'client') => {
  const conversation = await Conversation.findById(conversationId)
    .populate('contract', 'status client freelancer');

  if (!conversation || !conversation.contract) {
    throw createHttpError('Conversation not found', 404);
  }

  const participants = conversation.participants.map((id) => id.toString());
  if (!participants.includes(userId.toString()) && userRole !== 'super_admin') {
    throw createHttpError('Not authorized', 403);
  }

  if (userRole === 'super_admin') {
    return { result: { modifiedCount: 0 }, conversation };
  }

  const result = await Message.updateMany(
    {
      conversation: conversationId,
      receiver: userId,
      isRead: false
    },
    {
      isRead: true,
      readAt: new Date()
    }
  );

  conversation.unreadCount.set(userId.toString(), 0);
  await conversation.save();

  return { result, conversation };
};

export const markContractAsRead = async (contractId, userId, userRole = 'client') => {
  const contract = await getAccessibleContract({ contractId });

  if (!isParticipant(contract, userId) && userRole !== 'super_admin') {
    throw createHttpError('Forbidden: Not authorized for this contract chat', 403);
  }

  const conversation = await findOrCreateContractConversation(contract);

  if (userRole === 'super_admin') {
    return { conversation, updatedCount: 0 };
  }

  const result = await Message.updateMany(
    {
      contract: contract._id,
      conversation: conversation._id,
      receiver: userId,
      isRead: false
    },
    {
      isRead: true,
      readAt: new Date()
    }
  );

  conversation.unreadCount.set(userId.toString(), 0);
  await conversation.save();

  return { conversation, updatedCount: result.modifiedCount || 0 };
};

export const deleteMessage = async (messageId, userId) => {
  const message = await Message.findById(messageId);

  if (!message) {
    throw createHttpError('Message not found', 404);
  }

  const isSender = message.sender.toString() === userId.toString();
  const isReceiver = message.receiver.toString() === userId.toString();

  if (!isSender && !isReceiver) {
    throw createHttpError('Not authorized to delete this message', 403);
  }

  if (isSender) {
    message.isDeleted.sender = true;
  } else {
    message.isDeleted.receiver = true;
  }

  await message.save();

  if (message.isDeleted.sender && message.isDeleted.receiver) {
    await Message.findByIdAndDelete(messageId);
  }

  return message;
};

export const getUnreadCount = async (userId) => {
  const count = await Message.countDocuments({
    receiver: userId,
    isRead: false
  });

  return count;
};

export const getUnreadByConversation = async (userId) => {
  const conversations = await Conversation.find({
    participants: userId,
    contract: { $ne: null }
  });

  const unreadByConversation = {};

  for (const conversation of conversations) {
    const count = await Message.countDocuments({
      conversation: conversation._id,
      receiver: userId,
      isRead: false
    });

    if (count > 0) {
      unreadByConversation[conversation._id] = count;
    }
  }

  return unreadByConversation;
};

export const searchMessages = async (userId, query, conversationId = null, userRole = 'client') => {
  let allowedConversationIds = [];

  if (userRole === 'super_admin') {
    const allConversations = await Conversation.find({ contract: { $ne: null } }).select('_id');
    allowedConversationIds = allConversations.map((conversation) => conversation._id);
  } else {
    const userConversations = await Conversation.find({ participants: userId, contract: { $ne: null } }).select('_id');
    allowedConversationIds = userConversations.map((conversation) => conversation._id);
  }

  const searchQuery = {
    conversation: { $in: allowedConversationIds },
    content: { $regex: query, $options: 'i' }
  };

  if (conversationId) {
    if (!allowedConversationIds.find((id) => id.toString() === conversationId.toString())) {
      throw createHttpError('Not authorized to search this conversation', 403);
    }
    searchQuery.conversation = conversationId;
  }

  const messages = await Message.find(searchQuery)
    .populate('sender', 'firstName lastName avatar')
    .populate('receiver', 'firstName lastName avatar')
    .sort({ createdAt: -1 })
    .limit(50);

  return messages;
};

export const getAttachmentMetadata = async (messageId, attachmentIndex) => {
  const message = await Message.findById(messageId);

  if (!message) {
    throw createHttpError('Message not found', 404);
  }

  if (!message.attachments[attachmentIndex]) {
    throw createHttpError('Attachment not found', 404);
  }

  return message.attachments[attachmentIndex];
};

export const getDirectMessages = async (userId, otherUserId, page = 1, limit = 50) => {
  const contract = await getAccessibleContract({
    senderId: userId,
    receiverId: otherUserId
  });

  const skip = (page - 1) * limit;

  const messages = await Message.find({
    contract: contract._id,
    $or: [
      { sender: userId, receiver: otherUserId },
      { sender: otherUserId, receiver: userId }
    ]
  })
    .populate('sender', 'firstName lastName avatar')
    .populate('receiver', 'firstName lastName avatar')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit);

  const total = await Message.countDocuments({
    contract: contract._id,
    $or: [
      { sender: userId, receiver: otherUserId },
      { sender: otherUserId, receiver: userId }
    ]
  });

  return {
    messages,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};
