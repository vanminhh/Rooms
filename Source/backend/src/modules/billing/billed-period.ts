import type { Prisma } from '@prisma/client';

// A waived, issued monthly bill still covers its period. Reissued originals
// have a replacement, while draft invoices merged at checkout have no issue date.
export const billedPeriod: Prisma.InvoiceWhereInput = {
  OR: [
    { status: { not: 'CANCELLED' } },
    { type: 'MONTHLY', status: 'CANCELLED', issueDate: { not: null }, replacedBy: null },
  ],
};

export const issuedPeriod = { AND: billedPeriod, status: { not: 'DRAFT' } } satisfies Prisma.InvoiceWhereInput;
