import type { InvoiceStatus } from '@prisma/client';
import { formatMoney } from '../../common/money/format.js';

// BANK-03: the invoice id from "TT{id}" anywhere in the content (case-insensitive). Out-of-range ids never reach the DB.
export function invoiceCodeFrom(content: string): number | null {
  const m = /TT(\d+)/i.exec(content);
  const id = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(id) && id >= 1 && id <= 2147483647 ? id : null;
}

export type MatchOutcome = { match: true } | { match: false; note: string | null };

// BANK-03/BANK-04 with the reason shown to Boss (Q-P4-30).
export function matchOutcome(code: number | null, invoice: { status: InvoiceStatus; total: number } | null, amount: number): MatchOutcome {
  if (code === null) return { match: false, note: null };
  if (!invoice) return { match: false, note: `Nội dung TT${code} nhưng không có hóa đơn này` };
  if (invoice.status === 'PAID') return { match: false, note: `Hóa đơn TT${code} đã thanh toán` };
  if (invoice.status !== 'UNPAID') return { match: false, note: `Hóa đơn TT${code} không ở trạng thái chờ thanh toán` };
  if (invoice.total !== amount) return { match: false, note: `Nội dung TT${code} nhưng số tiền lệch (hóa đơn ${formatMoney(invoice.total)})` };
  return { match: true };
}
