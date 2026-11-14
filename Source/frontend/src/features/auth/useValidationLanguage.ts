import { useEffect, useRef } from 'react'
import type { FieldErrors, FieldValues, Path, UseFormTrigger } from 'react-hook-form'
import type { Lang } from '../../shared/i18n'

// UI-12: translate existing client errors without resetting inputs or clearing API field errors (UI-05).
export function useValidationLanguage<T extends FieldValues>(lang: Lang, errors: FieldErrors<T>, trigger: UseFormTrigger<T>) {
  const previous = useRef(lang)
  useEffect(() => {
    if (previous.current === lang) return
    previous.current = lang
    const fields = Object.keys(errors).filter(name => errors[name]?.type !== 'server') as Path<T>[]
    if (fields.length) void trigger(fields)
  }, [lang, errors, trigger])
}
