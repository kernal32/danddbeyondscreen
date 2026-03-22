import { formatConditionLabel } from './formatConditionLabel';

export type ConditionVisualVariant =
  | 'rose'
  | 'amber'
  | 'violet'
  | 'sky'
  | 'emerald'
  | 'orange'
  | 'slate'
  | 'cyan';

export type ConditionIconKind =
  | 'skull'
  | 'sparkles'
  | 'eye'
  | 'flame'
  | 'snow'
  | 'bolt'
  | 'drop'
  | 'shield'
  | 'swords'
  | 'moon'
  | 'sun'
  | 'heart'
  | 'anchor'
  | 'star'
  | 'default';

type Row = {
  keys: string[];
  icon: ConditionIconKind;
  variant: ConditionVisualVariant;
  subtitle?: string;
};

/** Curated SRD-style names (substring match after normalize). Order = first match wins. */
const ROWS: Row[] = [
  { keys: ['poisoned', 'poison'], icon: 'skull', variant: 'rose', subtitle: 'See PHB' },
  { keys: ['blessed', 'bless'], icon: 'sparkles', variant: 'violet', subtitle: 'd4 to saves & attacks' },
  { keys: ['cursed'], icon: 'moon', variant: 'violet' },
  { keys: ['charmed'], icon: 'heart', variant: 'rose' },
  { keys: ['frightened', 'fear'], icon: 'eye', variant: 'orange' },
  { keys: ['stunned', 'stun'], icon: 'bolt', variant: 'sky' },
  { keys: ['paralyzed', 'paralyse'], icon: 'anchor', variant: 'sky' },
  { keys: ['prone'], icon: 'swords', variant: 'amber' },
  { keys: ['restrained', 'restrain'], icon: 'anchor', variant: 'amber' },
  { keys: ['grappled', 'grapple'], icon: 'anchor', variant: 'amber' },
  { keys: ['invisible', 'invisibility'], icon: 'eye', variant: 'cyan' },
  { keys: ['incapacitated'], icon: 'skull', variant: 'slate' },
  { keys: ['exhaustion', 'exhausted'], icon: 'flame', variant: 'orange' },
  { keys: ['deafened', 'deaf'], icon: 'bolt', variant: 'slate' },
  { keys: ['blinded', 'blind'], icon: 'eye', variant: 'slate' },
  { keys: ['petrified'], icon: 'anchor', variant: 'slate' },
  { keys: ['unconscious'], icon: 'skull', variant: 'rose' },
  { keys: ['hidden', 'hiding'], icon: 'eye', variant: 'cyan' },
  { keys: ['slowed', 'slow'], icon: 'snow', variant: 'sky' },
  { keys: ['hasted', 'haste'], icon: 'bolt', variant: 'emerald' },
  { keys: ['raging', 'rage'], icon: 'flame', variant: 'rose' },
  { keys: ['concentrating', 'concentration'], icon: 'star', variant: 'violet' },
  { keys: ['sanctuary'], icon: 'shield', variant: 'sky' },
  { keys: ['hex'], icon: 'skull', variant: 'violet' },
  { keys: ['hunters mark', "hunter's mark"], icon: 'eye', variant: 'amber' },
  { keys: ['faerie fire'], icon: 'sparkles', variant: 'violet' },
  { keys: ['web'], icon: 'anchor', variant: 'slate' },
  { keys: ['difficult terrain'], icon: 'swords', variant: 'slate' },
];

function normalizeForMatch(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

export function getConditionPresentation(raw: unknown): {
  title: string;
  subtitle?: string;
  variant: ConditionVisualVariant;
  icon: ConditionIconKind;
} {
  const title = formatConditionLabel(raw).trim() || 'Condition';
  const norm = normalizeForMatch(title);
  if (!norm) {
    return { title, variant: 'slate', icon: 'default' };
  }
  for (const row of ROWS) {
    for (const k of row.keys) {
      if (norm.includes(k) || norm.split(/\s+/).some((w) => w === k)) {
        return {
          title,
          subtitle: row.subtitle,
          variant: row.variant,
          icon: row.icon,
        };
      }
    }
  }
  return { title, variant: 'slate', icon: 'default' };
}

export const CONDITION_VARIANT_RING: Record<ConditionVisualVariant, string> = {
  rose: 'border-rose-400/45 bg-rose-950/30 text-rose-100',
  amber: 'border-amber-400/45 bg-amber-950/25 text-amber-100',
  violet: 'border-violet-400/45 bg-violet-950/30 text-violet-100',
  sky: 'border-sky-400/45 bg-sky-950/30 text-sky-100',
  emerald: 'border-emerald-400/45 bg-emerald-950/30 text-emerald-100',
  orange: 'border-orange-400/45 bg-orange-950/25 text-orange-100',
  slate: 'border-white/20 bg-black/30 text-[var(--text)]',
  cyan: 'border-cyan-400/45 bg-cyan-950/25 text-cyan-100',
};
