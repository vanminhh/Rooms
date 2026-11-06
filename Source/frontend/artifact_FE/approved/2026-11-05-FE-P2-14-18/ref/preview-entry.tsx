import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router'
import { AppProviders } from '../src/app/AppProviders'
import { routes } from '../src/app/routes'

// Same providers and routes as src/main.tsx; the draft routes replace the main ones only inside this preview.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={createBrowserRouter(routes)} />
    </AppProviders>
  </StrictMode>,
)
