import { Controller, ForbiddenException, Get, Header, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { CurrentUser, Roles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import { ReportsService } from './reports.service.js';
import { reportRange } from './report-math.js';

class BuildingFilter {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) buildingId?: number;
}
class RevenueFilter extends BuildingFilter {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) to?: string;
}
function buildingIds(actor: AuthUser, id?: number) {
  if (id && actor.buildingIds && !actor.buildingIds.includes(id)) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
  return id ? [id] : actor.buildingIds;
}

@Controller('reports')
@Roles('BOSS', 'MANAGER')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('revenue')
  @Header('Cache-Control', 'no-store')
  revenue(@CurrentUser() actor: AuthUser, @Query() q: RevenueFilter) {
    return this.reports.revenue(buildingIds(actor, q.buildingId), actor.role === 'BOSS', reportRange(q.from, q.to));
  }

  @Get('occupancy')
  @Header('Cache-Control', 'no-store')
  occupancy(@CurrentUser() actor: AuthUser, @Query() q: BuildingFilter) {
    return this.reports.occupancy(buildingIds(actor, q.buildingId), actor.role === 'BOSS');
  }
}
