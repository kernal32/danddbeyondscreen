import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { loadConfig } from './config.js';
import { openAppDatabase } from './db/sqlite.js';
import { registerAuthRoutes, verifyUserJwt } from './routes/auth.js';
import { DndBeyondService } from './services/dndbeyond.service.js';
import { CharacterService } from './services/character.service.js';
import { GameSessionPersistence } from './services/game-session-persistence.service.js';
import { SessionService } from './services/session.service.js';
import { UserAuthService } from './services/user-auth.service.js';
import { UserPreferencesService } from './services/user-preferences.service.js';
import { UserApiKeyService } from './services/user-api-keys.service.js';
import { UserDdbUploadService } from './services/user-ddb-upload.service.js';
import { registerApiRoutes } from './routes/api.js';
import { attachSocketHandlers, broadcastSessionState } from './ws/socket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../../.env') });

const config = loadConfig();
const db = openAppDatabase(config.databasePath);
const gameSessionPersistence = new GameSessionPersistence(db);

const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const PERSIST_DEBOUNCE_MS = 900;
let sessions: SessionService;
const schedulePersist = (sessionId: string) => {
  const prev = persistTimers.get(sessionId);
  if (prev) clearTimeout(prev);
  persistTimers.set(
    sessionId,
    setTimeout(() => {
      persistTimers.delete(sessionId);
      const s = sessions.get(sessionId);
      if (s) gameSessionPersistence.upsert(s);
    }, PERSIST_DEBOUNCE_MS),
  );
};

const flushAllPersisted = () => {
  for (const t of persistTimers.values()) clearTimeout(t);
  persistTimers.clear();
  for (const s of sessions.allSessions()) {
    gameSessionPersistence.upsert(s);
  }
};

sessions = new SessionService({
  onCreate: (s) => gameSessionPersistence.upsert(s),
  onMutate: schedulePersist,
});

for (const row of gameSessionPersistence.loadAll()) {
  sessions.restoreSession(row);
}

const ddb = new DndBeyondService(config);
const characters = new CharacterService(ddb);

/** Match nginx `client_max_body_size` — ingest payloads are large (many characters × full DDB JSON). */
const app = Fastify({ logger: true, bodyLimit: 32 * 1024 * 1024 });

if (config.ddbCookie) {
  app.log.warn(
    'DDB_COOKIE is set: D&D Beyond requests include a browser session. Treat this backend as sensitive; rotate the cookie if exposed.',
  );
}

if (config.authSecret.length > 0 && config.authSecret.length < 32) {
  app.log.warn(
    'AUTH_SECRET is set but shorter than 32 characters — user accounts are disabled. Use a long random value (e.g. openssl rand -hex 32).',
  );
}

let userPrefs: UserPreferencesService | null = null;
let userApiKeys: UserApiKeyService | null = null;
let userDdbUploads: UserDdbUploadService | null = null;
if (config.authSecret.length >= 32) {
  const userAuth = new UserAuthService(db);
  userPrefs = new UserPreferencesService(db, config.authSecret);
  userApiKeys = new UserApiKeyService(db);
  userDdbUploads = new UserDdbUploadService(db);
  registerAuthRoutes(app, {
    authSecret: config.authSecret,
    userAuth,
    prefs: userPrefs,
    apiKeys: userApiKeys,
    ddbUploads: userDdbUploads,
    sessions,
    gameSessionPersistence,
  });
  app.log.info({ databasePath: config.databasePath }, 'User accounts enabled (SQLite + JWT)');
} else {
  app.log.info({ databasePath: config.databasePath }, 'Game sessions persisted to SQLite (user accounts disabled)');
}

await app.register(cors, {
  origin: config.corsOrigin,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Authorization'],
});

let io: Server | undefined;
const broadcast = (sessionId: string) => {
  if (io) void broadcastSessionState(io, sessions, sessionId);
};

function parseBearerHeader(auth: string | undefined): string | null {
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

registerApiRoutes(app, {
  sessions,
  characters,
  config,
  broadcast,
  ddb,
  authEnabled: config.authSecret.length >= 32,
  userApiKeys: userApiKeys ?? undefined,
  userDdbUploads: userDdbUploads ?? undefined,
  authSecret: config.authSecret.length >= 32 ? config.authSecret : undefined,
  applyUserPrefsToNewSession:
    config.authSecret.length >= 32 && userPrefs
      ? async (s, hdr) => {
          const t = parseBearerHeader(hdr);
          if (!t) return;
          const uid = await verifyUserJwt(t, config.authSecret);
          if (!uid) return;
          userPrefs!.applyToSession(s, uid, sessions);
          ddb.clearCache();
        }
      : undefined,
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    try {
      flushAllPersisted();
    } catch (e) {
      app.log.warn({ err: e }, 'flush game sessions on shutdown failed');
    }
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });

io = new Server(app.server, {
  cors: { origin: config.corsOrigin === true ? '*' : config.corsOrigin },
});

attachSocketHandlers(io, { sessions, characters, config, broadcast });

app.log.info(`API + Socket.IO on http://${config.host}:${config.port}`);
