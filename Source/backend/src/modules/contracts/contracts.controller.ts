import { Body, Controller, Ip, Post } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../../common/guards/auth.decorators.js';
import { ContractsService } from './contracts.service.js';
import { CreateContractDto } from './dto/create-contract.dto.js';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Roles('BOSS', 'MANAGER')
  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateContractDto, @Ip() ip: string) {
    return this.contracts.create(actor, dto, ip);
  }
}
