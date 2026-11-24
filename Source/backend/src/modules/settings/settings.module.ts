import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { AdminSettingsController } from './admin-settings.controller.js';

@Module({
  imports: [AuditModule],
  controllers: [SettingsController, AdminSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
