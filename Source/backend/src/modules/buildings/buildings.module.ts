import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { BuildingContactService } from './building-contact.service.js';
import { BuildingWriteGuard } from './building-write.guard.js';
import { BuildingsController } from './buildings.controller.js';
import { BuildingsService } from './buildings.service.js';
import { ServicesController } from './services.controller.js';
import { ServicesService } from './services.service.js';

@Module({
  imports: [PrismaModule, AuditModule, SettingsModule],
  controllers: [BuildingsController, ServicesController],
  providers: [BuildingsService, BuildingWriteGuard, BuildingContactService, ServicesService],
  exports: [BuildingContactService],
})
export class BuildingsModule {}
