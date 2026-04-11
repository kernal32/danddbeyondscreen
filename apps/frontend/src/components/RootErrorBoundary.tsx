import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

/**
 * Catches render errors so a failed widget does not leave a blank document with no UI feedback.
 */
export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('RootErrorBoundary', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="theme-dark-arcane min-h-dvh flex flex-col items-center justify-center gap-4 bg-[#0f0f12] px-6 py-12 text-center text-[#e8e6e3]">
        <h1 className="font-display text-xl font-semibold text-amber-200">Something went wrong</h1>
        <p className="max-w-lg text-sm text-[#b8b5b0]">
          The UI hit an error while rendering. Try a hard refresh. If you use Tampermonkey or other extensions on this site,
          try disabling them for this domain.
        </p>
        <p className="max-w-xl break-all rounded border border-white/15 bg-black/40 px-3 py-2 font-mono text-xs text-amber-100/90">
          {this.state.message}
        </p>
        <Link
          to="/"
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          Go to Home
        </Link>
      </div>
    );
  }
}
