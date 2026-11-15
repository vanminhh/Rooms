import { TIME_SLOT_LABELS } from './viewing-slot.js';

it('VIEW-08: existing viewing slots keep the approved Vietnamese labels', () => {
  expect(TIME_SLOT_LABELS).toEqual({
    MORNING: 'Sáng (8:00–11:00)', AFTERNOON: 'Chiều (14:00–17:00)', EVENING: 'Tối (18:00–20:00)',
  });
});
