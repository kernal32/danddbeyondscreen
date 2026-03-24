import type { Server } from 'socket.io';
import { mergePartyOverrides, type SessionService } from '../services/session.service.js';
import type { CharacterService } from '../services/character.service.js';
import type { AppConfig } from '../config.js';
import { effectiveDdbCookie } from '../services/ddb-session-cookie.js';
import * as Initiative from '../services/initiative.service.js';
import { randomUUID } from 'node:crypto';
import { parseTableLayoutPayload } from '../util/table-layout.js';
import {
  assertValidThemePalette,
  isInitiativeCombatTag,
  isTableTheme,
  parsePartyCardDisplayPayload,
  type HiddenInitiativeSnapshot,
  type InitiativeEntry,
} from '@ddb/shared-types';

function entryToHiddenSnapshot(e: InitiativeEntry): HiddenInitiativeSnapshot {
  const out: HiddenInitiativeSnapshot = {
    initiativeTotal: e.initiativeTotal,
    mod: e.mod,
    rollMode: e.rollMode,
  };
  if (e.dexMod != null && Number.isFinite(e.dexMod)) {
    out.dexMod = e.dexMod;
  }
  if (e.rollBreakdown) {
    out.rollBreakdown = {
      rolls: [...e.rollBreakdown.rolls],
      kept: e.rollBreakdown.kept,
      mod: e.rollBreakdown.mod,
    };
  }
  if (e.combatTags?.length) {
    out.combatTags = [...e.combatTags];
  }
  return out;
}

