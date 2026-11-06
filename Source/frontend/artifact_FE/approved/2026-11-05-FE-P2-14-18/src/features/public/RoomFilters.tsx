import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { RoomsButton, TextField } from '../../components'
import type { PublicLocation } from './api'
import { filterSchema } from './room-filters'
import type { FilterFormValues, PublicFilters } from './room-filters'
import './public.css'

export type { PublicFilters } from './room-filters'

// Filter form of /phong (FE-P2-15). No building select: buildingId only comes from the URL (D-1).
export function RoomFilters({ locations, values, onChange, onReset }: {
  locations: PublicLocation[]
  values: PublicFilters
  onChange: (next: PublicFilters) => void
  onReset: () => void
}): ReactElement {
  const { control, register, handleSubmit, reset, trigger, setValue, formState: { errors } } = useForm<FilterFormValues>({
    resolver: zodResolver(filterSchema),
    defaultValues: values,
  })
  const district = useWatch({ control, name: 'district' })

  // Every URL change (apply, reset, page, "Bỏ lọc tòa") replaces the form; a bad URL value shows its message at once.
  useEffect(() => {
    reset(values)
    void trigger()
  }, [reset, trigger, values])

  // The ward list follows the chosen district; with no district it lists every ward once.
  const scope = district ? locations.filter(item => item.district === district) : locations
  const wards = [...new Set(scope.flatMap(item => item.wards.map(ward => ward.ward)))]

  return <form className="public-filters" noValidate onSubmit={handleSubmit(data => onChange({ ...values, ...data }))}>
    <label className="rooms-field">
      <span className="rooms-field-label">Quận</span>
      <Controller control={control} name="district" render={({ field }) => (
        <select {...field} className="rooms-field-input" onChange={event => {
          field.onChange(event.target.value)
          setValue('ward', '')
        }}>
          <option value="">Tất cả quận</option>
          {locations.map(item => <option key={item.district} value={item.district}>{item.district}</option>)}
        </select>
      )} />
    </label>
    <label className="rooms-field">
      <span className="rooms-field-label">Phường</span>
      <Controller control={control} name="ward" render={({ field }) => (
        <select {...field} className="rooms-field-input">
          <option value="">Tất cả phường</option>
          {wards.map(ward => <option key={ward} value={ward}>{ward}</option>)}
        </select>
      )} />
    </label>
    <div className="public-filter-prices">
      <TextField type="number" inputMode="numeric" min="0" label="Giá từ (đ/tháng)" placeholder="Không giới hạn"
        error={errors.minPrice?.message} {...register('minPrice')} />
      <TextField type="number" inputMode="numeric" min="0" label="Giá đến (đ/tháng)" placeholder="Không giới hạn"
        error={errors.maxPrice?.message} {...register('maxPrice')} />
    </div>
    <label className="rooms-field">
      <span className="rooms-field-label">Sắp xếp</span>
      <Controller control={control} name="sort" render={({ field }) => (
        <select {...field} className="rooms-field-input">
          <option value="price">Giá tăng dần</option>
          <option value="newest">Mới nhất</option>
        </select>
      )} />
    </label>
    <div className="public-filter-actions">
      <RoomsButton type="submit">Áp dụng bộ lọc <span aria-hidden="true">↗</span></RoomsButton>
      <RoomsButton variant="outline" onClick={onReset}>Xóa bộ lọc</RoomsButton>
    </div>
  </form>
}
