import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { addDays, HANOI_OFFSET_MS, hanoiMinutesOfDay, todayHanoi } from '../common/date/today.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { notifyRequestChange } from '../modules/requests/requests.service.js';
import { claimDailyRun } from './job-state.js';

@Injectable()
export class CloseIncidentsJob implements OnApplicationBootstrap {
  constructor(private readonly db: PrismaService) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV !== 'test' && hanoiMinutesOfDay() >= 480) await this.scheduled();
  }

  @Cron('0 8 * * *', { name: 'close-incidents', timeZone: 'Asia/Ho_Chi_Minh' })
  async scheduled() {
    try { await this.run(); }
    catch (e) { new Logger(CloseIncidentsJob.name).error('Không thể tự đóng sự cố', e instanceof Error ? e.stack : undefined); }
  }

  async run(now = new Date(), contractId?: number) {
    const today = todayHanoi(now);
    const before = new Date(addDays(today, -2).getTime() - HANOI_OFFSET_MS);
    return this.db.$transaction(async tx => {
      if (!await claimDailyRun(tx, 'close_incidents', today)) return 0;
      const rows = await tx.request.updateManyAndReturn({ where: { contractId, type: 'INCIDENT', status: 'RESOLVED', resolvedAt: { lt: before } },
        data: { status: 'CLOSED', closedAt: now }, select: { id: true, title: true, createdById: true, status: true } });
      for (const row of rows) await notifyRequestChange(tx, row);
      return rows.length;
    });
  }
}
