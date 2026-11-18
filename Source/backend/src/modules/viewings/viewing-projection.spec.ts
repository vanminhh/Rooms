import { toView, type ViewingRecord } from './viewings.service.js';

const legacy: ViewingRecord = {
  id: 1, roomId: 2, userId: null, visitAt: null,
  guestName: 'Khách', guestPhone: '0900000006',
  visitDate: new Date('2026-11-15T00:00:00Z'), timeSlot: 'AFTERNOON',
  status: 'NEW', source: 'WEB', note: null, handledById: null, outcomeNote: null, contractId: null,
  calledById: null, calledAt: null, depositCancelledByContractId: null,
  createdAt: new Date('2026-11-14T00:00:00Z'), updatedAt: new Date('2026-11-14T00:00:00Z'),
  user: null,
  room: { code: '201', buildingId: 1, isActive: true, underMaintenance: false,
    building: { name: 'Tòa A', address: 'Hà Nội', isActive: true, manager: null } },
};

describe('BE-EX-18 / migration-compatible viewing projection', () => {
  it('VIEW-08: preserves the legacy date and label with no invented exact hour', () => {
    expect(toView(legacy)).toMatchObject({ visitDate: '2026-11-15', timeSlot: 'AFTERNOON', timeSlotLabel: 'Chiều (14:00–17:00)', visitAt: null });
  });
  it('VIEW-08/10: exact-hour DONE does not read a null legacy date', () => {
    expect(toView({ ...legacy, visitDate: null, timeSlot: null, visitAt: new Date('2026-11-15T03:00:00Z'), status: 'DONE' }))
      .toMatchObject({ visitDate: null, timeSlot: null, timeSlotLabel: null, visitAt: '2026-11-15T03:00:00.000Z', status: 'DONE', statusLabel: 'Đã xem' });
  });
  it('VIEW-05: staff can distinguish the current WEB owner from the booking snapshot when choosing the signer', () => {
    const row = {
      ...legacy, userId: 9, status: 'CONFIRMED' as const,
      user: { fullName: 'Khách Hiện Tại', phone: '0912345678', email: 'guest@example.test', locale: 'vi' },
    };
    expect(toView(row)).toMatchObject({
      guestName: 'Khách', guestPhone: '0900000006',
      guestAccount: { fullName: 'Khách Hiện Tại', phone: '0912345678' },
    });
    expect(toView(legacy)).not.toHaveProperty('guestAccount');
  });
});
