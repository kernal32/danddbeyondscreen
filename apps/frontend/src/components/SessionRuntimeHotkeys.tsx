import { useEffect } from 'react';
import { useSessionRuntimeStore } from '../stores/sessionRuntimeStore';

/** Global: Ctrl+Shift+D toggles layout debug overlay (persisted in sessionStorage). */
export default function SessionRuntimeHotkeys() {
  const toggleDebugLayout = useSessionRuntimeStore((s) => s.toggleDebugLayout);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        toggleDebugLayout();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleDebugLayout]);

  return null;
}
