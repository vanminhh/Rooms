import { describe, expect, it } from 'vitest';
import { DEFAULT_TX_TIMEOUT_MS, txTimeoutMs } from './tx-timeout.js';

// Owner 22/11/2026: only the e2e run raises the transaction limit; anything unusable falls back to 30 s.
describe('txTimeoutMs', () => {
  it('keeps 30 s when the variable is missing, empty, not a whole number, or lower than 30 s', () => {
    expect(DEFAULT_TX_TIMEOUT_MS).toBe(30_000);
    for (const raw of [undefined, '', 'abc', '45000.5', '-1', '0', '29999', ' ']) expect(txTimeoutMs(raw)).toBe(30_000);
  });

  it('uses a larger whole number as given', () => {
    expect(txTimeoutMs('30000')).toBe(30_000);
    expect(txTimeoutMs('120000')).toBe(120_000);
  });
});
