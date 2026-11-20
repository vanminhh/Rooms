import { afterEach, describe, expect, it, vi } from 'vitest';

type Verify = (source: NodeJS.ProcessEnv, runner: (...args: any[]) => any, probe: (env: NodeJS.ProcessEnv) => Promise<boolean>) => Promise<number>;
type Runner = (...args: any[]) => { status: number | null };
// The CLI is JavaScript and also runs directly under Node; test its exported boundary.
const { verifyContractRegistrations } = await import(new URL('./verify-contract-registrations.mjs', import.meta.url).href) as { verifyContractRegistrations: Verify };
const source = { DATABASE_URL: 'postgresql://fixture:fixture-secret@localhost:5432/rooms', NODE_ENV: 'development', MAIL_PROVIDER: 'resend' };
afterEach(() => { vi.restoreAllMocks(); });

describe('BE-P3-27: registration verification CLI', () => {
  it('runs the two explicit E2E files sequentially and only then lists cleanup, with child-only environment changes', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const runner = vi.fn<Runner>(() => ({ status: 0 })); const probe = vi.fn(async () => true);
    const before = { ...source };
    expect(await verifyContractRegistrations(source, runner, probe)).toBe(0);
    expect(source).toEqual(before); expect(runner).toHaveBeenCalledTimes(2);
    expect(probe).toHaveBeenCalledWith(expect.objectContaining({ NODE_ENV: 'test', MAIL_PROVIDER: '' }));
    const [, args, options] = runner.mock.calls[0] as unknown as [string, string[], { env: NodeJS.ProcessEnv; shell: boolean; windowsHide: boolean }];
    expect(args).toEqual(['./node_modules/vitest/vitest.mjs', 'run', '--config', './vitest.config.e2e.ts',
      './test/contracts-registrations.e2e-spec.ts', './test/contracts.e2e-spec.ts', '--maxWorkers=1', '--no-file-parallelism']);
    expect(new URL(options.env.DATABASE_URL!).searchParams.get('connect_timeout')).toBe('30');
    expect(options.shell).toBe(false); expect(options.windowsHide).toBe(true);
    expect(runner.mock.calls[1][1]).toEqual(['./scripts/e2e/cleanup.mjs']);
    expect(JSON.stringify(log.mock.calls).includes('fixture-secret')).toBe(false);
  });
  it('does not start fixtures when the runtime database probe fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const runner = vi.fn(), probe = vi.fn(async () => false);
    expect(await verifyContractRegistrations(source, runner, probe)).toBe(1); expect(runner).not.toHaveBeenCalled();
  });
  it('does not expose raw probe errors or start children', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {}); const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runner = vi.fn();
    expect(await verifyContractRegistrations(source, runner, async () => { throw new Error('fixture-secret'); })).toBe(1);
    expect(runner).not.toHaveBeenCalled(); expect(JSON.stringify(error.mock.calls).includes('fixture-secret')).toBe(false);
  });
  it.each([1, 2, null])('returns a failed E2E status %s without running cleanup list', async status => {
    vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
    const runner = vi.fn(() => ({ status }));
    expect(await verifyContractRegistrations(source, runner, async () => true)).toBe(status ?? 1); expect(runner).toHaveBeenCalledTimes(1);
  });
  it('preserves an explicitly configured connection timeout', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const runner = vi.fn<Runner>(() => ({ status: 0 }));
    expect(await verifyContractRegistrations({ ...source, DATABASE_URL: `${source.DATABASE_URL}?connect_timeout=45` }, runner, async () => true)).toBe(0);
    expect(new URL(runner.mock.calls[0][2].env.DATABASE_URL).searchParams.get('connect_timeout')).toBe('45');
  });
});
