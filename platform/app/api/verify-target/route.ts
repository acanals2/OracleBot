/**
 * Domain verification API.
 *
 *   GET  /api/verify-target?domain=<host>   — read status (used by wizard)
 *   POST /api/verify-target                  — create / refresh challenge
 *                                              body: { domain, method }
 *   GET  /api/verify-target?list=1           — list all org verifications
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import {
  createChallenge,
  dnsTxtRecordValue,
  getVerificationStatus,
  isCarveOut,
  listVerificationsForOrg,
  normalizeDomain,
  wellKnownUrl,
} from '@/lib/target-verification';
import { logger, newTraceId } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  domain: z.string().trim().min(1),
  method: z.enum(['dns_txt', 'well_known_file']),
});

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);

    if (searchParams.get('list') === '1') {
      const rows = await listVerificationsForOrg(session.org.id);
      return ok({ verifications: rows });
    }

    const domainInput = searchParams.get('domain');
    if (!domainInput) {
      return ok({ verifications: await listVerificationsForOrg(session.org.id) });
    }

    const status = await getVerificationStatus(session.org.id, domainInput);
    return ok({
      domain: status.domain,
      state: status.state,
      verification: status.verification,
      isCarveOut: isCarveOut(status.domain),
      instructions:
        status.verification && status.state !== 'verified'
          ? buildInstructions(status.verification.method, status.domain, status.verification.challengeToken)
          : null,
    });
  } catch (e) {
    return apiError(e, { traceId });
  }
}

export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  const log = logger.child({ traceId, route: '/api/verify-target' });
  try {
    const session = await requireSession();
    const body = await req.json();
    const input = createSchema.parse(body);

    const verification = await createChallenge(session.org.id, input.domain, input.method);
    log.info(
      {
        event: 'target_verification.challenge_created',
        orgId: session.org.id,
        domain: verification.domain,
        method: verification.method,
        verificationId: verification.id,
      },
      'verification challenge created',
    );

    return ok({
      verification,
      instructions: buildInstructions(verification.method, verification.domain, verification.challengeToken),
    });
  } catch (e) {
    return apiError(e, { traceId });
  }
}

function buildInstructions(
  method: 'dns_txt' | 'well_known_file',
  domain: string,
  token: string,
): { method: 'dns_txt' | 'well_known_file'; summary: string; details: string[] } {
  if (method === 'dns_txt') {
    return {
      method,
      summary: `Add a DNS TXT record at ${domain} (or _oracle-bot.${domain})`,
      details: [
        `Host: ${domain} (or _oracle-bot.${domain} as a subdomain)`,
        `Type: TXT`,
        `Value: ${dnsTxtRecordValue(token)}`,
        `TTL: any (300–3600 typical)`,
        `DNS propagation can take a few minutes — re-check after publishing.`,
      ],
    };
  }
  return {
    method,
    summary: `Serve a verification file at ${wellKnownUrl(domain)}`,
    details: [
      `URL: ${wellKnownUrl(domain)}`,
      `Content-Type: text/plain (any)`,
      `Body: ${token}`,
      `The file must be reachable over HTTPS without authentication.`,
    ],
  };
}

// Normalize is exported on lib but expose a tiny utility check too.
export const _normalize = normalizeDomain;
