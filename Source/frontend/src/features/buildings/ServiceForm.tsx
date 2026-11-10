import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { applyApiError } from '../../shared/form-errors'
import { createService, updateService } from './api'
import type { ServiceView } from './api'
import { SelectField } from './fields'
import { serviceUnitLabels } from './labels'
import './buildings.css'

// Mirrors CreateServiceDto / UpdateServiceDto (SVC-01, API-03): name up to 50 characters.
const serviceFormSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên dịch vụ').max(50, 'Tên dịch vụ tối đa 50 ký tự'),
  unit: z.enum(['ROOM', 'PERSON', 'VEHICLE'], { error: 'Chọn đơn vị tính' }),
})

type ServiceFormValues = z.infer<typeof serviceFormSchema>

// Create takes a name and a unit; edit changes the name only, because the unit is fixed after creation.
export function ServiceForm({ buildingId, service, onClose }: { buildingId: number; service?: ServiceView; onClose(): void }) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState('')
  const { register, handleSubmit, setError, formState: { errors } } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    // In edit mode the unit is not rendered; its default keeps the schema valid.
    defaultValues: service ? { name: service.name, unit: service.unit } : undefined,
  })

  const save = useMutation({
    mutationFn: (values: ServiceFormValues) => service
      ? updateService(service.id, { name: values.name })
      : createService({ buildingId, name: values.name, unit: values.unit }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['services'] })
      onClose()
    },
  })

  async function onSubmit(values: ServiceFormValues) {
    setFormError('')
    try {
      await save.mutateAsync(values)
    } catch (error) {
      setFormError(applyApiError(error, setError, ['name', 'unit']))
    }
  }

  return <form noValidate className="buildings-form" onSubmit={handleSubmit(onSubmit)}>
    <TextField label="Tên dịch vụ" autoComplete="off" error={errors.name?.message} {...register('name')} />
    {!service && <SelectField label="Đơn vị tính" error={errors.unit?.message} {...register('unit')}>
      <option value="">Chọn đơn vị tính</option>
      {Object.entries(serviceUnitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </SelectField>}
    <FormError>{formError}</FormError>
    <div className="buildings-form-actions">
      <RoomsButton type="submit" disabled={save.isPending}>Lưu{save.isPending && <Spinner label="Đang lưu" />}</RoomsButton>
      <RoomsButton variant="outline" onClick={onClose}>Hủy</RoomsButton>
    </div>
  </form>
}
