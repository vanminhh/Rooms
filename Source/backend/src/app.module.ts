import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { BuildingsModule } from './modules/buildings/buildings.module.js';
import { RoomsModule } from './modules/rooms/rooms.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { ViewingsModule } from './modules/viewings/viewings.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ContractsModule } from './modules/contracts/contracts.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { MetersModule } from './modules/meters/meters.module.js';
import { RequestsModule } from './modules/requests/requests.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { BankModule } from './modules/bank/bank.module.js';
import { ChatbotModule } from './modules/chatbot/chatbot.module.js';

// Cron (PRC-06 job) runs outside tests only.
const scheduleImports = process.env.NODE_ENV === 'test' ? [] : [ScheduleModule.forRoot()];

@Module({
  controllers: [HealthController],
  imports: [PrismaModule, AuthModule, SettingsModule, FilesModule, BuildingsModule, RoomsModule, PricingModule, ViewingsModule, NotificationsModule, ContractsModule, BillingModule, MetersModule, BankModule, RequestsModule, ReportsModule, ChatbotModule, ...scheduleImports],
})
export class AppModule {}
