import { useState, type FormEvent } from 'react';
import { ApiHttpError } from '../api';

type DisplayPinOverlayProps = {
  title: string;
  description?: string;
  onSubmit: (pin: string) => Promise<void>;
};

export default function DisplayPinOverlay({ title, description, onSubmit }: DisplayPinOverlayProps) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const digits = pin.replace(/\D/g, '').slice(-4);
    if (digits.length !== 4) {
      setErr('Enter the 4-digit code from the DM Settings.');
      return;
    }
    setLoading(true);
    try {
      await onSubmit(digits);
      setPin('');
    } catch (ex) {
      setErr(ex instanceof ApiHttpError ? ex.message : 'Could not verify. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="display-pin-title"
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-[var(--surface)] p-6 shadow-xl"
      >
        <h2 id="display-pin-title" className="font-display text-xl font-bold text-[var(--accent)]">
          {title}
        </h2>
        {description ? <p className="mt-2 text-sm text-[var(--muted)]">{description}</p> : null}
        <label className="mt-4 block text-sm text-[var(--muted)]" htmlFor="display-pin-input">
          4-digit code
        </label>
        <input
          id="display-pin-input"
          className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-3 text-center font-mono text-2xl tracking-[0.35em] text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          disabled={loading}
          aria-invalid={err != null}
        />
        {err ? (
          <p className="mt-2 text-sm text-amber-300" role="alert">
            {err}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-violet-700 py-3 font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          {loading ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
