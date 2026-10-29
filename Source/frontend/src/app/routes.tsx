import type { RouteObject } from 'react-router'
import { PublicLayout } from '../layouts/PublicLayout'
import { TenantLayout } from '../layouts/TenantLayout'
import { StaffLayout } from '../layouts/StaffLayout'
import { PlaceholderPage } from '../pages/public/PlaceholderPage'
import { NotFoundPage } from '../pages/public/NotFoundPage'
import { LoginPage } from '../pages/public/LoginPage'
import { ChangePasswordPage } from '../pages/public/ChangePasswordPage'
import { ForgotPasswordPage } from '../pages/public/ForgotPasswordPage'
import { TenantHomePage } from '../pages/tenant/TenantHomePage'
import { TenantAccountPage } from '../pages/tenant/TenantAccountPage'
import { StaffHomePage } from '../pages/staff/StaffHomePage'
import { StaffAccountPage } from '../pages/staff/StaffAccountPage'
import { GuestOnly, RequireAuth } from './RequireAuth'

export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <PlaceholderPage /> },
      { path: '/phong', element: <PlaceholderPage /> },
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
      ],
    }],
  },
]
