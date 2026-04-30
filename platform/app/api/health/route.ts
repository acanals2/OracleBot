/**
 * GET /api/health  — liveness probe for uptime monitors + Vercel rolling deploys.
 * Doesn't touch the DB so it stays fast and cheap.
 */
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'oracle-bot-platform',
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
    time: new Date().toISOString(),
  });
}
