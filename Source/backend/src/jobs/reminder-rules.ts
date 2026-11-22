// NOTI-05 day rules. Dates are business dates (UTC midnight of the Hà Nội day, G-02).
const DAY_MS = 24 * 3600_000;
export const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / DAY_MS);

// Overdue reminders on day 1, 4, 7, … after due_date (every 3 days).
export function isOverdueReminderDay(dueDate: Date, today: Date): boolean {
  const n = daysBetween(dueDate, today);
  return n >= 1 && (n - 1) % 3 === 0;
}

// Contracts are reminded exactly 30 and 7 days before end_date.
export function expiringNoticeDays(endDate: Date, today: Date): 30 | 7 | null {
  const n = daysBetween(today, endDate);
  return n === 30 || n === 7 ? n : null;
}
