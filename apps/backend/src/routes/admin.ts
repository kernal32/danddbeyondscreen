import type { FastifyInstance } from 'fastify';
import { verifyUserJwt } from './auth.js';
import type { UserAuthService } from '../services/user-auth.service.js';
import type { AdminAuditService } from '../services/admin-audit.service.js';
import type { UserDdbUploadService } from '../services/user-ddb-upload.service.js';
import { IngestRateLimiter } from '../util/ingest-rate-limit.js';

const adminLimiter = new IngestRateLimiter(60_000, 120);

function parseBearer(auth: string | undefined): string | null {
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0]!.trim();
  if (typeof req.ip === 'string') return req.ip;
  return undefined;
}

type AdminAuth = { kind: 'ok'; userId: string; email: string } | { kind: 'fail'; status: 401 | 403 | 429 };

async function resolveAdmin(
  req: { headers: Record<string, string | string[] | undefined>; ip?: string },
  authSecret: string,
  userAuth: UserAuthService,
  adminEmailAllowlist: Set<string>,
): Promise<AdminAuth> {
  const authHdr = req.headers.authorization;
  const hdr = Array.isArray(authHdr) ? authHdr[0] : authHdr;
  const tok = parseBearer(hdr);
  if (!tok) return { kind: 'fail', status: 401 };
  const userId = await verifyUserJwt(tok, authSecret);
  if (!userId) return { kind: 'fail', status: 401 };
  if (!adminLimiter.allow(`admin:${userId}`)) return { kind: 'fail', status: 429 };
  const user = userAuth.getById(userId);
  if (!user) return { kind: 'fail', status: 401 };
  if (!adminEmailAllowlist.has(user.email.toLowerCase())) return { kind: 'fail', status: 403 };
  return { kind: 'ok', userId, email: user.email };
}

