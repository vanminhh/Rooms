import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Checkbox, RoomsButton, TextField } from '../../components'
import type { PublicFiltersView, PublicLocation } from './api'
import { filterSchema } from './room-filters'
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
    <div className="public-filter-prices">
      <TextField type="number" inputMode="decimal" min="0" step="0.1" label="Diện tích từ (m²)" placeholder="Không giới hạn"
        error={errors.minArea?.message} {...register('minArea')} />
      <TextField type="number" inputMode="decimal" min="0" step="0.1" label="Diện tích đến (m²)" placeholder="Không giới hạn"
        error={errors.maxArea?.message} {...register('maxArea')} />
    </div>
    <div className="public-filter-prices">
      <TextField type="number" inputMode="numeric" min="1" label="Số người ở tối thiểu" placeholder="Không giới hạn"
        error={errors.minOccupants?.message} {...register('minOccupants')} />
      <TextField type="number" inputMode="numeric" min="1" label="Tầng" placeholder="Tất cả các tầng"
        error={errors.floor?.message} {...register('floor')} />
    </div>
    <label className="rooms-field">
      <span className="rooms-field-label">Loại phòng</span>
      <Controller control={control} name="roomType" render={({ field }) => (
        <select {...field} className="rooms-field-input" disabled={!catalog}>
          <option value="">{catalog ? 'Mọi loại phòng' : 'Đang tải…'}</option>
          {catalog?.roomTypes.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
      )} />
    </label>
    <fieldset className="public-filter-group">
      <legend className="rooms-field-label">Phòng có</legend>
      <Checkbox label="Ban công" {...register('balcony')} />
      <Checkbox label="Cửa sổ" {...register('window')} />
      <Checkbox label="Cho nuôi thú cưng" {...register('pets')} />
    </fieldset>
    <fieldset className="public-filter-group" disabled={!catalog}>
      <legend className="rooms-field-label">Tiện ích tòa{catalog ? '' : ' (đang tải…)'}</legend>
      <Controller control={control} name="amenities" render={({ field }) => <>
        {catalog?.amenities.map(item => <Checkbox key={item.code} label={item.label} checked={field.value.includes(item.code)}
          onChange={event => field.onChange(event.target.checked ? [...field.value, item.code] : field.value.filter(code => code !== item.code))} />)}
      </>} />
    </fieldset>
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
