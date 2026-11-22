import { describe, expect, it, vi } from 'vitest';
import { claimDailyRun } from './job-state.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('Q-P4-16 claimDailyRun', () => {
  it('Q-P4-16: true when this call stored today, false when the day was already claimed', async () => {
    const db = { $executeRaw: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0) };
    expect(await claimDailyRun(db as never, 'late_readings', d('2026-11-02'))).toBe(true);
    expect(await claimDailyRun(db as never, 'late_readings', d('2026-11-02'))).toBe(false);
  });

  it('Q-P4-16: one upsert on settings job_state, guarded by the stored day (atomic under the row lock)', async () => {
    const db = { $executeRaw: vi.fn(async () => 1) };
    await claimDailyRun(db as never, 'invoice_reminders', d('2026-11-02'));
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = (db.$executeRaw.mock.calls[0] as unknown) as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join('?');
    expect(sql).toContain("'job_state'");
    expect(sql).toContain('ON CONFLICT (key) DO UPDATE');
    expect(sql).toContain('IS DISTINCT FROM');
    expect(sql.split(';').filter(s => s.trim()).length).toBe(1);
    expect(values).toEqual(['invoice_reminders', '2026-11-02', 'invoice_reminders', '2026-11-02', 'invoice_reminders', '2026-11-02']);
  });
});
