import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://oraclebot.net'),
  title: {
    default: 'Oracle Bot — The first Agent Testing Platform',
    template: '%s · Oracle Bot',
  },
  description:
    'Test your AI app the way users actually break it. Oracle Bot tests your site, your agent, your API, and your full stack — through one unified bot architecture, in one sandboxed run, with one report.',
  keywords: [
    'agent testing',
    'AI testing',
    'load testing',
    'prompt injection testing',
    'AI quality',
    'pre-launch testing',
  ],
  openGraph: {
    title: 'Oracle Bot — The first Agent Testing Platform',
    description:
      'Test your site, agent, API, and full stack with one unified bot architecture. Find prompt injections, hallucinations, race conditions, and load cliffs before your users do.',
    url: 'https://oraclebot.net',
    siteName: 'Oracle Bot',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Oracle Bot — Agent Testing Platform',
    description:
      'Test your AI app the way users actually break it. One unified bot architecture, one report, one source of truth.',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#07080B',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
