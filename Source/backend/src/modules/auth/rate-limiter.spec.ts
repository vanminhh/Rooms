import { afterEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, RateLimiter } from './rate-limiter.js';

// Unit under test is the real RateLimiter; nothing is mocked except the clock, which is passed in as `now`
// (and, for the default-argument test, faked through vi.useFakeTimers).

const MIN = 60 * 1000;
const T0 = Date.parse('2026-10-29T10:00:00+07:00');

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BE-LOGIN-12: RateLimiter (AUTH-04)', () => {
  it('AUTH-04: constants are 5 failures per 15 minutes', () => {
    expect(RATE_LIMIT_MAX).toBe(5);
    expect(RATE_LIMIT_WINDOW_MS).toBe(900_000);
  });

  it('AUTH-04: 4 records are not blocked, the 5th blocks', () => {
    const rl = new RateLimiter();
    for (let i = 1; i <= 4; i++) {
      rl.record('0900000001', T0);
      expect(rl.isBlocked('0900000001', T0), `after ${i} records`).toBe(false);
    }
    rl.record('0900000001', T0);
    expect(rl.isBlocked('0900000001', T0)).toBe(true);
  });

  it('AUTH-04: a key never recorded is not blocked', () => {
    expect(new RateLimiter().isBlocked('0900000001', T0)).toBe(false);
  });

  it('AUTH-04: keys are independent', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.record('A', T0);
    expect(rl.isBlocked('A', T0)).toBe(true);
    expect(rl.isBlocked('B', T0)).toBe(false);
  });

  it('AUTH-04: a hit counts until exactly ts + 15 minutes (ts + 15 min - 1 ms blocked, ts + 15 min free)', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.record('k', T0);
    expect(rl.isBlocked('k', T0 + 15 * MIN - 1)).toBe(true);
    expect(rl.isBlocked('k', T0 + 15 * MIN)).toBe(false);
  });

  it('AUTH-04: sliding window, hits drop out one by one (not a fixed bucket)', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.record('k', T0 + i * MIN); // t0 .. t0+4min
    expect(rl.isBlocked('k', T0 + 15 * MIN - 1)).toBe(true); // the oldest hit is still inside
    expect(rl.isBlocked('k', T0 + 15 * MIN)).toBe(false); // oldest left, 4 remain
    rl.record('k', T0 + 15 * MIN); // a new failure makes it 5 again
    expect(rl.isBlocked('k', T0 + 15 * MIN)).toBe(true);
    expect(rl.isBlocked('k', T0 + 16 * MIN)).toBe(false); // t0+1min left, 4 remain
  });

  it('AUTH-04: isBlocked is read-only (asking never adds a hit)', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 4; i++) rl.record('k', T0);
    for (let i = 0; i < 20; i++) expect(rl.isBlocked('k', T0)).toBe(false);
    rl.record('k', T0);
    expect(rl.isBlocked('k', T0)).toBe(true);
  });

  it('Q2b: reset clears the key and only that key', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) {
      rl.record('a', T0);
      rl.record('b', T0);
    }
    rl.reset('a');
    expect(rl.isBlocked('a', T0)).toBe(false);
    expect(rl.isBlocked('b', T0)).toBe(true);
    // after a reset the key needs 5 fresh hits again
    for (let i = 0; i < 4; i++) rl.record('a', T0);
    expect(rl.isBlocked('a', T0)).toBe(false);
  });

  it('Q2b: reset of an unknown key does not throw', () => {
    expect(() => new RateLimiter().reset('never-seen')).not.toThrow();
  });

  it('AUTH-04: now defaults to the current clock (Date.now), faked here', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); // outside edge: the clock
    vi.setSystemTime(T0);
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.record('k');
    expect(rl.isBlocked('k')).toBe(true);
    vi.setSystemTime(T0 + 15 * MIN - 1);
    expect(rl.isBlocked('k')).toBe(true);
    vi.setSystemTime(T0 + 15 * MIN);
    expect(rl.isBlocked('k')).toBe(false);
  });

  it('AUTH-04: creates no timer (the Nest app must be able to close in tests)', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const rl = new RateLimiter();
    for (let i = 0; i < 6; i++) rl.record('k', T0);
    rl.isBlocked('k', T0);
    rl.reset('k');
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('BE-LOGIN-12: past 10 000 keys, keys with no hit left in the window are swept; live keys stay', () => {
    const rl = new RateLimiter();
    // Peeks at the private map: the sweep has no public effect except memory.
    const size = () => (rl as unknown as { hits: Map<string, number[]> }).hits.size;
    for (let i = 0; i <= 10_000; i++) rl.record(`dead-${i}`, T0); // 10 001 keys, all alive at T0, nothing swept yet
    expect(size()).toBe(10_001);
    rl.record('live', T0 + 1 * MIN);
    // 15 min after T0 every `dead-*` hit has left the window; `live` (T0 + 1 min) is still inside.
    rl.record('fresh', T0 + 15 * MIN);
    expect(size()).toBe(2);
    expect(rl.isBlocked('live', T0 + 15 * MIN)).toBe(false);
    for (let i = 0; i < 4; i++) rl.record('live', T0 + 15 * MIN); // 1 old + 4 new = 5 inside the window
    expect(rl.isBlocked('live', T0 + 15 * MIN)).toBe(true); // the sweep did not drop live hits
  });
});

