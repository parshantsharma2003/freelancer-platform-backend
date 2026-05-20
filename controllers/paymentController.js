import stripe from '../utils/stripeClient.js';
import Payment from '../models/Payment.js';
import Contract from '../models/Contract.js';
import User from '../models/User.js';
import Milestone from '../models/Milestone.js';
import Dispute from '../models/Dispute.js';
import Notification from '../models/Notification.js';
import notificationService from '../services/notificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// @desc    Create payment (deposit to escrow)
// @route   POST /api/payments
// @access  Private (Clients only)
export const createPayment = asyncHandler(async (req, res) => {
  const { contractId, amount, type, milestoneId, paymentGateway = 'stripe' } = req.body;

  // --- Fraud Prevention Logic ---
  if (req.user.fraud?.riskScore > 80) {
    return res.status(403).json({
      status: 'error',
      message: 'Payment blocked due to risk'
    });
  }
  // ------------------------------

  const contract = await Contract.findById(contractId);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  if (!['stripe', 'razorpay'].includes(String(paymentGateway))) {
    return res.status(400).json({
      status: 'error',
      message: 'Unsupported payment gateway'
    });
  }

  // Check if user is the client
  if (contract.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to make payment for this contract'
    });
  }

  if (type === 'deposit') {
    if (!milestoneId) {
      return res.status(400).json({
        status: 'error',
        message: 'milestoneId is required for deposit payments'
      });
    }

    const milestone = await Milestone.findById(milestoneId);
    if (!milestone || milestone.contract.toString() !== contractId.toString()) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid milestone for this contract'
      });
    }

    if (milestone.escrow?.isHeld || milestone.escrow?.paymentReleased) {
      return res.status(400).json({
        status: 'error',
        message: 'Milestone is already funded or paid'
      });
    }

    if (Number(amount) !== Number(milestone.amount)) {
      return res.status(400).json({
        status: 'error',
        message: 'Deposit amount must match milestone amount exactly'
      });
    }
  }

  // Prevent duplicate milestone deposits
  const existingDeposit = await Payment.findOne({
    milestone: milestoneId,
    type: 'deposit',
    status: { $in: ['processing', 'held-in-escrow'] }
  });

  if (existingDeposit) {
    return res.status(400).json({
      status: 'error',
      message: 'Milestone already funded'
    });
  }

  const currency = (contract.budget?.currency || 'USD').toLowerCase();
  let stripePaymentIntent = null;
  
  if (type === 'deposit') {
    if (paymentGateway === 'stripe') {
      stripePaymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(Number(amount) * 100),
        currency,
        capture_method: 'manual', // Add manual capture for escrow
        metadata: {
          contractId: contractId.toString(),
          clientId: req.user._id.toString(),
          milestoneId: milestoneId?.toString() || ''
        }
      });
    }
  }

  const payment = await Payment.create({
    contract: contractId,
    client: req.user._id,
    freelancer: contract.freelancer,
    amount,
    currency: contract.budget?.currency || 'USD',
    paymentGateway,
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

  if (type === 'deposit') {
    payment.status = 'held-in-escrow';
    payment.escrow.isEscrowed = true;
    payment.escrow.depositedAt = new Date();
    await payment.save();

    await Milestone.findByIdAndUpdate(milestoneId, {
      status: 'funded',
      'escrow.isHeld': true,
      'escrow.heldAmount': Number(amount),
      'escrow.heldAt': new Date(),
      'payment.paymentId': payment._id,
      'payment.status': 'completed',
      $push: {
        statusHistory: {
          status: 'funded',
            changedAt: new Date(),
          changedBy: req.user._id,
            reason: `Escrow deposit confirmed via ${paymentGateway}`
        }
      }
    });
  }

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

  const milestone = await Milestone.findById(payment.milestone);
  if (!milestone) {
    return res.status(404).json({
      status: 'error',
      message: 'Milestone not found for this payment'
    });
  }

  if (milestone.status !== 'approved') {
    return res.status(400).json({
      status: 'error',
      message: `Milestone must be approved before release. Current status: ${milestone.status}`
    });
  }

  // Capture payment before transfer
  if (payment.stripe?.paymentIntentId) {
    await stripe.paymentIntents.capture(payment.stripe.paymentIntentId);
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

  const walletCreditAmount = Number(payment.amount || payment.netAmount || 0);
  const freelancerWalletBefore = Number(freelancer?.wallet?.availableBalance || 0);
  const freelancerWalletAfter = freelancerWalletBefore + walletCreditAmount;

  await User.findByIdAndUpdate(payment.freelancer, {
    $inc: {
      'wallet.availableBalance': walletCreditAmount,
      'wallet.totalEarnings': walletCreditAmount
    },
    $set: {
      'wallet.lastUpdatedAt': new Date()
    }
  });

  await Milestone.findByIdAndUpdate(payment.milestone, {
    status: 'paid',
    'escrow.paymentReleased': true,
    'escrow.releasedAt': new Date(),
    'escrow.releaseTransactionId': payment._id.toString(),
    'payment.paymentId': payment._id,
    'payment.paidAt': new Date(),
    'payment.paidAmount': payment.netAmount,
    'payment.netAmount': payment.netAmount,
    'payment.status': 'completed',
    $push: {
      statusHistory: {
        status: 'paid',
        changedAt: new Date(),
        changedBy: req.user._id,
        reason: 'Escrow funds released to freelancer'
      }
    }
  });

  payment.wallet = {
    transactionId: payment._id.toString(),
    balanceBefore: freelancerWalletBefore,
    balanceAfter: freelancerWalletAfter
  };
  await payment.save();

  // Update contract
  await Contract.findByIdAndUpdate(payment.contract._id, {
    $inc: { totalPaid: payment.netAmount }
  });

  // Emit socket event for real-time analytics update
  try {
    const io = req.app.get('io');
    if (io) {
      const paymentPayload = {
        paymentId: payment._id,
        amount: payment.netAmount,
        contractId: payment.contract._id,
        timestamp: new Date()
      };

      io.to(`user:${req.user._id}`).emit('payment_completed', paymentPayload);
      io.to(`user:${payment.freelancer}`).emit('payment_completed', paymentPayload);
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

  if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.amount_capturable_updated') {
    const paymentIntent = event.data.object;

    const payment = await Payment.findOne({ 'stripe.paymentIntentId': paymentIntent.id });
    if (payment) {
      payment.status = 'held-in-escrow';
      payment.stripe.status = paymentIntent.status;
      payment.stripe.chargeId = paymentIntent.latest_charge || payment.stripe.chargeId;
      payment.escrow.isEscrowed = true;
      payment.escrow.depositedAt = new Date();
      await payment.save();

      await Milestone.findByIdAndUpdate(payment.milestone, {
        status: 'funded',
        'escrow.isHeld': true,
        'escrow.heldAmount': payment.amount,
        'escrow.heldAt': new Date(),
        'escrow.stripePaymentIntentId': paymentIntent.id,
        'payment.paymentId': payment._id,
        'payment.status': 'processing',
        $push: {
          statusHistory: {
            status: 'funded',
            changedAt: new Date(),
            reason: 'Escrow deposit confirmed'
          }
        }
      });
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

// @desc    Refund escrow payment back to client
// @route   POST /api/payments/:id/refund
// @access  Private (Client only)
export const refundPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id).populate('contract');

  if (!payment) {
    return res.status(404).json({
      status: 'error',
      message: 'Payment not found'
    });
  }

  if (payment.client.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to refund this payment'
    });
  }

  if (payment.type !== 'deposit' || payment.status !== 'held-in-escrow') {
    return res.status(400).json({
      status: 'error',
      message: 'Only held escrow deposits can be refunded'
    });
  }

  if (payment.stripe?.paymentIntentId) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripe.paymentIntentId
      });
      payment.stripe.refundId = refund.id;
    } catch (error) {
      return res.status(400).json({
        status: 'error',
        message: `Refund failed: ${error.message}`
      });
    }
  }

  payment.status = 'refunded';
  payment.processedAt = new Date();
  payment.escrow.releasedAt = new Date();
  await payment.save();

  await Milestone.findByIdAndUpdate(payment.milestone, {
    status: 'refunded',
    'escrow.isHeld': false,
    'escrow.heldAmount': 0,
    'escrow.refundedAt': new Date(),
    'payment.status': 'failed',
    $push: {
      statusHistory: {
        status: 'refunded',
        changedAt: new Date(),
        changedBy: req.user._id,
        reason: req.body.reason || 'Escrow refunded to client'
      }
    }
  });

  await Notification.create({
    recipient: payment.freelancer,
    type: 'payment_refunded',
    title: 'Escrow Refunded',
    message: `Escrow for contract "${payment.contract.title}" was refunded to the client`,
    relatedContract: payment.contract._id,
    actionUrl: `/payments/${payment._id}`,
    priority: 'high'
  });

  res.status(200).json({
    status: 'success',
    message: 'Escrow refunded successfully',
    data: { payment }
  });
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
        totalAmount: { $sum: { $ifNull: ['$netAmount', '$amount'] } }
      }
    }
  ]);

  // Calculate derived metrics
  const successfulPayments = stats
    .filter(s => ['completed', 'released'].includes(s._id))
    .reduce(
      (acc, current) => ({
        totalAmount: acc.totalAmount + (current.totalAmount || 0),
        count: acc.count + (current.count || 0)
      }),
      { totalAmount: 0, count: 0 }
    );
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

  // MatchStage logic...
  const matchStage = {
    $match: {
      status: { $in: ['completed', 'released'] },
      createdAt: {
        $gte: new Date(Date.now() - numMonths * 30 * 24 * 60 * 60 * 1000)
      }
    }
  };

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
        total: { $sum: { $ifNull: ['$netAmount', '$amount'] } },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 }
    }
  ]);

  const months_obj = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const chartData = earnings.map(e => ({
    name: months_obj[e._id.month - 1],
    earnings: e.total
  }));

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
