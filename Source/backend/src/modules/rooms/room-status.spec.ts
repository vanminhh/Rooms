import { describe, expect, it } from 'vitest';
import { deriveRoomStatus } from './room-status.js';

describe('deriveRoomStatus', () => {
  it('G-08: ACTIVE outranks HOLD and maintenance', () => {
    expect(
      deriveRoomStatus({
        underMaintenance: true,
        contracts: [{ status: 'HOLD' }, { status: 'ACTIVE' }],
      }),
    ).toBe('Đang thuê');
  });

  it('G-08: HOLD outranks maintenance when no ACTIVE contract exists', () => {
    expect(
      deriveRoomStatus({ underMaintenance: true, contracts: [{ status: 'HOLD' }] }),
    ).toBe('Đã cọc');
  });

  it('G-08: maintenance without an open contract is Bảo trì', () => {
    expect(deriveRoomStatus({ underMaintenance: true, contracts: [] })).toBe('Bảo trì');
  });

  it('G-08: no open contract and no maintenance is Trống', () => {
    expect(deriveRoomStatus({ underMaintenance: false, contracts: [] })).toBe('Trống');
  });

  it('ROOM-04: derives the permitted view of a locked room from its business conditions', () => {
    expect(deriveRoomStatus({ underMaintenance: false, contracts: [{ status: 'ACTIVE' }] })).toBe(
      'Đang thuê',
    );
    expect(deriveRoomStatus({ underMaintenance: false, contracts: [] })).toBe('Trống');
  });
});
