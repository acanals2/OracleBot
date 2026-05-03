/**
 * PATCH  /api/webhook-subscriptions/:id  — { enabled: bool } toggles the row
 * DELETE /api/webhook-subscriptions/:id  — drop the row entirely
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import { deleteSubscription, setEnabled } from '@/lib/webhook-subscriptions';

type Params = Promise<{ id: string }>;

const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const input = patchSchema.parse(await req.json());
    await setEnabled(session.org.id, id, input.enabled);
    return ok({ id, enabled: input.enabled });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await deleteSubscription(session.org.id, id);
    return ok({ deleted: id });
  } catch (e) {
    return apiError(e);
  }
}
