import { useEffect, useMemo } from 'react'
import type { ReactElement } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Checkbox, RoomsButton, TextField } from '../../components'
import { t as translate, useI18n } from '../../shared/i18n'
import type { PublicFiltersView, PublicLocation } from './api'
import { filterSchemaFor } from './room-filters'
import type { FilterFormValues, PublicFilters } from './room-filters'
import './public.css'

export type { PublicFilters } from './room-filters'

// Filter form of /phong (FE-P2-15). No building select: buildingId only comes from the URL (D-1).
export function RoomFilters({ locations, catalog, values, onChange, onReset }: {
  locations: PublicLocation[]
  catalog: PublicFiltersView | undefined // from GET /public/filters; the two lists stay disabled until it loads (UI-03)
  values: PublicFilters
  onChange: (next: PublicFilters) => void
  onReset: () => void
}): ReactElement {
  const { lang, t } = useI18n()
  const schema = useMemo(() => filterSchemaFor((key, params) => translate(key, params, lang)), [lang])
  const { control, register, handleSubmit, reset, trigger, setValue, formState: { errors } } = useForm<FilterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: values,
  })
  const district = useWatch({ control, name: 'district' })

  // Every URL change (apply, reset, page, "Bỏ lọc tòa") replaces the form; a bad URL value shows its message at once.
  useEffect(() => {
    reset(values)
    void trigger()
  }, [reset, trigger, values])
  useEffect(() => { void trigger() }, [lang, trigger])

  // The ward list follows the chosen district; with no district it lists every ward once.
  const scope = district ? locations.filter(item => item.district === district) : locations
  const wards = [...new Set(scope.flatMap(item => item.wards.map(ward => ward.ward)))]

  return <form className="public-filters" noValidate onSubmit={handleSubmit(data => onChange({ ...values, ...data }))}>
    <label className="rooms-field">
      <span className="rooms-field-label">{t('rooms.filters.district')}</span>
      <Controller control={control} name="district" render={({ field }) => (
        <select {...field} className="rooms-field-input" onChange={event => {
          field.onChange(event.target.value)
          setValue('ward', '')
        }}>
          <option value="">{t('rooms.filters.allDistricts')}</option>
          {locations.map(item => <option key={item.district} value={item.district}>{item.district}</option>)}
        </select>
      )} />
    </label>
    <label className="rooms-field">
      <span className="rooms-field-label">{t('rooms.filters.ward')}</span>
      <Controller control={control} name="ward" render={({ field }) => (
        <select {...field} className="rooms-field-input">
          <option value="">{t('rooms.filters.allWards')}</option>
          {wards.map(ward => <option key={ward} value={ward}>{ward}</option>)}
        </select>
      )} />
    </label>
    <div className="public-filter-prices">
      <TextField type="number" inputMode="numeric" min="0" label={t('rooms.filters.minPrice')} placeholder={t('rooms.filters.noLimit')}
        error={errors.minPrice?.message} {...register('minPrice')} />
      <TextField type="number" inputMode="numeric" min="0" label={t('rooms.filters.maxPrice')} placeholder={t('rooms.filters.noLimit')}
        error={errors.maxPrice?.message} {...register('maxPrice')} />
    </div>
    <div className="public-filter-prices">
      <TextField type="number" inputMode="decimal" min="0" step="0.1" label={t('rooms.filters.minArea')} placeholder={t('rooms.filters.noLimit')}
        error={errors.minArea?.message} {...register('minArea')} />
      <TextField type="number" inputMode="decimal" min="0" step="0.1" label={t('rooms.filters.maxArea')} placeholder={t('rooms.filters.noLimit')}
        error={errors.maxArea?.message} {...register('maxArea')} />
    </div>
    <div className="public-filter-prices">
      <TextField type="number" inputMode="numeric" min="1" label={t('rooms.filters.minOccupants')} placeholder={t('rooms.filters.noLimit')}
        error={errors.minOccupants?.message} {...register('minOccupants')} />
      <TextField type="number" inputMode="numeric" min="1" label={t('rooms.filters.floor')} placeholder={t('rooms.filters.allFloors')}
        error={errors.floor?.message} {...register('floor')} />
    </div>
    <label className="rooms-field">
      <span className="rooms-field-label">{t('rooms.filters.roomType')}</span>
      <Controller control={control} name="roomType" render={({ field }) => (
        <select {...field} className="rooms-field-input" disabled={!catalog}>
          <option value="">{catalog ? t('rooms.filters.allTypes') : t('rooms.filters.loading')}</option>
          {catalog?.roomTypes.map(item => <option key={item.code} value={item.code}>{lang === 'en' ? item.labelEn || item.label : item.label}</option>)}
        </select>
      )} />
    </label>
    <fieldset className="public-filter-group">
      <legend className="rooms-field-label">{t('rooms.filters.features')}</legend>
      <Checkbox label={t('rooms.filters.balcony')} {...register('balcony')} />
      <Checkbox label={t('rooms.filters.window')} {...register('window')} />
      <Checkbox label={t('rooms.filters.pets')} {...register('pets')} />
    </fieldset>
    <fieldset className="public-filter-group" disabled={!catalog}>
      <legend className="rooms-field-label">{t('rooms.filters.amenities')}{catalog ? '' : t('rooms.filters.loadingSuffix')}</legend>
      <Controller control={control} name="amenities" render={({ field }) => <>
        {catalog?.amenities.map(item => <Checkbox key={item.code} label={lang === 'en' ? item.labelEn || item.label : item.label} checked={field.value.includes(item.code)}
          onChange={event => field.onChange(event.target.checked ? [...field.value, item.code] : field.value.filter(code => code !== item.code))} />)}
      </>} />
    </fieldset>
    <label className="rooms-field">
      <span className="rooms-field-label">{t('rooms.filters.sort')}</span>
      <Controller control={control} name="sort" render={({ field }) => (
        <select {...field} className="rooms-field-input">
          <option value="price">{t('rooms.filters.lowestPrice')}</option>
          <option value="newest">{t('rooms.filters.newest')}</option>
        </select>
      )} />
    </label>
    <div className="public-filter-actions">
      <RoomsButton type="submit">{t('rooms.filters.apply')} <span aria-hidden="true">↗</span></RoomsButton>
      <RoomsButton variant="outline" onClick={onReset}>{t('rooms.list.clear')}</RoomsButton>
    </div>
  </form>
}
