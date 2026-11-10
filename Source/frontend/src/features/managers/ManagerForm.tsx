import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { applyApiError } from '../../shared/form-errors'
import { createManager } from './api'
import { managerFormSchema } from './schemas'
import type { ManagerFormValues } from './schemas'
import './managers.css'

const managerFields = ['phone', 'fullName', 'email'] as const

// The temporary password lives only in the parent's state, shown once (AUTH-08).
export interface IssuedPassword {
  fullName: string
  password: string
}

// Boss creates a manager account; the API returns the temporary password once (AUTH-08).
export function ManagerForm({ onCreated, onCancel }: { onCreated(issued: IssuedPassword): void; onCancel(): void }) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState('')
  const { register, handleSubmit, setError, formState: { errors } } = useForm<ManagerFormValues>({
    resolver: zodResolver(managerFormSchema),
    defaultValues: { phone: '', fullName: '', email: '' },
  })

  const create = useMutation({
    mutationFn: (input: { phone: string; fullName: string; email?: string }) => createManager(input),
    // The password must not stay in the query cache after the form closes.
    gcTime: 0,
    onSuccess: created => {
      void queryClient.invalidateQueries({ queryKey: ['managers'] })
      onCreated({ fullName: created.manager.fullName, password: created.temporaryPassword })
    },
  })

  async function onSubmit(values: ManagerFormValues) {
    setFormError('')
    try {
      await create.mutateAsync({ phone: values.phone, fullName: values.fullName, email: values.email || undefined })
    } catch (error) {
      setFormError(applyApiError(error, setError, managerFields))
    }
  }

  return <form noValidate className="managers-form" onSubmit={handleSubmit(onSubmit)}>
    <TextField label="Số điện thoại" inputMode="tel" autoComplete="off" error={errors.phone?.message} {...register('phone')} />
    <TextField label="Họ và tên" autoComplete="off" error={errors.fullName?.message} {...register('fullName')} />
    <TextField label="Email (không bắt buộc)" type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />
    <FormError>{formError}</FormError>
    <div className="managers-form-actions">
      <RoomsButton type="submit" disabled={create.isPending}>Tạo tài khoản{create.isPending && <Spinner label="Đang tạo" />}</RoomsButton>
      <RoomsButton variant="outline" onClick={onCancel}>Hủy</RoomsButton>
    </div>
  </form>
}
