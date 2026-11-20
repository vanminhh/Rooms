import { ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { formatDateOnly } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { AuditService } from '../audit/audit.service.js';
import { signedContractAssetUrl } from '../files/files.service.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import { renderContractPrint } from './contract-print.js';

const PRINT_SELECT = {
  code: true, startDate: true, endDate: true, termMonths: true, rent: true, deposit: true, terms: true,
  room: { select: { code: true } },
  building: { select: { code: true, name: true, address: true, district: true, ward: true } },
  occupants: { where: { isSigner: true }, take: 1, select: {
    fullName: true, phone: true, dateOfBirth: true, idNumberLast4: true,
  } },
} satisfies Prisma.ContractSelect;

const printDate = (date: Date) => formatDateOnly(date).split('-').reverse().join('/');
const printMoney = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;

@Injectable()
export class ContractDocumentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async scan(actor: AuthUser, id: number, ip?: string) {
    return this.prisma.$transaction(async tx => {
      await lockViewingMapping(tx);
      await this.authorize(tx, actor, id);
      const contract = await tx.contract.findUniqueOrThrow({ where: { id }, select: { signedScanAssetId: true } });
      if (!contract.signedScanAssetId) throw new NotFoundException(ErrorCode.NOT_FOUND);
      await this.audit.log(actor.id, 'contract.view_scan', 'contract', id, undefined, undefined, ip, tx);
      return signedContractAssetUrl(contract.signedScanAssetId);
    });
  }

  async print(actor: AuthUser, id: number) {
    return this.prisma.$transaction(async tx => {
      await lockViewingMapping(tx);
      await this.authorize(tx, actor, id);
      const contract = await tx.contract.findUniqueOrThrow({ where: { id }, select: PRINT_SELECT });
      const signer = contract.occupants[0];
      if (!signer || (signer.idNumberLast4 !== null && !/^\d{4}$/.test(signer.idNumberLast4))) {
        throw new InternalServerErrorException(ErrorCode.INTERNAL_ERROR);
      }
      const setting = await tx.setting.findUnique({ where: { key: 'contract_template' }, select: { value: true } });
      return renderContractPrint(setting?.value, {
        'contract.code': contract.code,
        'contract.startDate': printDate(contract.startDate), 'contract.endDate': printDate(contract.endDate),
        'contract.termMonths': String(contract.termMonths),
        'contract.rent': printMoney(contract.rent), 'contract.deposit': printMoney(contract.deposit),
        'contract.terms': contract.terms ?? '—',
        'building.name': contract.building.name, 'building.code': contract.building.code,
        'building.address': contract.building.address, 'building.ward': contract.building.ward, 'building.district': contract.building.district,
        'room.code': contract.room.code, 'tenant.fullName': signer.fullName,
        'tenant.phone': signer.phone ?? '—', 'tenant.dateOfBirth': signer.dateOfBirth ? printDate(signer.dateOfBirth) : '—',
        'tenant.idNumberLast4': signer.idNumberLast4 ?? '—',
      });
    });
  }

  private async authorize(tx: Prisma.TransactionClient, actor: AuthUser, id: number) {
    if (actor.role !== 'BOSS' && actor.role !== 'MANAGER' && actor.role !== 'TENANT') {
      throw new ForbiddenException(ErrorCode.FORBIDDEN);
    }
    if (actor.role === 'TENANT') {
      await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} AND tenant_id = ${actor.id} FOR SHARE`;
    } else {
      await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} FOR SHARE`;
    }
    const contract = await tx.contract.findUnique({ where: actor.role === 'TENANT'
      ? { id, tenantId: actor.id } : { id, ...scopeWhere(actor) }, select: {
      id: true, building: { select: { managerId: true, isActive: true, manager: { select: { isActive: true } } } },
    } });
    if (!contract) {
      if (actor.role !== 'TENANT' && await tx.contract.findUnique({ where: { id }, select: { id: true } })) {
        throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      }
      throw new NotFoundException(ErrorCode.NOT_FOUND);
    }
    if (actor.role !== 'TENANT') assertViewingScope(actor, contract);
  }
}
