'use client';

import { useEffect, useState } from 'react';

// AC-006-002-02: elapsed time is derived from an authoritative start boundary and the
// current time, ticking client-side — never a per-second server write.
export function useElapsedSeconds(startAt: string | null | undefined): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!startAt) {
      setSeconds(0);
      return;
    }
    const start = new Date(startAt).getTime();
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startAt]);

  return seconds;
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
