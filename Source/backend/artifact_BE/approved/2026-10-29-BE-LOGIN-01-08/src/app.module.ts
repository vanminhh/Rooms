import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
})
export class AppModule {}
