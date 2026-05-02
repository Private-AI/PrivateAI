import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/deck/',
  build: {
    // Output directly into the Next.js public folder so Next.js serves it at /deck/
    outDir: '../frontend/public/deck',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
    },
  },
})
