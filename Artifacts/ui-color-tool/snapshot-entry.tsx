import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AuthContext } from '/src/app/auth-context'
import { I18nProvider } from '/src/shared/i18n'
import { PublicLayout } from '/src/layouts/PublicLayout'
import { PublicHomePage } from '/src/pages/public/PublicHomePage'
import { publicQueryKeys } from '/src/features/public/api'

// Render the real components with local fixtures; no customer data or API calls.
export function snapshot() {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } })
  const locations = ['Đống Đa', 'Ba Đình', 'Cầu Giấy'].map((district, i) => ({ district, roomCount: 3 + i, wards: [{ ward: 'Phường minh họa', roomCount: 3 + i }] }))
  client.setQueryData([...publicQueryKeys.locations, 'vi'], locations)
  client.setQueryData([...publicQueryKeys.featured, 'vi'], locations.map((place, i) => ({
    id: i + 1, code: ['A201', 'B302', 'C401'][i], buildingId: i + 1, buildingCode: `DEMO${i}`,
    buildingName: `Rooms ${['Láng Hạ', 'Ba Đình', 'Cầu Giấy'][i]}`, district: place.district,
    ward: 'Dữ liệu minh họa', price: [3500000, 4200000, 4800000][i], areaM2: [25, 32, 38][i],
    floor: i + 2, maxOccupants: 2, imageUrl: ['/images/rooms-hanoi-room.webp', '/images/auth-room.webp', null][i],
    roomType: 'STUDIO', hasBalcony: true, hasWindow: true, petsAllowed: null, buildingAmenities: [],
  })))
  client.setQueryData(['public', 'contact'], { phone: '0900 000 000', zaloUrl: 'https://example.com', facebookUrl: null })
  const disabled = () => { throw new Error('Static color preview: account actions are disabled') }
  const auth = { status: 'ready' as const, user: null, login: disabled, acceptSession: disabled, logout: disabled, refreshMe: disabled, retry: disabled }
  const html = renderToStaticMarkup(<QueryClientProvider client={client}><I18nProvider locale="vi"><AuthContext.Provider value={auth}>
    <MemoryRouter initialEntries={['/']}><Routes><Route element={<PublicLayout />}><Route path="/" element={<PublicHomePage />} /></Route></Routes></MemoryRouter>
  </AuthContext.Provider></I18nProvider></QueryClientProvider>)
  client.clear()
  return html
}
