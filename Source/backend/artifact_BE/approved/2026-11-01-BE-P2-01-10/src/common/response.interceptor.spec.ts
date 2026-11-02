// Side-effect import first: '@nestjs/common' loads the 'reflect-metadata' polyfill that
// class-transformer's @Type (used by pagination.ts, imported below) needs at decoration time.
// A `import type` alone would be erased at compile time and miss that side effect.
import '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { paginated } from './pagination.js';
import { ResponseInterceptor } from './response.interceptor.js';

// Unit test of the interceptor itself: no real HTTP server. The only outside edge
// (Nest's ExecutionContext) is faked since intercept() never reads it; CallHandler.handle()
// is a stub that just emits the given value, same role as a real handler's return value.
function run(value: unknown): Promise<unknown> {
  const interceptor = new ResponseInterceptor();
  const handler: CallHandler = { handle: () => of(value) };
  return new Promise((resolve) => {
    interceptor.intercept({} as ExecutionContext, handler).subscribe((result) => resolve(result));
  });
}

describe('BE-P2-03 / API-02: ResponseInterceptor wraps per PLAN CP-2 scenario table', () => {
  it('BE-P2-03 scenario 1: paginated(...) -> { data, meta } and no other top-level key', async () => {
    const result = await run(paginated([{ id: 1 }], 2, 20, 41));
    expect(result).toEqual({ data: [{ id: 1 }], meta: { page: 2, limit: 20, total: 41 } });
    expect(Object.keys(result as object).sort()).toEqual(['data', 'meta']);
  });

  it('BE-P2-03 scenario 2: plain object -> { data: obj }, no meta key at all', async () => {
    const result = await run({ id: 1, name: 'An' });
    expect(result).toEqual({ data: { id: 1, name: 'An' } });
    expect(result).not.toHaveProperty('meta');
  });

  it('BE-P2-03 scenario 3: plain array -> { data: [...] }', async () => {
    expect(await run([1, 2, 3])).toEqual({ data: [1, 2, 3] });
  });

  it('BE-P2-03 scenario 4: undefined handler result -> { data: null }', async () => {
    expect(await run(undefined)).toEqual({ data: null });
  });

  it('BE-P2-03 scenario 4: null handler result -> { data: null }', async () => {
    expect(await run(null)).toEqual({ data: null });
  });

  it('BE-P2-03 scenario 5: object that happens to carry data/meta keys but is not Paginated is wrapped whole, not unwrapped', async () => {
    const trap = { data: [1], meta: { page: 1, limit: 20, total: 1 } };
    expect(await run(trap)).toEqual({ data: trap });
  });

  it('BE-P2-03 scenario 6: empty list with total 0 still carries meta', async () => {
    const result = await run(paginated([], 1, 20, 0));
    expect(result).toEqual({ data: [], meta: { page: 1, limit: 20, total: 0 } });
  });
});
