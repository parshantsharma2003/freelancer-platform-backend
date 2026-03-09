import { isSocketAuthenticated, hasSocketRole } from './socketAuth.js';

/**
 * Initialize Socket.io with event handlers for:
 * - Real-time job posting
 * - Proposal submissions
 * - Real-time notifications
 * - Presence tracking
 */
export const initializeSocketEvents = (io) => {
  // Track online users by role
  const onlineUsers = new Map(); // userId -> socketId
  const freelancerRoomSize = new Map(); // frequency of 'freelancers:active' room

  /**
   * 1️⃣ CONNECTION & AUTHENTICATION
   */
  io.on('connection', (socket) => {
    // Auth check
    if (!isSocketAuthenticated(socket)) {
      console.warn('[Socket] Unauthenticated connection attempt:', socket.id);
      socket.disconnect(true);
      return;
    }

    const { userId, userRole, userName } = socket;
    console.log(`[Socket] ${userRole} connected: ${userName} (${socket.id})`);

    onlineUsers.set(userId, socket.id);

    io.emit('presence:update', {
      userId,
      status: 'online',
      timestamp: new Date()
    });

    // ========================================
    // 2️⃣ JOIN ROOMS BASED ON ROLE
    // ========================================

    // All authenticated users join personal room for notifications
    socket.join(`user:${userId}`);

    // Freelancers join the active freelancers room
    if (hasSocketRole(socket, 'freelancer')) {
      socket.join('freelancers:active');
      console.log(`[Socket] Freelancer ${userName} joined 'freelancers:active' room`);
    }

    // Clients join their personal client room for proposals
    if (hasSocketRole(socket, 'client')) {
      socket.join(`client:${userId}`);
      console.log(`[Socket] Client ${userName} joined 'client:${userId}' room`);
    }

    // ========================================
    // 3️⃣ JOB-RELATED EVENTS
    // ========================================

    /**
     * Event: job:new
     * Emitted by: Server (from POST /api/jobs)
     * Received by: Freelancers in 'freelancers:active' room
     * Payload: Job summary only (not full details)
     */
    socket.on('job:fetch', async () => {
      // Freelancer explicitly requests to see new jobs
      // This is handled by REST API, but socket notifies of updates
      if (hasSocketRole(socket, 'freelancer')) {
        console.log(`[Socket] Freelancer ${userName} requested fresh job feed`);
      }
    });

    // ========================================
    // 4️⃣ PROPOSAL-RELATED EVENTS
    // ========================================

    /**
     * Event: proposal:new
     * Emitted by: Server (from POST /api/proposals)
     * Received by: Job owner (client) in `client:userId` room
     * Payload: Proposal summary
     */
    socket.on('proposal:check', async () => {
      // Client explicitly checks for new proposals
      if (hasSocketRole(socket, 'client')) {
        console.log(`[Socket] Client ${userName} checked for new proposals`);
      }
    });

    // ========================================
    // 5️⃣ CONTRACT-RELATED EVENTS
    // ========================================

    /**
     * Event: contract:join
     * Allows user to join a contract room for milestone updates
     * Validates user is client or freelancer in the contract
     */
    socket.on('contract:join', async (contractId) => {
      try {
        const { default: Contract } = await import('../models/Contract.js');
        const contract = await Contract.findById(contractId);
        
        if (!contract) {
          socket.emit('contract:join-error', {
            status: 'error',
            message: 'Contract not found'
          });
          return;
        }

        // Verify user is part of this contract
        const isClient = contract.client.toString() === userId;
        const isFreelancer = contract.freelancer.toString() === userId;
        const isSuperAdmin = userRole === 'super_admin';

        if (!isClient && !isFreelancer && !isSuperAdmin) {
          socket.emit('contract:join-error', {
            status: 'error',
            message: 'Unauthorized: Not part of this contract'
          });
          console.warn(`[Socket] User ${userName} tried to join unauthorized contract ${contractId}`);
          return;
        }

        socket.join(`contract:${contractId}`);
        console.log(`[Socket] User ${userName} joined contract:${contractId} room`);
        
        socket.emit('contract:joined', {
          status: 'success',
          contractId,
          message: `Joined contract ${contractId} for real-time updates`
        });
      } catch (error) {
        console.error('[Socket] Error joining contract room:', error);
        socket.emit('contract:join-error', {
          status: 'error',
          message: 'Server error joining contract room'
        });
      }
    });

    /**
     * Event: contract:leave
     * User leaves contract room
     */
    socket.on('contract:leave', (contractId) => {
      socket.leave(`contract:${contractId}`);
      console.log(`[Socket] User ${userName} left contract:${contractId} room`);
      socket.emit('contract:left', {
        status: 'success',
        contractId,
        message: `Left contract ${contractId}`
      });
    });

    // ========================================
    // 6️⃣ NOTIFICATION EVENTS
    // ========================================

    /**
     * Subscribe to personal notifications
     */
    socket.on('notification:subscribe', () => {
      console.log(`[Socket] User ${userName} subscribed to personal notifications`);
    });

    // ========================================
    // 7️⃣ PRESENCE & STATUS
    // ========================================

    socket.on('user:status', (status) => {
      if (['online', 'away', 'offline'].includes(status)) {
        io.to(`user:${userId}`).emit('status:update', {
          userId,
          status,
          timestamp: new Date()
        });
        console.log(`[Socket] User ${userName} status: ${status}`);
      }
    });

    socket.on('presence:check', (targetUserId) => {
      if (!targetUserId) return;
      socket.emit('presence:status', {
        userId: targetUserId,
        status: onlineUsers.has(targetUserId) ? 'online' : 'offline',
        timestamp: new Date()
      });
    });

    // ========================================
    // 8️⃣ CONVERSATION ROOMS (legacy)
    // ========================================

    socket.on('conversation:join', async (conversationId) => {
      try {
        const { Conversation } = await import('../models/Message.js');
        const conversation = await Conversation.findById(conversationId).select('participants');

        if (!conversation) {
          socket.emit('conversation:join-error', {
            status: 'error',
            message: 'Conversation not found'
          });
          return;
        }

        const participants = conversation.participants.map(id => id.toString());
        if (!participants.includes(userId)) {
          socket.emit('conversation:join-error', {
            status: 'error',
            message: 'Unauthorized conversation'
          });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        socket.emit('conversation:joined', {
          status: 'success',
          conversationId
        });
      } catch (error) {
        console.error('[Socket] Error joining conversation:', error);
        socket.emit('conversation:join-error', {
          status: 'error',
          message: 'Server error joining conversation'
        });
      }
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
      socket.emit('conversation:left', {
        status: 'success',
        conversationId
      });
    });

    // ========================================
    // 8️⃣ MESSAGE EVENTS (Existing)
    // ========================================

    socket.on('message:send', () => {
      socket.emit('message:error', {
        status: 'error',
        message: 'Direct socket message sending is disabled. Use REST API to persist messages first.'
      });
    });

    socket.on('message:read', (contractId) => {
      if (!contractId) return;
      io.to(`contract:${contractId}`).emit('message:read', {
        contractId,
        readerId: userId,
        timestamp: new Date()
      });
    });

    // ========================================
    // 9️⃣ TYPING INDICATORS
    // ========================================

    socket.on('typing:start', (contractId) => {
      if (!contractId) return;
      socket.to(`contract:${contractId}`).emit('typing:indicator', {
        userId,
        userName,
        contractId,
        isTyping: true
      });
    });

    socket.on('typing:stop', (contractId) => {
      if (!contractId) return;
      socket.to(`contract:${contractId}`).emit('typing:indicator', {
        userId,
        userName,
        contractId,
        isTyping: false
      });
    });

    // ========================================
    // 🔟 DISCONNECT & CLEANUP
    // ========================================

    socket.on('disconnect', () => {
      onlineUsers.delete(userId);

      io.emit('presence:update', {
        userId,
        status: 'offline',
        timestamp: new Date()
      });
      
      if (hasSocketRole(socket, 'freelancer')) {
        console.log(`[Socket] Freelancer ${userName} disconnected`);
      } else if (hasSocketRole(socket, 'client')) {
        console.log(`[Socket] Client ${userName} disconnected`);
      }
      
      console.log(`[Socket] Total online: ${onlineUsers.size}`);
    });

    // ========================================
    // 1️⃣1️⃣ ERROR HANDLING
    // ========================================

    socket.on('error', (error) => {
      console.error(`[Socket] Error for user ${userName}:`, error);
    });
  });

  // ========================================
  // 1️⃣2️⃣ SERVER-SIDE EMISSION METHODS
  // (Called from Express controllers)
  // ========================================

  return {
    /**
     * 📢 Broadcast new job to all active freelancers
     * Called from: POST /api/jobs (createJob controller)
     */
    broadcastNewJob: (jobData) => {
      io.to('freelancers:active').emit('job:new', {
        status: 'success',
        event: 'job:new',
        data: {
          jobId: jobData._id,
          title: jobData.title,
          category: jobData.category,
          skills: jobData.skills,
          budget: {
            type: jobData.budget.type,
            amount: jobData.budget.amount,
            minAmount: jobData.budget.minAmount,
            maxAmount: jobData.budget.maxAmount,
            currency: jobData.budget.currency
          },
          duration: jobData.duration,
          experienceLevel: jobData.experienceLevel,
          createdAt: jobData.createdAt,
          proposalsCount: jobData.proposalsCount
        },
        timestamp: new Date()
      });
      console.log(`[BroadcastJob] Sent to 'freelancers:active' room:`, jobData.title);
    },

    /**
     * 📢 Notify client of new proposal
     * Called from: POST /api/proposals (createProposal controller)
     */
    notifyNewProposal: (clientId, proposalData) => {
      io.to(`client:${clientId}`).emit('proposal:new', {
        status: 'success',
        event: 'proposal:new',
        data: {
          proposalId: proposalData._id,
          jobId: proposalData.job,
          jobTitle: proposalData.jobTitle,
          freelancerId: proposalData.freelancer,
          freelancerName: proposalData.freelancerName,
          proposedBudget: proposalData.proposedBudget,
          estimatedDuration: proposalData.estimatedDuration,
          createdAt: proposalData.createdAt
        },
        timestamp: new Date()
      });
      console.log(`[NotifyProposal] Sent to client:${clientId}. Proposal ID:`, proposalData._id);
    },

    /**
     * 📢 Send personal notification to user
     * Called from: Various controllers
     */
    notifyUser: (userId, notification) => {
      io.to(`user:${userId}`).emit('notification:new', {
        status: 'success',
        event: 'notification:new',
        data: notification,
        timestamp: new Date()
      });
      console.log(`[NotifyUser] Sent to user:${userId}:`, notification.title);
    },

    /**
     * 📢 Get current online users count
     */
    getOnlineCount: () => onlineUsers.size,

    /**
     * 📢 Get active freelancers count
     */
    getActiveFrancersCount: () => {
      return io.sockets.adapter.rooms.get('freelancers:active')?.size || 0;
    },

    /**
     * 📢 Notify on milestone status change
     * Called from: Milestone controller
     */
    broadcastMilestoneStatusChange: (contractId, milestoneId, statusData) => {
      io.to(`contract:${contractId}`).emit('milestone:status-changed', {
        status: 'success',
        event: 'milestone:status-changed',
        data: {
          milestoneId: milestoneId,
          contractId: contractId,
          newStatus: statusData.newStatus,
          title: statusData.title,
          amount: statusData.amount,
          changedAt: new Date(),
          changedBy: statusData.changedBy,
          message: statusData.message
        },
        timestamp: new Date()
      });
      console.log(`[MilestoneStatus] ${statusData.newStatus} for milestone ${milestoneId}`);
    },

    /**
     * 📢 Notify on milestone payment released
     * Called from: Milestone controller on approval payment release
     */
    broadcastMilestonePaymentReleased: (contractId, freelancerId, paymentData) => {
      io.to(`user:${freelancerId}`).emit('milestone:payment-released', {
        status: 'success',
        event: 'milestone:payment-released',
        data: {
          milestoneId: paymentData.milestoneId,
          contractId: contractId,
          grossAmount: paymentData.grossAmount,
          netAmount: paymentData.netAmount,
          platformFee: paymentData.platformFee,
          title: paymentData.title,
          paidAt: new Date()
        },
        timestamp: new Date()
      });
      console.log(`[MilestonePayment] Payment released for milestone ${paymentData.milestoneId}`);
    },

    /**
     * 📢 Notify on time entry started
     * Called from: Time entry controller on timer start
     */
    broadcastTimeEntryStarted: (contractId, freelancerId, entryData) => {
      io.to(`contract:${contractId}`).emit('timeentry:started', {
        status: 'success',
        event: 'timeentry:started',
        data: {
          timeEntryId: entryData.timeEntryId,
          contractId: contractId,
          freelancerId: freelancerId,
          startTime: entryData.startTime,
          description: entryData.description,
          message: `Freelancer started time tracking: ${entryData.description}`
        },
        timestamp: new Date()
      });
      console.log(`[TimeEntry] Started for contract ${contractId}`);
    },

    /**
     * 📢 Notify on time entry stopped
     * Called from: Time entry controller on timer stop
     */
    broadcastTimeEntryStopped: (contractId, clientId, entryData) => {
      io.to(`user:${clientId}`).emit('timeentry:stopped', {
        status: 'success',
        event: 'timeentry:stopped',
        data: {
          timeEntryId: entryData.timeEntryId,
          contractId: contractId,
          duration: entryData.duration,
          durationHours: entryData.durationHours,
          billableAmount: entryData.billableAmount,
          platformFee: entryData.platformFee,
          netAmount: entryData.netAmount,
          message: `${entryData.durationHours} hours logged - awaiting approval`
        },
        timestamp: new Date()
      });
      console.log(`[TimeEntry] Stopped for contract ${contractId} - ${entryData.durationHours} hours`);
    },

    /**
     * 📢 Notify on time entry approved
     * Called from: Time entry controller on approval
     */
    broadcastTimeEntryApproved: (freelancerId, approvalData) => {
      io.to(`user:${freelancerId}`).emit('timeentry:approved', {
        status: 'success',
        event: 'timeentry:approved',
        data: {
          timeEntryId: approvalData.timeEntryId,
          contractId: approvalData.contractId,
          approved: true,
          billableAmount: approvalData.billableAmount,
          message: `Your time entry has been approved for $${approvalData.billableAmount}`
        },
        timestamp: new Date()
      });
      console.log(`[TimeEntry] Approved for ${approvalData.timeEntryId}`);
    },

    /**
     * 📢 Notify on weekly payment processed
     * Called from: Time entry controller on weekly payment
     */
    broadcastWeeklyPaymentProcessed: (freelancerId, paymentData) => {
      io.to(`user:${freelancerId}`).emit('timeentry:payment-processed', {
        status: 'success',
        event: 'timeentry:payment-processed',
        data: {
          contractId: paymentData.contractId,
          weekStart: paymentData.weekStart,
          weekEnd: paymentData.weekEnd,
          hours: paymentData.hours,
          amount: paymentData.amount,
          message: `Weekly payment processed: $${paymentData.amount} for ${paymentData.hours} hours`
        },
        timestamp: new Date()
      });
      console.log(`[TimeEntry] Weekly payment processed for user ${freelancerId} - $${paymentData.amount}`);
    },

    /**
     * 📢 Notify freelancer on new job invite
     * Called from: Invite controller on invite sent
     */
    broadcastJobInvite: (invite) => {
      io.to(`user:${invite.freelancer._id}`).emit('job:invited', {
        status: 'success',
        event: 'job:invited',
        data: {
          inviteId: invite._id,
          jobId: invite.job._id,
          jobTitle: invite.job.title,
          jobBudget: invite.job.budget,
          clientName: `${invite.client.firstName} ${invite.client.lastName}`,
          clientId: invite.client._id,
          message: invite.message || 'You have been invited to a job',
          expiresAt: invite.expiresAt
        },
        timestamp: new Date()
      });
      console.log(`[Invite] Job invite sent to ${invite.freelancer._id} for job ${invite.job._id}`);
    },

    /**
     * 📢 Notify client on invite response
     * Called from: Invite controller on freelancer response
     */
    broadcastInviteResponse: (invite) => {
      io.to(`user:${invite.client._id}`).emit('invite:responded', {
        status: 'success',
        event: 'invite:responded',
        data: {
          inviteId: invite._id,
          jobId: invite.job._id,
          jobTitle: invite.job.title,
          freelancerName: `${invite.freelancer.firstName} ${invite.freelancer.lastName}`,
          freelancerId: invite.freelancer._id,
          response: invite.status,
          message: `${invite.freelancer.firstName} has ${invite.status} your job invitation`,
          respondedAt: invite.respondedAt
        },
        timestamp: new Date()
      });
      console.log(`[Invite] ${invite.status.toUpperCase()} response from ${invite.freelancer._id} on job ${invite.job._id}`);
    },

    /**
     * 📢 Notify user of new message
     * Called from: Message controller on message send
     * Emits to: Receiver's personal room
     */
    broadcastContractMessage: (message) => {
      const payload = {
        status: 'success',
        event: 'message:new',
        data: {
          messageId: message._id,
          senderId: message.sender._id,
          senderName: `${message.sender.firstName} ${message.sender.lastName}`,
          receiverId: message.receiver._id,
          conversationId: message.conversation._id,
          content: message.content,
          messageType: message.messageType,
          contractId: message.contract ? message.contract._id : null,
          proposalId: message.proposal ? message.proposal._id : null,
          attachmentsCount: message.attachments?.length || 0,
          createdAt: message.createdAt,
          senderRole: message.senderRole
        },
        timestamp: new Date()
      };

      io.to(`user:${message.receiver._id}`).emit('message_received', payload);
      io.to(`user:${message.sender._id}`).emit('message_sent', payload);
      if (message.contract?._id) {
        io.to(`contract:${message.contract._id}`).emit('message:new', payload);
      }
      io.to(`conversation:${message.conversation._id}`).emit('message:new', payload);
      console.log(`[Message] New message from ${message.sender._id} to ${message.receiver._id} in contract ${message.contract?._id}`);
    },

    broadcastReadReceipt: (conversation, readerId) => {
      const reader = readerId.toString();
      const participants = conversation.participants?.map(id => id.toString()) || [];
      const payload = {
        status: 'success',
        event: 'read_receipt',
        data: {
          conversationId: conversation._id,
          readerId: readerId,
          timestamp: new Date()
        }
      };

      io.to(`conversation:${conversation._id}`).emit('read_receipt', payload);

      participants
        .filter(id => id !== reader)
        .forEach(id => io.to(`user:${id}`).emit('read_receipt', payload));
    },

    broadcastContractReadReceipt: (contractId, readerId) => {
      io.to(`contract:${contractId}`).emit('message:read', {
        contractId,
        readerId,
        timestamp: new Date()
      });
    }
  };
};
