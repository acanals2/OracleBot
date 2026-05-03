/**
 * Stacked horizontal bar showing how many completed runs hit each probe
 * pack. Pure server component — no interactivity.
 *
 * Renders inline SVG so the chart needs no client JS bundle (Recharts
 * weighs > 100 KB; this is < 1 KB rendered).
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PACKS, type PackId } from '@/data/packs';

interface Slice {
  packId: string;
  count: number;
}

const PACK_COLOURS: Record<string, string> = {
  web_classics: '#7CF0C0',
  ai_built_apps: '#a18bff',
  llm_endpoints: '#5fb7ff',
  mcp_server: '#f4b860',
  agent_runtime: '#e27474',
  other: '#5F6573',
};

export function PackDistribution({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pack distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ob-muted">
            No completed runs yet. Once you run a scan, the packs you used will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const items = slices.map((s) => {
    const pack = PACKS[s.packId as PackId];
    return {
      packId: s.packId,
      label: pack?.label ?? s.packId,
      count: s.count,
      pct: (s.count / total) * 100,
      colour: PACK_COLOURS[s.packId] ?? PACK_COLOURS.other,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pack distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
          {total.toLocaleString()} pack invocation{total === 1 ? '' : 's'} across completed runs
        </p>

        {/* Stacked bar */}
        <div
          className="mt-3 flex h-3 w-full overflow-hidden rounded-full border border-ob-line bg-ob-bg/40"
          role="img"
          aria-label={`Pack distribution: ${items.map((i) => `${i.label} ${i.count}`).join(', ')}`}
        >
          {items.map((i) => (
            <div
              key={i.packId}
              style={{ width: `${i.pct}%`, background: i.colour }}
              title={`${i.label} · ${i.count}`}
            />
          ))}
        </div>

        {/* Legend */}
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.packId} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: i.colour }}
                  aria-hidden="true"
                />
                <span className="truncate text-ob-ink">{i.label}</span>
              </span>
              <span className="font-mono text-[11px] tabular-nums text-ob-muted">
                {i.count} <span className="text-ob-dim">({i.pct.toFixed(0)}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
