import { useEffect, useState } from 'react';
import type { RollMode } from '@ddb/shared-types';

type InitiativeDualRollRevealProps = {
  rolls: [number, number];
  kept: number;
  rollMode: RollMode;
  large?: boolean;
  /** Change when the server sends a new roll so the reveal can replay. */
  animKey: string;
};

export default function InitiativeDualRollReveal({
  rolls,
  kept,
  rollMode,
  large,
  animKey,
}: InitiativeDualRollRevealProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const [a, b] = rolls;
  const adv = rollMode === 'advantage';
  const dis = rollMode === 'disadvantage';
  const keptStrong =
    adv ? 'border-emerald-400/80 bg-emerald-500/15 text-emerald-100 shadow-[0_0_12px_rgba(52,211,153,0.35)]'
    : dis
      ? 'border-rose-400/75 bg-rose-500/15 text-rose-100 shadow-[0_0_12px_rgba(251,113,133,0.3)]'
      : 'border-white/35 bg-white/10 text-[var(--text)]';

  const droppedWeak = 'border-white/15 bg-black/25 text-[var(--muted)]';

  const pill = `rounded-lg border font-mono font-bold tabular-nums ${
    large ? 'px-2.5 py-1 text-base md:text-lg min-w-[2.5rem] text-center' : 'px-2 py-0.5 text-sm min-w-[2rem] text-center'
  }`;

  const caption =
    adv ? 'Kept higher' : dis ? 'Kept lower' : null;

  return (
    <div key={animKey} className={`mt-1.5 flex flex-wrap items-center gap-2 ${large ? 'mt-2 gap-2.5' : ''}`}>
      <div className="flex items-center gap-1.5" aria-hidden={caption == null}>
        {[a, b].map((v, i) => {
          const isKept = v === kept;
          const animatePop = !reduceMotion && isKept;
          const animateDim = !reduceMotion && !isKept;
          return (
            <span
              key={`${i}-${v}`}
              className={`${pill} ${isKept ? keptStrong : droppedWeak} ${
                animatePop ? 'motion-safe:animate-init-die-pop' : ''
              } ${animateDim ? 'motion-safe:animate-init-die-dim' : ''}`}
            >
              {v}
            </span>
          );
        })}
      </div>
      {caption ? (
        <span className={`text-[var(--muted)] ${large ? 'text-xs md:text-sm' : 'text-[10px]'}`}>{caption}</span>
      ) : null}
    </div>
  );
}
