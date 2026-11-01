import { describe, it, expect } from 'vitest';
import {
  HANOI_OFFSET_MS,
  SLOT_START_MINUTES,
  todayHanoi,
  hanoiMinutesOfDay,
  toDateOnly,
  addDays,
  compareDates,
  formatDateOnly,
  parseDateOnly,
  hasSlotStarted,
} from './today.js';

// CP-3 (BE-P2-04) · G-02: all date logic runs in Asia/Ho_Chi_Minh (fixed UTC+7, no DST).
// Every test fixes `now` explicitly; none depends on the machine clock.

describe('G-02 / BE-P2-04: todayHanoi', () => {
  it('G-02 / BE-P2-04: 16:30 UTC is 23:30 Hanoi, same calendar day', () => {
    expect(todayHanoi(new Date('2026-11-01T16:30:00Z'))).toEqual(new Date('2026-11-01T00:00:00Z'));
  });

  it('G-02 / BE-P2-04: 17:00 UTC is 00:00 Hanoi, rolls to the next day', () => {
    expect(todayHanoi(new Date('2026-11-01T17:00:00Z'))).toEqual(new Date('2026-11-02T00:00:00Z'));
  });

  it('G-02 / BE-P2-04: 16:59:59 UTC is still 23:59:59 Hanoi, midnight boundary not crossed', () => {
    expect(todayHanoi(new Date('2026-11-01T16:59:59Z'))).toEqual(new Date('2026-11-01T00:00:00Z'));
  });

  it('G-02 / BE-P2-04: 00:00 UTC is 07:00 Hanoi, same calendar day', () => {
    expect(todayHanoi(new Date('2026-11-01T00:00:00Z'))).toEqual(new Date('2026-11-01T00:00:00Z'));
  });

  it('G-02 / BE-P2-04: end of month rolls over correctly', () => {
    expect(todayHanoi(new Date('2026-10-31T17:30:00Z'))).toEqual(new Date('2026-11-01T00:00:00Z'));
  });

  it('G-02 / BE-P2-04: end of year rolls over correctly', () => {
    expect(todayHanoi(new Date('2026-12-31T17:30:00Z'))).toEqual(new Date('2027-01-01T00:00:00Z'));
  });

  it('G-02 / BE-P2-04: HANOI_OFFSET_MS is exactly +7 hours', () => {
    expect(HANOI_OFFSET_MS).toBe(7 * 3600_000);
  });
});


describe('G-02 / BE-P2-04: addDays', () => {
  it('G-02 / BE-P2-04: non-leap year Feb 28 + 1 day rolls to Mar 1', () => {
    expect(addDays(new Date('2026-02-28T00:00:00Z'), 1)).toEqual(new Date('2026-03-01T00:00:00Z'));
  });

  it('G-02 / BE-P2-04: leap year Feb 28 + 1 day rolls to Feb 29', () => {
    expect(addDays(new Date('2028-02-28T00:00:00Z'), 1)).toEqual(new Date('2028-02-29T00:00:00Z'));
  });

  it('VIEW-08 / BE-P2-04: addDays(d, 0) returns the same calendar day at UTC midnight', () => {
    const d = new Date('2026-11-05T00:00:00Z');
    expect(addDays(d, 0)).toEqual(new Date('2026-11-05T00:00:00Z'));
  });

  it('VIEW-08 / BE-P2-04: addDays(d, -1) goes back one day', () => {
    expect(addDays(new Date('2026-11-05T00:00:00Z'), -1)).toEqual(new Date('2026-11-04T00:00:00Z'));
  });

  it('VIEW-08 / BE-P2-04: addDays(d, 30) matches the +30 day viewing window boundary', () => {
    expect(addDays(new Date('2026-11-01T00:00:00Z'), 30)).toEqual(new Date('2026-12-01T00:00:00Z'));
  });

  it('VIEW-08 / BE-P2-04: addDays never mutates the original Date', () => {
    const d = new Date('2026-11-05T00:00:00Z');
    const before = d.getTime();
    addDays(d, 5);
    expect(d.getTime()).toBe(before);
  });

  it('G-02 / BE-P2-04: addDays always returns UTC midnight even from a non-midnight input', () => {
    const result = addDays(new Date('2026-11-05T13:45:00Z'), 2);
    expect(result).toEqual(new Date('2026-11-07T00:00:00Z'));
  });
});

describe('G-02 / BE-P2-04: compareDates', () => {
  it('G-02 / BE-P2-04: returns -1 when a is before b', () => {
    expect(compareDates(new Date('2026-11-01T00:00:00Z'), new Date('2026-11-02T00:00:00Z'))).toBe(-1);
  });

  it('G-02 / BE-P2-04: returns 1 when a is after b', () => {
    expect(compareDates(new Date('2026-11-02T00:00:00Z'), new Date('2026-11-01T00:00:00Z'))).toBe(1);
  });

  it('G-02 / BE-P2-04: returns 0 for the same calendar day', () => {
    expect(compareDates(new Date('2026-11-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'))).toBe(0);
  });

  it('G-02 / BE-P2-04: ignores time-of-day when one Date has a non-zero time', () => {
    expect(compareDates(new Date('2026-11-01T23:59:59Z'), new Date('2026-11-01T00:00:01Z'))).toBe(0);
  });
});

