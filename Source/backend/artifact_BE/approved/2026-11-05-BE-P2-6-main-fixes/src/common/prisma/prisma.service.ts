import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// No $connect on init: Prisma connects on the first query, so the app boots without a DB.
// Interactive transactions get longer limits than Prisma's 5 s default: the pooler is remote
// (~0.8 s per query from Hà Nội), so a 6-8 query transaction (price approve, viewing booking) timed out.
// shortcut: fixed values, move to env vars if staging/production need different ones.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ transactionOptions: { maxWait: 10_000, timeout: 30_000 } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
