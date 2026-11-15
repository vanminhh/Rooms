import { toView, type ViewingRecord } from './viewings.service.js';

const legacy: ViewingRecord = {
  id: 1, roomId: 2, userId: null, visitAt: null,
  guestName: 'Khách', guestPhone: '0900000006',
  visitDate: new Date('2026-11-15T00:00:00Z'), timeSlot: 'AFTERNOON',
  status: 'NEW', source: 'WEB', note: null, handledById: null, outcomeNote: null, contractId: null,
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
});
