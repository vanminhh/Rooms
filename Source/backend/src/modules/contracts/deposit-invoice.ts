import { InternalServerErrorException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { formatDateOnly } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';

export const DEPOSIT_INVOICE_SELECT = {
  id: true, status: true, total: true, issueDate: true, dueDate: true,
} satisfies Prisma.InvoiceSelect;

type DepositInvoice = Prisma.InvoiceGetPayload<{ select: typeof DEPOSIT_INVOICE_SELECT }>;

// BIL-10 / G-09: the transfer content is derived from the invoice ID.
export function depositInvoiceView(invoice: DepositInvoice, setting?: Prisma.JsonValue | null) {
  let vietqr = null;
  let qrImageUrl = null;
  if (invoice.status === 'UNPAID') {
    const bank = setting && typeof setting === 'object' && !Array.isArray(setting) ? setting : {};
    const { bankBin, accountNo, accountName } = bank;
    if (typeof bankBin !== 'string' || !/^\d{6}$/.test(bankBin) ||
        typeof accountNo !== 'string' || !/^[A-Za-z0-9]{1,30}$/.test(accountNo) ||
        typeof accountName !== 'string' || !accountName.trim()) {
      throw new InternalServerErrorException(ErrorCode.INTERNAL_ERROR);
    }
    const content = `TT${invoice.id}`;
    vietqr = { bankBin, accountNo, accountName, amount: invoice.total, content };
    const query = new URLSearchParams({ amount: String(invoice.total), addInfo: content, accountName });
    qrImageUrl = `https://img.vietqr.io/image/${bankBin}-${accountNo}-compact2.png?${query}`;
  }
  return {
    ...invoice,
    issueDate: invoice.issueDate ? formatDateOnly(invoice.issueDate) : null,
    dueDate: invoice.dueDate ? formatDateOnly(invoice.dueDate) : null,
    vietqr, qrImageUrl,
  };
}
