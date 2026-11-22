import { describe, expect, it } from 'vitest';
import { expiringNoticeDays, isOverdueReminderDay } from './reminder-rules.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('NOTI-05 reminder days', () => {
  it('NOTI-05: overdue reminders on day 1, 4, 7, 10 after due_date; not on the due date, day 2, 3, 5, 6', () => {
    const due = d('2026-10-31');
    const day = (n: number) => isOverdueReminderDay(due, new Date(due.getTime() + n * 86_400_000));
    expect([1, 4, 7, 10].map(day)).toEqual([true, true, true, true]);
    expect([-1, 0, 2, 3, 5, 6].map(day)).toEqual([false, false, false, false, false, false]);
    expect(isOverdueReminderDay(due, d('2026-11-01'))).toBe(true);
  });

  it('NOTI-05: contracts are reminded exactly 30 and 7 days before end_date', () => {
    const today = d('2026-11-22');
    expect(expiringNoticeDays(d('2026-12-22'), today)).toBe(30);
    expect(expiringNoticeDays(d('2026-11-29'), today)).toBe(7);
    expect([d('2026-12-21'), d('2026-11-30'), d('2026-11-28'), today, d('2026-11-21')].map(e => expiringNoticeDays(e, today)))
      .toEqual([null, null, null, null, null]);
  });

  it('BIL-22, G-02: a leap February counts 29 days', () => {
    expect(expiringNoticeDays(d('2028-02-29'), d('2028-01-30'))).toBe(30);
  });
});
