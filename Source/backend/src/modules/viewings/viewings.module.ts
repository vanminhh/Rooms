import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module.js';
import { PublicViewingsController } from './public-viewings.controller.js';
import { ViewingsController } from './viewings.controller.js';
import { ViewingsService } from './viewings.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [PublicViewingsController, ViewingsController],
  providers: [ViewingsService],
})
export class ViewingsModule {}
