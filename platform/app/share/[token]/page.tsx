/**
 * Public share router. Resolves the token, then redirects to the
 * appropriate spectator view based on run status.
 *   - non-terminal status → /share/[token]/live
 *   - terminal status     → /share/[token]/results
 */
import { notFound, redirect } from 'next/navigation';
import { getRunByShareToken } from '@/lib/runs';

const TERMINAL = new Set(['completed', 'failed', 'canceled', 'timed_out']);

type Params = Promise<{ token: string }>;

export default async function SharePage({ params }: { params: Params }) {
  const { token } = await params;
  const run = await getRunByShareToken(token);
  if (!run) notFound();
  redirect(TERMINAL.has(run.status) ? `/share/${token}/results` : `/share/${token}/live`);
}
