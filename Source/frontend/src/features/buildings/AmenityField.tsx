import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Checkbox, FormError, RoomsButton } from '../../components'
import { applyApiError } from '../../shared/form-errors'
import { getPublicFilters, publicQueryKeys } from '../public/api'
import { updateBuildingNotes } from './api'
import type { BuildingView } from './api'

// BLD-08: amenities are ticked from the fixed list of GET /public/filters (the only source of labels).
export function AmenityField({ value, onChange }: { value: string[]; onChange(next: string[]): void }) {
  const catalog = useQuery({ queryKey: publicQueryKeys.filters, queryFn: getPublicFilters })
  return <fieldset className="buildings-amenities" disabled={!catalog.data}>
    <legend className="rooms-field-label">Tiện ích{catalog.isPending ? ' (đang tải…)' : ''}</legend>
    {catalog.isError && <FormError>{catalog.error.message}</FormError>}
    {catalog.data?.amenities.map(item => <Checkbox key={item.code} label={item.label} checked={value.includes(item.code)}
      onChange={event => onChange(event.target.checked ? [...value, item.code] : value.filter(code => code !== item.code))} />)}
  </fieldset>
}

// BLD-08, OQ-1: old free text stays visible to staff until they clear it; saving codes never touches it.
export function LegacyAmenities({ building }: { building: BuildingView }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const clear = useMutation({
    mutationFn: () => updateBuildingNotes(building.id, { legacyAmenities: [] }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['buildings'] }),
  })
  if (building.legacyAmenities.length === 0) return null

  async function onClear() {
    setError('')
    try {
      await clear.mutateAsync()
    } catch (e) {
      setError(applyApiError(e, () => undefined, []))
    }
  }

  return <div className="buildings-legacy">
    <p className="rooms-field-label">Tiện ích cũ (chưa chọn lại)</p>
    <p>{building.legacyAmenities.join(', ')}</p>
    <FormError>{error}</FormError>
    <RoomsButton variant="outline" type="button" disabled={clear.isPending} onClick={() => void onClear()}>Xóa tiện ích cũ</RoomsButton>
  </div>
}
