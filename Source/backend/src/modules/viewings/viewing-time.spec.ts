import { BadRequestException } from '@nestjs/common';
import { checkVisitAt, viewingStart } from './viewing-time.js';

const now = new Date('2026-11-15T07:00:00+07:00');

// VIEW-08: removing any bound must fail its corresponding boundary case.
describe('BE-EX-18 / VIEW-08 exact viewing time', () => {
  it.each([
    ['first hour', '2026-11-15T08:00:00+07:00', '2026-11-15T01:00:00.000Z'],
    ['last hour', '2026-11-15T19:00:00+07:00', '2026-11-15T12:00:00.000Z'],
    ['UTC representation', '2026-11-15T01:00:00Z', '2026-11-15T01:00:00.000Z'],
    ['another offset', '2026-11-14T20:00:00-05:00', '2026-11-15T01:00:00.000Z'],
    ['ISO without seconds', '2026-11-15T08:00+07:00', '2026-11-15T01:00:00.000Z'],
    ['day 30 inclusive', '2026-12-15T19:00:00+07:00', '2026-12-15T12:00:00.000Z'],
  ])('VIEW-08: accepts %s and preserves its instant', (_label, input, expected) => {
    expect(checkVisitAt(input, now).toISOString()).toBe(expected);
  });

  it.each([
    ['07:00', '2026-11-16T07:00:00+07:00'],
    ['20:00', '2026-11-16T20:00:00+07:00'],
    ['half hour', '2026-11-16T10:30:00+07:00'],
    ['seconds', '2026-11-16T10:00:01+07:00'],
    ['milliseconds', '2026-11-16T10:00:00.001+07:00'],
    ['sub-millisecond fraction', '2026-11-16T10:00:00.0001+07:00'],
    ['yesterday', '2026-11-14T19:00:00+07:00'],
    ['day 31', '2026-12-16T08:00:00+07:00'],
    ['missing timezone', '2026-11-16T10:00:00'],
    ['date only', '2026-11-16'],
    ['impossible day', '2026-11-31T10:00:00+07:00'],
    ['hour 24', '2026-11-16T24:00:00+07:00'],
    ['invalid offset', '2026-11-16T10:00:00+24:00'],
    ['empty', ''],
  ])('VIEW-08: rejects %s with fields.visitAt', (_label, input) => {
    let error: unknown;
    try { checkVisitAt(input, now); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'VALIDATION_FAILED', fields: { visitAt: expect.any(String) },
    });
  });

  it('VIEW-08: accepts one millisecond before start, refuses at/after start', () => {
    const input = '2026-11-15T10:00:00+07:00';
    expect(checkVisitAt(input, new Date('2026-11-15T02:59:59.999Z')).toISOString()).toBe('2026-11-15T03:00:00.000Z');
    expect(() => checkVisitAt(input, new Date('2026-11-15T03:00:00Z'))).toThrow(BadRequestException);
    expect(() => checkVisitAt(input, new Date('2026-11-15T03:01:00Z'))).toThrow(BadRequestException);
  });

  it('VIEW-08/G-02: day 30 follows Hanoi midnight across the year boundary', () => {
    const input = '2027-01-31T08:00:00+07:00';
    expect(() => checkVisitAt(input, new Date('2026-12-31T16:59:59Z'))).toThrow(BadRequestException);
    expect(checkVisitAt(input, new Date('2026-12-31T17:00:00Z')).toISOString()).toBe('2027-01-31T01:00:00.000Z');
  });

  it('VIEW-08: day 30 is a calendar limit, not 720 elapsed hours', () => {
    expect(checkVisitAt('2026-03-02T19:00:00+07:00', new Date('2026-01-31T00:00:00+07:00')).toISOString())
      .toBe('2026-03-02T12:00:00.000Z');
    expect(() => checkVisitAt('2026-03-03T08:00:00+07:00', new Date('2026-01-31T00:00:00+07:00'))).toThrow(BadRequestException);
  });

  it('VIEW-08: an exact-hour row does not need legacy date/slot', () => {
    expect(viewingStart({ visitAt: new Date('2026-11-15T03:00:00Z'), visitDate: null, timeSlot: null }).toISOString())
      .toBe('2026-11-15T03:00:00.000Z');
  });

  it.each([['MORNING', '01'], ['AFTERNOON', '07'], ['EVENING', '11']])(
    'VIEW-08: legacy %s uses its existing Hanoi start without changing the row', (timeSlot, hour) => {
      const row = { visitAt: null, visitDate: new Date('2026-11-15T00:00:00Z'), timeSlot };
      expect(viewingStart(row).toISOString()).toBe(`2026-11-15T${hour}:00:00.000Z`);
      expect(row.visitAt).toBeNull();
      expect(row.visitDate.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    },
  );
});
