'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

const tickStyle = { fill: '#5F6573', fontSize: 10 };
const tooltipStyles = {
  contentStyle: {
    background: '#14171F',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
  labelStyle: { color: '#9097A4' },
  itemStyle: { color: '#7CF0C0' },
};

export function ResponseTimeChart({
  data,
}: {
  data: { t: string; ms: number; errors: number }[];
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Response time (p95 trend)</CardTitle>
        <p className="text-xs text-ob-muted">Placeholder series — wire to live test telemetry via API.</p>
      </CardHeader>
      <CardContent className="h-72 pt-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="msGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7CF0C0" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#7CF0C0" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="t" tick={tickStyle} axisLine={false} tickLine={false} />
            <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={36} unit="ms" />
            <Tooltip {...tooltipStyles} formatter={(v: number) => [`${v} ms`, 'p95']} />
            <Area
              type="monotone"
              dataKey="ms"
              stroke="#7CF0C0"
              strokeWidth={1.5}
              fill="url(#msGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
