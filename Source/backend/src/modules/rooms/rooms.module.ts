import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module.js';
import { BuildingsModule } from '../buildings/buildings.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { PublicRoomsController } from './public-rooms.controller.js';
import { PublicRoomsService } from './public-rooms.service.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';

@Module({
  imports: [PrismaModule, BuildingsModule, SettingsModule],
  controllers: [RoomsController, PublicRoomsController],
  providers: [RoomsService, PublicRoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
