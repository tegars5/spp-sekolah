// src/services/AuditLogService.js
// Service untuk mencatat dan membaca audit trail.

const prisma = require('../lib/prisma');

function normalizeLimit(value, fallback = 50, max = 200) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

const AuditLogService = {
  /**
   * Tulis audit log secara fail-safe.
   * Jika model/table audit log belum siap, proses utama tidak gagal.
   */
  async logAction({ actorUserId, actorRole, action, entity, entityId, metadata }) {
    if (!prisma.auditLog || !action || !entity) {
      return null;
    }

    try {
      return await prisma.auditLog.create({
        data: {
          actorUserId: actorUserId ? Number(actorUserId) : null,
          actorRole: actorRole || null,
          action,
          entity,
          entityId: entityId ? String(entityId) : null,
          metadata: metadata || null,
        },
      });
    } catch {
      return null;
    }
  },

  /**
   * Ambil daftar audit log dengan filter opsional.
   */
  async list({ action, entity, actorUserId, limit }) {
    if (!prisma.auditLog) {
      return [];
    }

    const where = {};
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (actorUserId) where.actorUserId = Number(actorUserId);

    return prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: { id: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: normalizeLimit(limit),
    });
  },
};

module.exports = AuditLogService;
