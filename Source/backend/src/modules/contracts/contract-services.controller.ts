import { Body, Controller, Get, Header, Ip, Param, Patch } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../../common/guards/auth.decorators.js';
import { ContractServicesService } from './contract-services.service.js';
import { UpdateContractServicesDto } from './dto/contract-services.dto.js';
import { ContractIdParamsDto } from './dto/contracts-query.dto.js';

@Controller('contracts/:id/services')
@Roles('BOSS', 'MANAGER')
export class ContractServicesController {
  constructor(private readonly services: ContractServicesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto) {
    return this.services.list(actor, params.id);
  }

  @Patch()
  @Header('Cache-Control', 'no-store')
  update(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto, @Body() dto: UpdateContractServicesDto, @Ip() ip: string) {
    return this.services.update(actor, params.id, dto, ip);
  }
}
