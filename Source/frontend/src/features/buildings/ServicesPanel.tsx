import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { listServices, updateService } from './api'
import type { ServiceView } from './api'
import { ServiceForm } from './ServiceForm'
import { serviceUnitLabels } from './labels'
import './buildings.css'

// Services of one building (SVC-01..04). Boss creates, renames and locks (softly, isActive); a manager reads the list.
export function ServicesPanel({ buildingId, canManage }: { buildingId: number; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const services = useQuery({
    queryKey: ['services', 'list', buildingId],
    // shortcut: one page of 100 (the BE maximum) per building; paginate here if a building ever has more services.
    queryFn: () => listServices({ buildingId, limit: 100 }),
  })
  const setActive = useMutation({
    mutationFn: (service: ServiceView) => updateService(service.id, { isActive: !service.isActive }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['services'] }),
  })

  return <section className="buildings-section">
    <SectionHeading>Dịch vụ</SectionHeading>
    {canManage && !adding && <div><RoomsButton variant="outline" onClick={() => setAdding(true)}>Thêm dịch vụ</RoomsButton></div>}
    {canManage && adding && <ServiceForm buildingId={buildingId} onClose={() => setAdding(false)} />}
    <FormError>{setActive.error?.message}</FormError>
    {services.isPending && <Spinner block label="Đang tải dịch vụ" />}
    {services.isError && <div className="buildings-state">
      <FormError>{services.error.message}</FormError>
      <RoomsButton variant="sand" onClick={() => void services.refetch()}>Thử lại</RoomsButton>
    </div>}
    {services.isSuccess && services.data.data.length === 0 && <p className="rooms-empty">
      {canManage ? 'Chưa có dịch vụ nào. Bấm “Thêm dịch vụ” để tạo dịch vụ đầu tiên.' : 'Chưa có dịch vụ nào cho tòa này.'}
    </p>}
    {services.isSuccess && services.data.data.length > 0 && <ul className="buildings-list">
      {services.data.data.map(service => <li key={service.id} className="buildings-item">
        {canManage && editingId === service.id
          ? <ServiceForm buildingId={buildingId} service={service} onClose={() => setEditingId(null)} />
          : <>
            <div>
              <p className="buildings-item-title">{service.name}</p>
              <p className="buildings-item-meta">{serviceUnitLabels[service.unit]} · {service.hasCurrentRate ? 'Đã có giá' : 'Chưa có giá'} · {service.isActive ? 'Đang dùng' : 'Đã khóa'}</p>
            </div>
            {canManage && <div className="buildings-item-actions">
              <RoomsButton variant="outline" aria-label={`Sửa dịch vụ ${service.name}`} onClick={() => setEditingId(service.id)}>Sửa</RoomsButton>
              <RoomsButton variant="outline" aria-label={`${service.isActive ? 'Khóa' : 'Mở khóa'} dịch vụ ${service.name}`} disabled={setActive.isPending} onClick={() => setActive.mutate(service)}>
                {service.isActive ? 'Khóa' : 'Mở khóa'}
              </RoomsButton>
            </div>}
          </>}
      </li>)}
    </ul>}
  </section>
}
