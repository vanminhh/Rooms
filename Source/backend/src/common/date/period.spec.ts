import { formatDateOnly, parseDateOnly } from './today.js';
import { billingMonthOf, contractEndDate, contractPeriods, contractTermProgress, dueDateOfBillingMonth, dueDateOfPeriod, periodContaining, periodsDue, proratedAmount } from './period.js';

function date(value: string): Date {
  const parsed = parseDateOnly(value);
  if (!parsed) throw new Error(`Invalid test date: ${value}`);
  return parsed;
}

describe('BE-P3-01: calendar-month contract periods', () => {
  it('FE-P3-12/D-41: term progress clamps before start and after the inclusive last day', () => {
    expect(contractTermProgress(date('2027-01-01'), date('2027-01-31'), date('2026-12-31'))).toEqual({ elapsedDays: 0, totalDays: 31, percent: 0 });
    expect(contractTermProgress(date('2027-01-01'), date('2027-01-31'), date('2027-01-16'))).toEqual({ elapsedDays: 15, totalDays: 31, percent: 48 });
    expect(contractTermProgress(date('2027-01-01'), date('2027-01-31'), date('2027-02-01'))).toEqual({ elapsedDays: 31, totalDays: 31, percent: 100 });
  });
  it('BIL-01 / BIL-08: six full months end on 28/02/2027 and the first invoice is due on 09/10/2026', () => {
    expect(formatDateOnly(contractEndDate(date('2026-09-01'), 6))).toBe('2027-02-28');
    const periods = contractPeriods(date('2026-09-01'), 6);
    expect(periods.map(({ periodNo, periodStart, periodEnd, billingDate, isPartial }) => ({
      periodNo,
      start: formatDateOnly(periodStart),
      end: formatDateOnly(periodEnd),
      billing: formatDateOnly(billingDate),
      isPartial,
    }))).toEqual([
      { periodNo: 1, start: '2026-09-01', end: '2026-09-30', billing: '2026-10-01', isPartial: false },
      { periodNo: 2, start: '2026-10-01', end: '2026-10-31', billing: '2026-11-01', isPartial: false },
      { periodNo: 3, start: '2026-11-01', end: '2026-11-30', billing: '2026-12-01', isPartial: false },
      { periodNo: 4, start: '2026-12-01', end: '2026-12-31', billing: '2027-01-01', isPartial: false },
      { periodNo: 5, start: '2027-01-01', end: '2027-01-31', billing: '2027-02-01', isPartial: false },
      { periodNo: 6, start: '2027-02-01', end: '2027-02-28', billing: '2027-03-01', isPartial: false },
    ]);
    expect(formatDateOnly(dueDateOfBillingMonth(date('2026-10-01')))).toBe('2026-10-09');
  });

  it('BIL-02: 31/01/2027 for three months clamps to 29/04 and prorates both edges', () => {
    const periods = contractPeriods(date('2027-01-31'), 3);
    expect(formatDateOnly(contractEndDate(date('2027-01-31'), 3))).toBe('2027-04-29');
    expect(periods.map((p) => [formatDateOnly(p.periodStart), formatDateOnly(p.periodEnd), p.isPartial])).toEqual([
      ['2027-01-31', '2027-01-31', true],
      ['2027-02-01', '2027-02-28', false],
      ['2027-03-01', '2027-03-31', false],
      ['2027-04-01', '2027-04-29', true],
    ]);
    expect(periods.map((p) => proratedAmount(2_500_000, p.periodStart, p.periodEnd)))
      .toEqual([80_645, 2_500_000, 2_500_000, 2_416_667]);
  });

  it('BIL-22: 20/03/2027 has 12/31 first month, five full months and 19/30 last month', () => {
    const periods = contractPeriods(date('2027-03-20'), 6);
    expect(formatDateOnly(contractEndDate(date('2027-03-20'), 6))).toBe('2027-09-19');
    expect(periods.map((p) => [formatDateOnly(p.periodStart), formatDateOnly(p.periodEnd), p.isPartial])).toEqual([
      ['2027-03-20', '2027-03-31', true],
      ['2027-04-01', '2027-04-30', false],
      ['2027-05-01', '2027-05-31', false],
      ['2027-06-01', '2027-06-30', false],
      ['2027-07-01', '2027-07-31', false],
      ['2027-08-01', '2027-08-31', false],
      ['2027-09-01', '2027-09-19', true],
    ]);
    expect(periods.map((p) => proratedAmount(2_500_000, p.periodStart, p.periodEnd)))
      .toEqual([967_742, 2_500_000, 2_500_000, 2_500_000, 2_500_000, 2_500_000, 1_583_333]);
    expect(formatDateOnly(periods.at(-1)!.billingDate)).toBe('2027-09-20');
  });

  it('D-41: 2028 leap February has 29 days and a 10/29 partial month', () => {
    const full = contractPeriods(date('2028-01-31'), 3);
    expect(formatDateOnly(full[1].periodEnd)).toBe('2028-02-29');
    expect(full[1].isPartial).toBe(false);
    const partial = contractPeriods(date('2028-02-20'), 3)[0];
    expect(formatDateOnly(partial.periodEnd)).toBe('2028-02-29');
    expect(proratedAmount(2_500_000, partial.periodStart, partial.periodEnd)).toBe(862_069);
  });

  it('BIL-03: a renewal starts the day after the previous end, splitting that month without a gap', () => {
    const oldEnd = contractEndDate(date('2027-03-20'), 3);
    expect(formatDateOnly(oldEnd)).toBe('2027-06-19');
    const renewal = contractPeriods(date('2027-06-20'), 3);
    expect(formatDateOnly(renewal[0].periodStart)).toBe('2027-06-20');
    expect(formatDateOnly(renewal[0].periodEnd)).toBe('2027-06-30');
    expect(renewal[0].isPartial).toBe(true);
  });

  it('BIL-04: the terminal period ends exactly at end_date and no period extends beyond it', () => {
    const end = contractEndDate(date('2027-01-31'), 3);
    const periods = contractPeriods(date('2027-01-31'), 3);
    expect(periods.at(-1)!.periodEnd.getTime()).toBe(end.getTime());
    expect(periods.every((period) => period.periodEnd.getTime() <= end.getTime())).toBe(true);
    expect(formatDateOnly(periods.at(-1)!.billingDate)).toBe('2027-04-30');
  });

  it('A-21 / G-01: rounds a half đồng up once and rejects noninteger or negative amounts', () => {
    expect(proratedAmount(15, date('2027-04-01'), date('2027-04-01'))).toBe(1);
    expect(() => proratedAmount(-1, date('2027-04-01'), date('2027-04-30'))).toThrow(RangeError);
    expect(() => proratedAmount(1.5, date('2027-04-01'), date('2027-04-30'))).toThrow(RangeError);
  });
});

