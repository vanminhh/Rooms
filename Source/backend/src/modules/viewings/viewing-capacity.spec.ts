import { canBookViewing, type ViewingHold } from './viewing-capacity.js';

const at = new Date('2026-11-16T03:00:00Z');
const target = { buildingId: 10, responsibleId: 2, guestPhone: '0900000009', visitAt: at };
const hold = (id: number, overrides: Partial<ViewingHold> = {}): ViewingHold => ({
  id, buildingId: 10, responsibleId: 2, guestPhone: `090000000${id}`, visitAt: at, status: 'NEW', ...overrides,
});

describe('VIEW-16: three guests per building/hour with cross-building exclusion', () => {
  it.each([0, 1, 2])('VIEW-16: another guest fits when %i phones hold this building/hour', count => {
    expect(canBookViewing(Array.from({ length: count }, (_, i) => hold(i + 1)), target)).toBe(true);
  });
  it('VIEW-16: refuses the fourth distinct guest', () => {
    expect(canBookViewing([hold(1), hold(2), hold(3)], target)).toBe(false);
  });
  it('VIEW-16: the same phone may add another room at full capacity', () => {
    expect(canBookViewing([hold(1), hold(2), hold(3)], { ...target, guestPhone: '0900000001' })).toBe(true);
  });
  it('VIEW-16: duplicate phones count once, regardless of room/source/owner', () => {
    expect(canBookViewing([hold(1), hold(2, { guestPhone: '0900000001' }), hold(3)], target)).toBe(true);
  });
  it('VIEW-16: responsible person cannot be at another building', () => {
    expect(canBookViewing([hold(1, { buildingId: 20 })], target)).toBe(false);
  });
  it('VIEW-16: guest cannot be at another building even with a different responsible person', () => {
    expect(canBookViewing([hold(1, { buildingId: 20, responsibleId: 3, guestPhone: target.guestPhone })], target)).toBe(false);
  });
  it('VIEW-16: unrelated guest and manager at another building do not interfere', () => {
    expect(canBookViewing([hold(1, { buildingId: 20, responsibleId: 3 })], target)).toBe(true);
  });
  it('VIEW-16: another hour does not interfere', () => {
    expect(canBookViewing([hold(1, { buildingId: 20, visitAt: new Date('2026-11-16T04:00:00Z') })], target)).toBe(true);
  });
  it.each(['DONE', 'LOST', 'WON', 'CANCELLED'] as const)('VIEW-16: closed %s holds no capacity', status => {
    expect(canBookViewing([hold(1, { buildingId: 20, status })], target)).toBe(true);
  });
  it('VIEW-16: CONFIRMED still holds capacity', () => {
    expect(canBookViewing([hold(1, { status: 'CONFIRMED' }), hold(2), hold(3)], target)).toBe(false);
  });
  it('VIEW-08/16: legacy rows do not hold an exact hour', () => {
    expect(canBookViewing([hold(1, { buildingId: 20, visitAt: null })], target)).toBe(true);
  });
  it('VIEW-09/16: reschedule excludes only the edited row', () => {
    expect(canBookViewing([hold(1), hold(2), hold(3)], { ...target, excludeId: 1 })).toBe(true);
    expect(canBookViewing([hold(1), hold(2), hold(3), hold(4, { guestPhone: '0900000001' })], { ...target, excludeId: 1 })).toBe(false);
  });
  it('VIEW-21: anonymous hours require room for a new distinct phone', () => {
    const anonymous = { ...target, guestPhone: undefined };
    expect(canBookViewing([hold(1), hold(2)], anonymous)).toBe(true);
    expect(canBookViewing([hold(1), hold(2), hold(3)], anonymous)).toBe(false);
  });
});
