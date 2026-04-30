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

interface WelcomeEmailProps {
  recipientName: string;
  appUrl: string;
}

export function WelcomeEmail({ recipientName, appUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to Oracle Bot — let&apos;s find some bugs.</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>Welcome to Oracle Bot.</Heading>
          <Text style={text}>Hi {recipientName},</Text>
          <Text style={text}>
            You&apos;re in. Oracle Bot is the first Agent Testing Platform — one unified bot
            architecture tests your site, your agent, your API, and your full stack in one
            air-gapped sandbox.
          </Text>
          <Text style={text}>
            Connect a repo, pick a mode, and find the bugs that only show up at 10,000 users.
          </Text>
          <Section style={ctaWrap}>
            <Button href={`${appUrl}/app/tests/new`} style={button}>
              Run your first test
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            Reply to this email if you get stuck — a real person reads every reply.
            <br />
            <a href={appUrl} style={link}>
              oraclebot.net
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
