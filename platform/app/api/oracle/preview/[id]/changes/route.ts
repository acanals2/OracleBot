/**
 * GET /api/oracle/preview/:id/changes  — Server-Sent Events stream.
 *
 * The previewed iframe subscribes to this stream and reloads itself on
 * `change`/`rebuild` events. Auth-gated by ownership lookup like the rest
 * of /api/oracle/* (the bundle's version was unauthenticated since it
 * relied on opaque preview ids; we tighten it up here).
 */
import { subscribeToPreviewEvents } from '@/lib/oracle-preview';
import { loadWorkspaceForRequest } from '@/lib/workspaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function GET(req: Request, { params }: { params: Params }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    return new Response('invalid id', { status: 400 });
  }
  try {
    await loadWorkspaceForRequest(id);
  } catch {
    return new Response('forbidden', { status: 403 });
  }

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      write(`:connected\n\n`);

      const unsubscribe = subscribeToPreviewEvents(id, (event) => {
        if (closed) return;
        if (event.type === 'change') {
          write(`event: change\ndata: ${JSON.stringify({ files: event.files })}\n\n`);
        } else if (event.type === 'rebuild') {
          write(`event: rebuild\ndata: ${JSON.stringify({ reason: event.reason })}\n\n`);
        } else if (event.type === 'state') {
          write(`event: state\ndata: ${JSON.stringify({ id: event.id })}\n\n`);
        }
      });

      const keepalive = setInterval(() => write(`:ping\n\n`), 15_000);
      (keepalive as unknown as { unref?: () => void }).unref?.();

      cleanup = () => {
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener('abort', () => cleanup?.());
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  });
}
