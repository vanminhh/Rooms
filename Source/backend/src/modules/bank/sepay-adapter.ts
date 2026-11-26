import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ErrorCode } from '../../common/errors/error-code.js';
import { fakeAdapter, parseProviderTime, type BankWebhookAdapter } from './webhook-adapter.js';

export const sepayAdapter: BankWebhookAdapter = {
  provider: 'SEPAY',
  verify({ headers, rawBody }, secret) {
    const signature = headers['x-sepay-signature'];
    const timestamp = headers['x-sepay-timestamp'];
    if (!secret || !rawBody || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)
      || typeof timestamp !== 'string' || !/^\d{1,12}$/.test(timestamp)
      || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
    const expected = createHmac('sha256', secret).update(timestamp + '.').update(rawBody).digest();
    return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
  },
  parse(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException(ErrorCode.VALIDATION_FAILED);
    const item = body as Record<string, unknown>;
    if (item.transferType === 'out') return { txs: [], skipped: 1 };
    const { id, transferAmount: amount, accountNumber, content, transactionDate } = item;
    const receivedAt = parseProviderTime(transactionDate);
    if (item.transferType !== 'in' || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0
      || typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > 2147483647
      || typeof accountNumber !== 'string' || !/^[A-Za-z0-9]{1,30}$/.test(accountNumber)
      || typeof content !== 'string' || !receivedAt) throw new BadRequestException(ErrorCode.VALIDATION_FAILED);
    return { txs: [{ providerTxId: String(id), amount, accountNumber, content, receivedAt, raw: item as Prisma.InputJsonObject }], skipped: 0 };
  },
};

export function configuredBankAdapter(): BankWebhookAdapter {
  return process.env.NODE_ENV === 'test' ? fakeAdapter : sepayAdapter;
}
