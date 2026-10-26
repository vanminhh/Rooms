import type { ReactNode } from 'react'

// Line icons drawn for the mockup (no icon library in the project yet).
export const Icon = ({ children, size = 34 }: { children: ReactNode; size?: number }) => <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
export const Arrow = () => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16M14 6l6 6-6 6" /></svg>
export const Star = () => <Icon size={18}><path d="M16 4.5l3.5 7.2 7.9 1.1-5.7 5.5 1.4 7.9L16 22.4l-7.1 3.8 1.4-7.9-5.7-5.5 7.9-1.1z" /></Icon>
export const SearchChart = () => <Icon size={32}><circle cx="14" cy="14" r="8" /><path d="M20 20l7 7M10.5 17v-3M14 17v-6M17.5 17v-4.5" /></Icon>
export const Pin = () => <Icon size={32}><path d="M16 28s-8-7.2-8-14a8 8 0 0 1 16 0c0 6.8-8 14-8 14z" /><circle cx="16" cy="14" r="3" /></Icon>
export const Key = () => <Icon size={32}><circle cx="9.5" cy="16" r="4.5" /><path d="M14 16h13M22 16v4M26 16v3" /></Icon>
export const Headset = () => <Icon size={20}><path d="M6 18v-3a10 10 0 0 1 20 0v3M6 18a2 2 0 0 0 2 2h1v-6H8a2 2 0 0 0-2 2zM26 18a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM23 22c0 3-3 4-7 4" /></Icon>
export const Chat = () => <Icon size={20}><path d="M5 7h22v15H14l-6 5v-5H5z" /><path d="M10 13h12M10 17h8" /></Icon>
export const Shield = () => <Icon size={20}><path d="M16 4l10 4v7c0 6-4.5 10-10 13C10.5 25 6 21 6 15V8z" /><path d="M11.5 16l3.2 3.2 6-6.4" /></Icon>
