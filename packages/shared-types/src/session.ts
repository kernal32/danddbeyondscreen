import type { NormalizedCharacter, PartySnapshot } from './character.js';
import type { InitiativeCombatTag, InitiativeRollBreakdown, InitiativeState, RollMode } from './initiative.js';
import type { TableLayout } from './layout.js';
import type { PartyCardDisplayOptions } from './party-card-display.js';
import type { TableTheme } from './themes.js';

export interface TimedEffect {
  id: string;
  label: string;
  roundsRemaining: number;
  entityId: string;
}

export interface DiceLogEntry {
  at: string;
  message: string;
  /** When true, hidden from display clients (DM-only) */
  dmOnly?: boolean;
}

export interface NpcTemplate {
  id: string;
  name: string;
  defaultAc: number;
  defaultMaxHp: number;
}

/** Captured when hiding a PC that had an initiative row; used for “unhide with saved roll”. */
export interface HiddenInitiativeSnapshot {
  initiativeTotal: number;
  mod: number;
  rollMode: RollMode;
  /** Preserved for tiebreak + display after unhide with saved roll. */
  dexMod?: number;
  rollBreakdown?: InitiativeRollBreakdown;
  combatTags?: InitiativeCombatTag[];
}

/** Party members hidden from TV/phone party + initiative (`manualOverrides.hiddenFromTable`); listed for unhide on phone. */
export type HiddenPartyMember = {
  id: string;
  name: string;
  /** Present when a snapshot was stored at hide time (PC was on the tracker). */
  hasSavedSnapshot?: boolean;
  savedInitiativeTotal?: number;
};

export interface PublicSessionState {
  sessionId: string;
  /** Bumps when the DM changes the display / phone PIN; clients re-verify when this changes. */
  displayPinRevision: number;
  theme: TableTheme;
  /**
   * When non-null and non-empty, clients map these hex colours to CSS variables over the base `theme` class.
   */
  themePalette: string[] | null;
  /** What to show on each party character card (DM + display). */
  partyCardDisplay: PartyCardDisplayOptions;
  /**
   * When true, table/phone **display** clients mask initiative totals and roll lines except for revealed rows
   * (see {@link shouldRevealInitiativeDetailOnDisplay}). DM always sees full data.
   */
  displayInitiativeMaskTotals: boolean;
  /** When true with `displayInitiativeMaskTotals`, also show totals for everyone tied for lowest initiative in order. */
  displayInitiativeRevealLowest: boolean;
  /** TV/table widget grid; included for display and DM. */
  tableLayout: TableLayout;
  party: PartySnapshot;
  initiative: InitiativeState;
  /** Last N dice / system messages (display sees non-dmOnly only) */
  diceLog: DiceLogEntry[];
  timedEffects: TimedEffect[];
  /** Saved NPC templates; DM + display (phone) can spawn from templates. */
  npcTemplates: NpcTemplate[];
  /** Characters with `hiddenFromTable` override (omitted from `party` / `initiative` for display clients). */
  hiddenPartyMembers: HiddenPartyMember[];
}

export interface SessionRecord {
  sessionId: string;
  displayToken: string;
  dmToken: string;
  /** When set, same user (account JWT) may open display / phone routes without the 4-digit PIN. */
  ownerUserId: string | null;
  /** 4-digit code for TV / phone display routes; not exposed on public full state. */
  displayGatePin: string;
  /** Incremented when `displayGatePin` changes so devices re-prompt. */
  displayPinRevision: number;
  theme: TableTheme;
  /** See `PublicSessionState.themePalette`. */
  themePalette?: string[] | null;
  partyCardDisplay: PartyCardDisplayOptions;
  /** @see PublicSessionState.displayInitiativeMaskTotals */
  displayInitiativeMaskTotals?: boolean;
  /** @see PublicSessionState.displayInitiativeRevealLowest */
  displayInitiativeRevealLowest?: boolean;
  tableLayout: TableLayout;
  seedCharacterId: number | null;
  pollIntervalMs: number;
  party: PartySnapshot;
  initiative: InitiativeState;
  manualOverrides: Record<
    string,
    Partial<Pick<NormalizedCharacter, 'currentHp' | 'tempHp' | 'conditions' | 'absent' | 'inspired'>> & {
      /** When true, omit from display party + initiative; excluded from begin-combat rolls. */
      hiddenFromTable?: boolean;
      /** Initiative row data saved when hiding (for restore on unhide). */
      hiddenInitiativeSnapshot?: HiddenInitiativeSnapshot | null;
    }
  >;
  diceLog: DiceLogEntry[];
  timedEffects: TimedEffect[];
  npcTemplates: NpcTemplate[];
}
