import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { forceLanguage, setLanguage } from '../api'
import { currentLang, I18nContext, setStoredLang, t } from './core'
import type { Lang } from './core'

export function I18nProvider({ children, locale }: { children: ReactNode; locale?: Lang }): ReactElement {
  const [selected, setSelected] = useState(currentLang)
  const lang = locale ?? selected
  const setLang = useCallback((next: Lang) => {
    if (locale) return
    setStoredLang(next)
    setLanguage(next)
    setSelected(next)
  }, [locale])

  useLayoutEffect(() => {
    if (!locale) return setLanguage(lang)
    // A fixed-language area (the staff app, LOC-01) also fixes the language its API calls ask for, until it unmounts.
    forceLanguage(locale)
    return () => forceLanguage(null)
  }, [lang, locale])

  useEffect(() => {
    try {
      if (typeof document !== 'undefined') document.documentElement.lang = lang
    } catch {
      // Rendering without a writable document must not prevent translation.
    }
  }, [lang])

  return (
    <I18nContext.Provider value={{ lang, t: (key, params) => t(key, params, lang), setLang }}>
      {children}
    </I18nContext.Provider>
  )
}
