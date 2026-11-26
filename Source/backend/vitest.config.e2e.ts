import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Drafts (pending or approved) never run against the dev DB; e2e runs only on applied files.
    exclude: [...configDefaults.exclude, 'artifact_BE/**'],
    // The dev DB is remote (~0.8 s per query), so fixtures that create many rows need more than the 5 s / 60 s defaults.
    // The e2e run loads the real .env; an empty provider keeps every mail on the console mailer (Q-14).
    // PRISMA_TX_TIMEOUT_MS: requests queued on one advisory lock wait inside their transaction; on the remote dev DB
    // that wait alone can pass the 30 s production limit (VIEW-16/21, owner 22/11/2026). Production keeps 30 s.
    env: { MAIL_PROVIDER: '', ANTHROPIC_API_KEY: '', PRISMA_TX_TIMEOUT_MS: '120000' },
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
