import type { PublicCatalogItem, PublicFiltersView, PublicRoomAttributes } from './api'

// A code that is not in the list keeps its own text (old data, a list that has not loaded): nothing is hidden or invented.
export function labelOf(code: string, items: readonly PublicCatalogItem[] | undefined): string {
  return items?.find(item => item.code === code)?.label ?? code
}

const yesNo = (value: boolean) => (value ? 'Có' : 'Không')

// ROOM-10: the facts shown on /phong/:id. A "chưa nhập" (null) value is not shown at all; false is shown as "Không".
// `loading`: the list of labels is still on its way, so the room type waits instead of flashing its code.
export function roomAttributeFacts(room: PublicRoomAttributes, catalog: PublicFiltersView | undefined, loading = false): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = []
  if (room.roomType !== null && !loading) facts.push({ label: 'Loại phòng', value: labelOf(room.roomType, catalog?.roomTypes) })
  if (room.hasBalcony !== null) facts.push({ label: 'Ban công', value: yesNo(room.hasBalcony) })
  if (room.hasWindow !== null) facts.push({ label: 'Cửa sổ', value: yesNo(room.hasWindow) })
  if (room.petsAllowed !== null) facts.push({ label: 'Nuôi thú cưng', value: yesNo(room.petsAllowed) })
  return facts
}
