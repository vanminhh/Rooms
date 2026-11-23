import { apiRequest, apiRequestPage, listPath } from '../../shared/api'

export interface MyNotification { id: number; kind: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }

// NOTI-11: meta carries unreadCount next to page/limit/total.
export async function listMyNotifications() {
  const page = await apiRequestPage<MyNotification>(listPath('/me/notifications', { limit: 10 }))
  return { items: page.data, unreadCount: (page.meta as { unreadCount?: number }).unreadCount ?? 0 }
}
export const readNotification = (id: number) => apiRequest<{ id: number; readAt: string }>(`/me/notifications/${id}/read`, { method: 'POST' })
export const readAllNotifications = () => apiRequest<{ updated: number }>('/me/notifications/read-all', { method: 'POST' })
