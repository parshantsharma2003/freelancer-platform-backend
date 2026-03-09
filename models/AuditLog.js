import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  actorRole: {
    type: String,
    enum: ['client', 'freelancer', 'super_admin', 'system'],
    default: 'system'
  },
  action: {
    type: String,
    required: true,
    trim: true
  },
  targetType: {
    type: String,
    trim: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId
  },
  summary: {
    type: String,
    trim: true,
    maxlength: 500
  },
  metadata: {
    type: Map,
    of: String
  },
  ipAddress: String,
  userAgent: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
