// Socket.io event handlers
export const initializeSocket = (io) => {
  // Store online users
  const onlineUsers = new Map();

  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // User comes online
    socket.on('user_online', (userId) => {
      onlineUsers.set(userId, socket.id);
      socket.userId = userId;
      socket.join(userId); // Join room with userId

      // Broadcast to all that user is online
      io.emit('user_status', { userId, status: 'online' });

      console.log(`User ${userId} is online`);
    });

    // Typing indicator
    socket.on('typing', ({ conversationId, userId }) => {
      socket.to(conversationId).emit('user_typing', { userId });
    });

    socket.on('stop_typing', ({ conversationId, userId }) => {
      socket.to(conversationId).emit('user_stop_typing', { userId });
    });

    // Real-time notifications
    socket.on('send_notification', (data) => {
      const { recipientId, notification } = data;
      const recipientSocketId = onlineUsers.get(recipientId);

      if (recipientSocketId) {
        io.to(recipientSocketId).emit('new_notification', notification);
      }
    });

    // Join conversation room
    socket.on('join_conversation', (conversationId) => {
      socket.join(conversationId);
      console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
    });

    // Leave conversation room
    socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId);
      console.log(`Socket ${socket.id} left conversation ${conversationId}`);
    });

    // Message events
    socket.on('send_message', (message) => {
      // Emit to conversation room
      socket.to(message.conversationId).emit('new_message', message);
    });

    socket.on('message_read', (data) => {
      socket.to(data.conversationId).emit('message_read', data);
    });

    // Proposal events
    socket.on('proposal_submitted', (data) => {
      const { clientId, proposal } = data;
      io.to(clientId).emit('new_proposal', proposal);
    });

    // Contract events
    socket.on('contract_update', (data) => {
      const { recipientId, contract } = data;
      io.to(recipientId).emit('contract_updated', contract);
    });

    // Payment events
    socket.on('payment_update', (data) => {
      const { recipientId, payment } = data;
      io.to(recipientId).emit('payment_updated', payment);
    });

    // User disconnects
    socket.on('disconnect', () => {
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        io.emit('user_status', { userId: socket.userId, status: 'offline' });
        console.log(`User ${socket.userId} went offline`);
      }
      console.log('Client disconnected:', socket.id);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  // Heartbeat to check socket connection
  setInterval(() => {
    io.emit('ping');
  }, 30000); // Every 30 seconds

  return io;
};
