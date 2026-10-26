import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import HomeMockup from './HomeMockup'
import './building-3d.css'
import './home-mockup.css'
import './home-sections.css'

createRoot(document.getElementById('root')!).render(<StrictMode><HomeMockup /></StrictMode>)
