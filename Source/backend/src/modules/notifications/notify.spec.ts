import { describe, expect, it, vi } from 'vitest';
import { notifyBuildingStaff, responsibleStaffIds } from './notify.js';

// SCOPE-04: building 1 has an active manager, 2 a deactivated one, 3 none. Boss is user 1.
function db() {
  const buildings = [
    { id: 1, managerId: 7, manager: { isActive: true } },
    { id: 2, managerId: 8, manager: { isActive: false } },
    { id: 3, managerId: null, manager: null },
  ];
  return {
    building: { findMany: vi.fn(async ({ where }: any) => buildings.filter(b => where.id.in.includes(b.id))) },
    user: { findFirst: vi.fn(async () => ({ id: 1 })) },
    notification: { create: vi.fn() },
  };
}

describe('NOTI-11 staff notifications', () => {
  it('SCOPE-04: active manager, else Boss (deactivated manager or none), in one building query', async () => {
    const tx = db();
    expect(await responsibleStaffIds(tx as never, [1, 2, 3, 1])).toEqual(new Map([[1, 7], [2, 1], [3, 1]]));
    expect(tx.building.findMany).toHaveBeenCalledTimes(1);
  });

  it('SCOPE-04: a building with an active manager never looks Boss up', async () => {
    const tx = db();
    await responsibleStaffIds(tx as never, [1]);
    expect(tx.user.findFirst).not.toHaveBeenCalled();
  });

  it('NOTI-11: notifyBuildingStaff writes one row for the responsible user', async () => {
    const tx = db();
    const input = { kind: 'PAYMENT_RECEIVED' as const, title: 'Đã nhận 2.984.000 đ cho hóa đơn TT9', link: '/ql/hoa-don/9' };
    expect(await notifyBuildingStaff(tx as never, 2, input)).toBe(1);
    expect(tx.notification.create).toHaveBeenCalledWith({ data: { ...input, userId: 1 } });
  });
});
