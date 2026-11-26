import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configuredBankAdapter, sepayAdapter } from './sepay-adapter.js';
import { fakeAdapter } from './webhook-adapter.js';

// Fields and values from SePay's official webhook integration example.
const sample = {
  id: 92704, gateway: 'Vietcombank', transactionDate: '2024-07-02 11:08:33', accountNumber: '1017588888',
  subAccount: '', code: 'SEVN63DC8E5C', content: 'SEVN63DC8E5C chuyen tien', transferType: 'in',
  description: 'NGUYEN VAN A chuyen tien', transferAmount: 5000000, accumulated: 105000000, referenceCode: 'FT24012345678',
};
const key = 'fixture-only-signing-key';

describe('SePay production adapter', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it('BANK-01: signs timestamp and original bytes, validates header types and the five-minute window', () => {
    vi.useFakeTimers();
    const timestamp = '1800000000';
    const rawBody = Buffer.from(JSON.stringify(sample, null, 2));
    const signature = 'sha256=' + createHmac('sha256', key).update(Buffer.concat([Buffer.from(timestamp + '.'), rawBody])).digest('hex');
    const headers = { 'x-sepay-timestamp': timestamp, 'x-sepay-signature': signature };
    const req = { headers, body: sample, rawBody };
    for (const seconds of [-301, -300, 0, 300, 301]) {
      vi.setSystemTime((Number(timestamp) + seconds) * 1000);
      expect(sepayAdapter.verify(req, key)).toBe(Math.abs(seconds) <= 300);
    }
    vi.setSystemTime(Number(timestamp) * 1000);
    expect(sepayAdapter.verify(req, 'wrong')).toBe(false);
    expect(sepayAdapter.verify({ ...req, rawBody: Buffer.from(JSON.stringify(sample)) }, key)).toBe(false);
    expect(sepayAdapter.verify({ ...req, rawBody: undefined }, key)).toBe(false);
    expect(sepayAdapter.verify({ ...req, headers: { ...headers, 'x-sepay-signature': [signature] } }, key)).toBe(false);
    expect(sepayAdapter.verify({ ...req, headers: { 'x-webhook-secret': key } }, key)).toBe(false);
  });

  it('BANK-02/07: maps the documented payload, preserves the raw event and skips debits', () => {
    expect(sepayAdapter.parse(sample)).toEqual({ txs: [{ providerTxId: '92704', amount: 5000000, accountNumber: '1017588888',
      content: sample.content, receivedAt: new Date('2024-07-02T04:08:33Z'), raw: sample }], skipped: 0 });
    expect(sepayAdapter.parse({ ...sample, transferType: 'out' })).toEqual({ txs: [], skipped: 1 });
    for (const invalid of [{ transferAmount: 1.5 }, { id: Number.MAX_SAFE_INTEGER + 1 }, { transactionDate: 'bad' }]) {
      expect(() => sepayAdapter.parse({ ...sample, ...invalid })).toThrow();
    }
  });

  it('BANK-01: only the test environment selects the fake adapter', () => {
    for (const mode of ['production', 'development', 'test']) {
      vi.stubEnv('NODE_ENV', mode);
      expect(configuredBankAdapter()).toBe(mode === 'test' ? fakeAdapter : sepayAdapter);
    }
  });
});
