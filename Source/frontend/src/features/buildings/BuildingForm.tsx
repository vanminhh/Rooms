import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { applyApiError } from '../../shared/form-errors'
import { listManagers } from '../managers/api'
import { createBuilding, updateBuilding, updateBuildingNotes } from './api'
import type { BuildingNotesInput, BuildingView, CreateBuildingInput } from './api'
import { SelectField, TextAreaField } from './fields'
import { waterModeLabels } from './labels'
import { buildingFormSchema, buildingNotesFormSchema } from './schemas'
import './buildings.css'

// The form keeps amenities as one comma-separated line and managerId as a select value; both are converted before the API call.
const adminFormSchema = buildingFormSchema.extend({ amenities: z.string(), managerId: z.string(), description: z.string() })
const adminFields = ['code', 'name', 'address', 'district', 'ward', 'waterMode', 'dueDays', 'managerId', 'amenities', 'description'] as const
const notesFormSchema = buildingNotesFormSchema.extend({ amenities: z.string(), description: z.string() })
const notesFields = ['amenities', 'description'] as const

type AdminFormValues = z.infer<typeof adminFormSchema>
type NotesFormValues = z.infer<typeof notesFormSchema>

function toAmenities(text: string): string[] {
  return text.split(',').map(item => item.trim()).filter(Boolean)
}

// Boss creates a building or edits every field (BLD-01, BLD-03). Lock/unlock is a separate control (BLD-06).
export function BuildingForm({ building, onSaved, onCancel }: { building?: BuildingView; onSaved?(saved: BuildingView): void; onCancel?(): void }) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState('')
  // shortcut: the manager dropdown reads one page of 100 (the BE maximum); paginate it if the staff list ever grows past that.
  const managers = useQuery({
    queryKey: ['managers', 'options'],
    queryFn: () => listManagers({ limit: 100 }),
  })
  // A locked manager is kept in the list so the current assignment is not shown as empty.
  const managerOptions = (managers.data?.data ?? []).filter(manager => manager.isActive || manager.id === building?.managerId)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<AdminFormValues>({
    resolver: zodResolver(adminFormSchema),
    defaultValues: building
      ? {
        code: building.code,
        name: building.name,
        address: building.address,
        district: building.district,
        ward: building.ward,
        waterMode: building.waterMode,
        dueDays: building.dueDays,
        managerId: building.managerId === null ? '' : String(building.managerId),
        amenities: building.amenities.join(', '),
        description: building.description ?? '',
      }
      // shortcut: 5 is the DB default for due_days (schema.prisma); water mode has no default, so the user picks it.
      : { dueDays: 5, managerId: '', amenities: '', description: '' },
  })

  const save = useMutation({
    mutationFn: (input: CreateBuildingInput) => building ? updateBuilding(building.id, input) : createBuilding(input),
    onSuccess: saved => {
      void queryClient.invalidateQueries({ queryKey: ['buildings'] })
      void queryClient.invalidateQueries({ queryKey: ['managers'] })
      onSaved?.(saved)
    },
  })

  async function onSubmit(values: AdminFormValues) {
    setFormError('')
    const input: CreateBuildingInput = {
      code: values.code,
      name: values.name,
      address: values.address,
      district: values.district,
      ward: values.ward,
      waterMode: values.waterMode,
      dueDays: values.dueDays,
      managerId: values.managerId ? Number(values.managerId) : null,
      amenities: toAmenities(values.amenities),
      description: values.description.trim() || null,
    }
    try {
      await save.mutateAsync(input)
    } catch (error) {
      setFormError(applyApiError(error, setError, adminFields))
    }
  }

  return <form noValidate className="buildings-form" onSubmit={handleSubmit(onSubmit)}>
    <TextField label="Mã tòa" autoComplete="off" error={errors.code?.message} {...register('code')} />
    <TextField label="Tên tòa" error={errors.name?.message} {...register('name')} />
    <TextField label="Địa chỉ" error={errors.address?.message} {...register('address')} />
    <TextField label="Quận/huyện" error={errors.district?.message} {...register('district')} />
    <TextField label="Phường/xã" error={errors.ward?.message} {...register('ward')} />
    <SelectField label="Cách tính nước" error={errors.waterMode?.message} {...register('waterMode')}>
      <option value="">Chọn cách tính nước</option>
      {Object.entries(waterModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </SelectField>
    <TextField label="Số ngày thu (1–31)" type="number" inputMode="numeric" min={1} max={31} error={errors.dueDays?.message} {...register('dueDays', { valueAsNumber: true })} />
    <SelectField label="Quản lý phụ trách" error={errors.managerId?.message} {...register('managerId')}>
      <option value="">Chưa gán quản lý</option>
      {managerOptions.map(manager => <option key={manager.id} value={manager.id}>{manager.fullName}{manager.isActive ? '' : ' (đã khóa)'}</option>)}
    </SelectField>
    {managers.isError && <FormError>{managers.error.message}</FormError>}
    <TextField label="Tiện ích (cách nhau bằng dấu phẩy)" error={errors.amenities?.message} {...register('amenities')} />
    <TextAreaField label="Mô tả" rows={4} error={errors.description?.message} {...register('description')} />
    <FormError>{formError}</FormError>
    <div className="buildings-form-actions">
      <RoomsButton type="submit" disabled={save.isPending}>Lưu{save.isPending && <Spinner label="Đang lưu" />}</RoomsButton>
      {onCancel && <RoomsButton variant="outline" onClick={onCancel}>Hủy</RoomsButton>}
    </div>
  </form>
}

// Manager edits amenities and description of his own building only (BLD-02).
export function BuildingNotesForm({ building }: { building: BuildingView }) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<NotesFormValues>({
    resolver: zodResolver(notesFormSchema),
    defaultValues: { amenities: building.amenities.join(', '), description: building.description ?? '' },
  })

  const save = useMutation({
    mutationFn: (input: BuildingNotesInput) => updateBuildingNotes(building.id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['buildings'] })
      setSaved(true)
    },
  })

  async function onSubmit(values: NotesFormValues) {
    setFormError('')
    setSaved(false)
    try {
      await save.mutateAsync({ amenities: toAmenities(values.amenities), description: values.description.trim() || null })
    } catch (error) {
      setFormError(applyApiError(error, setError, notesFields))
    }
  }

  return <>
    {saved && <p className="buildings-notice" role="status">Đã lưu.</p>}
    <form noValidate className="buildings-form" onSubmit={handleSubmit(onSubmit)}>
      <TextField label="Tiện ích (cách nhau bằng dấu phẩy)" error={errors.amenities?.message} {...register('amenities')} />
      <TextAreaField label="Mô tả" rows={4} error={errors.description?.message} {...register('description')} />
      <FormError>{formError}</FormError>
      <div className="buildings-form-actions">
        <RoomsButton type="submit" disabled={isSubmitting}>Lưu{isSubmitting && <Spinner label="Đang lưu" />}</RoomsButton>
      </div>
    </form>
  </>
}
