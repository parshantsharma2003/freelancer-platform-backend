import stripe from '../utils/stripeClient.js';
import Payment from '../models/Payment.js';
import Contract from '../models/Contract.js';
import User from '../models/User.js';
import Dispute from '../models/Dispute.js';
import Notification from '../models/Notification.js';
import notificationService from '../services/notificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// @desc    Create payment (deposit to escrow)
// @route   POST /api/payments
// @access  Private (Clients only)
export const createPayment = asyncHandler(async (req, res) => {
  const { contractId, amount, type, milestoneId } = req.body;

  const contract = await Contract.findById(contractId);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  // Check if user is the client
  if (contract.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to make payment for this contract'
    });
  }

  const currency = (contract.budget?.currency || 'USD').toLowerCase();
  let stripePaymentIntent = null;
  if (type === 'deposit') {
    stripePaymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      metadata: {
        contractId: contractId.toString(),
        clientId: req.user._id.toString()
      }
    });
  }

  const payment = await Payment.create({
    contract: contractId,
    client: req.user._id,
    freelancer: contract.freelancer,
    amount,
    currency: contract.budget?.currency || 'USD',
    type,
    milestone: milestoneId,
    status: type === 'deposit' ? 'processing' : 'pending',
    escrow: {
      isEscrowed: type === 'deposit',
      depositedAt: type === 'deposit' ? new Date() : null
    },
    stripe: stripePaymentIntent ? { paymentIntentId: stripePaymentIntent.id, status: stripePaymentIntent.status } : undefined
  });

  // Calculate fees
  payment.calculateFees();
  await payment.save();

  res.status(201).json({
    status: 'success',
    message: 'Payment created successfully',
    data: {
      payment,
      clientSecret: stripePaymentIntent?.client_secret
    }
  });
});

