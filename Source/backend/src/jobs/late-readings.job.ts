import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { addDays, formatDateOnly, formatDateVn, hanoiMinutesOfDay, todayHanoi } from '../common/date/today.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { emailTemplate } from '../modules/mailer/email-templates.js';
import { MailerService } from '../modules/mailer/mailer.service.js';
import { sendWithRetry } from '../modules/mailer/send-mail.js';
import { claimDailyRun } from './job-state.js';

export type LateReadingsOutcome = 'OUT_OF_WINDOW' | 'NOTHING_LATE' | 'ALREADY_RAN' | 'SENT' | 'NO_BOSS_EMAIL' | 'MAIL_FAILED';

// NOTI-10 (D-42): 08:00 from the 2nd to the 10th, one mail to Boss listing every MONTHLY DRAFT whose billing date
// has passed by at least one full day, grouped by building with its manager. Plus one Boss inbox row (NOTI-11, Q-P4-21).
@Injectable()
export class LateReadingsJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(LateReadingsJob.name);

  constructor(private readonly prisma: PrismaService, private readonly mailer: MailerService) {}

  @Cron('0 8 * * *', { name: 'late-readings', timeZone: 'Asia/Ho_Chi_Minh' })
  async runDaily(): Promise<void> {
    await this.runSafely();
  }

  // D-44 / NOTI-10: a start-up after a missed 08:00 sends that day's mail once, still only up to the 10th.
  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (hanoiMinutesOfDay() >= 8 * 60) await this.runSafely(); // before 08:00 the cron still comes today
  }

  async run(today = todayHanoi()): Promise<LateReadingsOutcome> {
    const day = today.getUTCDate();
    if (day < 2 || day > 10) return this.done('OUT_OF_WINDOW');
    // billing date = period_end + 1 < today, i.e. period_end < today − 1.
    const drafts = await this.prisma.invoice.findMany({
      where: { type: 'MONTHLY', status: 'DRAFT', periodEnd: { lt: addDays(today, -1) } },
      select: { id: true, periodNo: true, meterReadings: { where: { isOpening: false }, select: { kind: true } },
        contract: { select: { room: { select: { code: true } }, tenant: { select: { fullName: true } },
          building: { select: { id: true, name: true, waterMode: true, managerId: true, manager: { select: { fullName: true, isActive: true } } } } } } },
      orderBy: [{ contract: { buildingId: 'asc' } }, { periodEnd: 'asc' }, { id: 'asc' }],
    });
    if (drafts.length === 0) return this.done('NOTHING_LATE');
    // shortcut: drafts are read before the claim, so a draft issued in those milliseconds can still be listed once; harmless for a reminder.
    // Q-P4-16: claim and inbox row commit together, so a failed run gives the day back.
    const boss = await this.prisma.$transaction(async tx => {
      if (!await claimDailyRun(tx, 'late_readings', today)) return null;
      const user = await tx.user.findFirst({ where: { role: 'BOSS' }, select: { id: true, email: true } });
      if (!user) throw new Error('Boss account is missing');
      await tx.notification.create({ data: { userId: user.id, kind: 'ANNOUNCEMENT', title: `Còn ${drafts.length} hóa đơn tháng chờ chỉ số`, link: '/ql/chi-so' } });
      return user;
    });
    if (!boss) return this.done('ALREADY_RAN');
    if (!boss.email) return this.done('NO_BOSS_EMAIL');

    const list: string[] = [];
    let buildingId = 0;
    for (const draft of drafts) {
      const { building, room, tenant } = draft.contract;
      if (building.id !== buildingId) {
        buildingId = building.id;
        const manager = building.managerId && building.manager?.isActive ? building.manager.fullName : 'Boss (chưa có quản lý)';
        list.push(`${list.length ? '\n' : ''}Tòa ${building.name} – quản lý ${manager}`);
      }
      const has = (kind: string) => draft.meterReadings.some(r => r.kind === kind);
      // MTR-06: PER_PERSON water is recorded but never blocks the invoice, so it is not "missing" here.
      const missing = [!has('ELECTRIC') && 'điện', building.waterMode === 'PER_M3' && !has('WATER') && 'nước'].filter(Boolean);
      list.push(`  Phòng ${room.code} · ${tenant.fullName} · kỳ ${draft.periodNo} · ${missing.length ? `thiếu: ${missing.join(', ')}` : 'đủ chỉ số, chờ duyệt'}`);
    }
    try {
      await sendWithRetry(this.mailer, { to: boss.email, ...await emailTemplate(this.prisma, 'lateReadings', 'vi', {
        count: String(drafts.length), list: list.join('\n'), date: formatDateVn(today) }) }, `late-readings-${formatDateOnly(today)}`);
    } catch {
      return this.done('MAIL_FAILED', 'warn');
    }
    return this.done('SENT');
  }

  private done(outcome: LateReadingsOutcome, level: 'log' | 'warn' = 'log'): LateReadingsOutcome {
    this.logger[level](`late readings: ${outcome}`);
    return outcome;
  }

  private async runSafely(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error('late readings job failed', error instanceof Error ? error.stack : String(error));
    }
  }
}