export function attachSocketHandlers(
  io: Server,
  deps: {
    sessions: SessionService;
    characters: CharacterService;
    config: AppConfig;
    broadcast: (sessionId: string) => void;
  },
) {
  const { sessions, characters, config, broadcast } = deps;

  io.on('connection', (socket) => {
    socket.data.role = null as 'dm' | 'display' | null;
    socket.data.sessionId = null as string | null;

    socket.on('session:subscribe', (payload: { sessionId: string; token: string }) => {
      const s = sessions.get(payload.sessionId);
      if (!s) {
        socket.emit('error', { message: 'Unknown session' });
        return;
      }
      if (sessions.isDmToken(s, payload.token)) {
        socket.data.role = 'dm';
      } else if (sessions.isDisplayToken(s, payload.token)) {
        socket.data.role = 'display';
      } else {
        socket.emit('error', { message: 'Invalid token' });
        return;
      }
      socket.data.sessionId = payload.sessionId;
      void socket.join(`session:${payload.sessionId}`);
      const role = socket.data.role as 'dm' | 'display';
      socket.emit('state:full', sessions.toPublic(s, role));
    });

    const dmOnly = (fn: () => void) => {
      if (socket.data.role !== 'dm' || !socket.data.sessionId) {
        socket.emit('error', { message: 'DM only' });
        return;
      }
      fn();
    };

    const displayOrDm = (fn: () => void) => {
      const role = socket.data.role;
      if ((role !== 'dm' && role !== 'display') || !socket.data.sessionId) {
        socket.emit('error', { message: 'DM or display only' });
        return;
      }
      fn();
    };

    socket.on('initiative:next', () => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.nextTurn(s.initiative);
          s.timedEffects = Initiative.tickTimedEffects(s.timedEffects);
        });
        broadcast(sid);
      });
    });

    socket.on('initiative:prev', () => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.prevTurn(s.initiative);
        });
        broadcast(sid);
      });
    });

    socket.on('initiative:nextRound', () => {
      displayOrDm(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.advanceRoundAndRerollInitiative(s.initiative);
        });
        broadcast(sid);
      });
    });

    socket.on('initiative:prevRound', () => {
      displayOrDm(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.decrementRoundOnly(s.initiative);
        });
        broadcast(sid);
      });
    });

    socket.on('initiative:roll', (payload: { entryId?: string; rollMode?: 'normal' | 'advantage' | 'disadvantage'; mod?: number }) => {
      displayOrDm(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.rollInitiative(s.initiative, payload.entryId, payload.rollMode, payload.mod);
        });
        broadcast(sid);
      });
    });

    socket.on('initiative:sort', () => {
      displayOrDm(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.sortInitiative(s.initiative);
        });
        broadcast(sid);
      });
    });

    socket.on('initiative:setTotal', (payload: { entryId: string; total: number }) => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.setInitiativeTotal(s.initiative, payload.entryId, payload.total);
        });
        broadcast(sid);
      });
    });

    socket.on(
      'initiative:add',
      (payload: {
        label?: string;
        entityId?: string;
        mod?: number;
        groupId?: string;
        avatarUrl?: string;
        rollAndSort?: boolean;
      }) => {
        displayOrDm(() => {
          const label = typeof payload?.label === 'string' ? payload.label.trim() : '';
          if (!label) return;
          const sid = socket.data.sessionId as string;
          sessions.update(sid, (s) => {
            const beforeOrder = [...s.initiative.turnOrder];
            s.initiative = Initiative.addCombatant(s.initiative, {
              label,
              entityId: payload.entityId,
              mod: payload.mod,
              groupId: payload.groupId,
              avatarUrl: payload.avatarUrl,
            });
            const newEntryId = s.initiative.turnOrder.find((id) => !beforeOrder.includes(id));
            if (payload.rollAndSort && newEntryId) {
              s.initiative = Initiative.rollInitiative(s.initiative, newEntryId);
              s.initiative = Initiative.sortInitiative(s.initiative);
            }
          });
          broadcast(sid);
        });
      },
    );

    socket.on('initiative:remove', (payload: { entryId: string }) => {
      displayOrDm(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.removeCombatant(s.initiative, payload.entryId);
        });
        broadcast(sid);
      });
    });

    socket.on('initiative:toggleLock', (payload: { entryId: string }) => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.toggleLock(s.initiative, payload.entryId);
        });
        broadcast(sid);
      });
    });

    socket.on(
      'initiative:setCombatTags',
      (payload: { entryId?: string; combatTags?: unknown }) => {
        displayOrDm(() => {
          const sid = socket.data.sessionId as string;
          const entryId = typeof payload?.entryId === 'string' ? payload.entryId : '';
          const raw = payload?.combatTags;
          const combatTags = Array.isArray(raw) ? raw.filter(isInitiativeCombatTag) : [];
          if (!entryId) return;
          sessions.update(sid, (s) => {
            s.initiative = Initiative.setEntryCombatTags(s.initiative, entryId, combatTags);
          });
          broadcast(sid);
        });
      },
    );

    socket.on('initiative:delay', () => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.delayCurrent(s.initiative);
        });
        broadcast(sid);
      });
    });

    socket.on('initiative:clear', () => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.clearInitiative(s.initiative);
        });
        broadcast(sid);
      });
    });

    socket.on('initiative:markEntry', (payload: { entryId?: string | null }) => {
      displayOrDm(() => {
        const sid = socket.data.sessionId as string;
        const raw = payload?.entryId;
        const entryId = typeof raw === 'string' ? raw : null;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.setMarkedEntry(s.initiative, entryId);
        });
        broadcast(sid);
      });
    });

    socket.on('initiative:startCombat', () => {
      displayOrDm(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          const merged = mergePartyOverrides(s.party, s.manualOverrides);
          const hiddenIds = new Set(
            Object.entries(s.manualOverrides)
              .filter(([, v]) => v.hiddenFromTable === true)
              .map(([id]) => id),
          );
          let next = Initiative.startCombatFromParty(s.initiative, merged.characters, {
            skipCharacterIds: hiddenIds,
          });
          next = Initiative.rollInitiative(next);
          next = Initiative.sortInitiative(next);
          s.initiative = { ...next, currentTurnIndex: 0, markedEntryId: null };
        });
        broadcast(sid);
      });
    });

    socket.on('initiative:rerollAll', () => {
      displayOrDm(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.initiative = Initiative.rerollAllInitiative(s.initiative);
        });
        broadcast(sid);
      });
    });

    socket.on('party:refresh', () => {
      dmOnly(async () => {
        const sid = socket.data.sessionId as string;
        const s = sessions.get(sid);
        if (!s?.seedCharacterId) {
          socket.emit('ddb:warning', { message: 'No seed character set' });
          return;
        }
        sessions.appendLog(s, 'Refreshing party from D&D Beyond…', true, config.diceLogMax);
        const party = await characters.loadParty(s.seedCharacterId, true, effectiveDdbCookie(config));
        sessions.setParty(s, party);
        if (party.error) {
          socket.emit('ddb:warning', { message: party.error });
          sessions.appendLog(s, `D&D Beyond: ${party.error}`, true, config.diceLogMax);
        } else {
          sessions.appendLog(s, 'Party refresh complete.', true, config.diceLogMax);
        }
        broadcast(sid);
      });
    });

    socket.on('party:manualHp', (payload: { characterId: string; currentHp?: number; tempHp?: number }) => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          sessions.setManualOverride(s, payload.characterId, {
            currentHp: payload.currentHp,
            tempHp: payload.tempHp,
          });
        });
        broadcast(sid);
      });
    });

    socket.on('party:setConditions', (payload: { characterId: string; conditions: string[] }) => {
      displayOrDm(() => {
        if (typeof payload?.characterId !== 'string' || !Array.isArray(payload.conditions)) return;
        const sid = socket.data.sessionId as string;
        const rid = String(payload.characterId);
        const cur = sessions.get(sid);
        if (!cur?.party.characters.some((c) => String(c.id) === rid)) {
          socket.emit('error', { message: 'Character not in party' });
          return;
        }
        sessions.update(sid, (s) => {
          sessions.setManualOverride(s, rid, { conditions: payload.conditions });
        });
        broadcast(sid);
      });
    });

    socket.on('party:setAbsent', (payload: { characterId?: string; absent?: boolean }) => {
      dmOnly(() => {
        if (typeof payload?.characterId !== 'string' || typeof payload.absent !== 'boolean') return;
        const characterId = payload.characterId;
        const absent = payload.absent;
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          sessions.setManualOverride(s, characterId, { absent });
          if (absent) {
            s.initiative = Initiative.removeByEntityId(s.initiative, characterId);
          }
        });
        broadcast(sid);
      });
    });

    socket.on('party:setInspired', (payload: { characterId?: string; inspired?: boolean }) => {
      displayOrDm(() => {
        if (typeof payload?.characterId !== 'string' || typeof payload.inspired !== 'boolean') return;
        const characterId = String(payload.characterId);
        const sid = socket.data.sessionId as string;
        const cur = sessions.get(sid);
        if (!cur?.party.characters.some((c) => String(c.id) === characterId)) {
          socket.emit('error', { message: 'Character not in party' });
          return;
        }
        sessions.update(sid, (s) => {
          sessions.setManualOverride(s, characterId, { inspired: payload.inspired });
        });
        broadcast(sid);
      });
    });

    socket.on(
      'party:setHiddenFromTable',
      (payload: { characterId?: string; hidden?: boolean; unhideMode?: 'reroll' | 'saved' }) => {
        displayOrDm(() => {
          if (typeof payload?.characterId !== 'string' || typeof payload.hidden !== 'boolean') return;
          const characterId = payload.characterId;
          const rid = String(characterId);
          const hidden = payload.hidden;
          const sid = socket.data.sessionId as string;
          const cur = sessions.get(sid);
          if (!cur?.party.characters.some((c) => String(c.id) === rid)) {
            socket.emit('error', { message: 'Character not in party' });
            return;
          }
          sessions.update(sid, (s) => {
            if (hidden) {
              const entry = Initiative.findEntryByEntityId(s.initiative, rid);
              sessions.setManualOverride(s, rid, {
                hiddenFromTable: true,
                hiddenInitiativeSnapshot: entry ? entryToHiddenSnapshot(entry) : null,
              });
              s.initiative = Initiative.removeByEntityId(s.initiative, rid);
              s.timedEffects = s.timedEffects.filter((e) => String(e.entityId) !== rid);
              return;
            }

            const snap =
              s.manualOverrides[rid]?.hiddenInitiativeSnapshot ??
              s.manualOverrides[characterId]?.hiddenInitiativeSnapshot;
            const wantSaved = payload.unhideMode === 'saved' && !!snap;
            sessions.setManualOverride(s, rid, { hiddenFromTable: false, hiddenInitiativeSnapshot: null });

            if (Initiative.findEntryByEntityId(s.initiative, rid)) {
              return;
            }

            const merged = mergePartyOverrides(s.party, s.manualOverrides);
            const c = merged.characters.find((x) => String(x.id) === rid);
            if (!c || c.absent) return;

            const modFromSheet =
              typeof c.initiativeBonus === 'number' && Number.isFinite(c.initiativeBonus)
                ? c.initiativeBonus
                : 0;
            const dexFromChar =
              typeof c.dexterityModifier === 'number' && Number.isFinite(c.dexterityModifier)
                ? c.dexterityModifier
                : undefined;

            if (wantSaved && snap) {
              const dexFromSnap =
                snap.dexMod != null && Number.isFinite(snap.dexMod) ? snap.dexMod : dexFromChar;
              s.initiative = Initiative.addCombatant(s.initiative, {
                label: c.name,
                entityId: String(c.id),
                mod: snap.mod,
                avatarUrl: c.avatarUrl || undefined,
                conditions: c.conditions.length ? [...c.conditions] : undefined,
                initiativeTotal: snap.initiativeTotal,
                rollMode: snap.rollMode,
                rollBreakdown: snap.rollBreakdown,
                combatTags: snap.combatTags,
                ...(dexFromSnap !== undefined ? { dexMod: dexFromSnap } : {}),
              });
            } else {
              const lenBefore = s.initiative.turnOrder.length;
              s.initiative = Initiative.addCombatant(s.initiative, {
                label: c.name,
                entityId: String(c.id),
                mod: modFromSheet,
                ...(dexFromChar !== undefined ? { dexMod: dexFromChar } : {}),
                avatarUrl: c.avatarUrl || undefined,
                conditions: c.conditions.length ? [...c.conditions] : undefined,
              });
              const newEntryId =
                s.initiative.turnOrder.length > lenBefore
                  ? s.initiative.turnOrder[s.initiative.turnOrder.length - 1]
                  : undefined;
              if (newEntryId) {
                s.initiative = Initiative.rollInitiative(s.initiative, newEntryId);
              }
            }
            s.initiative = Initiative.sortInitiative(s.initiative);
          });
          broadcast(sid);
        });
      },
    );

    socket.on('party:removeCharacter', (payload: { characterId?: string }) => {
      displayOrDm(() => {
        if (typeof payload?.characterId !== 'string') return;
        const characterId = payload.characterId;
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          const rid = String(characterId);
          s.party = {
            ...s.party,
            characters: s.party.characters.filter((c) => String(c.id) !== rid),
          };
          delete s.manualOverrides[characterId];
          delete s.manualOverrides[rid];
          s.initiative = Initiative.removeByEntityId(s.initiative, characterId);
          s.timedEffects = s.timedEffects.filter((e) => e.entityId !== characterId);
        });
        broadcast(sid);
      });
    });

    socket.on('session:setPartyCardDisplay', (payload: { partyCardDisplay?: unknown }) => {
      dmOnly(() => {
        const parsed = parsePartyCardDisplayPayload(payload?.partyCardDisplay);
        if (!parsed) {
          socket.emit('error', { message: 'Invalid partyCardDisplay' });
          return;
        }
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => sessions.setPartyCardDisplay(s, parsed));
        broadcast(sid);
      });
    });

    socket.on('session:setTheme', (payload: { theme?: unknown; themePalette?: unknown }) => {
      dmOnly(() => {
        const theme = payload?.theme;
        if (!isTableTheme(theme)) {
          socket.emit('error', { message: 'Invalid theme' });
          return;
        }
        let pal: string[] | null = null;
        if (payload.themePalette !== undefined) {
          try {
            pal = assertValidThemePalette(payload.themePalette);
          } catch {
            socket.emit('error', { message: 'Invalid themePalette' });
            return;
          }
        }
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          sessions.setTheme(s, theme);
          if (payload.themePalette !== undefined) {
            sessions.setThemePalette(s, pal);
          } else {
            sessions.setThemePalette(s, null);
          }
        });
        broadcast(sid);
      });
    });

    socket.on('session:setTableLayout', (payload: { tableLayout?: unknown }) => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        const parsed = parseTableLayoutPayload(payload?.tableLayout);
        if (!parsed) {
          socket.emit('error', { message: 'Invalid tableLayout' });
          return;
        }
        sessions.update(sid, (s) => sessions.setTableLayout(s, parsed));
        broadcast(sid);
      });
    });

    socket.on('session:setSeed', (payload: { seedCharacterId: number }) => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => sessions.setSeed(s, payload.seedCharacterId));
        broadcast(sid);
      });
    });

    socket.on('effects:add', (payload: { id?: string; label: string; roundsRemaining: number; entityId: string }) => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          sessions.addTimedEffect(s, {
            id: payload.id ?? randomUUID(),
            label: payload.label,
            roundsRemaining: payload.roundsRemaining,
            entityId: payload.entityId,
          });
        });
        broadcast(sid);
      });
    });

    socket.on('effects:tick', () => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          s.timedEffects = Initiative.tickTimedEffects(s.timedEffects);
        });
        broadcast(sid);
      });
    });

    socket.on('effects:remove', (payload: { id: string }) => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => sessions.removeTimedEffect(s, payload.id));
        broadcast(sid);
      });
    });

    socket.on('log:append', (payload: { message: string; dmOnly?: boolean }) => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        const s = sessions.get(sid);
        if (s) sessions.appendLog(s, payload.message, payload.dmOnly ?? false, config.diceLogMax);
        broadcast(sid);
      });
    });

    socket.on('npc:addTemplate', (payload: { id: string; name: string; defaultAc: number; defaultMaxHp: number }) => {
      dmOnly(() => {
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => sessions.addNpcTemplate(s, payload));
        broadcast(sid);
      });
    });

    socket.on('npc:spawnFromTemplate', (payload: { templateId?: string }) => {
      displayOrDm(() => {
        const tid = typeof payload?.templateId === 'string' ? payload.templateId : '';
        if (!tid) return;
        const sid = socket.data.sessionId as string;
        sessions.update(sid, (s) => {
          const t = s.npcTemplates.find((x) => x.id === tid);
          if (!t) return;
          const entityId = `npc-${randomUUID()}`;
          s.initiative = Initiative.addCombatant(s.initiative, {
            label: t.name,
            entityId,
            mod: 0,
          });
        });
        broadcast(sid);
      });
    });
  });
}

export async function broadcastSessionState(io: Server, sessions: SessionService, sessionId: string) {
  const s = sessions.get(sessionId);
  if (!s) return;
  const room = `session:${sessionId}`;
  const sockets = await io.in(room).fetchSockets();
  for (const sock of sockets) {
    const role = sock.data.role as 'dm' | 'display' | null;
    if (!role) continue;
    sock.emit('state:full', sessions.toPublic(s, role));
  }
}
