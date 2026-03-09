import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
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
  // Invoice details
  invoiceNumber: {
    type: String,
    unique: true,
    required: true
  },
  weekStartDate: {
    type: Date,
    required: true
  },
  weekEndDate: {
    type: Date,
    required: true
  },
  // Time tracking summary
  totalHours: {
    type: Number,
    required: true
  },
  approvedHours: {
    type: Number,
    required: true
  },
  hourlyRate: {
    type: Number,
    required: true
  },
  // Amounts
  subtotal: {
    type: Number,
    required: true
  },
  platformFeePercent: {
    type: Number,
    default: 10
  },
  platformFee: {
    type: Number,
    required: true
  },
  total: {
    // Amount after platform fee
    type: Number,
    required: true
  },
  // Status
  status: {
    type: String,
    enum: ['draft', 'issued', 'paid', 'overdue'],
    default: 'draft'
  },
  issueDate: {
    type: Date,
    default: Date.now
  },
  dueDate: {
    type: Date
  },
  paidDate: {
    type: Date
  },
  // Time entries associated
  timeEntries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TimeEntry'
  }],
  // Notes
  notes: String,
  // Audit
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

// Index for efficient queries
invoiceSchema.index({ contract: 1, weekStartDate: 1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ client: 1, status: 1 });
invoiceSchema.index({ freelancer: 1, status: 1 });

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;
