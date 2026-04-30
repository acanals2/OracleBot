import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MODE_BY_SLUG, MODES, type ModeSlug } from '@/data/modes';
import { ModePageContent } from './ModePageContent';

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return MODES.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const mode = MODE_BY_SLUG[slug as ModeSlug];
  if (!mode) return {};
  return {
    title: `${mode.tag} — ${mode.hero.titleAccent}`,
    description: mode.hero.body,
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const mode = MODE_BY_SLUG[slug as ModeSlug];
  if (!mode) notFound();
  return <ModePageContent slug={slug as ModeSlug} />;
}
