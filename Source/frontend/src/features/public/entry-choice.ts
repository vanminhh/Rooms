export type EntryChoice = '/' | '/thue' | '/ql'
const STORAGE_KEY = 'rooms.entryChoice'

export function readEntryChoice(): EntryChoice | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === '/' || value === '/thue' || value === '/ql' ? value : null
  } catch {
    return null
  }
}

export function saveEntryChoice(value: EntryChoice): void {
  try { localStorage.setItem(STORAGE_KEY, value) } catch { /* The current page still closes when storage is blocked. */ }
}
