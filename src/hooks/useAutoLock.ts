import { useEffect, useRef, useCallback } from 'react';
import { getAutoLockMinutes } from '../lib/autoLock';

export function useAutoLock(onLock: () => void, enabled: boolean) {
  const lastActivity = useRef(Date.now());
  const onLockRef = useRef(onLock);
  onLockRef.current = onLock;

  const touchActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    const handler = () => { lastActivity.current = Date.now(); };
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));

    const interval = setInterval(async () => {
      const minutes = await getAutoLockMinutes();
      const idleMs = minutes * 60 * 1000;
      if (Date.now() - lastActivity.current >= idleMs) {
        onLockRef.current();
      }
    }, 30_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      clearInterval(interval);
    };
  }, [enabled]);

  return { touchActivity };
}
