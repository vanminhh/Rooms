import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { syncRoomPrices, type RoomPriceSyncSummary } from '../modules/pricing/room-price-sync.js';

@Injectable()
export class RoomPriceSyncJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(RoomPriceSyncJob.name);

  constructor(private readonly prisma: PrismaService) {}

  // ScheduleModule is registered only outside tests (app.module.ts), so this is inert in tests.
  @Cron('0 1 * * *', { name: 'room-price-sync', timeZone: 'Asia/Ho_Chi_Minh' })
  async runDaily(): Promise<void> {
    await this.runSafely();
  }

  // Start-up run fixes days missed while the server was off (PRC-06).
  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await this.runSafely();
  }

  async sync(roomIds?: readonly number[]): Promise<RoomPriceSyncSummary> {
    const summary = await this.prisma.$transaction((tx) => syncRoomPrices(tx, roomIds));
    this.logger.log(
      `room price sync: scanned=${summary.scanned} updated=${summary.updated} `
        + `unchanged=${summary.unchanged} withoutApprovedPrice=${summary.withoutApprovedPrice}`,
    );
    return summary;
  }

  // A failed run must not crash the app; the next run (or the next start) retries it.
  private async runSafely(): Promise<void> {
    try {
      await this.sync();
    } catch (error) {
      this.logger.error('room price sync failed', error instanceof Error ? error.stack : String(error));
    }
  }
}
