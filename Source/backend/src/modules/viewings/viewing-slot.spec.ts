import { todayHanoi, addDays, formatDateOnly } from '../../common/date/today.js';
import { checkVisitSlot } from './viewing-slot.js';

// CP-3 (BE-P2-31) · VIEW-08: visitDate in [today, today+30] (Asia/Ho_Chi_Minh), slot already
// started today is refused. Pure function, no mocking: this is the unit under test itself.

const hanoi = (dateStr: string, hh: number, mm: number): Date =>
  // dateStr is a Hanoi calendar date; convert "dateStr hh:mm Hanoi" to its UTC instant (Hanoi = UTC+7).
  new Date(new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`).getTime() - 7 * 3600_000);

describe('CP-3 (BE-P2-31) · checkVisitSlot (VIEW-08)', () => {
  it('VIEW-08: today is accepted for a slot that has not started yet', () => {
    const now = hanoi('2026-06-10', 7, 0);
    const today = todayHanoi(now);
    const date = checkVisitSlot(formatDateOnly(today), 'MORNING', now);
    expect(formatDateOnly(date)).toBe(formatDateOnly(today));
  });

  it('VIEW-08: today + 30 is accepted (inclusive upper boundary)', () => {
    const now = hanoi('2026-06-10', 7, 0);
    const today = todayHanoi(now);
    const date = checkVisitSlot(formatDateOnly(addDays(today, 30)), 'EVENING', now);
    expect(formatDateOnly(date)).toBe(formatDateOnly(addDays(today, 30)));
  });

  it('VIEW-08: today + 31 is rejected on fields.visitDate', () => {
    const now = hanoi('2026-06-10', 7, 0);
    const today = todayHanoi(now);
    try {
      checkVisitSlot(formatDateOnly(addDays(today, 31)), 'EVENING', now);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getResponse().code).toBe('VALIDATION_FAILED');
      expect(e.getResponse().fields.visitDate).toBeDefined();
      expect(e.getStatus()).toBe(400);
    }
  });

  it('VIEW-08: yesterday is rejected on fields.visitDate', () => {
    const now = hanoi('2026-06-10', 7, 0);
    const today = todayHanoi(now);
    try {
      checkVisitSlot(formatDateOnly(addDays(today, -1)), 'EVENING', now);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getResponse().fields.visitDate).toBeDefined();
    }
  });

  it('VIEW-08: an impossible calendar date (2026-02-30) is rejected on fields.visitDate', () => {
    const now = hanoi('2026-02-10', 7, 0);
    try {
      checkVisitSlot('2026-02-30', 'MORNING', now);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getResponse().fields.visitDate).toBeDefined();
    }
  });

  it('VIEW-08/Asia-Ho_Chi_Minh: at 15:00 Hanoi, MORNING and AFTERNOON today are rejected, EVENING today is accepted', () => {
    const now = hanoi('2026-06-10', 15, 0);
    const today = todayHanoi(now);
    const todayStr = formatDateOnly(today);
    for (const slot of ['MORNING', 'AFTERNOON'] as const) {
      try {
        checkVisitSlot(todayStr, slot, now);
        throw new Error('should have thrown');
      } catch (e: any) {
        expect(e.getResponse().fields.timeSlot).toBeDefined();
      }
    }
    expect(() => checkVisitSlot(todayStr, 'EVENING', now)).not.toThrow();
  });

  it('VIEW-08: at 15:00 Hanoi, every slot tomorrow is accepted', () => {
    const now = hanoi('2026-06-10', 15, 0);
    const tomorrow = formatDateOnly(addDays(todayHanoi(now), 1));
    for (const slot of ['MORNING', 'AFTERNOON', 'EVENING'] as const) {
      expect(() => checkVisitSlot(tomorrow, slot, now)).not.toThrow();
    }
  });

  it('VIEW-08: 07:59 Hanoi still allows MORNING today; 08:00 exactly refuses it', () => {
    const todayStr759 = formatDateOnly(todayHanoi(hanoi('2026-06-10', 7, 59)));
    expect(() => checkVisitSlot(todayStr759, 'MORNING', hanoi('2026-06-10', 7, 59))).not.toThrow();
    try {
      checkVisitSlot(formatDateOnly(todayHanoi(hanoi('2026-06-10', 8, 0))), 'MORNING', hanoi('2026-06-10', 8, 0));
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getResponse().fields.timeSlot).toBeDefined();
    }
  });

  // Rejecting an unknown slot name (e.g. "NIGHT") is the DTO's @IsIn job, not checkVisitSlot's;
  // that path is covered at the HTTP layer in public-viewings.http.spec.ts.
});
