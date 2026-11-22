import { describe, expect, it } from 'vitest';
import { invoiceCodeFrom, matchOutcome } from './match-invoice.js';

// BANK-03, BANK-04 and the 17-bank acceptance cases; reasons per Q-P4-30.
describe('BANK-03 invoice code', () => {
  it('BANK-03: /TT(\\d+)/i anywhere in the content', () => {
    expect(['TT1523 P203', 'chuyen tien tt1523', 'NGUYEN VAN A TT1523', 'TT1523TT9'].map(invoiceCodeFrom)).toEqual([1523, 1523, 1523, 1523]);
  });

  it('BANK-04: no usable code → null (no digits, a space, 0, beyond the DB integer)', () => {
    expect(['Chuyen tien phong 203', 'TT', 'TT 1523', 'TT0', 'TT9999999999999', ''].map(invoiceCodeFrom)).toEqual([null, null, null, null, null, null]);
  });
});

describe('BANK-03/04 match outcome', () => {
  const unpaid = { status: 'UNPAID' as const, total: 3_119_000 };
  it('17-bank acceptance: "TT1523 P203" with the exact total matches', () => {
    expect(matchOutcome(1523, unpaid, 3_119_000)).toEqual({ match: true });
  });

  it('17-bank acceptance: 1 đ short stays UNMATCHED with the invoice total in the note', () => {
    expect(matchOutcome(1523, unpaid, 3_118_999)).toEqual({ match: false, note: 'Nội dung TT1523 nhưng số tiền lệch (hóa đơn 3.119.000 đ)' });
  });

  it('17-bank acceptance: a second transfer for a PAID invoice stays UNMATCHED', () => {
    expect(matchOutcome(1523, { status: 'PAID', total: 3_119_000 }, 3_119_000)).toEqual({ match: false, note: 'Hóa đơn TT1523 đã thanh toán' });
  });

  it('BANK-04: DRAFT, CANCELLED, SETTLED, unknown invoice or no code never match', () => {
    for (const status of ['DRAFT', 'CANCELLED', 'SETTLED'] as const) {
      expect(matchOutcome(1523, { status, total: 3_119_000 }, 3_119_000)).toEqual({ match: false, note: 'Hóa đơn TT1523 không ở trạng thái chờ thanh toán' });
    }
    expect(matchOutcome(1523, null, 3_119_000)).toEqual({ match: false, note: 'Nội dung TT1523 nhưng không có hóa đơn này' });
    expect(matchOutcome(null, null, 3_119_000)).toEqual({ match: false, note: null });
  });
});
