import { Body, Controller, ForbiddenException, Get, Header, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { RequestType, RequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { CurrentUser, Roles, TenantMeRoles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import { PaginationQuery } from '../../common/pagination.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { ContractIdParamsDto } from '../contracts/dto/contracts-query.dto.js';
import { CreateRequestDto } from './request.dto.js';
import { RequestsService } from './requests.service.js';

class StaffQuery extends PaginationQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) buildingId?: number;
  @IsOptional() @IsEnum(RequestType) type?: RequestType;
  @IsOptional() @IsEnum(RequestStatus) status?: RequestStatus;
}
class IncidentUpdate {
  @IsEnum(RequestStatus) status: RequestStatus;
  @ValidateIf((_o, v) => v !== undefined) @IsInt() @Min(0) @Max(2147483647) cost?: number;
}
class DecisionDto {
  @IsOptional() @IsString() decisionNote?: string;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) bankTransactionId?: number;
}

@Controller('me/requests')
@TenantMeRoles()
export class TenantRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() actor: AuthUser, @Query() query: PaginationQuery) {
    return this.requests.list({ createdById: actor.id, contract: { tenantId: actor.id } }, query, true);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateRequestDto) { return this.requests.create(actor, dto); }

  @Post(':id/cancel')
  cancel(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto) { return this.requests.tenantChange(actor, params.id, 'cancel'); }

  @Post(':id/confirm')
  confirm(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto) { return this.requests.tenantChange(actor, params.id, 'confirm'); }

  @Post(':id/reopen')
  reopen(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto) { return this.requests.tenantChange(actor, params.id, 'reopen'); }
}

@Controller('requests')
@Roles('BOSS', 'MANAGER')
export class StaffRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post(':id/approve')
  approve(@CurrentUser() actor: AuthUser, @Param() p: ContractIdParamsDto, @Ip() ip: string) {
    return this.requests.decide(actor, p.id, 'approve', {}, ip);
  }

  @Post(':id/reject')
  reject(@CurrentUser() actor: AuthUser, @Param() p: ContractIdParamsDto, @Body() dto: DecisionDto, @Ip() ip: string) {
    return this.requests.decide(actor, p.id, 'reject', dto, ip);
  }

  @Post(':id/escalate')
  escalate(@CurrentUser() actor: AuthUser, @Param() p: ContractIdParamsDto, @Ip() ip: string) {
    return this.requests.decide(actor, p.id, 'escalate', {}, ip);
  }

  @Post(':id/resolve')
  resolve(@CurrentUser() actor: AuthUser, @Param() p: ContractIdParamsDto, @Body() dto: DecisionDto, @Ip() ip: string) {
    return this.requests.decide(actor, p.id, 'resolve', dto, ip);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() actor: AuthUser, @Query() query: StaffQuery) {
    if (query.buildingId && actor.buildingIds && !actor.buildingIds.includes(query.buildingId)) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    return this.requests.list({ type: query.type, status: query.status,
      contract: query.buildingId ? { buildingId: query.buildingId } : scopeWhere(actor) }, query);
  }

  @Patch(':id')
  incident(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto, @Body() dto: IncidentUpdate, @Ip() ip: string) {
    return this.requests.incident(actor, params.id, dto.status, dto.cost, ip);
  }
}
