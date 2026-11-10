import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog, FormError, RoomsButton } from '../../components'
import { updateBuilding } from './api'
import type { BuildingView } from './api'

// Boss locks or unlocks a building (BLD-06). Locking unassigns the manager and keeps NEW/CONFIRMED viewings (VIEW-13),
// so the dialog states how many are still open.
export function BuildingLockControl({ building }: { building: BuildingView }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const toggle = useMutation({
    mutationFn: () => updateBuilding(building.id, { isActive: !building.isActive }),
    onSuccess: () => setOpen(false),
    onSettled: () => {
      // Locking clears the manager (BLD-06) and can change public rooms, so buildings, managers and rooms are refetched.
      void queryClient.invalidateQueries({ queryKey: ['buildings'] })
      void queryClient.invalidateQueries({ queryKey: ['managers'] })
      void queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
  })

  const description = building.isActive
    ? `Quản lý đang phụ trách sẽ được gỡ khỏi tòa này. Còn ${building.pendingViewingCount} lịch hẹn chưa xử lý.`
    : 'Sau khi mở khóa, Boss cần gán lại quản lý cho tòa nếu cần.'

  return <div className="buildings-lock">
    <RoomsButton variant="outline" onClick={() => { toggle.reset(); setOpen(true) }}>
      {building.isActive ? 'Khóa tòa' : 'Mở khóa tòa'}
    </RoomsButton>
    <ConfirmDialog
      open={open}
      title={building.isActive ? 'Khóa tòa này?' : 'Mở khóa tòa này?'}
      description={<>
        <p>{description}</p>
        <FormError>{toggle.error?.message}</FormError>
      </>}
      confirmLabel={building.isActive ? 'Khóa tòa' : 'Mở khóa'}
      pending={toggle.isPending}
      onConfirm={() => toggle.mutate()}
      onClose={() => setOpen(false)}
    />
  </div>
}
