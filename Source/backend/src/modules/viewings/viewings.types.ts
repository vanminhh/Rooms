import type { TimeSlot } from '../../common/date/today.js';
import type { PublicContact } from '../settings/settings.service.js';

export type ViewingStatus = 'NEW' | 'CONFIRMED' | 'WON' | 'LOST' | 'CANCELLED' | 'DONE';

export interface ViewingView {
  id: number;
  roomId: number;
  roomCode: string;
  buildingId: number;
  buildingName: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  guestAccount?: { fullName: string; phone: string };
  visitAt: string | null;
  visitDate: string | null;
  timeSlot: TimeSlot | null;
  timeSlotLabel: string | null;
  note: string | null;
  source: 'WEB' | 'MANUAL';
  status: ViewingStatus;
  statusLabel: string;
  handledById: number | null;
  outcomeNote: string | null;
  overdue: boolean;
  overlap: boolean;
  roomLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

// Explicit allowlist: no staff ids, internal outcome notes, or other guests' details.
export interface OwnViewingView {
  id: number;
  roomId: number;
  roomCode: string;
  buildingName: string;
  buildingAddress: string;
  visitAt: string | null;
  visitDate: string | null;
  timeSlot: TimeSlot | null;
  note: string | null;
  status: ViewingStatus;
  contact: PublicContact | null;
  bossContact: PublicContact | null;
  createdAt: string;
}

export interface ViewingDay { date: string; hours: string[] }
