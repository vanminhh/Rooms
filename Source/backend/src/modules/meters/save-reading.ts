import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { InvoiceStatus, MeterKind, Prisma } from '@prisma/client';
import { addDays, parseDateOnly, todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { isMeterPhotoUrl, parseCloudinaryUrl } from '../files/cloudinary.js';

function invalid(): never { throw new BadRequestException(ErrorCode.VALIDATION_FAILED); }
function conflict(): never { throw new ConflictException(ErrorCode.CONFLICT_STATE); }

function integer(value: unknown, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > 2147483647) invalid();
  return value;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid();
  return value;
}

// Q-P4-58 (D-38): an optional photo must come from this room's signed meter folder.
export function assertMeterPhoto(photoUrl: string | null | undefined, buildingId: number, roomId: number, env: NodeJS.ProcessEnv = process.env) {
  if (!photoUrl) return;
  const cfg = parseCloudinaryUrl(env.CLOUDINARY_URL);
  if (!cfg || !isMeterPhotoUrl(photoUrl, cfg.cloudName, buildingId, roomId)) invalid();
}

export function parseReading(raw: unknown, today = todayHanoi()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  const item = raw as Record<string, unknown>;
  const { kind, isMeterReplaced = false } = item;
  if (kind !== 'ELECTRIC' && kind !== 'WATER') invalid();
  if (typeof isMeterReplaced !== 'boolean') invalid();
  const readOn = typeof item.readOn === 'string' && parseDateOnly(item.readOn);
  if (!readOn || readOn > today) invalid();
  if (!isMeterReplaced && item.oldMeterFinal != null) invalid();
  return {
    roomId: integer(item.roomId, 1), invoiceId: item.invoiceId === undefined ? undefined : integer(item.invoiceId, 1),
    kind: kind as MeterKind, value: integer(item.value, 0), readOn, isMeterReplaced,
    oldMeterFinal: isMeterReplaced ? integer(item.oldMeterFinal, 0) : null,
    photoUrl: optionalText(item.photoUrl), note: optionalText(item.note),
  };
}

export async function saveReading(tx: Prisma.TransactionClient, actor: AuthUser, item: ReturnType<typeof parseReading>) {
  const { roomId, invoiceId, kind, readOn } = item;
  const rooms = await tx.$queryRaw<{ building_id: number }[]>`SELECT building_id FROM rooms WHERE id = ${roomId} FOR UPDATE`;
  if (!rooms.length) throw new NotFoundException(ErrorCode.NOT_FOUND);
  assertMeterPhoto(item.photoUrl, rooms[0].building_id, roomId);
  if (actor.role !== 'BOSS') {
    const building = await tx.building.findFirst({ where: { id: rooms[0].building_id, managerId: actor.id, isActive: true } });
    if (!building) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
  }
  // p(k) = periodEnd + 1. Eligible closings may start two days before p(k).
  const candidates = await tx.invoice.findMany({
    where: { id: invoiceId, type: 'MONTHLY', contract: { roomId }, periodEnd: { lte: addDays(readOn, 1) },
      meterReadings: { none: { kind } },
      OR: [{ status: 'DRAFT' }, ...(kind === 'WATER' ? [{
        status: { in: ['UNPAID', 'PAID', 'SETTLED'] as InvoiceStatus[] }, contract: { building: { waterMode: 'PER_PERSON' as const } },
      }] : [])] },
    take: 2, select: { id: true, contractId: true, status: true, periodNo: true },
  });
  if (candidates.length > 1) conflict();
  const invoice = candidates[0];
  let contractId: number;
  if (invoice) {
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoice.id} FOR UPDATE`;
    const current = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, select: { status: true } });
    if (current.status !== invoice.status) conflict();
    contractId = invoice.contractId;
  } else {
    if (!item.isMeterReplaced || invoiceId !== undefined) conflict();
    const contract = await tx.contract.findFirst({ where: { roomId, status: 'ACTIVE', startDate: { lte: readOn }, endDate: { gte: readOn } }, select: { id: true } });
    if (!contract) conflict();
    // Historical replacements within a closed reading interval require invoice reissue.
    const billed = await tx.meterReading.findFirst({ where: { contractId: contract.id, kind, readOn: { gte: readOn },
      invoice: { status: { in: ['UNPAID', 'PAID', 'SETTLED'] } } }, select: { id: true } });
    if (billed) conflict();
    contractId = contract.id;
  }
  const previous = await tx.meterReading.findFirst({
    where: { roomId, contractId, kind, readOn: { lte: readOn } },
    orderBy: [{ readOn: 'desc' }, { isOpening: 'asc' }, { id: 'desc' }],
  });
  if (!previous) conflict();
  if ((item.oldMeterFinal ?? item.value) < previous.value) throw new ConflictException(ErrorCode.METER_VALUE_DECREASED);
  const next = await tx.meterReading.findFirst({ where: { roomId, contractId, kind, readOn: { gt: readOn } },
    orderBy: [{ readOn: 'asc' }, { id: 'asc' }] });
  if (next && (next.isOpening || item.value > (next.oldMeterFinal ?? next.value))) conflict();
  const reading = await tx.meterReading.create({ data: { ...item, invoiceId: invoice?.id ?? null, readById: actor.id, contractId } });
  return { invoiceId: invoice?.id ?? null, readingId: reading.id, status: invoice?.status ?? null };
}
