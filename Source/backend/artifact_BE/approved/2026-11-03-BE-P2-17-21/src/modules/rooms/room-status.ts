import type { ContractStatus } from '@prisma/client';
import type { RoomStatus } from './rooms.types.js';

export function deriveRoomStatus(room: {
  underMaintenance: boolean;
  contracts: readonly { status: ContractStatus }[];
}): RoomStatus {
  if (room.contracts.some((contract) => contract.status === 'ACTIVE')) return 'Đang thuê';
  if (room.contracts.some((contract) => contract.status === 'HOLD')) return 'Đã cọc';
  if (room.underMaintenance) return 'Bảo trì';
  return 'Trống';
}
