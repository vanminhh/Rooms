import { viewingOverlapIds, type ViewingHold } from './viewing-capacity.js';

const base: ViewingHold = { id: 1, buildingId: 10, responsibleId: 2, guestPhone: '0911111111', visitAt: new Date('2026-11-16T03:00:00Z'), status: 'NEW' };
const hold = (id: number, extra: Partial<ViewingHold> = {}): ViewingHold => ({ ...base, id, ...extra });

describe('VIEW-22 actual overlaps', () => {
  it('three guests and multiple rooms at one building are valid', () => {
    expect([...viewingOverlapIds([hold(1), hold(2), hold(3, { guestPhone: '0922222222' }), hold(4, { guestPhone: '0933333333', status: 'CONFIRMED' })])]).toEqual([]);
  });
  it('four distinct phones flag every open row in that building/hour', () => {
    const rows = [1, 2, 3, 4].map(id => hold(id, { guestPhone: `090000000${id}` }));
    expect([...viewingOverlapIds(rows)]).toEqual([1, 2, 3, 4]);
  });
  it('current responsible at two buildings flags both, including CONFIRMED', () => {
    expect([...viewingOverlapIds([hold(1), hold(2, { buildingId: 20, status: 'CONFIRMED' })])]).toEqual([1, 2]);
  });
  it('same phone in different buildings flags both even with different managers', () => {
    expect([...viewingOverlapIds([hold(1), hold(2, { buildingId: 30, responsibleId: 3 })])]).toEqual([1, 2]);
  });
  it('unrelated manager/phone, another hour, closed and legacy rows are ignored', () => {
    expect([...viewingOverlapIds([hold(1), hold(2, { buildingId: 30, responsibleId: 3, guestPhone: '0922222222' }),
      hold(3, { buildingId: 20, visitAt: new Date('2026-11-16T04:00:00Z') }), hold(4, { buildingId: 20, status: 'DONE' }), hold(5, { buildingId: 20, visitAt: null })])]).toEqual([]);
  });
});
