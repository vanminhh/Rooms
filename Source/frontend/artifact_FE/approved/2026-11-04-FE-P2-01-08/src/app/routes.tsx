import type { RouteObject } from 'react-router'
import { PublicLayout } from '../layouts/PublicLayout'
import { TenantLayout } from '../layouts/TenantLayout'
import { StaffLayout } from '../layouts/StaffLayout'
import { PlaceholderPage } from '../pages/public/PlaceholderPage'
import { PublicRoomsPage } from '../pages/public/PublicRoomsPage'
import { PublicBuildingPage } from '../pages/public/PublicBuildingPage'
import { PublicRoomPage } from '../pages/public/PublicRoomPage'
import { NotFoundPage } from '../pages/public/NotFoundPage'
import { LoginPage } from '../pages/public/LoginPage'
import { ChangePasswordPage } from '../pages/public/ChangePasswordPage'
import { ForgotPasswordPage } from '../pages/public/ForgotPasswordPage'
import { TenantHomePage } from '../pages/tenant/TenantHomePage'
import { TenantAccountPage } from '../pages/tenant/TenantAccountPage'
import { StaffHomePage } from '../pages/staff/StaffHomePage'
import { StaffAccountPage } from '../pages/staff/StaffAccountPage'
import { BuildingsPage } from '../pages/staff/BuildingsPage'
import { BuildingDetailPage } from '../pages/staff/BuildingDetailPage'
import { ManagersPage } from '../pages/staff/ManagersPage'
import { RoomsPage } from '../pages/staff/RoomsPage'
import { PricesPage } from '../pages/staff/PricesPage'
import { ApprovalsPage } from '../pages/staff/ApprovalsPage'
import { ViewingsPage } from '../pages/staff/ViewingsPage'
import { GuestOnly, RequireAuth } from './RequireAuth'

export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <PlaceholderPage /> },
      { path: '/phong', element: <PublicRoomsPage /> },
      { path: '/toa/:id', element: <PublicBuildingPage /> },
      { path: '/phong/:id', element: <PublicRoomPage /> },
      { element: <GuestOnly />, children: [{ path: '/dang-nhap', element: <LoginPage /> }] },
      { path: '/quen-mat-khau', element: <ForgotPasswordPage /> },
      { element: <RequireAuth allow="any" />, children: [{ path: '/doi-mat-khau', element: <ChangePasswordPage /> }] },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/thue',
    element: <RequireAuth allow={['TENANT']} />,
    children: [{
      element: <TenantLayout />,
      children: [
        { index: true, element: <TenantHomePage /> },
        { path: 'tai-khoan', element: <TenantAccountPage /> },
      ],
    }],
  },
  {
    path: '/ql',
    element: <RequireAuth allow={['MANAGER', 'BOSS']} />,
    children: [{
      element: <StaffLayout />,
      children: [
        { index: true, element: <StaffHomePage /> },
        { path: 'tai-khoan', element: <StaffAccountPage /> },
        { path: 'toa-nha', element: <BuildingsPage /> },
        { path: 'toa-nha/:id', element: <BuildingDetailPage /> },
        { path: 'phong', element: <RoomsPage /> },
        { path: 'don-gia', element: <PricesPage /> },
        { path: 'lich-hen', element: <ViewingsPage /> },
        // Boss-only pages: the guard blocks a manager who types the URL, not only the menu (AUTH-06, UI-08).
        { element: <RequireAuth allow={['BOSS']} />, children: [
          { path: 'nhan-su', element: <ManagersPage /> },
          { path: 'duyet-gia', element: <ApprovalsPage /> },
        ] },
      ],
    }],
  },
]
