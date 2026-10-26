import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Building3D from './Building3D'
import './building-3d.css'

createRoot(document.getElementById('root')!).render(<StrictMode><Building3D /></StrictMode>)
