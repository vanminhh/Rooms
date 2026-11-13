import type { PublicCatalogItem, PublicFiltersView, PublicRoomAttributes } from './api'
import { t } from '../../shared/i18n'
import type { Lang } from '../../shared/i18n'

// A code that is not in the list keeps its own text (old data, a list that has not loaded): nothing is hidden or invented.
export function labelOf(code: string, items: readonly PublicCatalogItem[] | undefined, lang: Lang = 'vi'): string {
  const item = items?.find(entry => entry.code === code)
  return (lang === 'en' ? item?.labelEn || item?.label : item?.label) ?? code
}

const yesNo = (value: boolean, lang: Lang) => t(value ? 'room.yes' : 'room.no', undefined, lang)

// ROOM-10: the facts shown on /phong/:id. A "chưa nhập" (null) value is not shown at all; false is shown as "Không".
// `loading`: the list of labels is still on its way, so the room type waits instead of flashing its code.
export function roomAttributeFacts(room: PublicRoomAttributes, catalog: PublicFiltersView | undefined, loading = false, lang: Lang = 'vi'): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = []
  if (room.roomType !== null && !loading) facts.push({ label: t('room.type', undefined, lang), value: labelOf(room.roomType, catalog?.roomTypes, lang) })
  if (room.hasBalcony !== null) facts.push({ label: t('room.balcony', undefined, lang), value: yesNo(room.hasBalcony, lang) })
  if (room.hasWindow !== null) facts.push({ label: t('room.window', undefined, lang), value: yesNo(room.hasWindow, lang) })
  if (room.petsAllowed !== null) facts.push({ label: t('room.pets', undefined, lang), value: yesNo(room.petsAllowed, lang) })
  return facts
}
