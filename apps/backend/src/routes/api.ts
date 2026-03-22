import type { FastifyInstance } from 'fastify';
import type { SessionRecord } from '@ddb/shared-types';
import type { AppConfig } from '../config.js';
import type { CharacterService } from '../services/character.service.js';
import type { SessionService } from '../services/session.service.js';
import type { DndBeyondService } from '../services/dndbeyond.service.js';
import { effectiveDdbCookie } from '../services/ddb-session-cookie.js';
import type { PartyCardDisplayOptions, PartySnapshot, TableLayout, TableTheme } from '@ddb/shared-types';
import { isInitiativeCombatTag, isTableTheme, parsePartyCardDisplayPayload } from '@ddb/shared-types';
import * as Initiative from '../services/initiative.service.js';
import { randomUUID } from 'node:crypto';
import { parseTableLayoutPayload } from '../util/table-layout.js';
import { IngestRateLimiter } from '../util/ingest-rate-limit.js';
import { mergeIngestParty } from '../util/party-ingest-merge.js';
import { parsePartySnapshotIngest } from '../util/validate-party-ingest.js';
import { hashApiKeyPlain } from '../services/user-api-keys.service.js';
import type { UserApiKeyService } from '../services/user-api-keys.service.js';
import type { UserDdbUploadService } from '../services/user-ddb-upload.service.js';
import { verifyUserJwt } from './auth.js';
import { displayPinsEqual, normalizeDisplayGatePin } from '../util/display-gate-pin.js';

const ingestLimiter = new IngestRateLimiter(60_000, 45);

