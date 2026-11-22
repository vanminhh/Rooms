import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module.js';
import { InvoiceReminderJob } from '../../jobs/invoice-reminder.job.js';
import { LateReadingsJob } from '../../jobs/late-readings.job.js';
import { MailerModule } from '../mailer/mailer.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { MyNotificationsController } from './my-notifications.controller.js';
import { MyNotificationsService } from './my-notifications.service.js';

@Module({
  imports: [PrismaModule, MailerModule],
  controllers: [DashboardController, MyNotificationsController],
  providers: [DashboardService, MyNotificationsService, LateReadingsJob, InvoiceReminderJob],
})
export class NotificationsModule {}
