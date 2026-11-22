// Interactive-transaction time limit. Production keeps 30 s; the e2e run sets PRISMA_TX_TIMEOUT_MS higher because
// on the remote dev DB (0.3-0.8 s per query) a request queued behind an advisory lock spends that wait inside its
// own transaction (VIEW-16/21, owner 22/11/2026). A value below the default or not a whole number is ignored.
export const DEFAULT_TX_TIMEOUT_MS = 30_000;

export function txTimeoutMs(raw: string | undefined = process.env.PRISMA_TX_TIMEOUT_MS): number {
  const value = Number(raw);
  return raw !== undefined && raw !== '' && Number.isInteger(value) && value >= DEFAULT_TX_TIMEOUT_MS ? value : DEFAULT_TX_TIMEOUT_MS;
}