describe('API-06 / BE-P2-04: formatDateOnly / parseDateOnly round trip', () => {
  it('API-06 / BE-P2-04: formatDateOnly then parseDateOnly on the same string returns an equal Date', () => {
    const s = '2026-11-01';
    const parsed = parseDateOnly(s);
    expect(parsed).not.toBeNull();
    expect(formatDateOnly(parsed as Date)).toBe(s);
  });

  it('API-06 / BE-P2-04: formatDateOnly renders YYYY-MM-DD', () => {
    expect(formatDateOnly(new Date('2026-11-01T13:00:00Z'))).toBe('2026-11-01');
  });

  it('API-06 / BE-P2-04: parseDateOnly rejects an impossible day (Feb 30)', () => {
    expect(parseDateOnly('2026-02-30')).toBeNull();
  });

  it('API-06 / BE-P2-04: parseDateOnly rejects a non-ISO format (dd/mm/yyyy)', () => {
    expect(parseDateOnly('01/11/2026')).toBeNull();
  });

  it('API-06 / BE-P2-04: parseDateOnly rejects an empty string', () => {
    expect(parseDateOnly('')).toBeNull();
  });

  it('API-06 / BE-P2-04: parseDateOnly rejects an out-of-range month (13)', () => {
    expect(parseDateOnly('2026-13-01')).toBeNull();
  });
});

describe('VIEW-08 / BE-P2-04: hasSlotStarted', () => {
  // 15:00 Hanoi = 08:00 UTC
  const at15HanoiToday = new Date('2026-11-01T08:00:00Z');
  const today = new Date('2026-11-01T00:00:00Z');
  const tomorrow = new Date('2026-11-02T00:00:00Z');

  it('VIEW-08 / BE-P2-04: at 15:00 Hanoi, MORNING (started 8:00) has started for a today visit', () => {
    expect(hasSlotStarted(today, 'MORNING', at15HanoiToday)).toBe(true);
  });

  it('VIEW-08 / BE-P2-04: at 15:00 Hanoi, AFTERNOON (started 14:00) has started for a today visit', () => {
    expect(hasSlotStarted(today, 'AFTERNOON', at15HanoiToday)).toBe(true);
  });

  it('VIEW-08 / BE-P2-04: at 15:00 Hanoi, EVENING (starts 18:00) has not started for a today visit', () => {
    expect(hasSlotStarted(today, 'EVENING', at15HanoiToday)).toBe(false);
  });

  it('VIEW-08 / BE-P2-04: at 15:00 Hanoi, every slot is available for a tomorrow visit', () => {
    expect(hasSlotStarted(tomorrow, 'MORNING', at15HanoiToday)).toBe(false);
    expect(hasSlotStarted(tomorrow, 'AFTERNOON', at15HanoiToday)).toBe(false);
    expect(hasSlotStarted(tomorrow, 'EVENING', at15HanoiToday)).toBe(false);
  });

  it('VIEW-08 / BE-P2-04: at 07:59 Hanoi, MORNING has not started yet for a today visit', () => {
    const at0759Hanoi = new Date('2026-11-01T00:59:00Z');
    expect(hasSlotStarted(today, 'MORNING', at0759Hanoi)).toBe(false);
    expect(hasSlotStarted(today, 'AFTERNOON', at0759Hanoi)).toBe(false);
    expect(hasSlotStarted(today, 'EVENING', at0759Hanoi)).toBe(false);
  });

  it('VIEW-08 / BE-P2-04: at exactly 08:00 Hanoi, MORNING has started for a today visit', () => {
    const at0800Hanoi = new Date('2026-11-01T01:00:00Z');
    expect(hasSlotStarted(today, 'MORNING', at0800Hanoi)).toBe(true);
  });

  it('VIEW-08 / BE-P2-04: a visit date in the past never counts as started (not this helper\'s job)', () => {
    const yesterday = new Date('2026-10-31T00:00:00Z');
    expect(hasSlotStarted(yesterday, 'MORNING', at15HanoiToday)).toBe(false);
    expect(hasSlotStarted(yesterday, 'EVENING', at15HanoiToday)).toBe(false);
  });

  it('VIEW-08 / BE-P2-04: SLOT_START_MINUTES matches "Sáng 8:00 / Chiều 14:00 / Tối 18:00"', () => {
    expect(SLOT_START_MINUTES).toEqual({ MORNING: 480, AFTERNOON: 840, EVENING: 1080 });
  });
});

describe('G-02 / BE-P2-04: hanoiMinutesOfDay and toDateOnly helpers', () => {
  it('G-02 / BE-P2-04: hanoiMinutesOfDay at 08:00 Hanoi (01:00 UTC) is 480', () => {
    expect(hanoiMinutesOfDay(new Date('2026-11-01T01:00:00Z'))).toBe(480);
  });

  it('G-02 / BE-P2-04: hanoiMinutesOfDay wraps correctly just before Hanoi midnight', () => {
    // 16:59:59 UTC = 23:59:59 Hanoi = 1439 minutes
    expect(hanoiMinutesOfDay(new Date('2026-11-01T16:59:00Z'))).toBe(1439);
  });

  it('G-02 / BE-P2-04: toDateOnly strips the time-of-day, keeping UTC midnight', () => {
    expect(toDateOnly(new Date('2026-11-01T13:45:30Z'))).toEqual(new Date('2026-11-01T00:00:00Z'));
  });
});
