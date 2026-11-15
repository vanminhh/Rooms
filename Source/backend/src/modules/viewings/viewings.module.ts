import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module.js';
import { BuildingsModule } from '../buildings/buildings.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { MailerModule } from '../mailer/mailer.module.js';
import { MeViewingsController } from './me-viewings.controller.js';
import { PublicViewingsController } from './public-viewings.controller.js';
import { ViewingsController } from './viewings.controller.js';
import { ViewingsService } from './viewings.service.js';

@Module({
  imports: [PrismaModule, BuildingsModule, SettingsModule, MailerModule],
  controllers: [PublicViewingsController, MeViewingsController, ViewingsController],
  providers: [ViewingsService],
})
export class ViewingsModule {}
