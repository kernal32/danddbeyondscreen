import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mergePartyCardDisplayOptions } from '@ddb/shared-types/party-card-display';
import { TABLE_THEME_IDS, type TableTheme } from '@ddb/shared-types/themes';
import PlayerCard from '../components/player-card/PlayerCard';
import { MOCK_PLAYER_CARDS } from '../components/player-card/mockPlayerCards';
import ThemedPanel from '../components/ui/ThemedPanel';
import { TableThemeProvider } from '../theme/TableThemeContext';
import { applyRootTableTheme, THEME_LABELS } from '../theme/tableTheme';

export default function PlayerCardDemoPage() {
  const opts = mergePartyCardDisplayOptions(undefined);
  const [theme, setTheme] = useState<TableTheme>('minimal');

  useEffect(() => {
    applyRootTableTheme(theme);
  }, [theme]);

  return (
    <div className="min-h-screen bg-[var(--bg)] p-6 md:p-10">
      <TableThemeProvider theme={theme}>
        <div className="mx-auto max-w-[1600px] space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="font-display text-3xl font-bold text-[var(--accent)] md:text-4xl">Player card samples</h1>
            <Link to="/" className="text-sm text-[var(--link)] underline hover:text-[var(--link-hover)]">
              Home
            </Link>
          </div>
          <p className="max-w-2xl text-[var(--muted)]">
            Internal demo — three mock characters with default display options. Pick a table theme to preview tokens and
            panel frames.
          </p>
          <div className="flex flex-wrap gap-2">
            {TABLE_THEME_IDS.map((t) => (
              <button
                key={t}
                type="button"
                className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                  theme === t
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]'
                    : 'border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[var(--muted)] hover:text-[var(--text)]'
                }`}
                onClick={() => setTheme(t)}
              >
                {THEME_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {MOCK_PLAYER_CARDS.map((data) => (
              <ThemedPanel key={data.name} className="min-w-0" contentClassName="p-6 md:p-8">
                <PlayerCard data={data} displayOptions={opts} large />
              </ThemedPanel>
            ))}
          </div>
        </div>
      </TableThemeProvider>
    </div>
  );
}
