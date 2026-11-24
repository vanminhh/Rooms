import type { Prisma } from '@prisma/client';
import { formatDateOnly } from '../common/date/today.js';

export type DailyJob = 'late_readings' | 'invoice_reminders' | 'close_incidents';

// Q-P4-16: settings['job_state'] = { "<job>": "YYYY-MM-DD" } (Hà Nội date of the last run), created on first use.
// One statement: a second caller the same day waits for the row lock, re-checks WHERE and updates 0 rows.
// Call it first inside the job's write transaction so a failed run gives the day back.
export async function claimDailyRun(db: Pick<Prisma.TransactionClient, '$executeRaw'>, job: DailyJob, today: Date): Promise<boolean> {
  const day = formatDateOnly(today);
  const updated = await db.$executeRaw`
    INSERT INTO settings (key, value, updated_at) VALUES ('job_state', jsonb_build_object(${job}::text, ${day}::text), now())
    ON CONFLICT (key) DO UPDATE SET value = settings.value || jsonb_build_object(${job}::text, ${day}::text), updated_at = now()
    WHERE settings.value ->> ${job}::text IS DISTINCT FROM ${day}::text`;
  return updated === 1;
}
