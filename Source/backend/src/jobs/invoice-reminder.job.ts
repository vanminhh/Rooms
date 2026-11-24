import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { addDays, formatDateOnly, formatDateVn, hanoiMinutesOfDay, todayHanoi } from '../common/date/today.js';
import { mailLocale } from '../common/i18n/locale.js';
import { formatMoney } from '../common/money/format.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { emailTemplate } from '../modules/mailer/email-templates.js';
import { MailerService, type Mail } from '../modules/mailer/mailer.service.js';
import { sendWithRetry } from '../modules/mailer/send-mail.js';
import { responsibleStaffIds } from '../modules/notifications/notify.js';
import { claimDailyRun } from './job-state.js';
import { daysBetween, expiringNoticeDays, isOverdueReminderDay } from './reminder-rules.js';

export interface ReminderSummary { status: 'NOTHING_DUE' | 'ALREADY_RAN' | 'DONE'; dueTomorrow: number; overdue: number; expiring: number; mails: number; mailFailures: number }

const TENANT = { select: { id: true, fullName: true, role: true, locale: true, email: true, emailVerifiedAt: true } } satisfies Prisma.UserDefaultArgs;
const INVOICE = { id: true, total: true, dueDate: true,
  contract: { select: { buildingId: true, room: { select: { code: true } }, tenant: TENANT } } } satisfies Prisma.InvoiceSelect;
const money = formatMoney;
// Same rule as the invoice-issued mail (issue-monthly.ts): tenants get mail only at a verified address (NOTI-04).
const tenantEmail = (t: { email: string | null; emailVerifiedAt: Date | null }) => (t.email && t.emailVerifiedAt ? t.email : null);

