import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from './common/guards/auth.decorators.js';
import { PrismaService } from './common/prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  async check(@Res() response: Response): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      response.status(503).json({ status: 'unavailable' });
      return;
    }
    // A readiness probe must return its current status even for a conditional GET.
    response.status(200).type('application/json').end(JSON.stringify({ status: 'ok' }));
  }
}
