import type { FastifyInstance } from 'fastify';
import type { PartyCardDisplayOptions, TableLayout, UserThemePreferences } from '@ddb/shared-types';
import { parsePartyCardDisplayPayload, parseUserThemePreferences } from '@ddb/shared-types';
import { signUserJwt, verifyUserJwt } from '../auth/user-jwt.js';
import type { UserAuthService } from '../services/user-auth.service.js';
import type { UserPreferencesService } from '../services/user-preferences.service.js';
import type { UserApiKeyService } from '../services/user-api-keys.service.js';
import type { UserDdbUploadService } from '../services/user-ddb-upload.service.js';
import type { GameSessionPersistence } from '../services/game-session-persistence.service.js';
import type { SessionService } from '../services/session.service.js';
import { parseTableLayoutPayload } from '../util/table-layout.js';

const MAX_COOKIE = 65536;

function parseBearer(auth: string | undefined): string | null {
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: {
    authSecret: string;
    userAuth: UserAuthService;
    prefs: UserPreferencesService;
    apiKeys: UserApiKeyService;
    ddbUploads: UserDdbUploadService;
    sessions: SessionService;
    gameSessionPersistence: GameSessionPersistence;
    /** Normalized emails allowed to use `/api/admin/*` (empty = no admin UI flag). */
    adminEmailAllowlist?: Set<string>;
  },
) {
  const { authSecret, userAuth, prefs, apiKeys, ddbUploads, sessions, gameSessionPersistence, adminEmailAllowlist } =
    deps;

  app.post<{ Body: { email?: string; password?: string } }>('/api/auth/register', async (req, reply) => {
    const email = req.body?.email;
    const password = req.body?.password;
    if (typeof email !== 'string' || typeof password !== 'string') {
      return reply.code(400).send({ error: 'email and password required' });
    }
    const r = userAuth.register(email, password);
    if (!r.ok) {
      if (r.reason === 'exists') return reply.code(409).send({ error: 'Email already registered' });
      if (r.reason === 'weak') return reply.code(400).send({ error: 'Password must be at least 10 characters' });
      return reply.code(400).send({ error: 'Invalid email' });
    }
    const user = userAuth.getById(r.id);
    if (!user) return reply.code(500).send({ error: 'Registration failed' });
    const token = await signUserJwt(user.id, authSecret);
    return { token, user: { email: user.email } };
  });

  app.post<{ Body: { email?: string; password?: string } }>('/api/auth/login', async (req, reply) => {
    const email = req.body?.email;
    const password = req.body?.password;
    if (typeof email !== 'string' || typeof password !== 'string') {
      return reply.code(400).send({ error: 'email and password required' });
    }
    const user = userAuth.login(email, password);
    if (!user) return reply.code(401).send({ error: 'Invalid email or password' });
    const token = await signUserJwt(user.id, authSecret);
    return { token, user: { email: user.email } };
  });

  app.get('/api/me', async (req, reply) => {
    const tok = parseBearer(req.headers.authorization);
    if (!tok) return reply.code(401).send({ error: 'Unauthorized' });
    const userId = await verifyUserJwt(tok, authSecret);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const user = userAuth.getById(userId);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    const p = prefs.getSnapshot(userId);
    const allow = adminEmailAllowlist;
    const isAdmin = allow && allow.size > 0 && allow.has(user.email.toLowerCase());
    return {
      email: user.email,
      isAdmin: Boolean(isAdmin),
      preferences: {
        defaultSeedCharacterId: p.defaultSeedCharacterId,
        ddbCookie: p.ddbCookie,
        tableLayout: p.tableLayout,
        partyCardDisplay: p.partyCardDisplay,
        themePreferences: p.themePreferences,
        combinedLayoutPresets: p.combinedLayoutPresets,
      },
    };
  });

  app.put<{
    Body: Partial<{
      defaultSeedCharacterId: number | null;
      ddbCookie: string | null;
      tableLayout: TableLayout | null;
      partyCardDisplay: PartyCardDisplayOptions | null;
      themePreferences: UserThemePreferences | null;
      combinedLayoutPresets: { id: string; name: string; layout: Record<string, unknown> }[] | null;
    }>;
  }>('/api/me/preferences', async (req, reply) => {
    const tok = parseBearer(req.headers.authorization);
    if (!tok) return reply.code(401).send({ error: 'Unauthorized' });
    const userId = await verifyUserJwt(tok, authSecret);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const user = userAuth.getById(userId);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });

    const body = req.body ?? {};
    try {
      if (body.ddbCookie !== undefined && body.ddbCookie !== null && body.ddbCookie.length > MAX_COOKIE) {
        return reply.code(400).send({ error: 'ddbCookie too long' });
      }
      if (body.tableLayout !== undefined && body.tableLayout !== null) {
        if (!parseTableLayoutPayload(body.tableLayout as unknown)) {
          return reply.code(400).send({ error: 'Invalid tableLayout' });
        }
      }
      if (body.partyCardDisplay !== undefined && body.partyCardDisplay !== null) {
        if (!parsePartyCardDisplayPayload(body.partyCardDisplay as unknown)) {
          return reply.code(400).send({ error: 'Invalid partyCardDisplay' });
        }
      }
      prefs.save(userId, {
        defaultSeedCharacterId: body.defaultSeedCharacterId,
        ddbCookie: body.ddbCookie,
        tableLayout: body.tableLayout === undefined ? undefined : body.tableLayout,
        partyCardDisplay: body.partyCardDisplay === undefined ? undefined : body.partyCardDisplay,
        themePreferences:
          body.themePreferences === undefined
            ? undefined
            : body.themePreferences === null
              ? null
              : parseUserThemePreferences(body.themePreferences as unknown),
        combinedLayoutPresets:
          body.combinedLayoutPresets === undefined ? undefined : body.combinedLayoutPresets,
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get('/api/me/ddb-upload', async (req, reply) => {
    const tok = parseBearer(req.headers.authorization);
    if (!tok) return reply.code(401).send({ error: 'Unauthorized' });
    const userId = await verifyUserJwt(tok, authSecret);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const meta = ddbUploads.getMeta(userId);
    return { upload: meta };
  });

  app.get('/api/me/combined-layout-presets', async (req, reply) => {
    const tok = parseBearer(req.headers.authorization);
    if (!tok) return reply.code(401).send({ error: 'Unauthorized' });
    const userId = await verifyUserJwt(tok, authSecret);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const p = prefs.getSnapshot(userId);
    return { presets: p.combinedLayoutPresets };
  });

  app.put<{
    Body: { presets?: { id?: string; name?: string; layout?: Record<string, unknown> }[] };
  }>('/api/me/combined-layout-presets', async (req, reply) => {
    const tok = parseBearer(req.headers.authorization);
    if (!tok) return reply.code(401).send({ error: 'Unauthorized' });
    const userId = await verifyUserJwt(tok, authSecret);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const presets = Array.isArray(req.body?.presets) ? req.body.presets : [];
    try {
      prefs.save(userId, { combinedLayoutPresets: presets as { id: string; name: string; layout: Record<string, unknown> }[] });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      return reply.code(400).send({ error: msg });
    }
  });

  app.post<{ Body: { label?: string } }>('/api/me/api-keys', async (req, reply) => {
    const tok = parseBearer(req.headers.authorization);
    if (!tok) return reply.code(401).send({ error: 'Unauthorized' });
    const userId = await verifyUserJwt(tok, authSecret);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const label = typeof req.body?.label === 'string' ? req.body.label : null;
    try {
      const created = apiKeys.create(userId, label);
      return {
        id: created.id,
        key: created.plainKey,
        keyPrefix: created.keyPrefix,
        hint: 'Authorization: Bearer <key> on POST /api/ingest/party — copy now; not shown again.',
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get('/api/me/api-keys', async (req, reply) => {
    const tok = parseBearer(req.headers.authorization);
    if (!tok) return reply.code(401).send({ error: 'Unauthorized' });
    const userId = await verifyUserJwt(tok, authSecret);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    return { keys: apiKeys.list(userId) };
  });

  app.delete<{ Params: { id: string } }>('/api/me/api-keys/:id', async (req, reply) => {
    const tok = parseBearer(req.headers.authorization);
    if (!tok) return reply.code(401).send({ error: 'Unauthorized' });
    const userId = await verifyUserJwt(tok, authSecret);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const ok = apiKeys.revoke(userId, req.params.id);
    if (!ok) return reply.code(404).send({ error: 'Not found' });
    return { ok: true };
  });

  app.get('/api/me/table-sessions', async (req, reply) => {
    const tok = parseBearer(req.headers.authorization);
    if (!tok) return reply.code(401).send({ error: 'Unauthorized' });
    const userId = await verifyUserJwt(tok, authSecret);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const tables = gameSessionPersistence.listForOwner(userId);
    return { tables };
  });

  app.post<{ Params: { sessionId: string } }>(
    '/api/me/table-sessions/:sessionId/resume',
    async (req, reply) => {
      const tok = parseBearer(req.headers.authorization);
      if (!tok) return reply.code(401).send({ error: 'Unauthorized' });
      const userId = await verifyUserJwt(tok, authSecret);
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const s = sessions.get(req.params.sessionId);
      if (!s) return reply.code(404).send({ error: 'Session not found' });
      if (!s.ownerUserId || s.ownerUserId !== userId) {
        return reply.code(403).send({ error: 'This table is not linked to your account' });
      }
      return {
        sessionId: s.sessionId,
        dmToken: s.dmToken,
        displayToken: s.displayToken,
      };
    },
  );
}

export { verifyUserJwt };
