import { describe, expect, it } from 'vitest';
import { fakeAdapter, parseProviderTime, secretEquals } from './webhook-adapter.js';

// BANK-01, 17-bank "Adapter", Q-P4-28 (test adapter), Q-P4-33 (time zone).
const item = (extra: object = {}) => ({ id: 'TX1', amount: 3_119_000, content: 'TT1523 P203', accountNumber: '0000000000', receivedAt: '2026-11-22 10:05:00', ...extra });

describe('BANK-01 test adapter', () => {
  it('BANK-01: the secret is compared exactly, whatever the lengths', () => {
    expect(secretEquals('s3cret', 's3cret')).toBe(true);
    expect(secretEquals('s3cret', 's3creT')).toBe(false);
    expect(secretEquals('s3cret', 's3cret-longer')).toBe(false);
    expect(secretEquals('', 's3cret')).toBe(false);
  });

  it('Q-P4-28: verify reads X-Webhook-Secret only; missing or repeated headers fail', () => {
    const req = (headers: Record<string, string | string[] | undefined>) => ({ headers, body: {} });
    expect(fakeAdapter.verify(req({ 'x-webhook-secret': 'abc' }), 'abc')).toBe(true);
    expect(fakeAdapter.verify(req({ 'x-webhook-secret': 'abd' }), 'abc')).toBe(false);
    expect(fakeAdapter.verify(req({}), 'abc')).toBe(false);
    expect(fakeAdapter.verify(req({ 'x-webhook-secret': ['abc', 'abc'] }), 'abc')).toBe(false);
    expect(fakeAdapter.verify(req({ authorization: 'abc' }), 'abc')).toBe(false);
  });

  it('17-bank Adapter: only well-formed credits are kept; the item itself is the raw payload (BANK-07)', () => {
    const { txs, skipped } = fakeAdapter.parse({ transactions: [
      item(), item({ id: 'DEBIT', amount: -500_000 }), item({ id: 'ZERO', amount: 0 }), item({ id: 'FRACTION', amount: 10.5 }),
      item({ id: '' }), item({ id: 'BADTIME', receivedAt: 'hôm qua' }), item({ id: 'BADACC', accountNumber: '12 34' }), 'junk',
    ] });
    expect(txs.map(t => t.providerTxId)).toEqual(['TX1']);
    expect(skipped).toBe(7);
    expect(txs[0]).toMatchObject({ amount: 3_119_000, content: 'TT1523 P203', accountNumber: '0000000000', raw: item() });
    expect(fakeAdapter.parse('nope')).toEqual({ txs: [], skipped: 0 });
    expect(fakeAdapter.parse({ transactions: 'nope' })).toEqual({ txs: [], skipped: 0 });
  });

  it('Q-P4-33: a time without an offset is Hà Nội time; an explicit offset is kept', () => {
    expect(parseProviderTime('2026-11-22 10:05:00')?.toISOString()).toBe('2026-11-22T03:05:00.000Z');
    expect(parseProviderTime('2026-11-22T10:05')?.toISOString()).toBe('2026-11-22T03:05:00.000Z');
    expect(parseProviderTime('2026-11-22T10:05:00Z')?.toISOString()).toBe('2026-11-22T10:05:00.000Z');
    expect(parseProviderTime('2026-11-22T10:05:00+07:00')?.toISOString()).toBe('2026-11-22T03:05:00.000Z');
    expect([parseProviderTime('2026-11-22'), parseProviderTime(1700000000), parseProviderTime('2026-13-40 10:00:00')]).toEqual([null, null, null]);
  });
});