describe('BE-LOGIN-12: RateLimiter.remove (AUTH-04, Q2d)', () => {
  it('AUTH-04: 5 hits at different times, remove one -> not blocked, and exactly 4 remain (one more hit blocks again)', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.record('k', T0 + i);
    expect(rl.isBlocked('k', T0 + 10)).toBe(true);
    rl.remove('k', T0 + 2);
    expect(rl.isBlocked('k', T0 + 10)).toBe(false);
    rl.record('k', T0 + 10); // 4 + 1 = 5 only if exactly one hit was removed
    expect(rl.isBlocked('k', T0 + 10)).toBe(true);
  });

  it('AUTH-04: remove takes out the hit with that exact ts, the others keep their own expiry', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.record('k', T0 + i * MIN);
    rl.remove('k', T0 + 3 * MIN);
    rl.record('k', T0 + 5 * MIN); // hits now t0, 1, 2, 4, 5 min
    expect(rl.isBlocked('k', T0 + 5 * MIN)).toBe(true);
    expect(rl.isBlocked('k', T0 + 15 * MIN - 1)).toBe(true); // t0 still inside
    expect(rl.isBlocked('k', T0 + 15 * MIN)).toBe(false); // t0 left -> 4 remain
  });

  it('AUTH-04: two hits with the same ts -> remove drops only ONE of them', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.record('k', T0);
    rl.remove('k', T0);
    expect(rl.isBlocked('k', T0)).toBe(false); // 4 left
    rl.record('k', T0);
    expect(rl.isBlocked('k', T0)).toBe(true); // 4 + 1; if remove had dropped all 5 this would be false
  });

  it('AUTH-04: remove of a ts that is not recorded changes nothing and does not throw', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.record('k', T0);
    expect(() => rl.remove('k', T0 + 1)).not.toThrow();
    expect(rl.isBlocked('k', T0)).toBe(true);
  });

  it('AUTH-04: remove on a key that does not exist does not throw and does not create a block', () => {
    const rl = new RateLimiter();
    expect(() => rl.remove('never-seen', T0)).not.toThrow();
    expect(rl.isBlocked('never-seen', T0)).toBe(false);
  });

  it('AUTH-04: remove touches only its own key', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) {
      rl.record('a', T0);
      rl.record('b', T0);
    }
    rl.remove('a', T0);
    expect(rl.isBlocked('a', T0)).toBe(false);
    expect(rl.isBlocked('b', T0)).toBe(true);
  });

  it('AUTH-04: removing the only hit leaves the key clean (a single later hit is not a block)', () => {
    const rl = new RateLimiter();
    rl.record('k', T0);
    rl.remove('k', T0);
    for (let i = 0; i < 4; i++) rl.record('k', T0 + 1);
    expect(rl.isBlocked('k', T0 + 1)).toBe(false); // 4 hits only
  });
});
