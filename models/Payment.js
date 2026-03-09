import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  contract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  freelancer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  milestone: {
    type: mongoose.Schema.Types.ObjectId
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  type: {
    type: String,
    enum: ['deposit', 'release', 'refund', 'bonus', 'subscription'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'held-in-escrow', 'completed', 'failed', 'refunded', 'disputed'],
    default: 'pending'
  },
  // Escrow details
  escrow: {
    isEscrowed: {
      type: Boolean,
      default: false
    },
    depositedAt: Date,
    releasedAt: Date,
    releaseCondition: String
  },
  // Platform fees (transparent)
  fees: {
    platformFee: {
      amount: Number,
      percentage: Number
    },
    processingFee: {
      amount: Number,
      percentage: Number
    },
    totalFees: Number
  },
  netAmount: Number, // Amount after fees
  riskScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  // Stripe integration
  stripe: {
    paymentIntentId: String,
    chargeId: String,
    transferId: String,
    refundId: String,
    status: String,
    disputeId: String,
    disputeStatus: String
  },
  payoutSchedule: {
    scheduledFor: Date,
    processedAt: Date
  },
  wallet: {
    transactionId: String,
    balanceBefore: Number,
    balanceAfter: Number
  },
  paymentMethod: {
    type: {
      type: String,
      enum: ['card', 'bank_transfer', 'wallet']
    },
    last4: String,
    brand: String
  },
  description: String,
  metadata: {
    type: Map,
    of: String
  },
  // Regional pricing support
  regionalPricing: {
    originalAmount: Number,
    originalCurrency: String,
    exchangeRate: Number
  },
  failureReason: String,
  processedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Calculate platform fees
paymentSchema.methods.calculateFees = function() {
  const platformFeePercentage = 10; // 10% platform fee
  const processingFeePercentage = 2.9; // 2.9% processing fee

  this.fees = {
    platformFee: {
      amount: (this.amount * platformFeePercentage) / 100,
      percentage: platformFeePercentage
    },
    processingFee: {
      amount: (this.amount * processingFeePercentage) / 100,
      percentage: processingFeePercentage
    }
  };

  this.fees.totalFees = this.fees.platformFee.amount + this.fees.processingFee.amount;
  this.netAmount = this.amount - this.fees.totalFees;

  return this.fees;
};

paymentSchema.index({ contract: 1, client: 1, freelancer: 1, status: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
