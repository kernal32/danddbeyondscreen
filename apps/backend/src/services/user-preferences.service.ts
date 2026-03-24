import type Database from 'better-sqlite3';
import type {
  PartyCardDisplayOptions,
  SessionRecord,
  TableLayout,
  UserThemePreferences,
} from '@ddb/shared-types';
import { parsePartyCardDisplayPayload, parseUserThemePreferences } from '@ddb/shared-types';
import { encryptSecretField, decryptSecretField } from '../auth/field-crypto.js';
import { parseTableLayoutPayload } from '../util/table-layout.js';
import type { SessionService } from './session.service.js';

const MAX_COOKIE = 65536;

export type UserPreferencesSnapshot = {
  defaultSeedCharacterId: number | null;
  ddbCookie: string | null;
  tableLayout: TableLayout | null;
  partyCardDisplay: PartyCardDisplayOptions | null;
  themePreferences: UserThemePreferences;
};

export type UserPreferencesPatch = {
  defaultSeedCharacterId?: number | null;
  ddbCookie?: string | null;
  tableLayout?: TableLayout | null;
  partyCardDisplay?: PartyCardDisplayOptions | null;
  themePreferences?: UserThemePreferences | null;
};

type PrefRow = {
  default_seed_character_id: number | null;
  ddb_cookie_cipher: string | null;
  table_layout_json: string | null;
  party_card_display_json: string | null;
  theme_preferences_json: string | null;
};

export class UserPreferencesService {
  constructor(
    private db: Database.Database,
    private authSecret: string,
  ) {}

  getSnapshot(userId: string): UserPreferencesSnapshot {
    const row = this.db
      .prepare(
        'SELECT default_seed_character_id, ddb_cookie_cipher, table_layout_json, party_card_display_json, theme_preferences_json FROM user_preferences WHERE user_id = ?',
      )
      .get(userId) as PrefRow | undefined;

    if (!row) {
      return {
        defaultSeedCharacterId: null,
        ddbCookie: null,
        tableLayout: null,
        partyCardDisplay: null,
        themePreferences: parseUserThemePreferences(null),
      };
    }

    let ddbCookie: string | null = null;
    if (row.ddb_cookie_cipher) {
      ddbCookie = decryptSecretField(row.ddb_cookie_cipher, this.authSecret);
    }

    let tableLayout: TableLayout | null = null;
    if (row.table_layout_json) {
      try {
        const parsed = parseTableLayoutPayload(JSON.parse(row.table_layout_json) as unknown);
        if (parsed) tableLayout = parsed;
      } catch {
        /* ignore */
      }
    }

    let partyCardDisplay: PartyCardDisplayOptions | null = null;
    if (row.party_card_display_json) {
      try {
        const parsed = parsePartyCardDisplayPayload(JSON.parse(row.party_card_display_json) as unknown);
        if (parsed) partyCardDisplay = parsed;
      } catch {
        /* ignore */
      }
    }

    let themePreferences = parseUserThemePreferences(null);
    if (row.theme_preferences_json) {
      try {
        themePreferences = parseUserThemePreferences(JSON.parse(row.theme_preferences_json) as unknown);
      } catch {
        /* ignore */
      }
    }

    return {
      defaultSeedCharacterId:
        row.default_seed_character_id != null && Number.isFinite(row.default_seed_character_id)
          ? row.default_seed_character_id
          : null,
      ddbCookie,
      tableLayout,
      partyCardDisplay,
      themePreferences,
    };
  }

  save(userId: string, patch: UserPreferencesPatch): void {
    const cur = this.db
      .prepare(
        'SELECT default_seed_character_id, ddb_cookie_cipher, table_layout_json, party_card_display_json, theme_preferences_json FROM user_preferences WHERE user_id = ?',
      )
      .get(userId) as PrefRow | undefined;

    if (!cur) return;

    let seed = cur.default_seed_character_id;
    if (patch.defaultSeedCharacterId !== undefined) {
      seed =
        patch.defaultSeedCharacterId === null || !Number.isFinite(patch.defaultSeedCharacterId)
          ? null
          : Math.floor(patch.defaultSeedCharacterId);
    }

    let cipher = cur.ddb_cookie_cipher;
    if (patch.ddbCookie !== undefined) {
      if (patch.ddbCookie === null || patch.ddbCookie.trim() === '') {
        cipher = null;
      } else {
        const t = patch.ddbCookie.trim();
        if (t.length > MAX_COOKIE) throw new Error('ddbCookie too long');
        cipher = encryptSecretField(t, this.authSecret);
      }
    }

    let layoutJson = cur.table_layout_json;
    if (patch.tableLayout !== undefined) {
      if (patch.tableLayout === null) {
        layoutJson = null;
      } else {
        const parsed = parseTableLayoutPayload(patch.tableLayout as unknown);
        if (!parsed) throw new Error('Invalid tableLayout');
        layoutJson = JSON.stringify(parsed);
      }
    }

    let partyCardJson = cur.party_card_display_json;
    if (patch.partyCardDisplay !== undefined) {
      if (patch.partyCardDisplay === null) {
        partyCardJson = null;
      } else {
        const parsed = parsePartyCardDisplayPayload(patch.partyCardDisplay as unknown);
        if (!parsed) throw new Error('Invalid partyCardDisplay');
        partyCardJson = JSON.stringify(parsed);
      }
    }

    let themePrefJson = cur.theme_preferences_json;
    if (patch.themePreferences !== undefined) {
      if (patch.themePreferences === null) {
        themePrefJson = null;
      } else {
        const normalized = parseUserThemePreferences(patch.themePreferences as unknown);
        themePrefJson = JSON.stringify(normalized);
      }
    }

    this.db
      .prepare(
        `UPDATE user_preferences SET
          default_seed_character_id = ?,
          ddb_cookie_cipher = ?,
          table_layout_json = ?,
          party_card_display_json = ?,
          theme_preferences_json = ?,
          updated_at = ?
        WHERE user_id = ?`,
      )
      .run(seed, cipher, layoutJson, partyCardJson, themePrefJson, Date.now(), userId);
  }

  /** Copy saved prefs into a new in-memory game session (e.g. after POST /api/sessions). */
  applyToSession(session: SessionRecord, userId: string, sessions: SessionService): void {
    const snap = this.getSnapshot(userId);
    if (snap.defaultSeedCharacterId != null) sessions.setSeed(session, snap.defaultSeedCharacterId);
    if (snap.tableLayout) sessions.setTableLayout(session, snap.tableLayout);
    if (snap.partyCardDisplay) sessions.setPartyCardDisplay(session, snap.partyCardDisplay);

    const tp = snap.themePreferences;
    const pref = tp.preferredDefault;
    if (pref?.kind === 'builtin') {
      sessions.setTheme(session, pref.theme);
      sessions.setThemePalette(session, null);
    } else if (pref?.kind === 'custom') {
      const c = tp.savedCustomThemes.find((t) => t.id === pref.id);
      if (c) {
        sessions.setTheme(session, c.baseTheme);
        sessions.setThemePalette(session, c.palette);
      }
    }
  }
}
