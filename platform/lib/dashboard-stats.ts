import { eq, sql, and, isNotNull, gte } from 'drizzle-orm';
import { db } from './db';
import { runs, runFindings } from './db/schema';

export interface DashboardStats {
  totalRuns: number;
  completedRuns: number;
  avgReadiness: number | null;
  totalFindings: number;
  criticalFindings: number;
  /** count of completed runs that included each pack (counts a run twice if it had both). */
  packDistribution: { packId: string; count: number }[];
  /** Last 14 days of completed runs, one entry per run, oldest first. */
  scoreSeries: { runId: string; completedAt: string; score: number; mode: string }[];
}

export async function getDashboardStats(orgId: string): Promise<DashboardStats> {
  const [runStats] = await db
    .select({
      totalRuns: sql<number>`count(*)::int`,
      completedRuns: sql<number>`count(*) filter (where ${runs.status} = 'completed')::int`,
      avgReadiness: sql<number | null>`round(avg(${runs.readinessScore}) filter (where ${runs.readinessScore} is not null))`,
    })
    .from(runs)
    .where(eq(runs.orgId, orgId));

  const [findingStats] = await db
    .select({
      totalFindings: sql<number>`count(*)::int`,
      criticalFindings: sql<number>`count(*) filter (where ${runFindings.severity} = 'critical')::int`,
    })
    .from(runFindings)
    .innerJoin(runs, eq(runFindings.runId, runs.id))
    .where(eq(runs.orgId, orgId));

  // Pack distribution — unnest the jsonb packs array per completed run, then
  // count each pack id. Legacy runs (packs IS NULL) and runs with empty
  // packs arrays are bucketed as "web_classics" (the implicit default).
  //
  // jsonb_array_elements_text returns 0 rows on NULL input — so the
  // COALESCE-inside-unnest trick doesn't work. We use a UNION ALL between
  // exploded rows and a fallback bucket for runs with no packs column.
  const packExec = await db.execute(
    sql`
      SELECT pack_id, COUNT(*)::int AS run_count
      FROM (
        SELECT jsonb_array_elements_text(${runs.packs})::text AS pack_id
        FROM ${runs}
        WHERE ${runs.orgId} = ${orgId}
          AND ${runs.status} = 'completed'
          AND ${runs.packs} IS NOT NULL
          AND jsonb_array_length(${runs.packs}) > 0
        UNION ALL
        SELECT 'web_classics'::text AS pack_id
        FROM ${runs}
        WHERE ${runs.orgId} = ${orgId}
          AND ${runs.status} = 'completed'
          AND (${runs.packs} IS NULL OR jsonb_array_length(${runs.packs}) = 0)
      ) t
      GROUP BY pack_id
      ORDER BY run_count DESC
    `,
  );

  // db.execute returns either an array directly (Drizzle pg driver) or
  // { rows: [...] } (Neon HTTP driver). Handle both.
  const packRowsRaw = (Array.isArray(packExec)
    ? packExec
    : ((packExec as unknown as { rows?: unknown[] }).rows ?? [])) as {
    pack_id: string;
    run_count: number | string;
  }[];
  const packDistribution = packRowsRaw.map((r) => ({
    packId: r.pack_id,
    count: Number(r.run_count),
  }));

  // Score series — last 14 days of completed runs.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const scoreRows = await db
    .select({
      runId: runs.id,
      completedAt: runs.completedAt,
      score: runs.readinessScore,
      mode: runs.mode,
    })
    .from(runs)
    .where(
      and(
        eq(runs.orgId, orgId),
        eq(runs.status, 'completed'),
        isNotNull(runs.readinessScore),
        gte(runs.completedAt, since),
      ),
    )
    .orderBy(runs.completedAt)
    .limit(60);

  const scoreSeries = scoreRows
    .filter((r): r is typeof r & { completedAt: Date; score: number } =>
      r.completedAt instanceof Date && typeof r.score === 'number',
    )
    .map((r) => ({
      runId: r.runId,
      completedAt: r.completedAt.toISOString(),
      score: r.score,
      mode: r.mode,
    }));

  return {
    totalRuns: runStats.totalRuns,
    completedRuns: runStats.completedRuns,
    avgReadiness: runStats.avgReadiness,
    totalFindings: findingStats.totalFindings,
    criticalFindings: findingStats.criticalFindings,
    packDistribution,
    scoreSeries,
  };
}
