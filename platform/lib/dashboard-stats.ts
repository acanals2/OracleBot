import { eq, sql, and } from 'drizzle-orm';
import { db } from './db';
import { runs, runFindings } from './db/schema';

export interface DashboardStats {
  totalRuns: number;
  completedRuns: number;
  avgReadiness: number | null;
  totalFindings: number;
  criticalFindings: number;
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

  return {
    totalRuns: runStats.totalRuns,
    completedRuns: runStats.completedRuns,
    avgReadiness: runStats.avgReadiness,
    totalFindings: findingStats.totalFindings,
    criticalFindings: findingStats.criticalFindings,
  };
}
