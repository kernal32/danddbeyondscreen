import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { PublicSessionState } from '@ddb/shared-types/session';
import { useSessionRuntimeStore } from '../stores/sessionRuntimeStore';
import type { SessionUiMode } from '../types/sessionUiMode';

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? '';

export function useSessionSocket(
  sessionId: string | null,
  token: string | null,
  options?: { uiMode?: SessionUiMode },
) {
  const socketRef = useRef<Socket | null>(null);

  const publicSession = useSessionRuntimeStore((s) => s.publicSession);
  const connected = useSessionRuntimeStore((s) => s.connected);
  const setFromFullState = useSessionRuntimeStore((s) => s.setFromFullState);
  const setConnected = useSessionRuntimeStore((s) => s.setConnected);
  const resetSession = useSessionRuntimeStore((s) => s.resetSession);
  const setUiMode = useSessionRuntimeStore((s) => s.setUiMode);

  useEffect(() => {
    if (options?.uiMode) setUiMode(options.uiMode);
  }, [options?.uiMode, setUiMode]);

  useEffect(() => {
    if (!sessionId || !token) {
      /* Do not resetSession() here: TableScreen / InitiativeRemotePage hydrate the store from
       * REST before sessionId is derived; clearing here races effects and can wipe bootstrap data.
       * Route entry (useLayoutEffect) and socket cleanup still reset when leaving a session. */
      return;
    }

    const s = io(socketUrl || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = s;
    const subscribe = () => s.emit('session:subscribe', { sessionId, token });
    s.on('connect', () => {
      setConnected(true);
      subscribe();
    });
    s.on('disconnect', () => setConnected(false));
    s.on('state:full', (payload: PublicSessionState) => setFromFullState(payload));
    s.on('error', (e: { message?: string }) => console.error('socket error', e));
    if (s.connected) subscribe();

    return () => {
      s.disconnect();
      socketRef.current = null;
      setConnected(false);
      resetSession();
    };
  }, [sessionId, token, setFromFullState, setConnected, resetSession]);

  const emit = useCallback(<K extends string>(event: K, payload?: unknown) => {
    socketRef.current?.emit(event, payload);
  }, []);

  return { state: publicSession, connected, emit, socket: socketRef.current };
}
