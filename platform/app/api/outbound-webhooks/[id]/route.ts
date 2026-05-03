/**
 * PATCH  /api/outbound-webhooks/:id  — toggle enabled
 * DELETE /api/outbound-webhooks/:id  — remove
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import { deleteOutboundWebhook, setOutboundWebhookEnabled } from '@/lib/outbound-webhooks';
import { record as auditRecord } from '@/lib/audit';

type Params = Promise<{ id: string }>;

const patchSchema = z.object({
  enabled: z.boolean(),
});

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json();
    const input = patchSchema.parse(body);
    await setOutboundWebhookEnabled(session.org.id, id, input.enabled);
    await auditRecord({
      orgId: session.org.id,
      userId: session.user.id,
      action: 'webhook.outbound_toggled',
      resourceId: id,
      metadata: { enabled: input.enabled },
    });
    return ok({ id, enabled: input.enabled });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await deleteOutboundWebhook(session.org.id, id);
    await auditRecord({
      orgId: session.org.id,
      userId: session.user.id,
      action: 'webhook.outbound_deleted',
      resourceId: id,
    });
    return ok({ id, deleted: true });
  } catch (e) {
    return apiError(e);
  }
}
