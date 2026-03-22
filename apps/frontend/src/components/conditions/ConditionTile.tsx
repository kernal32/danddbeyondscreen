import type { ConditionIconKind } from '../../util/conditionDisplay';
import { CONDITION_VARIANT_RING, getConditionPresentation } from '../../util/conditionDisplay';

function ConditionGlyph({ kind, className }: { kind: ConditionIconKind; className?: string }) {
  const c = className ?? 'h-4 w-4 shrink-0 opacity-90';
  switch (kind) {
    case 'skull':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="10" r="6" strokeLinecap="round" />
          <path d="M9 16v2M12 16v2M15 16v2" strokeLinecap="round" />
          <path d="M9.5 9h.01M14.5 9h.01" strokeLinecap="round" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 3v2M9 19v2M3 9h2M19 9h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'eye':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'flame':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path
            d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.5-1-2-1-3.5 0-1.5 1-2.5 2-3.5.5 2 2 3.5 2 5a5 5 0 1 1-10 0c0-2 .5-3 1.5-4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'snow':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 2v20M8 6l8 12M16 6L8 18M6 12h12" strokeLinecap="round" />
        </svg>
      );
    case 'bolt':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" strokeLinejoin="round" />
        </svg>
      );
    case 'drop':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 2.7c-3 4-6 7.5-6 11a6 6 0 1 0 12 0c0-3.5-3-7-6-11z" strokeLinejoin="round" />
        </svg>
      );
    case 'shield':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 3l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V7l7-4z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'swords':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M9 8l4 4M5 21l4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'moon':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" strokeLinecap="round" />
        </svg>
      );
    case 'sun':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
        </svg>
      );
    case 'heart':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'anchor':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v14M5 12H2a10 10 0 0 0 20 0h-3" strokeLinecap="round" />
        </svg>
      );
    case 'star':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6L12 2z" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 9h8M8 13h5" strokeLinecap="round" />
        </svg>
      );
  }
}

export type ConditionTileSize = 'compact' | 'cozy' | 'tv';

const sizeClasses: Record<
  ConditionTileSize,
  { wrap: string; title: string; sub: string; icon: string }
> = {
  compact: {
    wrap: 'px-2 py-1.5 gap-1.5 min-w-0 max-w-[9rem]',
    title: 'text-xs font-semibold leading-tight line-clamp-2',
    sub: 'text-[10px] leading-tight text-current/70 line-clamp-2',
    icon: 'h-3.5 w-3.5',
  },
  cozy: {
    wrap: 'px-2.5 py-2 gap-2 min-w-0 max-w-[11rem]',
    title: 'text-sm font-semibold leading-tight line-clamp-2',
    sub: 'text-[11px] leading-tight text-current/75 line-clamp-2',
    icon: 'h-4 w-4',
  },
  tv: {
    wrap: 'px-3 py-2.5 gap-2.5 min-w-0 max-w-[14rem] md:max-w-[16rem]',
    title: 'text-sm md:text-base font-semibold leading-tight line-clamp-2',
    sub: 'text-xs md:text-sm leading-tight text-current/75 line-clamp-2',
    icon: 'h-5 w-5 md:h-6 md:w-6',
  },
};

export default function ConditionTile({ raw, size = 'cozy' }: { raw: unknown; size?: ConditionTileSize }) {
  const { title, subtitle, variant, icon } = getConditionPresentation(raw);
  const ring = CONDITION_VARIANT_RING[variant];
  const sc = sizeClasses[size];
  return (
    <li
      className={`flex items-start rounded-xl border shadow-sm ${ring} ${sc.wrap}`}
      title={subtitle ? `${title} — ${subtitle}` : title}
    >
      <ConditionGlyph kind={icon} className={`${sc.icon} shrink-0 mt-0.5`} />
      <div className="min-w-0 text-left">
        <div className={sc.title}>{title}</div>
        {subtitle ? <div className={`${sc.sub} mt-0.5`}>{subtitle}</div> : null}
      </div>
    </li>
  );
}
