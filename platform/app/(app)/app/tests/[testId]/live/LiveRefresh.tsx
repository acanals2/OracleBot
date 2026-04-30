'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Polls the server every 5s by re-running the page (router.refresh()) so
 * dashboard stays current while a run is live. Cheap and good enough for
 * V1 — swap to SSE or WebSockets when run velocity demands it.
 */
export function LiveRefresh({ runId }: { runId: string }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  return null;
}
