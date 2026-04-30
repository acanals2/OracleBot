import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface RunCompletedEmailProps {
  recipientName: string;
  runName: string;
  mode: string;
  readinessScore: number | null;
  findingsCount: number;
  reportUrl: string;
}

export function RunCompletedEmail({
  recipientName,
  runName,
  mode,
  readinessScore,
  findingsCount,
  reportUrl,
}: RunCompletedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Your Oracle Report is ready{readinessScore != null ? ` — ${readinessScore}/100` : ''}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>Your Oracle Report is ready</Heading>
          <Text style={text}>Hi {recipientName},</Text>
          <Text style={text}>
            <strong>{runName}</strong> ({mode} mode) finished running. We surfaced{' '}
            <strong>{findingsCount}</strong> {findingsCount === 1 ? 'issue' : 'issues'}.
          </Text>

          {readinessScore != null && (
            <Section style={scoreCard}>
              <Text style={scoreLabel}>Readiness score</Text>
              <Text style={scoreValue}>{readinessScore} / 100</Text>
            </Section>
          )}

          <Section style={ctaWrap}>
            <Button href={reportUrl} style={button}>
              View full report
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Oracle Bot — the first Agent Testing Platform.
            <br />
            <a href="https://oraclebot.net" style={link}>
              oraclebot.net
            </a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Styles — inline for max email client compat
// ────────────────────────────────────────────────────────────────────────────

const body = {
  backgroundColor: '#07080B',
  color: '#ECEEF2',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
};
const container = {
  margin: '0 auto',
  padding: '40px 24px',
  maxWidth: '560px',
};
const h1 = {
  color: '#ECEEF2',
  fontSize: '24px',
  fontWeight: 400,
  letterSpacing: '-0.01em',
  margin: '0 0 24px',
};
const text = {
  color: '#9097A4',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 16px',
};
const scoreCard = {
  backgroundColor: '#0F1117',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  padding: '20px',
  margin: '24px 0',
  textAlign: 'center' as const,
};
const scoreLabel = {
  color: '#5F6573',
  fontSize: '11px',
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  margin: '0 0 8px',
};
const scoreValue = {
  color: '#7CF0C0',
  fontSize: '32px',
  fontWeight: 600,
  margin: 0,
};
const ctaWrap = {
  textAlign: 'center' as const,
  margin: '32px 0',
};
const button = {
  backgroundColor: '#7CF0C0',
  color: '#07080B',
  fontSize: '13px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  padding: '12px 24px',
  borderRadius: '999px',
  textDecoration: 'none',
  display: 'inline-block',
};
const hr = {
  borderColor: 'rgba(255,255,255,0.08)',
  margin: '32px 0 24px',
};
const footer = {
  color: '#5F6573',
  fontSize: '11px',
  textAlign: 'center' as const,
  margin: 0,
};
const link = {
  color: '#7CF0C0',
  textDecoration: 'none',
};
