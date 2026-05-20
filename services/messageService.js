import { Message, Conversation } from '../models/Message.js';
import Contract from '../models/Contract.js';
import User from '../models/User.js';

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value?._id) return value._id.toString();
  if (typeof value.toString === 'function') return value.toString();
  return null;
};

const normalizeAttachmentsForSchema = (attachments = []) => {
  const list = Array.isArray(attachments) ? attachments : [];
  const attachmentsPath = Message.schema.path('attachments');
  const expectsStringArray = attachmentsPath?.caster?.instance === 'String';

  if (expectsStringArray) {
    return list
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          return item.url || item.name || '';
        }
        return '';
      })
      .filter(Boolean);
  }

  return list
    .map((item) => {
      if (typeof item === 'string') {
        return {
          name: item.split('/').pop() || 'attachment',
          url: item,
          type: 'file',
          uploadedAt: new Date()
        };
      }

      if (item && typeof item === 'object') {
        return {
          name: item.name || item.url?.split('/').pop() || 'attachment',
          url: item.url || '',
          size: typeof item.size === 'number' ? item.size : undefined,
          type: item.type || 'file',
          uploadedAt: item.uploadedAt ? new Date(item.uploadedAt) : new Date()
        };
      }

      return null;
    })
    .filter((item) => item && item.url);
};

const isParticipant = (contract, userId) => {
  const uid = getIdString(userId);
  const clientId = getIdString(contract.client);
  const freelancerId = getIdString(contract.freelancer);
  return (
    !!uid &&
    (clientId === uid || freelancerId === uid)
  );
};

const resolveReceiverFromContract = (contract, senderId) => {
  const sender = getIdString(senderId);
  const clientId = getIdString(contract.client);
  const freelancerId = getIdString(contract.freelancer);

  if (!sender || !clientId || !freelancerId) return null;

  if (clientId === sender) return contract.freelancer;
  if (freelancerId === sender) return contract.client;
  return null;
};

const findOrCreateDirectConversation = async (senderId, receiverId, context = {}) => {
  const participantQuery = {
    participants: { $all: [senderId, receiverId] },
    $or: [
      { contract: { $exists: false } },
      { contract: null }
    ]
  };

  if (context.jobId) {
    participantQuery.job = context.jobId;
  }

  if (context.proposalId) {
    participantQuery.proposal = context.proposalId;
  }

  let conversation = await Conversation.findOne(participantQuery);

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [senderId, receiverId],
      job: context.jobId || undefined,
      proposal: context.proposalId || undefined,
      unreadCount: {
        [senderId.toString()]: 0,
        [receiverId.toString()]: 0
      }
    });
  }

  return conversation;
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

  // Check if an active contract exists between the two users
  const contract = await Contract.findOne({
    $or: [
      { client: senderId, freelancer: receiverId, status: 'active' },
      { client: receiverId, freelancer: senderId, status: 'active' }
    ]
  }).select('_id status');

  if (!contract) {
    return { 
      allowed: false, 
      reason: 'Messaging is only available after a contract has been successfully created between you' 
    };
  }

  return { allowed: true, type: 'contract', contractId: contract._id };
};

export const sendMessage = async (senderId, receiverId, messageData) => {
  const hasContractContext = !!messageData.contractId;
  let contract = null;
  let conversation = null;

  if (hasContractContext) {
    contract = await getAccessibleContract({
      contractId: messageData.contractId,
      senderId,
      receiverId,
      activeOnly: true
    });

    if (!isParticipant(contract, senderId) || !isParticipant(contract, receiverId)) {
      throw createHttpError('Unauthorized: users must belong to the contract', 403);
    }

    conversation = await findOrCreateContractConversation(contract);
  } else {
    if (!receiverId) {
      throw createHttpError('Receiver ID is required', 400);
    }

    // ENFORCE: Contract requirement - direct messaging only allowed if active contract exists
    const activeContract = await Contract.findOne({
      $or: [
        { client: senderId, freelancer: receiverId, status: 'active' },
        { client: receiverId, freelancer: senderId, status: 'active' }
      ]
    }).select('_id status client freelancer');

    if (!activeContract) {
      throw createHttpError(
        'Messaging is only available after a contract has been successfully created between you',
        403
      );
    }

    // Use the contract-based conversation for direct messaging
    contract = activeContract;
    conversation = await findOrCreateContractConversation(contract);

    if (!conversation) {
      throw createHttpError('Conversation not found', 404);
    }

    const participantIds = (conversation.participants || []).map((participant) => getIdString(participant));
    if (!participantIds.includes(getIdString(senderId)) || !participantIds.includes(getIdString(receiverId))) {
      throw createHttpError('Unauthorized: users must belong to this conversation', 403);
    }
  }

  const senderUser = await User.findById(senderId).select('role');

  const safeMessageType = ['text', 'file', 'voice', 'image'].includes(messageData.messageType)
    ? messageData.messageType
    : 'text';

  const normalizedAttachments = normalizeAttachmentsForSchema(messageData.attachments);

  const message = await Message.create({
    conversation: conversation._id,
    sender: senderId,
    receiver: receiverId,
    content: messageData.content,
    messageType: safeMessageType,
    senderRole: senderUser?.role || 'client',
    attachments: normalizedAttachments,
    contract: contract?._id,
    proposal: messageData.proposalId || undefined
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

  let resolvedReceiver = resolveReceiverFromContract(contract, senderId);

  // Fallback for legacy conversations where contract participants may be stale/populated unexpectedly.
  if (!resolvedReceiver) {
    const conversation = await Conversation.findOne({ contract: contract._id }).select('participants');
    const sender = getIdString(senderId);
    const fallbackReceiverId = conversation?.participants
      ?.map((participantId) => getIdString(participantId))
      ?.find((participantId) => participantId && participantId !== sender);

    if (fallbackReceiverId) {
      resolvedReceiver = fallbackReceiverId;
    }
  }

  if (!resolvedReceiver) {
    throw createHttpError('Contract participant mapping is invalid for this chat', 403);
  }

  return sendMessage(senderId, resolvedReceiver, {
    ...messageData,
    contractId: contract._id
  });
};

export const getUserConversations = async (userId, userRole = 'client') => {
  const query = userRole === 'super_admin'
    ? {}
    : { participants: userId };

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

  if (!conversation) {
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

  if (!conversation) {
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
    participants: userId
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
    const allConversations = await Conversation.find({}).select('_id');
    allowedConversationIds = allConversations.map((conversation) => conversation._id);
  } else {
    const userConversations = await Conversation.find({ participants: userId }).select('_id');
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
  const conversation = await findOrCreateDirectConversation(userId, otherUserId);

  const skip = (page - 1) * limit;

  const messages = await Message.find({
    conversation: conversation._id
  })
    .populate('sender', 'firstName lastName avatar')
    .populate('receiver', 'firstName lastName avatar')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit);

  const total = await Message.countDocuments({ conversation: conversation._id });

  return {
    conversation,
    messages,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};
