import { z } from 'zod'
import type { I18nValue } from '../../shared/i18n'
export function viewingFormSchema(t: I18nValue['t']) {
  return z.object({ visitAt: z.string().min(1, t('viewing.chooseHour')), note: z.string().max(500, t('viewing.noteTooLong')) })
}
export type ViewingFormValues = z.infer<ReturnType<typeof viewingFormSchema>>
