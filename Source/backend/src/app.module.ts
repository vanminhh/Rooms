import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';

@Module({
  imports: [PrismaModule, AuthModule, SettingsModule],
})
export class AppModule {}
