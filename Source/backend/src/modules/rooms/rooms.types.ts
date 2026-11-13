export type RoomStatus = 'Đang thuê' | 'Đã cọc' | 'Bảo trì' | 'Trống';

export interface RoomImageView {
  id: number;
  roomId: number;
  publicId: string;
  url: string;
  sortOrder: number;
}

export interface RoomView {
  id: number;
  buildingId: number;
  code: string;
  floor: number;
  areaM2: number;
  price: number | null;
  maxOccupants: number;
  furniture: string[];
  description: string | null;
  roomType: 'STUDIO' | 'LOFT' | 'ONE_BEDROOM' | 'TWO_BEDROOM' | null; // ROOM-10: null = chưa nhập
  hasBalcony: boolean | null;
  hasWindow: boolean | null;
  petsAllowed: boolean | null;
  underMaintenance: boolean;
  isActive: boolean;
  status: RoomStatus;
  images: RoomImageView[];
  pendingViewingCount?: number;
}

export interface RoomGridItem extends Omit<RoomView, 'furniture' | 'description' | 'images' | 'roomType' | 'hasBalcony' | 'hasWindow' | 'petsAllowed'> {
  pendingProposal: null | { id: number; price: number; effectiveFrom: string; expired: boolean };
  imageCount: number;
}
