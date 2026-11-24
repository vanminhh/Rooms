import { BadRequestException } from '@nestjs/common';
import { RequestType, VehicleType, type Prisma } from '@prisma/client';
import { Type, plainToInstance } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsInt, IsISO8601, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested, validateSync } from 'class-validator';
import { encryptCccd, last4 } from '../../common/crypto/cccd.js';
import { parseDateOnly } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import { CreateOccupantDto } from '../contracts/dto/occupants.dto.js';
import { CreateVehicleDto } from '../contracts/dto/vehicles.dto.js';

class Photo {
  @Matches(/^[\w-]+$/) assetId: string;
  @IsString() publicId: string;
  @IsInt() @Min(1) version: number;
  @IsString() format: string;
}

export class CreateRequestDto {
  @IsInt() @Min(1) @Max(2147483647) contractId: number;
  @IsEnum(RequestType) type: RequestType;
  @Matches(/\S/) @MaxLength(150) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ArrayUnique((photo: Photo) => photo?.assetId)
  @ValidateNested({ each: true }) @Type(() => Photo) photos?: Photo[];
}

export const invalid = (field: string) => new BadRequestException({
  code: ErrorCode.VALIDATION_FAILED, fields: { [field]: 'Giá trị không hợp lệ' },
});

function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw invalid('payload');
  return value as Record<string, unknown>;
}

function integer(value: unknown, min = 1) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > 2147483647) throw invalid('payload');
  return value;
}

function day(value: unknown) {
  if (typeof value !== 'string' || !parseDateOnly(value)) throw invalid('payload');
  return value;
}

class TransferTime {
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/)
  transferredAt: string;
}

export function requestPayload(type: RequestType, data: Record<string, unknown> = {}): Prisma.InputJsonObject {
  switch (type) {
    case 'INCIDENT': object(data, []); return {};
    case 'MOVE_OUT': object(data, ['plannedMoveOutDate']); return { plannedMoveOutDate: day(data.plannedMoveOutDate) };
    case 'RENEW': object(data, ['termMonths']); return { termMonths: integer(data.termMonths, 3) };
    case 'PAYMENT_ISSUE': {
      object(data, ['invoiceId', 'amount', 'transferredAt']);
      if (validateSync(Object.assign(new TransferTime(), { transferredAt: data.transferredAt })).length) throw invalid('payload.transferredAt');
      return { invoiceId: integer(data.invoiceId), amount: integer(data.amount), transferredAt: data.transferredAt as string };
    }
    default: {
      object(data, ['add', 'remove']);
      const add = data.add ?? [], remove = data.remove ?? [];
      if (!Array.isArray(add) || !Array.isArray(remove) || !add.length && !remove.length) throw invalid('payload');
      const occupant = type === 'OCCUPANT_CHANGE';
      const additions = add.map((v: unknown): Prisma.InputJsonObject => {
        if (occupant) {
          const raw = object(v, ['fullName', 'phone', 'dateOfBirth', 'idNumber', 'moveInDate']);
          const dto = plainToInstance(CreateOccupantDto, raw);
          if (validateSync(dto).length) throw invalid('payload.add');
          return { fullName: dto.fullName, moveInDate: dto.moveInDate, phone: dto.phone ?? null, dateOfBirth: dto.dateOfBirth ?? null,
            ...(dto.idNumber ? { idNumberEnc: encryptCccd(dto.idNumber), idNumberLast4: last4(dto.idNumber) } : {}) };
        }
        const raw = object(v, ['plate', 'type', 'serviceId']);
        const dto = plainToInstance(CreateVehicleDto, raw);
        if (validateSync(dto).length) throw invalid('payload.add');
        return { plate: dto.plate, type: VehicleType[dto.type], serviceId: dto.serviceId };
      });
      const removals = remove.map((v: unknown): Prisma.InputJsonObject => {
        const key = occupant ? 'occupantId' : 'vehicleId', date = occupant ? 'moveOutDate' : 'removedAt';
        const raw = object(v, [key, date]);
        return { [key]: integer(raw[key]), [date]: day(raw[date]) };
      });
      return { add: additions, remove: removals };
    }
  }
}
