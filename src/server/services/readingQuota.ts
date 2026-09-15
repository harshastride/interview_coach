import { pgPool } from '../db/pool.ts';
import { ReadingError } from './azureReading.ts';
export const MONTHLY_AZURE_SECONDS = 1800;
export function checkpointDue(count: number, used: number, duration: number) {
  return count % 5 === 0 && used + Math.ceil(duration) <= MONTHLY_AZURE_SECONDS;
}
export async function reserveReading(userId: number, fingerprint: string, duration: number, question: string) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query('SELECT pg_advisory_xact_lock(7819, $1)', [userId]);
    const cached = await client.query('SELECT id, status, result FROM reading_analysis_jobs WHERE user_id=$1 AND fingerprint=$2', [userId, fingerprint]);
    if (cached.rows.length) {
      const job = cached.rows[0];
      if (job.status === 'complete') { await client.query('COMMIT'); return { cached: job.result, id: job.id, azure: false }; }
      throw new ReadingError(409, 'This recording is already processing or was interrupted. Make a new recording to retry.');
    }
    const usage = await client.query(`SELECT COALESCE(SUM(azure_seconds),0)::int AS used,
      COUNT(*)::int AS count
      FROM reading_analysis_jobs WHERE user_id=$1 AND month=(date_trunc('month', NOW() AT TIME ZONE 'UTC'))::date`, [userId]);
    const { used, count } = usage.rows[0];
    // Reserve budget before the external call. Uncertain failures remain charged
    // conservatively, so retries or concurrent requests cannot overspend the cap.
    const azure = checkpointDue(count, used, duration);
    const result = await client.query(`INSERT INTO reading_analysis_jobs (user_id, fingerprint, question_ref, month, azure_seconds, domain_id)
      VALUES ($1,$2,$3,(date_trunc('month', NOW() AT TIME ZONE 'UTC'))::date,$4,(SELECT domain_id FROM users WHERE id=$1)) RETURNING id`, [userId, fingerprint, question, azure ? Math.ceil(duration) : 0]);
    await client.query('COMMIT');
    return { id: result.rows[0].id as number, azure, cached: null };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
