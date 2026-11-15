import type { TimeSlot } from '../../common/date/today.js';

// VIEW-08: retained only for legacy rows; new and edited appointments use visitAt.
export const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  MORNING: 'Sáng (8:00–11:00)',
  AFTERNOON: 'Chiều (14:00–17:00)',
  EVENING: 'Tối (18:00–20:00)',
};