describe('BE-P4-01: billing month, due date, period of a date, periods due', () => {
  const p = contractPeriods(new Date('2026-09-01T00:00:00Z'), 6); // BIL-01
  const day = (s: string) => new Date(`${s}T00:00:00Z`);

  it('BIL-01, BIL-08: period 1 (01/09–30/09/2026) belongs to October and is due on 09/10/2026', () => {
    expect(billingMonthOf(p[0])).toEqual(day('2026-10-01'));
    expect(dueDateOfPeriod(p[0])).toEqual(day('2026-10-09'));
  });

  it('BIL-22, D-40: a last period ending 19/09/2027 belongs to October and is due on 09/10/2027, never before it ends', () => {
    const last = contractPeriods(day('2027-03-20'), 6).at(-1)!;
    expect(dueDateOfPeriod(last)).toEqual(day('2027-10-09'));
  });

  it('BIL-13: 25/11/2026 is in period j = 3 (November); on or after end_date it is the last period; before start none', () => {
    expect(periodContaining(p, day('2026-11-25'))?.periodNo).toBe(3);
    expect(periodContaining(p, day('2027-02-28'))?.periodNo).toBe(6);
    expect(periodContaining(p, day('2027-05-01'))?.periodNo).toBe(6);
    expect(periodContaining(p, day('2026-08-31'))).toBeNull();
  });

  it('BIL-05: on 30/09 no period is due; on 01/10 period 1 is; on 01/03/2027 all six are', () => {
    expect(periodsDue(p, day('2026-09-30'))).toEqual([]);
    expect(periodsDue(p, day('2026-10-01')).map((x) => x.periodNo)).toEqual([1]);
    expect(periodsDue(p, day('2027-03-01')).map((x) => x.periodNo)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
