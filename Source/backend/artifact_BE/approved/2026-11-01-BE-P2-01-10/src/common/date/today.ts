// Asia/Ho_Chi_Minh is UTC+7 all year (no DST), so a fixed offset is exact (G-02).
export const HANOI_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 24 * 3600_000;

export type TimeSlot = 'MORNING' | 'AFTERNOON' | 'EVENING';
export const SLOT_START_MINUTES: Record<TimeSlot, number> = {
  MORNING: 8 * 60,
  AFTERNOON: 14 * 60,
  EVENING: 18 * 60,
};

// Business dates are stored as UTC midnight of their calendar day (see prisma/seed.ts).
export function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function todayHanoi(now: Date = new Date()): Date {
  return toDateOnly(new Date(now.getTime() + HANOI_OFFSET_MS));
}

export function hanoiMinutesOfDay(now: Date = new Date()): number {
  const ms = now.getTime() + HANOI_OFFSET_MS;
  return Math.floor((((ms % DAY_MS) + DAY_MS) % DAY_MS) / 60_000);
}

export function addDays(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

export function compareDates(a: Date, b: Date): -1 | 0 | 1 {
  const x = toDateOnly(a).getTime();
  const y = toDateOnly(b).getTime();
  if (x === y) return 0;
  return x < y ? -1 : 1;
}

export function formatDateOnly(d: Date): string {
  return toDateOnly(d).toISOString().slice(0, 10);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Rejects impossible days (2026-02-30) by checking the parsed parts still match.
export function parseDateOnly(s: string): Date | null {
  const m = DATE_ONLY.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(Date.UTC(y, mo, day));
  const valid = d.getUTCFullYear() === y && d.getUTCMonth() === mo && d.getUTCDate() === day;
  return valid ? d : null;
}

export function hasSlotStarted(visitDate: Date, slot: TimeSlot, now: Date = new Date()): boolean {
  return (
    compareDates(visitDate, todayHanoi(now)) === 0 &&
    hanoiMinutesOfDay(now) >= SLOT_START_MINUTES[slot]
  );
}
