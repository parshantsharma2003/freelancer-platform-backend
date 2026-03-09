import AuditLog from '../models/AuditLog.js';

export const logAuditEvent = async ({
  actor,
  actorRole,
  action,
  targetType,
  targetId,
  summary,
  metadata,
  ipAddress,
  userAgent
}) => {
  try {
    await AuditLog.create({
      actor: actor || undefined,
      actorRole: actorRole || 'system',
      action,
      targetType,
      targetId,
      summary,
      metadata,
      ipAddress,
      userAgent
    });
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};
