import { getDb } from "./client";
import { ensureDb } from "./index";
import type { JobRow } from "./documents";

export function claimNextJob(): JobRow | undefined {
  ensureDb();
  const db = getDb();
  const job = db
    .prepare(
      `SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`,
    )
    .get() as JobRow | undefined;
  if (!job) return undefined;

  db.prepare(
    `UPDATE jobs SET status = 'running', started_at = datetime('now'), attempts = attempts + 1
     WHERE id = ? AND status = 'queued'`,
  ).run(job.id);

  return getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(job.id) as JobRow;
}

export function updateJobProgress(
  id: string,
  progress: string,
  current: number,
  total: number,
): void {
  ensureDb();
  getDb()
    .prepare(
      `UPDATE jobs SET progress = ?, progress_current = ?, progress_total = ? WHERE id = ?`,
    )
    .run(progress, current, total, id);
}

export function completeJob(id: string): void {
  ensureDb();
  getDb()
    .prepare(
      `UPDATE jobs SET status = 'completed', progress = 'done', finished_at = datetime('now')
       WHERE id = ?`,
    )
    .run(id);
}

export function failJob(id: string, message: string): void {
  ensureDb();
  getDb()
    .prepare(
      `UPDATE jobs SET status = 'failed', error_message = ?, finished_at = datetime('now')
       WHERE id = ?`,
    )
    .run(message.slice(0, 2000), id);
}

export function countJobsByStatus(status: string): number {
  ensureDb();
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM jobs WHERE status = ?`)
    .get(status) as { c: number };
  return row.c;
}
