import type { LucideIcon } from 'lucide-react';
import { Globe, Layers, MessageSquare, Terminal } from 'lucide-react';

export type ModeSlug = 'site' | 'agent' | 'api' | 'stack';

export interface ModeConfig {
  slug: ModeSlug;
  tag: string;
  icon: LucideIcon;
  hero: {
    eyebrow: string;
    title: string;
    titleAccent: string;
    titleAfter?: string;
    body: string;
  };
  signature?: boolean;
  finds: string[];
  customer: string[];
  scenarios: { name: string; example: string }[];
  reportPreview: { label: string; value: string }[];
  events: string[];
}

export const MODES: ModeConfig[] = [
  {
    slug: 'site',
    tag: 'Site Mode',
    icon: Globe,
    hero: {
      eyebrow: 'Site Mode · websites & web apps',
      title: 'Find the bugs that only appear when',
      titleAccent: '10,000 users',
      titleAfter: 'show up at once.',
      body:
        'Synthetic users complete real flows on your site — signup, checkout, onboarding — at population scale. Race conditions, conversion drop-offs, and broken flows surface before launch day, not on it.',
    },
    finds: [
      'Race conditions under concurrent user load',
      'Conversion funnel drop-offs you can\'t see in QA',
      'Cold-start latency cliffs',
      'Auth flow brittleness at scale',
      'Inventory contention and double-booking',
    ],
    customer: [
      'Solo founders pre-launching an app',
      'AI builders shipping with Cursor / Claude / Lovable',
      'Marketplaces, social, SaaS, e-commerce teams',
    ],
    scenarios: [
      { name: 'Launch spike', example: '10k personas hit signup over 5 minutes' },
      { name: 'Sustained load', example: '5k personas browse + purchase for 1 hour' },
      { name: 'Auth storm', example: '2k personas attempt login simultaneously' },
      { name: 'Checkout pressure', example: '1k personas race to claim limited inventory' },
    ],
    reportPreview: [
      { label: 'Readiness', value: '92/100' },
      { label: 'p95 latency', value: '428ms' },
      { label: 'Funnel completion', value: '87%' },
    ],
    events: [
      '→ checkout race condition at 412 concurrent',
      '→ signup form regression on mobile',
      '→ CDN cold-start adds 2.1s for first 500 users',
    ],
  },
  {
    slug: 'agent',
    tag: 'Agent Mode',
    icon: MessageSquare,
    hero: {
      eyebrow: 'Agent Mode · AI chatbots & agents',
      title: 'Find the prompt injections, hallucinations, and jailbreaks',
      titleAccent: 'before your users do',
      titleAfter: '.',
      body:
        'Synthetic users converse with your AI agent across the full intent spectrum — friendly, hostile, confused, malicious. Oracle Bot surfaces what your agent says when nobody\'s looking.',
    },
    finds: [
      'Prompt injections that bypass your system prompt',
      'Hallucinations that invent products, prices, or policies',
      'Jailbreak patterns that break safety guardrails',
      'System-prompt leaks to unprivileged users',
      'Off-topic drift and conversation hijacks',
    ],
    customer: [
      'Anyone shipping a chatbot, support agent, or sales agent',
      'Teams building with the Claude / OpenAI Agent SDKs',
      'Regulated industries deploying customer-facing AI',
    ],
    scenarios: [
      { name: 'Adversarial mix', example: '5k personas attempt jailbreaks + injections' },
      { name: 'Confused user', example: '2k personas ask malformed or off-topic questions' },
      { name: 'Persistent attacker', example: '500 personas run multi-turn social engineering' },
      { name: 'Real-user simulation', example: '10k personas with realistic intent distribution' },
    ],
    reportPreview: [
      { label: 'Safety score', value: '78/100' },
      { label: 'Injection rate', value: '4.2%' },
      { label: 'Hallucinations', value: '1.2%' },
    ],
    events: [
      '→ agent leaks system prompt to bot_437',
      '→ refund granted after \'pretty please\' x3',
      '→ agent hallucinated product SKU not in catalog',
    ],
  },
  {
    slug: 'api',
    tag: 'API Mode',
    icon: Terminal,
    hero: {
      eyebrow: 'API Mode · endpoints & scripts',
      title: 'Find the auth gaps, rate-limit cliffs, and malformed-input crashes',
      titleAccent: 'before they\'re exploited',
      titleAfter: '.',
      body:
        'Synthetic clients call your API with realistic and adversarial payloads. Load ceilings, edge-case input handling, and missing auth checks surface in one run.',
    },
    finds: [
      'Auth bypasses and missing permission checks',
      'Malformed input that crashes endpoints',
      'Rate-limit cliffs where degradation hits',
      'N+1 query bottlenecks under realistic load',
      'Race conditions in stateful endpoints',
    ],
    customer: [
      'Backend developers shipping public APIs',
      'API product owners launching new endpoints',
      'Teams pre-launch on a payment, auth, or webhook service',
    ],
    scenarios: [
      { name: 'Load profile', example: '5k clients sustained for 30 minutes' },
      { name: 'Adversarial payloads', example: '1k clients send fuzzed + malformed input' },
      { name: 'Auth probe', example: '500 clients test access controls + token edge cases' },
      { name: 'Spike + recovery', example: '10x burst then back to baseline' },
    ],
    reportPreview: [
      { label: 'Health score', value: '95/100' },
      { label: 'Throughput', value: '18k rps' },
      { label: 'Edge cases', value: '142 found' },
    ],
    events: [
      '→ /v1/refund accepts negative amounts',
      '→ rate limit absent on /search?q=*',
      '→ webhook retries cause duplicate writes',
    ],
  },
  {
    slug: 'stack',
    tag: 'Stack Mode',
    icon: Layers,
    signature: true,
    hero: {
      eyebrow: 'Stack Mode · the signature mode',
      title: 'Test your full AI product end-to-end',
      titleAccent: 'in one run',
      titleAfter: '.',
      body:
        'One sandbox covers your whole product: site → AI feature → API → back to site. Synthetic users complete real journeys — including AI interactions. Nobody else does this. Stack Mode is why Oracle Bot exists.',
    },
    finds: [
      'Integration bugs between site, agent, and API',
      'AI cost runaway under realistic user load',
      'Latency cascades when AI responses block UX',
      'End-to-end failures invisible to single-modality tests',
      'State drift between agent context and database',
    ],
    customer: [
      'AI app builders shipping a complete product',
      'Teams with site + agent + API in one stack',
      'Pre-launch fintechs running compliance audits',
    ],
    scenarios: [
      {
        name: 'Full journey',
        example: '5k personas signup → onboard with AI agent → place order',
      },
      {
        name: 'AI cost stress',
        example: '10k personas hit AI features at peak — measure $/user',
      },
      {
        name: 'Cascade failure',
        example: 'Agent slows; does the site degrade gracefully?',
      },
      {
        name: 'Compliance run',
        example: 'Full audit with signed artifacts for procurement',
      },
    ],
    reportPreview: [
      { label: 'Stack readiness', value: '87/100' },
      { label: 'Site / Agent / API', value: '92 / 78 / 95' },
      { label: 'AI cost / 1k users', value: '$4.20' },
    ],
    events: [
      '→ agent adds 3.4s to checkout flow under load',
      '→ AI cost spikes 8x when 200 personas onboard at once',
      '→ session state lost between agent and order DB',
    ],
  },
];

export const MODE_BY_SLUG: Record<ModeSlug, ModeConfig> = MODES.reduce(
  (acc, m) => ({ ...acc, [m.slug]: m }),
  {} as Record<ModeSlug, ModeConfig>,
);
