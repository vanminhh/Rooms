import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ComponentPreview from './pages/ComponentPreview'
import './component-preview.css'

createRoot(document.getElementById('root')!).render(<StrictMode><ComponentPreview /></StrictMode>)
