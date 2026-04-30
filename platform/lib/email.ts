/**
 * Resend email client + template registry.
 *
 * The web app rarely calls these directly — it enqueues `emailQueue` jobs and
 * the worker process invokes `sendEmail`. That keeps email retries off the
 * request path.
 *
 * Templates live in lib/email-templates/ as React Email components.
 */
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { ReactElement } from 'react';

let _resend: Resend | null = null;

function client(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  _resend = new Resend(key);
  return _resend;
}

export interface SendEmailOpts {
  to: string | string[];
  subject: string;
  /** A React Email component (renders to both HTML and plain text) */
  react: ReactElement;
  replyTo?: string;
}

export async function sendEmail(opts: SendEmailOpts) {
  const from = process.env.RESEND_FROM_EMAIL ?? 'Oracle Bot <hello@oraclebot.net>';

  const html = await render(opts.react);
  const text = await render(opts.react, { plainText: true });

  const result = await client().emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html,
    text,
    replyTo: opts.replyTo,
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
  return result.data;
}
