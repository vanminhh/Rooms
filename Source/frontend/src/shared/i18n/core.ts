import { createContext, useContext } from 'react'
import { en } from './en'
import { vi } from './vi'

export type Lang = 'vi' | 'en'
export type DictKey = keyof typeof vi
export type Params = Record<string, string | number>
export const STORAGE_KEY = 'rooms.lang'

let memoryLang: Lang = 'vi'

function storedLang(): Lang | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === null ? null : saved === 'en' ? 'en' : 'vi'
  } catch {
    return null
  }
}

export function savedLang(): Lang | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'vi' || saved === 'en' ? saved : null
  } catch {
    return null
  }
}

export function currentLang(): Lang {
  return storedLang() ?? memoryLang
}

export function setStoredLang(next: Lang): void {
  memoryLang = next
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // The current page can still switch languages when browser storage is unavailable.
  }
}

function lookup(key: string, lang: Lang): string | undefined {
  const typedKey = key as DictKey
  return (lang === 'en' ? en[typedKey] : vi[typedKey]) || vi[typedKey]
}

export function t(key: DictKey, params?: Params, lang: Lang = currentLang()): string {
  const pluralKey = typeof params?.count === 'number'
    ? `${key}.${params.count === 1 ? 'one' : 'other'}`
    : null
  const message = (pluralKey && lookup(pluralKey, lang)) || lookup(key, lang)
  if (!message) {
    console.error(`Missing translation: ${key}`)
    return ''
  }
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (placeholder, name: string) => {
    if (params && Object.hasOwn(params, name)) return String(params[name])
    console.error(`Missing translation parameter: ${name} for ${key}`)
    return placeholder
  })
}

export type I18nValue = {
  lang: Lang
  t: (key: DictKey, params?: Params) => string
  setLang: (next: Lang) => void
}

export const I18nContext = createContext<I18nValue>({
  lang: 'vi',
  t: (key, params) => t(key, params, 'vi'),
  setLang: setStoredLang,
})

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
