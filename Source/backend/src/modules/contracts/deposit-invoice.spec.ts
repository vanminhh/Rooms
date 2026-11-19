import { depositInvoiceView } from './deposit-invoice.js';

describe('BIL-10: deposit transfer details', () => {
  const invoice = { id: 1523, status: 'UNPAID' as const, total: 2_500_000, issueDate: new Date('2026-11-19'), dueDate: new Date('2026-11-30') };
  const bank = { bankBin: '970436', accountNo: '0000000000', accountName: 'TRỌ THÔNG MINH' };

  it('G-09/BIL-10: preserves the bank account and encodes transfer content and account holder', () => {
    const result = depositInvoiceView(invoice, bank);
    expect(result.vietqr).toEqual({ ...bank, amount: 2_500_000, content: 'TT1523' });
    const query = new URL(result.qrImageUrl!).searchParams;
    expect(query.get('accountName')).toBe(bank.accountName);
    expect(query.get('addInfo')).toBe('TT1523');
  });

  it.each(['PAID', 'CANCELLED', 'DRAFT', 'SETTLED'] as const)('BIL-10: %s has no transfer request', status => {
    expect(depositInvoiceView({ ...invoice, status })).toMatchObject({ vietqr: null, qrImageUrl: null });
  });
});
