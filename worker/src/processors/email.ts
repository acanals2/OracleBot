/**
 * Email-send processor. Each job carries a template name + variables;
 * we instantiate the React Email component, render to HTML/text, send via Resend.
 */
import type { Job } from 'bullmq';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import React from 'react';
import { RunCompletedEmail } from './email-templates/RunCompletedEmail.js';
import { RunFailedEmail } from './email-templates/RunFailedEmail.js';
import { WelcomeEmail } from './email-templates/WelcomeEmail.js';
import type { SendEmailJobData } from '../queue-config.js';
import { env } from '../env.js';
import { logger } from '../logger.js';

let _resend: Resend | null = null;
function client(): Resend {
  if (_resend) return _resend;
  const key = env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  _resend = new Resend(key);
  return _resend;
}

export async function processSendEmail(job: Job<SendEmailJobData>) {
  const { template, to, vars } = job.data;
  const from = env.RESEND_FROM_EMAIL ?? 'Oracle Bot <hello@oraclebot.net>';

  const node = (() => {
    switch (template) {
      case 'run_completed':
        return React.createElement(RunCompletedEmail, vars as never);
      case 'run_failed':
        return React.createElement(RunFailedEmail, vars as never);
      case 'welcome':
        return React.createElement(WelcomeEmail, vars as never);
      case 'invoice_receipt':
        // Stripe sends its own invoice email by default; we keep this as a
        // hook in case we want to override later.
        throw new Error('invoice_receipt template not implemented');
      default:
        throw new Error(`Unknown template: ${template}`);
    }
  })();

  const subject = subjectFor(template, vars);
  const html = await render(node);
  const text = await render(node, { plainText: true });

  const result = await client().emails.send({ from, to, subject, html, text });
  if (result.error) throw new Error(`Resend error: ${result.error.message}`);
  logger.info({ event: 'email.sent', template, to }, 'email sent');
}

function subjectFor(template: SendEmailJobData['template'], vars: Record<string, unknown>): string {
  switch (template) {
    case 'run_completed': {
      const score = vars.readinessScore;
      return score != null
        ? `Your Oracle Report is ready — ${score}/100`
        : 'Your Oracle Report is ready';
    }
    case 'run_failed':
      return `Your Oracle Bot run didn't complete`;
    case 'welcome':
      return `Welcome to Oracle Bot`;
    case 'invoice_receipt':
      return `Receipt from Oracle Bot`;
  }
}
