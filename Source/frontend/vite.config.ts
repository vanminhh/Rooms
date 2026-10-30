import { fileURLToPath } from 'node:url'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  // Same-origin API in dev so auth cookies work without CORS (FE-LOGIN-03).
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        components: fileURLToPath(new URL('./components.html', import.meta.url)),
      },
    },
  },
})
