import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { AuditService } from '../audit/audit.service.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import type { UpdateContractServicesDto } from './dto/contract-services.dto.js';

const SERVICE_SELECT = { id: true, name: true, unit: true, isActive: true } satisfies Prisma.ServiceSelect;
const MEMBERSHIP_SELECT = { service: { select: SERVICE_SELECT } } satisfies Prisma.ContractServiceSelect;
const CONTRACT_SELECT = { id: true, buildingId: true, status: true, startDate: true,
  building: { select: { managerId: true, isActive: true, manager: { select: { isActive: true } } } },
} satisfies Prisma.ContractSelect;
const fieldError = (message: string) => new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { serviceIds: message } });
function staff(actor: AuthUser) {
  if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
}

@Injectable()
export class ContractServicesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async contract(tx: Prisma.TransactionClient, actor: AuthUser, id: number) {
    const row = await tx.contract.findUnique({ where: { id, ...scopeWhere(actor) }, select: CONTRACT_SELECT });
    if (!row) {
      if (await tx.contract.findUnique({ where: { id }, select: { id: true } })) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      throw new NotFoundException(ErrorCode.NOT_FOUND);
    }
    assertViewingScope(actor, row);
    return row;
  }

  async list(actor: AuthUser, id: number) {
    staff(actor);
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} FOR SHARE`;
      const contract = await this.contract(tx, actor, id);
      const rows = await this.selected(tx, contract.id, contract.buildingId);
      return rows.map(row => row.service);
    });
  }

  async update(actor: AuthUser, id: number, dto: UpdateContractServicesDto, ip?: string) {
    staff(actor);
    const desired = [...dto.serviceIds].sort((a, b) => a - b);
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} FOR UPDATE`;
      const contract = await this.contract(tx, actor, id);
      if (contract.status !== 'HOLD' && contract.status !== 'ACTIVE') throw new ConflictException(ErrorCode.CONFLICT_STATE);
      const current = await this.selected(tx, id, contract.buildingId);
      const before = current.map(row => row.service.id);
      const previous = new Set(before), next = new Set(desired);
      const added = desired.filter(serviceId => !previous.has(serviceId));
      const removed = before.filter(serviceId => !next.has(serviceId));
      // A-28: retained archived services are history, not new selections.
      if (!added.length && !removed.length) return current.map(row => row.service);

      if (desired.length) {
        await tx.$queryRaw`SELECT id FROM services WHERE id IN (${Prisma.join(desired)}) ORDER BY id FOR SHARE`;
      }
      const services = desired.length ? await tx.service.findMany({ where: { id: { in: desired },
        buildingId: contract.buildingId, unit: { in: ['ROOM', 'PERSON'] } }, select: SERVICE_SELECT, orderBy: { id: 'asc' } }) : [];
      if (services.length !== desired.length) throw fieldError('Dịch vụ phải cùng tòa và tính theo phòng hoặc theo người');

      if (added.length) {
        // Q-P3-22: new selections use the same approved-rate safeguard as intake.
        const checkedOn = contract.status === 'HOLD' ? contract.startDate : todayHanoi();
        const eligible = await tx.service.findMany({ where: { id: { in: added }, buildingId: contract.buildingId,
          unit: { in: ['ROOM', 'PERSON'] }, isActive: true,
          ratePlans: { some: { kind: 'SERVICE', status: 'APPROVED', effectiveFrom: { lte: checkedOn } } },
        }, select: { id: true } });
        if (eligible.length !== added.length) throw fieldError('Dịch vụ thêm mới phải đang hoạt động và có giá đã duyệt tại ngày áp dụng');
      }

      // Only the current membership join is replaced; complete before/after sets
      // remain in the audit, while master services/rates/invoices are untouched.
      if (removed.length) {
        const deleted = await tx.contractService.deleteMany({ where: { contractId: id, buildingId: contract.buildingId, serviceId: { in: removed } } });
        if (deleted.count !== removed.length) throw new ConflictException(ErrorCode.CONFLICT_STATE);
      }
      if (added.length) {
        const created = await tx.contractService.createMany({ data: added.map(serviceId => ({ contractId: id, buildingId: contract.buildingId, serviceId })) });
        if (created.count !== added.length) throw new ConflictException(ErrorCode.CONFLICT_STATE);
      }
      await this.audit.log(actor.id, 'contract.update_services', 'contract', id,
        { serviceIds: before }, { serviceIds: desired }, ip, tx);
      return services;
    });
  }

  private selected(tx: Prisma.TransactionClient, contractId: number, buildingId: number) {
    return tx.contractService.findMany({ where: { contractId, buildingId }, select: MEMBERSHIP_SELECT, orderBy: { serviceId: 'asc' } });
  }

  private async transaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.prisma.$transaction(async tx => { await lockViewingMapping(tx); return action(tx); });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(ErrorCode.INTERNAL_ERROR);
    }
  }
}
