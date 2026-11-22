import type { Prisma } from '@prisma/client';
import { mailLocale } from '../../common/i18n/locale.js';
import { formatMoney } from '../../common/money/format.js';
import { emailTemplate } from '../mailer/email-templates.js';
import type { Mail } from '../mailer/mailer.service.js';
import { notifyBuildingStaff } from '../notifications/notify.js';

// BIL-11, BANK-03, BANK-05: "Đã nhận tiền" for every way an invoice gets paid. Tenant row (+ mail to a verified address,
// Q-P4-1, NOTI-04) and a row for the building's responsible staff (Q-P4-27, Q-P4-31, NOTI-11). The caller sends the mail after commit.
export async function paymentReceivedNotice(tx: Prisma.TransactionClient, invoiceId: number): Promise<Mail | null> {
  const { total, contract: c } = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { total: true, contract: { select: {
    buildingId: true, tenantId: true, room: { select: { code: true } },
    tenant: { select: { role: true, locale: true, email: true, emailVerifiedAt: true } } } } } });
  const amount = formatMoney(total);
  await tx.notification.create({ data: { userId: c.tenantId, kind: 'PAYMENT_RECEIVED', title: `Đã nhận ${amount} cho hóa đơn TT${invoiceId}`, link: `/thue/hoa-don/${invoiceId}` } });
  await notifyBuildingStaff(tx, c.buildingId, { kind: 'PAYMENT_RECEIVED', title: `Đã nhận ${amount} cho hóa đơn TT${invoiceId} phòng ${c.room.code}`, link: `/ql/hoa-don/${invoiceId}` });
  const to = c.tenant.email && c.tenant.emailVerifiedAt ? c.tenant.email : null;
  return to ? { to, ...await emailTemplate(tx, 'paymentReceived', mailLocale(c.tenant), { code: `TT${invoiceId}`, total: amount, room: c.room.code }) } : null;
}
