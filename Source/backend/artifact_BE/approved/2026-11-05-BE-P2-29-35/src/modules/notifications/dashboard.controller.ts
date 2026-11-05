import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser, Roles } from '../../common/guards/auth.decorators.js';
import { DashboardQueryDto } from './dto/dashboard.dto.js';
import { type DashboardView, DashboardService } from './dashboard.service.js';

// GET /dashboard (VIEW-07, PRC-11). Thin: the rules live in DashboardService.
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Roles('BOSS', 'MANAGER')
  @Get()
  get(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto): Promise<DashboardView> {
    return this.dashboard.get(user, query);
  }
}
