import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.js';

const INVALID_MANAGER_MESSAGE = 'Người được gán phải là quản lý đang hoạt động';

export async function assertAssignableManager(
  tx: Prisma.TransactionClient,
  managerId: number,
  excludeBuildingId?: number,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM users WHERE id = ${managerId} FOR UPDATE`;

  const manager = await tx.user.findUnique({
    where: { id: managerId },
    select: { id: true, role: true, isActive: true },
  });
  if (!manager || manager.role !== 'MANAGER' || !manager.isActive) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      fields: { managerId: INVALID_MANAGER_MESSAGE },
    });
  }

  const buildingCount = await tx.building.count({
    where: {
      managerId,
      ...(excludeBuildingId !== undefined ? { id: { not: excludeBuildingId } } : {}),
    },
  });
  if (buildingCount >= 2) {
    throw new ConflictException('MANAGER_MAX_2_BUILDINGS');
  }
}
