import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { BuildingsModule } from './modules/buildings/buildings.module.js';

@Module({
  imports: [PrismaModule, AuthModule, SettingsModule, FilesModule, BuildingsModule],
})
export class AppModule {}
