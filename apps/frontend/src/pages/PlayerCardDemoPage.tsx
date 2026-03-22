import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { mergePartyCardDisplayOptions } from '@ddb/shared-types';
import PlayerCard from '../components/player-card/PlayerCard';
import { MOCK_PLAYER_CARDS } from '../components/player-card/mockPlayerCards';
import { applyRootTableTheme } from '../theme/tableTheme';

export default function PlayerCardDemoPage() {
  const opts = mergePartyCardDisplayOptions(undefined);

  useEffect(() => {
    applyRootTableTheme('minimal');
  }, []);

  return (
    <div className="theme-minimal min-h-screen p-6 md:p-10 bg-[var(--bg)]">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-[var(--accent)]">Player card samples</h1>
          <Link to="/" className="text-[var(--accent)] underline text-sm">
            Home
          </Link>
        </div>
        <p className="text-[var(--muted)] max-w-2xl">
          Internal demo — three mock characters with default display options. DM Settings has the full toggle + reorder panel.
        </p>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {MOCK_PLAYER_CARDS.map((data) => (
            <article
              key={data.name}
              className="rounded-xl border border-white/10 bg-[var(--surface)] p-6 md:p-8 shadow-lg"
            >
              <PlayerCard data={data} displayOptions={opts} large />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
