import type { TimeSlot } from '../../common/date/today.js';

export type ViewingStatus = 'NEW' | 'CONFIRMED' | 'WON' | 'LOST' | 'CANCELLED';

// API shape of one viewing for staff (CP-4 returns it; CP-3 only declares it).
export interface ViewingView {
  id: number;
  roomId: number;
  roomCode: string;
  buildingId: number;
  buildingName: string;
  guestName: string;
  guestPhone: string;
  visitDate: string; // YYYY-MM-DD
  timeSlot: TimeSlot;
  timeSlotLabel: string; // VIEW-08
  note: string | null;
  source: 'WEB' | 'MANUAL';
  status: ViewingStatus;
  statusLabel: string; // VIEW-10
  handledById: number | null;
  outcomeNote: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string;
}