function parseBearer(auth: string | undefined): string | null {
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

export function registerApiRoutes(
  app: FastifyInstance,
  deps: {
    sessions: SessionService;
    characters: CharacterService;
    config: AppConfig;
    broadcast: (sessionId: string) => void;
    ddb: DndBeyondService;
    /** When the client sends `Authorization: Bearer <user JWT>` on new session, apply saved preferences. */
    applyUserPrefsToNewSession?: (
      session: SessionRecord,
      authorizationHeader: string | undefined,
    ) => void | Promise<void>;
    authEnabled: boolean;
    userApiKeys?: UserApiKeyService;
    userDdbUploads?: UserDdbUploadService;
    authSecret?: string;
  },
) {
  const {
    sessions,
    characters,
    config,
    broadcast,
    ddb,
    applyUserPrefsToNewSession,
    authEnabled,
    userApiKeys,
    userDdbUploads,
    authSecret,
  } = deps;

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/auth/enabled', async () => ({ enabled: authEnabled }));

  app.post('/api/sessions', async (req) => {
    const s = sessions.create();
    const authHdr = req.headers.authorization;
    const hdr = Array.isArray(authHdr) ? authHdr[0] : authHdr;
    if (authSecret && hdr) {
      const ujwt = parseBearer(hdr);
      if (ujwt) {
        const uid = await verifyUserJwt(ujwt, authSecret);
        if (uid) s.ownerUserId = uid;
      }
    }
    if (applyUserPrefsToNewSession) {
      await applyUserPrefsToNewSession(s, hdr);
    }
    return {
      sessionId: s.sessionId,
      displayToken: s.displayToken,
      dmToken: s.dmToken,
    };
  });

  app.get<{ Params: { sessionId: string } }>('/api/sessions/:sessionId', async (req, reply) => {
    const token = parseBearer(req.headers.authorization);
    const s = sessions.get(req.params.sessionId);
    if (!s || !token || !sessions.isDmToken(s, token)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    return {
      sessionId: s.sessionId,
      theme: s.theme,
      partyCardDisplay: s.partyCardDisplay,
      tableLayout: s.tableLayout,
      seedCharacterId: s.seedCharacterId,
      pollIntervalMs: s.pollIntervalMs,
      displayToken: s.displayToken,
      displayGatePin: s.displayGatePin,
      displayPinRevision: s.displayPinRevision,
    };
  });

  app.patch<{
    Params: { sessionId: string };
    Body: Partial<{
      theme: TableTheme;
      partyCardDisplay: PartyCardDisplayOptions;
      tableLayout: TableLayout;
      seedCharacterId: number | null;
      pollIntervalMs: number;
      /** Exactly four digits; bumps `displayPinRevision` for display / phone clients. */
      displayGatePin: string;
    }>;
  }>(
    '/api/sessions/:sessionId',
    async (req, reply) => {
      const token = parseBearer(req.headers.authorization);
      const s = sessions.get(req.params.sessionId);
      if (!s || !token || !sessions.isDmToken(s, token)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      if (req.body.displayGatePin !== undefined) {
        const pin = normalizeDisplayGatePin(req.body.displayGatePin);
        if (!pin) {
          return reply.code(400).send({ error: 'displayGatePin must be exactly 4 digits' });
        }
        s.displayGatePin = pin;
        s.displayPinRevision += 1;
      }
      if (req.body.theme !== undefined) {
        if (!isTableTheme(req.body.theme)) {
          return reply.code(400).send({ error: 'Invalid theme' });
        }
        sessions.setTheme(s, req.body.theme);
      }
      if (req.body.partyCardDisplay !== undefined) {
        const parsed = parsePartyCardDisplayPayload(req.body.partyCardDisplay);
        if (!parsed) return reply.code(400).send({ error: 'Invalid partyCardDisplay' });
        sessions.setPartyCardDisplay(s, parsed);
      }
      if (req.body.tableLayout !== undefined) {
        const parsed = parseTableLayoutPayload(req.body.tableLayout);
        if (!parsed) return reply.code(400).send({ error: 'Invalid tableLayout' });
        sessions.setTableLayout(s, parsed);
      }
      if (req.body.seedCharacterId !== undefined) sessions.setSeed(s, req.body.seedCharacterId);
      if (req.body.pollIntervalMs !== undefined) s.pollIntervalMs = req.body.pollIntervalMs;
      sessions.markDirty(s);
      broadcast(s.sessionId);
      return { ok: true, displayPinRevision: s.displayPinRevision };
    },
  );

  app.get<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/party', async (req, reply) => {
    const token = parseBearer(req.headers.authorization);
    const s = sessions.get(req.params.sessionId);
    if (!s || !token || !sessions.isDmToken(s, token)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    return sessions.toPublic(s, 'dm').party;
  });

  app.post<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/party/refresh', async (req, reply) => {
    const token = parseBearer(req.headers.authorization);
    const s = sessions.get(req.params.sessionId);
    if (!s || !token || !sessions.isDmToken(s, token)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (s.seedCharacterId == null) {
      return reply.code(400).send({ error: 'No seedCharacterId set' });
    }
    sessions.appendLog(s, 'Refreshing party from D&D Beyond…', true, config.diceLogMax);
    const party = await characters.loadParty(s.seedCharacterId, true, effectiveDdbCookie(config));
    sessions.setParty(s, party);
    if (party.error) {
      sessions.appendLog(s, `D&D Beyond: ${party.error}`, true, config.diceLogMax);
    } else {
      sessions.appendLog(s, 'Party refresh complete.', true, config.diceLogMax);
    }
    broadcast(s.sessionId);
    return sessions.toPublic(s, 'dm').party;
  });

  app.get<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/initiative', async (req, reply) => {
    const token = parseBearer(req.headers.authorization);
    const s = sessions.get(req.params.sessionId);
    if (!s || !token || !sessions.isDmToken(s, token)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    return s.initiative;
  });

  app.patch<{
    Params: { sessionId: string };
    Body: {
      action:
        | 'next'
        | 'prev'
        | 'nextRound'
        | 'prevRound'
        | 'sort'
        | 'clear'
        | 'delay'
        | 'add'
        | 'remove'
        | 'roll'
        | 'setTotal'
        | 'toggleLock'
        | 'setCombatTags';
      entryId?: string;
      label?: string;
      entityId?: string;
      mod?: number;
      groupId?: string;
      total?: number;
      rollMode?: 'normal' | 'advantage' | 'disadvantage';
      combatTags?: string[];
    };
  }>('/api/sessions/:sessionId/initiative', async (req, reply) => {
    const token = parseBearer(req.headers.authorization);
    const s = sessions.get(req.params.sessionId);
    if (!s || !token || !sessions.isDmToken(s, token)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    let next = s.initiative;
    const a = req.body.action;
    if (a === 'next') {
      next = Initiative.nextTurn(next);
      s.timedEffects = Initiative.tickTimedEffects(s.timedEffects);
    } else if (a === 'prev') next = Initiative.prevTurn(next);
    else if (a === 'nextRound') next = Initiative.advanceRoundAndRerollInitiative(next);
    else if (a === 'prevRound') next = Initiative.decrementRoundOnly(next);
    else if (a === 'sort') next = Initiative.sortInitiative(next);
    else if (a === 'clear') next = Initiative.clearInitiative(next);
    else if (a === 'delay') next = Initiative.delayCurrent(next);
    else if (a === 'add') {
      next = Initiative.addCombatant(next, {
        label: req.body.label ?? 'Combatant',
        entityId: req.body.entityId,
        mod: req.body.mod,
        groupId: req.body.groupId,
      });
    } else if (a === 'remove' && req.body.entryId) {
      next = Initiative.removeCombatant(next, req.body.entryId);
    } else if (a === 'roll') {
      next = Initiative.rollInitiative(next, req.body.entryId, req.body.rollMode, req.body.mod);
    } else if (a === 'setTotal' && req.body.entryId && req.body.total !== undefined) {
      next = Initiative.setInitiativeTotal(next, req.body.entryId, req.body.total);
    } else if (a === 'toggleLock' && req.body.entryId) {
      next = Initiative.toggleLock(next, req.body.entryId);
    } else if (a === 'setCombatTags' && req.body.entryId) {
      const tags = Array.isArray(req.body.combatTags) ? req.body.combatTags.filter(isInitiativeCombatTag) : [];
      next = Initiative.setEntryCombatTags(next, req.body.entryId, tags);
    }
    sessions.setInitiative(s, next);
    broadcast(s.sessionId);
    return next;
  });

  app.get<{ Params: { displayToken: string } }>(
    '/api/public/display/:displayToken/meta',
    async (req, reply) => {
      const s = sessions.getByDisplayToken(req.params.displayToken);
      if (!s) return reply.code(404).send({ error: 'Not found' });
      return { sessionId: s.sessionId, displayPinRevision: s.displayPinRevision };
    },
  );

  app.post<{ Params: { displayToken: string }; Body: { pin?: string } }>(
    '/api/public/display/:displayToken/unlock',
    async (req, reply) => {
      const s = sessions.getByDisplayToken(req.params.displayToken);
      if (!s) return reply.code(404).send({ error: 'Not found' });
      const pin = normalizeDisplayGatePin(req.body?.pin);
      if (!pin) return reply.code(400).send({ error: 'pin must be exactly 4 digits' });
      if (!displayPinsEqual(s.displayGatePin, pin)) {
        return reply.code(403).send({ error: 'Invalid code' });
      }
      return { ok: true as const, displayPinRevision: s.displayPinRevision };
    },
  );

  app.post<{ Params: { displayToken: string } }>(
    '/api/public/display/:displayToken/unlock-account',
    async (req, reply) => {
      if (!authEnabled || !authSecret) {
        return reply.code(503).send({ error: 'Account sign-in is not enabled on this server' });
      }
      const tok = parseBearer(req.headers.authorization);
      if (!tok) return reply.code(401).send({ error: 'Sign in required' });
      const uid = await verifyUserJwt(tok, authSecret);
      if (!uid) return reply.code(401).send({ error: 'Invalid or expired sign-in' });
      const s = sessions.getByDisplayToken(req.params.displayToken);
      if (!s) return reply.code(404).send({ error: 'Not found' });
      if (!s.ownerUserId || s.ownerUserId !== uid) {
        return reply
          .code(403)
          .send({ error: 'This table is not linked to your account (create the game while signed in to skip the PIN).' });
      }
      return { ok: true as const, displayPinRevision: s.displayPinRevision };
    },
  );

  app.get<{ Params: { displayToken: string } }>('/api/public/display/:displayToken', async (req, reply) => {
    const s = sessions.getByDisplayToken(req.params.displayToken);
    if (!s) return reply.code(404).send({ error: 'Not found' });
    return sessions.toPublic(s, 'display');
  });

  app.post<{
    Params: { sessionId: string };
    Body: {
      characterId: string;
      currentHp?: number;
      tempHp?: number;
      conditions?: string[];
      absent?: boolean;
      hiddenFromTable?: boolean;
    };
  }>('/api/sessions/:sessionId/party/manual', async (req, reply) => {
    const token = parseBearer(req.headers.authorization);
    const s = sessions.get(req.params.sessionId);
    if (!s || !token || !sessions.isDmToken(s, token)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const { characterId, currentHp, tempHp, conditions, absent, hiddenFromTable } = req.body;
    if (!characterId) return reply.code(400).send({ error: 'characterId required' });
    sessions.setManualOverride(s, characterId, {
      currentHp,
      tempHp,
      conditions,
      absent,
      hiddenFromTable,
    });
    if (absent === true || hiddenFromTable === true) {
      s.initiative = Initiative.removeByEntityId(s.initiative, characterId);
    }
    if (hiddenFromTable === true) {
      s.timedEffects = s.timedEffects.filter((e) => e.entityId !== characterId);
    }
    broadcast(s.sessionId);
    return { ok: true };
  });

  app.post<{
    Body: {
      format?: string;
      party?: unknown;
      characters?: unknown[];
      /** When true, merge by character id into the stored upload (keeps others). When false with multi-character body, replaces entire stored party. */
      mergeParty?: boolean;
      /** When true, always replace stored party with this payload (no merge). */
      replaceParty?: boolean;
    };
  }>(
    '/api/ingest/party',
    { bodyLimit: 32 * 1024 * 1024 },
    async (req, reply) => {
      if (!userApiKeys || !userDdbUploads) {
        return reply.code(503).send({ error: 'User accounts are disabled (set AUTH_SECRET)' });
      }
      const auth = req.headers.authorization;
      const hdr = Array.isArray(auth) ? auth[0] : auth;
      const plain = parseBearer(hdr);
      if (!plain || plain.length > 200) {
        return reply.code(401).send({ error: 'Invalid or missing API key' });
      }
      const resolved = userApiKeys.resolveAndTouch(plain);
      if (!resolved) {
        return reply.code(401).send({ error: 'Invalid or missing API key' });
      }
      const bucketKey = hashApiKeyPlain(plain);
      if (!ingestLimiter.allow(bucketKey)) {
        return reply.code(429).send({ error: 'Too many requests' });
      }

      const body = req.body ?? {};
      let party: PartySnapshot | null = null;
      if (body.format === 'party' && body.party !== undefined) {
        party = parsePartySnapshotIngest(body.party);
      } else if (body.format === 'ddb_characters' && Array.isArray(body.characters)) {
        party = characters.partyFromDdbJsonArray(body.characters);
      } else if (body.party !== undefined) {
        party = parsePartySnapshotIngest(body.party);
      } else if (Array.isArray(body.characters)) {
        party = characters.partyFromDdbJsonArray(body.characters);
      }

      if (!party || party.characters.length < 1) {
        return reply.code(400).send({ error: 'Expected party or characters[] with at least one valid character' });
      }

      const replaceParty = body.replaceParty === true;
      const mergePartyFlag = body.mergeParty === true;
      const batchTime = Date.now();
      const existing = userDdbUploads.getParty(resolved.userId);
      let merge: boolean;
      if (replaceParty) {
        merge = false;
      } else if (mergePartyFlag) {
        merge = true;
      } else {
        merge = party.characters.length === 1;
      }
      const stored = mergeIngestParty(existing, party, merge, batchTime);
      userDdbUploads.saveParty(resolved.userId, stored);
      const meta = userDdbUploads.getMeta(resolved.userId);
      return {
        ok: true,
        characterCount: party.characters.length,
        storedCharacterCount: stored.characters.length,
        mergeMode: merge ? ('merge' as const) : ('replace' as const),
        uploadUpdatedAt: meta?.updatedAt ?? batchTime,
      };
    },
  );

  /** Copy latest account upload into this live session (DM token + browser user JWT). */
  app.post<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/party/import-upload',
    async (req, reply) => {
      if (!userDdbUploads || !authSecret) {
        return reply.code(503).send({ error: 'User accounts are disabled' });
      }
      const dmTok = parseBearer(req.headers.authorization);
      const s = sessions.get(req.params.sessionId);
      if (!s || !dmTok || !sessions.isDmToken(s, dmTok)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const xUser = req.headers['x-user-authorization'];
      const xHdr = Array.isArray(xUser) ? xUser[0] : xUser;
      const userJwt = xHdr?.startsWith('Bearer ') ? xHdr.slice(7).trim() : null;
      if (!userJwt) {
        return reply.code(401).send({ error: 'X-User-Authorization: Bearer <login JWT> required' });
      }
      const userId = await verifyUserJwt(userJwt, authSecret);
      if (!userId) {
        return reply.code(401).send({ error: 'Invalid user token' });
      }
      const party = userDdbUploads.getParty(userId);
      if (!party || party.characters.length < 1) {
        return reply.code(404).send({ error: 'No uploaded party for this account yet' });
      }
      sessions.setParty(s, party);
      sessions.appendLog(
        s,
        `Loaded ${party.characters.length} character(s) from account upload.`,
        true,
        config.diceLogMax,
      );
      broadcast(s.sessionId);
      const meta = userDdbUploads.getMeta(userId);
      return {
        ok: true,
        characterCount: party.characters.length,
        uploadUpdatedAt: meta?.updatedAt ?? null,
      };
    },
  );

  app.post<{
    Params: { sessionId: string };
    Body: { name: string; defaultAc: number; defaultMaxHp: number; id?: string };
  }>('/api/sessions/:sessionId/npc-templates', async (req, reply) => {
    const token = parseBearer(req.headers.authorization);
    const s = sessions.get(req.params.sessionId);
    if (!s || !token || !sessions.isDmToken(s, token)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const id = req.body.id ?? randomUUID();
    sessions.addNpcTemplate(s, {
      id,
      name: req.body.name,
      defaultAc: req.body.defaultAc,
      defaultMaxHp: req.body.defaultMaxHp,
    });
    broadcast(s.sessionId);
    return { ok: true, id };
  });
}
