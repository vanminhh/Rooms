import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { txTimeoutMs } from './tx-timeout.js';

// No $connect on init: Prisma connects on the first query, so the app boots without a DB.
// Interactive transactions get longer limits than Prisma's 5 s default: the pooler is remote
// (~0.8 s per query from Hà Nội), so a 6-8 query transaction (price approve, viewing booking) timed out.
// The time limit comes from txTimeoutMs (30 s unless PRISMA_TX_TIMEOUT_MS raises it, as the e2e run does).
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ transactionOptions: { maxWait: 10_000, timeout: txTimeoutMs() } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