// NOTI-05 at 08:00 (Q-P4-17..19, Q-P4-22, Q-P4-23): invoices due tomorrow (mail only); overdue on day 1, 4, 7, …
// (tenant row + mail, staff row); contracts ending in 30 or 7 days without renewal or settlement (tenant row + mail,
// staff row, one digest mail per staff member). Staff rows go to the building's responsible user (NOTI-11, SCOPE-04).
@Injectable()
export class InvoiceReminderJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(InvoiceReminderJob.name);

  constructor(private readonly prisma: PrismaService, private readonly mailer: MailerService) {}

  @Cron('0 8 * * *', { name: 'invoice-reminders', timeZone: 'Asia/Ho_Chi_Minh' })
  async runDaily(): Promise<void> {
    await this.runSafely();
  }

  // D-44, Q-P4-4: a start-up after a missed 08:00 catches today up once; earlier missed days are skipped.
  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (hanoiMinutesOfDay() >= 8 * 60) await this.runSafely();
  }

  async run(today = todayHanoi()): Promise<ReminderSummary> {
    const unpaid = { status: 'UNPAID' } as const; // every type with a due date: DEPOSIT, MONTHLY, FINAL (Q-P4-23)
    const due = await this.prisma.invoice.findMany({ where: { ...unpaid, dueDate: addDays(today, 1) }, select: INVOICE, orderBy: { id: 'asc' } });
    const overdue = (await this.prisma.invoice.findMany({ where: { ...unpaid, dueDate: { lt: today } }, select: INVOICE, orderBy: { id: 'asc' } }))
      .filter(i => isOverdueReminderDay(i.dueDate!, today));
    const expiring = await this.prisma.contract.findMany({
      where: { status: 'ACTIVE', endDate: { in: [addDays(today, 30), addDays(today, 7)] }, OR: [{ nextContract: null }, { nextContract: { status: 'CANCELLED' } }], settlement: null },
      select: { id: true, code: true, endDate: true, buildingId: true, room: { select: { code: true } }, building: { select: { name: true } }, tenant: TENANT },
      orderBy: [{ endDate: 'asc' }, { id: 'asc' }] });
    const summary: ReminderSummary = { status: 'DONE', dueTomorrow: due.length, overdue: overdue.length, expiring: expiring.length, mails: 0, mailFailures: 0 };
    if (!due.length && !overdue.length && !expiring.length) return this.done({ ...summary, status: 'NOTHING_DUE' });

    const day = formatDateOnly(today);
    const mails: { mail: Mail; key: string }[] = [];
    const tenantMail = async (to: string | null, lang: 'vi' | 'en', kind: Parameters<typeof emailTemplate>[1], values: Record<string, string>, key: string) => {
      if (to) mails.push({ mail: { to, ...await emailTemplate(this.prisma, kind, lang, values) }, key: `${key}-${day}` });
    };
    // shortcut: lists are read before the claim, so an invoice paid in those milliseconds can still get one reminder; re-read inside the transaction if that ever matters.
    // Q-P4-16: the claim is the transaction's first write, so a failed run releases the day and a parallel run waits, then skips.
    const claimed = await this.prisma.$transaction(async tx => {
      if (!await claimDailyRun(tx, 'invoice_reminders', today)) return false;
      for (const i of due) {
        await tenantMail(tenantEmail(i.contract.tenant), mailLocale(i.contract.tenant), 'invoiceDueTomorrow',
          { code: `TT${i.id}`, total: money(i.total), dueDate: formatDateVn(i.dueDate!), room: i.contract.room.code }, `invoice-due-tomorrow-${i.id}`);
      }
      const staff = await responsibleStaffIds(tx, [...overdue.map(i => i.contract.buildingId), ...expiring.map(c => c.buildingId)]);
      const rows: Prisma.NotificationCreateManyInput[] = [];
      for (const i of overdue) {
        const days = daysBetween(i.dueDate!, today);
        const body = `Số tiền ${money(i.total)}. Hạn thanh toán ${formatDateVn(i.dueDate!)}.`;
        rows.push({ userId: i.contract.tenant.id, kind: 'INVOICE_OVERDUE', title: `Hóa đơn TT${i.id} đã quá hạn ${days} ngày`, body, link: `/thue/hoa-don/${i.id}` },
          { userId: staff.get(i.contract.buildingId)!, kind: 'INVOICE_OVERDUE', title: `Hóa đơn TT${i.id} phòng ${i.contract.room.code} đã quá hạn ${days} ngày`, body, link: `/ql/hoa-don/${i.id}` });
        await tenantMail(tenantEmail(i.contract.tenant), mailLocale(i.contract.tenant), 'invoiceOverdue',
          { code: `TT${i.id}`, total: money(i.total), days: String(days), dueDate: formatDateVn(i.dueDate!), room: i.contract.room.code }, `invoice-overdue-${i.id}`);
      }
      const digest = new Map<number, string[]>();
      for (const c of expiring) {
        const days = expiringNoticeDays(c.endDate, today)!;
        const endDate = formatDateVn(c.endDate);
        const staffId = staff.get(c.buildingId)!;
        rows.push({ userId: c.tenant.id, kind: 'CONTRACT_EXPIRING', title: `Hợp đồng ${c.code} hết hạn ngày ${endDate}`, link: `/thue/hop-dong/${c.id}` },
          { userId: staffId, kind: 'CONTRACT_EXPIRING', title: `Hợp đồng ${c.code} phòng ${c.room.code} hết hạn ngày ${endDate}`, link: `/ql/hop-dong/${c.id}` });
        await tenantMail(tenantEmail(c.tenant), mailLocale(c.tenant), 'contractExpiringTenant',
          { code: c.code, endDate, days: String(days), room: c.room.code }, `contract-expiring-${c.id}-${days}`);
        digest.set(staffId, [...digest.get(staffId) ?? [], `${c.building.name} · phòng ${c.room.code} · ${c.code} · ${c.tenant.fullName} · hết hạn ${endDate} (còn ${days} ngày)`]);
      }
      await tx.notification.createMany({ data: rows });
      // Q-P4-22: one digest per staff member per day; staff mail needs only an address (NOTI-04) and is Vietnamese (LOC-06).
      const staffUsers = digest.size ? await tx.user.findMany({ where: { id: { in: [...digest.keys()] } }, select: { id: true, email: true } }) : [];
      for (const u of staffUsers) {
        const list = digest.get(u.id)!;
        if (u.email) mails.push({ mail: { to: u.email, ...await emailTemplate(tx, 'contractExpiringStaff', 'vi',
          { count: String(list.length), list: list.join('\n'), date: formatDateVn(today) }) }, key: `contract-expiring-staff-${u.id}-${day}` });
      }
      return true;
    });
    if (!claimed) return this.done({ ...summary, status: 'ALREADY_RAN' });

    // NOTI-07: after commit; a failure is logged and never stops the other mails.
    for (const { mail, key } of mails) {
      try {
        await sendWithRetry(this.mailer, mail, key);
        summary.mails++;
      } catch {
        summary.mailFailures++;
        this.logger.warn(`reminder mail ${key} failed after retry`);
      }
    }
    return this.done(summary);
  }

  private done(summary: ReminderSummary): ReminderSummary {
    this.logger.log(`invoice reminders: ${summary.status} dueTomorrow=${summary.dueTomorrow} overdue=${summary.overdue} `
      + `expiring=${summary.expiring} mails=${summary.mails} mailFailures=${summary.mailFailures}`);
    return summary;
  }

  private async runSafely(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error('invoice reminder job failed', error instanceof Error ? error.stack : String(error));
    }
  }
}