export function registerAdminRoutes(
  app: FastifyInstance,
  deps: {
    authSecret: string;
    userAuth: UserAuthService;
    audit: AdminAuditService;
    adminEmailAllowlist: Set<string>;
    ddbUploads: UserDdbUploadService;
  },
) {
  const { authSecret, userAuth, audit, adminEmailAllowlist, ddbUploads } = deps;

  if (adminEmailAllowlist.size === 0) {
    return;
  }

  const failMsg = (status: 401 | 403 | 429) =>
    status === 429 ? 'Too many requests' : status === 401 ? 'Unauthorized' : 'Forbidden';

  app.get('/api/admin/overview', async (req, reply) => {
    const a = await resolveAdmin(req, authSecret, userAuth, adminEmailAllowlist);
    if (a.kind !== 'ok') return reply.code(a.status).send({ error: failMsg(a.status) });
    const { activeUserCount, deactivatedUserCount } = userAuth.adminDashboardStats();
    return {
      activeUserCount,
      deactivatedUserCount,
      adminSlotCount: adminEmailAllowlist.size,
    };
  });

  app.get<{
    Querystring: { q?: string; page?: string; pageSize?: string; includeDeleted?: string };
  }>('/api/admin/users', async (req, reply) => {
    const a = await resolveAdmin(req, authSecret, userAuth, adminEmailAllowlist);
    if (a.kind !== 'ok') return reply.code(a.status).send({ error: failMsg(a.status) });
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const offset = (page - 1) * pageSize;
    const { users, total } = userAuth.listUsersForAdmin({
      q,
      limit: pageSize,
      offset,
      includeDeleted,
    });
    return { users, total, page, pageSize };
  });

  app.get<{ Params: { id: string } }>('/api/admin/users/:id', async (req, reply) => {
    const a = await resolveAdmin(req, authSecret, userAuth, adminEmailAllowlist);
    if (a.kind !== 'ok') return reply.code(a.status).send({ error: failMsg(a.status) });
    const detail = userAuth.getUserAdminDetail(req.params.id);
    if (!detail) return reply.code(404).send({ error: 'User not found' });
    return detail;
  });

  app.get<{ Params: { id: string } }>('/api/admin/users/:id/ingest', async (req, reply) => {
    const a = await resolveAdmin(req, authSecret, userAuth, adminEmailAllowlist);
    if (a.kind !== 'ok') return reply.code(a.status).send({ error: failMsg(a.status) });
    const user = userAuth.getRowByIdAny(req.params.id);
    if (!user) return reply.code(404).send({ error: 'User not found' });
    const meta = ddbUploads.getMeta(req.params.id);
    const party = ddbUploads.getParty(req.params.id);
    if (!meta || !party) return reply.code(404).send({ error: 'No uploaded party for this user' });
    const characters = party.characters.map((c) => {
      const av = typeof c.avatarUrl === 'string' ? c.avatarUrl.trim() : '';
      return {
        id: c.id,
        name: c.name,
        ddbCharacterId: c.ddbCharacterId ?? null,
        source: c.source,
        maxHp: c.maxHp,
        currentHp: c.currentHp,
        tempHp: c.tempHp,
        ac: c.ac,
        passivePerception: c.passivePerception,
        passiveInvestigation: c.passiveInvestigation,
        passiveInsight: c.passiveInsight,
        inspired: c.inspired === true,
        initiativeBonus: c.initiativeBonus,
        dexterityModifier: c.dexterityModifier,
        spellSaveDC: c.spellSaveDC,
        conditionsCount: c.conditions.length,
        conditionsPreview: c.conditions.slice(0, 12),
        spellSlotsCount: c.spellSlots?.length ?? 0,
        /** `left/max` per spell level (matches player card: remaining / pool). */
        spellSlotsSummary: c.spellSlots?.length
          ? c.spellSlots
              .map((s) => {
                const left = Math.max(0, s.available - s.used);
                return `L${s.level} ${left}/${s.available}`;
              })
              .join(' · ')
          : null,
        classResourcesCount: c.classResources?.length ?? 0,
        hasAvatarUrl: av.length > 0,
        avatarUrlChars: av.length,
        avatarUrlPrefix: av.length ? av.slice(0, 96) : null,
        ingestedAt: c.ingestedAt ?? null,
        hasDdbSheetJson: !!(c.ddbSheetJson && typeof c.ddbSheetJson === 'object'),
        ddbSheetJsonBytes:
          c.ddbSheetJson && typeof c.ddbSheetJson === 'object'
            ? (() => {
                try {
                  return JSON.stringify(c.ddbSheetJson).length;
                } catch {
                  return null;
                }
              })()
            : null,
      };
    });
    return {
      user: { id: user.id, email: user.email },
      meta,
      campaign: party.campaign
        ? {
            id: party.campaign.id,
            name: party.campaign.name,
            link: party.campaign.link,
            characterIdsCount: party.campaign.characterIds.length,
          }
        : null,
      fetchedAt: party.fetchedAt,
      upstreamDate: party.upstreamDate,
      error: party.error,
      /** Full normalized party rows + ingest diagnostics (not truncated). */
      characters,
      /** @deprecated Use `characters` — same data; kept for older admin clients. */
      sampleCharacters: characters,
    };
  });

  app.post<{
    Params: { id: string };
    Body: { confirmEmail?: string };
  }>('/api/admin/users/:id/deactivate', async (req, reply) => {
    const a = await resolveAdmin(req, authSecret, userAuth, adminEmailAllowlist);
    if (a.kind !== 'ok') return reply.code(a.status).send({ error: failMsg(a.status) });
    const confirm = typeof req.body?.confirmEmail === 'string' ? req.body.confirmEmail.trim().toLowerCase() : '';
    const target = userAuth.getRowByIdAny(req.params.id);
    if (!target || target.deletedAt != null) {
      return reply.code(404).send({ error: 'User not found' });
    }
    if (confirm !== target.email.toLowerCase()) {
      return reply.code(400).send({ error: 'confirmEmail must match the account email' });
    }
    if (req.params.id === a.userId) {
      return reply.code(400).send({ error: 'You cannot deactivate your own account from the admin console' });
    }
    const r = userAuth.softDeleteUser(req.params.id, adminEmailAllowlist);
    if (!r.ok) {
      if (r.reason === 'last_admin') {
        return reply.code(409).send({ error: 'Cannot remove the last active admin allowlist account' });
      }
      return reply.code(404).send({ error: 'User not found' });
    }
    audit.log({
      actorUserId: a.userId,
      action: 'user.deactivate',
      targetUserId: req.params.id,
      ip: clientIp(req),
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      detail: { targetEmailPrefix: target.email.slice(0, 2) },
    });
    return { ok: true };
  });
}
