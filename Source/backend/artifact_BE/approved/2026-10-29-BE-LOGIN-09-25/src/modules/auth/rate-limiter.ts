export const RATE_LIMIT_MAX = 5; // AUTH-04
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const SWEEP_ABOVE_KEYS = 10_000;

// Sliding window: a hit counts while ts > now - window, so it stops counting exactly at ts + 15 minutes.
// shortcut: in-memory, single instance only; move to a shared store (DB/Redis) before running more than one instance
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  isBlocked(key: string, now: number = Date.now()): boolean {
    return this.recent(key, now).length >= RATE_LIMIT_MAX;
  }

  record(key: string, now: number = Date.now()): void {
    this.hits.set(key, [...this.recent(key, now), now]);
    if (this.hits.size > SWEEP_ABOVE_KEYS) this.sweep(now);
  }

  // Takes back one hit with this exact timestamp (a locked account's attempt, AUTH-02). Missing hit: no-op.
  remove(key: string, ts: number): void {
    const hits = this.hits.get(key);
    const i = hits?.indexOf(ts) ?? -1;
    if (hits && i !== -1) hits.splice(i, 1);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private recent(key: string, now: number): number[] {
    return (this.hits.get(key) ?? []).filter((ts) => ts > now - RATE_LIMIT_WINDOW_MS);
  }

  // No timer (the app must close cleanly in tests): drop dead keys only when the map grows big.
  private sweep(now: number): void {
    for (const key of this.hits.keys()) {
      if (this.recent(key, now).length === 0) this.hits.delete(key);
    }
  }
}
