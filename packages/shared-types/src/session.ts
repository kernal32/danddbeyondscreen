import type { NormalizedCharacter, PartySnapshot } from './character.js';
import type { InitiativeState } from './initiative.js';
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

/** Party members hidden from TV/phone party + initiative (`manualOverrides.hiddenFromTable`); listed for unhide on phone. */
export type HiddenPartyMember = { id: string; name: string };

export interface PublicSessionState {
  sessionId: string;
  /** Bumps when the DM changes the display / phone PIN; clients re-verify when this changes. */
  displayPinRevision: number;
  theme: TableTheme;
  /** What to show on each party character card (DM + display). */
  partyCardDisplay: PartyCardDisplayOptions;
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
  partyCardDisplay: PartyCardDisplayOptions;
  tableLayout: TableLayout;
  seedCharacterId: number | null;
  pollIntervalMs: number;
  party: PartySnapshot;
  initiative: InitiativeState;
  manualOverrides: Record<
    string,
    Partial<Pick<NormalizedCharacter, 'currentHp' | 'tempHp' | 'conditions' | 'absent'>> & {
      /** When true, omit from display party + initiative; excluded from begin-combat rolls. */
      hiddenFromTable?: boolean;
    }
  >;
  diceLog: DiceLogEntry[];
  timedEffects: TimedEffect[];
  npcTemplates: NpcTemplate[];
}
