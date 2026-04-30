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

interface RunFailedEmailProps {
  recipientName: string;
  runName: string;
  mode: string;
  errorSummary: string;
  retryUrl: string;
}

export function RunFailedEmail({
  recipientName,
  runName,
  mode,
  errorSummary,
  retryUrl,
}: RunFailedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Oracle Bot run failed — {errorSummary.slice(0, 60)}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>Your run didn&apos;t complete</Heading>
          <Text style={text}>Hi {recipientName},</Text>
          <Text style={text}>
            <strong>{runName}</strong> ({mode} mode) failed before producing a report.
          </Text>
          <Section style={errorCard}>
            <Text style={errorText}>{errorSummary}</Text>
          </Section>
          <Text style={text}>
            We&apos;ve already cleaned up the sandbox. You weren&apos;t charged for this run.
          </Text>
          <Section style={ctaWrap}>
            <Button href={retryUrl} style={button}>
              Re-run with same config
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            Oracle Bot — the first Agent Testing Platform.
            <br />
            <a href="mailto:hello@oraclebot.net" style={link}>
              hello@oraclebot.net
            </a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: '#07080B', color: '#ECEEF2', fontFamily: '"JetBrains Mono", ui-monospace, monospace' };
const container = { margin: '0 auto', padding: '40px 24px', maxWidth: '560px' };
const h1 = { color: '#ECEEF2', fontSize: '24px', fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 24px' };
const text = { color: '#9097A4', fontSize: '14px', lineHeight: '1.6', margin: '0 0 16px' };
const errorCard = {
  backgroundColor: 'rgba(226,116,116,0.08)',
  border: '1px solid rgba(226,116,116,0.25)',
  borderRadius: '12px',
  padding: '16px',
  margin: '20px 0',
};
const errorText = { color: '#E27474', fontSize: '13px', margin: 0, lineHeight: '1.5' };
const ctaWrap = { textAlign: 'center' as const, margin: '32px 0' };
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
const hr = { borderColor: 'rgba(255,255,255,0.08)', margin: '32px 0 24px' };
const footer = { color: '#5F6573', fontSize: '11px', textAlign: 'center' as const, margin: 0 };
const link = { color: '#7CF0C0', textDecoration: 'none' };
