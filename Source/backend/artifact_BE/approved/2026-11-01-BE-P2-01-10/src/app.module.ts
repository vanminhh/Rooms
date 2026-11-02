import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';

@Module({
  imports: [PrismaModule, AuthModule, SettingsModule, FilesModule],
})
export class AppModule {}
