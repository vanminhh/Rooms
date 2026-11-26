import { createHash, timingSafeEqual } from 'node:crypto';
import type { BankProvider, Prisma } from '@prisma/client';
import { HANOI_OFFSET_MS, parseDateOnly } from '../../common/date/today.js';

export interface WebhookRequest { headers: Record<string, string | string[] | undefined>; body: unknown; rawBody?: Buffer }
export const BANK_ADAPTER = Symbol('BANK_ADAPTER');
export interface IncomingTx { providerTxId: string; amount: number; content: string; accountNumber: string; receivedAt: Date; raw: Prisma.InputJsonValue }

// 17-bank "Adapter": the real provider (Q-03) plugs in as another implementation; the service only sees IncomingTx.
export interface BankWebhookAdapter {
  provider: BankProvider;
  verify(req: WebhookRequest, secret: string): boolean;
  // Debits are skipped. A production adapter rejects malformed credit payloads.
  parse(body: unknown): { txs: IncomingTx[]; skipped: number };
}

// BANK-01: constant time and length-hiding (both sides hashed to 32 bytes).
export function secretEquals(a: string, b: string): boolean {
  const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest();
  return timingSafeEqual(hash(a), hash(b));
}

// Q-P4-33: a timestamp without an offset is Asia/Ho_Chi_Minh time.
export function parseProviderTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const local = /^(\d{4}-\d{2}-\d{2})[ T]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  const day = local ? parseDateOnly(local[1]) : null; // rejects 2026-13-40
  const date = local
    ? day && new Date(day.getTime() + ((+local[2] * 60 + +local[3]) * 60 + +(local[4] ?? 0)) * 1000 - HANOI_OFFSET_MS)
    : /(Z|[+-]\d{2}:?\d{2})$/i.test(value) ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

const object = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

// Q-P4-28: test fixtures use a shared header and a batch of credits; rows use the SEPAY provider.
export const fakeAdapter: BankWebhookAdapter = {
  provider: 'SEPAY',
  verify(req, secret) {
    const header = req.headers['x-webhook-secret'];
    return typeof header === 'string' && secretEquals(header, secret);
  },
  parse(body) {
    const items = object(body)?.transactions;
    if (!Array.isArray(items)) return { txs: [], skipped: 0 };
    const txs: IncomingTx[] = [];
    for (const item of items) {
      const t = object(item);
      const id = typeof t?.id === 'number' || typeof t?.id === 'string' ? String(t.id).trim() : '';
      const receivedAt = parseProviderTime(t?.receivedAt);
      const amount = t?.amount;
      if (!t || !id || id.length > 100 || typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647
        || typeof t.content !== 'string' || typeof t.accountNumber !== 'string' || !/^[A-Za-z0-9]{1,30}$/.test(t.accountNumber) || !receivedAt) continue;
      txs.push({ providerTxId: id, amount, content: t.content, accountNumber: t.accountNumber, receivedAt, raw: t as Prisma.InputJsonObject });
    }
    return { txs, skipped: items.length - txs.length };
  },
};