// @desc    Release payment from escrow
// @route   POST /api/payments/:id/release
// @access  Private (Client only)
export const releasePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id).populate('contract');

  if (!payment) {
    return res.status(404).json({
      status: 'error',
      message: 'Payment not found'
    });
  }

  // Check if user is the client
  if (payment.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to release this payment'
    });
  }

  // Check if payment is in escrow
  if (!payment.escrow.isEscrowed || payment.status !== 'held-in-escrow') {
    return res.status(400).json({
      status: 'error',
      message: 'Payment is not in escrow'
    });
  }

  // Release payment
  const freelancer = await User.findById(payment.freelancer).select('stripeConnect');
  let transferId = null;

  if (freelancer?.stripeConnect?.accountId && freelancer.stripeConnect.payoutsEnabled) {
    const transfer = await stripe.transfers.create({
      amount: Math.round(Number(payment.netAmount) * 100),
      currency: payment.currency.toLowerCase(),
      destination: freelancer.stripeConnect.accountId,
      metadata: {
        paymentId: payment._id.toString(),
        contractId: payment.contract._id.toString()
      }
    });
    transferId = transfer.id;
  }

  payment.status = 'completed';
  payment.escrow.releasedAt = new Date();
  payment.processedAt = new Date();
  if (transferId) {
    payment.stripe.transferId = transferId;
  }
  await payment.save();

  // Update contract
  await Contract.findByIdAndUpdate(payment.contract._id, {
    $inc: { totalPaid: payment.netAmount }
  });

  // Emit socket event for real-time analytics update
  try {
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user._id}`).emit('payment_completed', {
        paymentId: payment._id,
        amount: payment.netAmount,
        contractId: payment.contract._id,
        timestamp: new Date()
      });
    }
  } catch (socketError) {
    console.log('[Socket] Payment completed event failed (non-critical):', socketError.message);
  }

  // Notify freelancer of payment via notification service
  try {
    const socketBroadcast = req.app.get('socketBroadcast');
    await notificationService.notifyPaymentReleased(payment, payment.freelancer, payment.netAmount, socketBroadcast);
  } catch (err) {
    console.log('[Notification] Failed to notify freelancer of payment:', err.message);
    // Create fallback notification
    await Notification.create({
      recipient: payment.freelancer,
      type: 'payment_received',
      title: 'Payment Received',
      message: `You received $${payment.netAmount} for "${payment.contract.title}"`,
      relatedContract: payment.contract._id,
      relatedUser: req.user._id,
      actionUrl: `/payments/${payment._id}`,
      priority: 'high'
    });
  }

  res.status(200).json({
    status: 'success',
    message: 'Payment released successfully',
    data: { payment }
  });
});

// @desc    Stripe webhook handler
// @route   POST /api/payments/webhook
// @access  Public (Stripe)
export const stripeWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: `Webhook Error: ${error.message}`
    });
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;

    const payment = await Payment.findOne({ 'stripe.paymentIntentId': paymentIntent.id });
    if (payment) {
      payment.status = 'held-in-escrow';
      payment.stripe.status = paymentIntent.status;
      payment.stripe.chargeId = paymentIntent.latest_charge || payment.stripe.chargeId;
      payment.escrow.isEscrowed = true;
      payment.escrow.depositedAt = new Date();
      await payment.save();
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object;
    const payment = await Payment.findOne({ 'stripe.paymentIntentId': paymentIntent.id });
    if (payment) {
      payment.status = 'failed';
      payment.failureReason = paymentIntent.last_payment_error?.message;
      payment.stripe.status = paymentIntent.status;
      await payment.save();
    }
  }

  if (event.type === 'account.updated') {
    const account = event.data.object;
    const user = await User.findOne({ 'stripeConnect.accountId': account.id });
    if (user) {
      user.stripeConnect.detailsSubmitted = account.details_submitted;
      user.stripeConnect.chargesEnabled = account.charges_enabled;
      user.stripeConnect.payoutsEnabled = account.payouts_enabled;
      user.stripeConnect.status = account.payouts_enabled ? 'verified' : 'pending';
      user.stripeConnect.updatedAt = new Date();
      await user.save();
    }
  }

  if (event.type === 'charge.dispute.created') {
    const disputePayload = event.data.object;
    const payment = await Payment.findOne({ 'stripe.chargeId': disputePayload.charge });

    if (payment) {
      payment.status = 'disputed';
      payment.stripe.disputeId = disputePayload.id;
      payment.stripe.disputeStatus = disputePayload.status;
      await payment.save();

      const contract = await Contract.findById(payment.contract);
      if (contract) {
        await Dispute.create({
          contract: contract._id,
          payment: payment._id,
          client: contract.client,
          freelancer: contract.freelancer,
          openedBy: contract.client,
          reason: disputePayload.reason || 'stripe_dispute',
          description: 'Stripe dispute opened',
          stripeDisputeId: disputePayload.id,
          stripeStatus: disputePayload.status
        });

        contract.dispute = {
          isDisputed: true,
          reason: disputePayload.reason || 'stripe_dispute',
          initiatedBy: contract.client,
          status: 'open'
        };
        await contract.save();
      }
    }
  }

  if (event.type === 'charge.dispute.closed') {
    const disputePayload = event.data.object;
    const dispute = await Dispute.findOne({ stripeDisputeId: disputePayload.id });

    if (dispute) {
      dispute.status = 'closed';
      dispute.stripeStatus = disputePayload.status;
      dispute.resolution = disputePayload.status === 'lost' ? 'Lost on Stripe' : 'Won on Stripe';
      dispute.resolvedAt = new Date();
      await dispute.save();
    }

    const payment = await Payment.findOne({ 'stripe.disputeId': disputePayload.id });
    if (payment) {
      payment.status = disputePayload.status === 'lost' ? 'refunded' : 'completed';
      payment.stripe.disputeStatus = disputePayload.status;
      await payment.save();
    }
  }

  res.status(200).json({ received: true });
});

// @desc    Create Stripe Connect account
// @route   POST /api/payments/connect/account
// @access  Private (Freelancer only)
export const createConnectAccount = asyncHandler(async (req, res) => {
  if (req.user.stripeConnect?.accountId) {
    return res.status(200).json({
      status: 'success',
      data: { accountId: req.user.stripeConnect.accountId }
    });
  }

  const account = await stripe.accounts.create({
    type: 'express',
    email: req.user.email,
    capabilities: {
      transfers: { requested: true }
    }
  });

  req.user.stripeConnect = {
    accountId: account.id,
    status: 'pending',
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    onboardedAt: new Date(),
    updatedAt: new Date()
  };
  await req.user.save();

  res.status(201).json({
    status: 'success',
    data: { accountId: account.id }
  });
});

// @desc    Create Stripe Connect account link
// @route   POST /api/payments/connect/account-link
// @access  Private (Freelancer only)
export const createConnectAccountLink = asyncHandler(async (req, res) => {
  if (!req.user.stripeConnect?.accountId) {
    return res.status(400).json({
      status: 'error',
      message: 'Stripe Connect account not found'
    });
  }

  if (!process.env.STRIPE_CONNECT_RETURN_URL || !process.env.STRIPE_CONNECT_REFRESH_URL) {
    return res.status(400).json({
      status: 'error',
      message: 'Stripe Connect return/refresh URLs not configured'
    });
  }

  const accountLink = await stripe.accountLinks.create({
    account: req.user.stripeConnect.accountId,
    refresh_url: process.env.STRIPE_CONNECT_REFRESH_URL,
    return_url: process.env.STRIPE_CONNECT_RETURN_URL,
    type: 'account_onboarding'
  });

  res.status(200).json({
    status: 'success',
    data: { url: accountLink.url }
  });
});

// @desc    Get Stripe Connect account status
// @route   GET /api/payments/connect/status
// @access  Private (Freelancer only)
export const getConnectStatus = asyncHandler(async (req, res) => {
  if (!req.user.stripeConnect?.accountId) {
    return res.status(404).json({
      status: 'error',
      message: 'Stripe Connect account not found'
    });
  }

  const account = await stripe.accounts.retrieve(req.user.stripeConnect.accountId);

  req.user.stripeConnect.detailsSubmitted = account.details_submitted;
  req.user.stripeConnect.chargesEnabled = account.charges_enabled;
  req.user.stripeConnect.payoutsEnabled = account.payouts_enabled;
  req.user.stripeConnect.status = account.payouts_enabled ? 'verified' : 'pending';
  req.user.stripeConnect.updatedAt = new Date();
  await req.user.save();

  res.status(200).json({
    status: 'success',
    data: { stripeConnect: req.user.stripeConnect }
  });
});

// @desc    Create Stripe Connect login link
// @route   POST /api/payments/connect/login-link
// @access  Private (Freelancer only)
export const createConnectLoginLink = asyncHandler(async (req, res) => {
  if (!req.user.stripeConnect?.accountId) {
    return res.status(404).json({
      status: 'error',
      message: 'Stripe Connect account not found'
    });
  }

  const loginLink = await stripe.accounts.createLoginLink(req.user.stripeConnect.accountId);

  res.status(200).json({
    status: 'success',
    data: { url: loginLink.url }
  });
});

// @desc    Get my payments
// @route   GET /api/payments/my
// @access  Private
export const getMyPayments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, type, status } = req.query;

  const query = {
    $or: [
      { client: req.user._id },
      { freelancer: req.user._id }
    ]
  };

  if (type) query.type = type;
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const payments = await Payment.find(query)
    .populate('contract', 'title')
    .populate('client', 'firstName lastName')
    .populate('freelancer', 'firstName lastName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Payment.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Get payment by ID
// @route   GET /api/payments/:id
// @access  Private
export const getPaymentById = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('contract', 'title')
    .populate('client', 'firstName lastName email')
    .populate('freelancer', 'firstName lastName email');

  if (!payment) {
    return res.status(404).json({
      status: 'error',
      message: 'Payment not found'
    });
  }

  // Check authorization
  const isAuthorized = 
    payment.client._id.toString() === req.user._id.toString() ||
    payment.freelancer._id.toString() === req.user._id.toString() ||
    req.user.role === 'super_admin';

  if (!isAuthorized) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to view this payment'
    });
  }

  res.status(200).json({
    status: 'success',
    data: { payment }
  });
});

// @desc    Get payment stats
// @route   GET /api/payments/stats/summary
// @access  Private
export const getPaymentStats = asyncHandler(async (req, res) => {
  const stats = await Payment.aggregate([
    {
      $match: {
        $or: [
          { client: req.user._id },
          { freelancer: req.user._id }
        ]
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);

  // Calculate derived metrics
  const successfulPayments = stats.find(s => s._id === 'released') || { totalAmount: 0, count: 0 };
  const totalStats = stats.reduce((sum, s) => sum + s.count, 0);
  const successRate = totalStats > 0 ? Math.round((successfulPayments.count / totalStats) * 100) : 0;

  res.status(200).json({
    status: 'success',
    data: {
      stats,
      total: successfulPayments.totalAmount,
      successRate,
      completed: successfulPayments.count
    }
  });
});

// @desc    Get earnings by month for chart
// @route   GET /api/payments/stats/earnings
// @access  Private
export const getEarningsByMonth = asyncHandler(async (req, res) => {
  const { months = 6 } = req.query;
  const numMonths = Math.min(Math.max(1, parseInt(months)), 12);

  // For freelancers: earnings are when they receive payments (released status)
  // For clients: spending is when they send payments (released status)
  const matchStage = {
    $match: {
      status: 'released',
      createdAt: {
        $gte: new Date(Date.now() - numMonths * 30 * 24 * 60 * 60 * 1000)
      }
    }
  };

  // If freelancer, match earnings (payments to them)
  // If client, match spending (payments from them)
  if (req.user.role === 'freelancer') {
    matchStage.$match.freelancer = req.user._id;
  } else {
    matchStage.$match.client = req.user._id;
  }

  const earnings = await Payment.aggregate([
    matchStage,
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 }
    }
  ]);

  // Format for chart
  const months_obj = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const chartData = earnings.map(e => ({
    name: months_obj[e._id.month - 1],
    earnings: e.total
  }));

  // Fill in missing months with 0
  const now = new Date();
  const allMonths = [];
  for (let i = numMonths - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = months_obj[date.getMonth()];
    const existingMonth = chartData.find(m => m.name === monthName);
    allMonths.push({
      name: monthName,
      earnings: existingMonth ? existingMonth.earnings : 0
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      earnings: allMonths,
      total: allMonths.reduce((sum, m) => sum + m.earnings, 0),
      average: allMonths.length > 0 ? Math.round(allMonths.reduce((sum, m) => sum + m.earnings, 0) / allMonths.length) : 0
    }
  });
});
