import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { todayHanoi } from '../common/date/today.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { createDueMonthlyDrafts, type MonthlyDraftSummary } from '../modules/billing/monthly-drafts.js';
import { switchDueRenewals, type RenewalSummary } from '../modules/billing/renewal-switch.js';

@Injectable()
export class MonthlyInvoiceJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(MonthlyInvoiceJob.name);

  constructor(private readonly prisma: PrismaService) {}

  // BIL-05 then BIL-06 at 00:05 Hà Nội. ScheduleModule is registered only outside tests (app.module.ts).
  @Cron('5 0 * * *', { name: 'monthly-invoice', timeZone: 'Asia/Ho_Chi_Minh' })
  async runDaily(): Promise<void> {
    await this.runSafely();
  }

  // D-21: the start-up run catches up billing dates of the last 7 days missed while the server was off.
  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await this.runSafely();
  }

  async run(today = todayHanoi()): Promise<{ drafts: MonthlyDraftSummary; renewals: RenewalSummary }> {
    const drafts = await createDueMonthlyDrafts(this.prisma, today);
    const renewals = await switchDueRenewals(this.prisma, today);
    this.logger.log(`monthly invoice: contracts=${drafts.contracts} created=${drafts.created} alreadyExisting=${drafts.alreadyExisting} `
      + `missedOver7Days=${drafts.missedOld} renewalsSwitched=${renewals.switched} renewalsWaiting=${renewals.waiting}`);
    return { drafts, renewals };
  }

  // A failed run must not crash the app; the next run (or the next start) retries it.
  private async runSafely(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error('monthly invoice job failed', error instanceof Error ? error.stack : String(error));
    }
  }
}
