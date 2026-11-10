import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { BuildingsModule } from './modules/buildings/buildings.module.js';
import { RoomsModule } from './modules/rooms/rooms.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { ViewingsModule } from './modules/viewings/viewings.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';

// Cron (PRC-06 job) runs outside tests only.
const scheduleImports = process.env.NODE_ENV === 'test' ? [] : [ScheduleModule.forRoot()];

@Module({
  imports: [PrismaModule, AuthModule, SettingsModule, FilesModule, BuildingsModule, RoomsModule, PricingModule, ViewingsModule, NotificationsModule, ...scheduleImports],
})
export class AppModule {}
