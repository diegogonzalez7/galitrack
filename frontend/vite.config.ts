import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

const apiProxy = {
  '/api': {
    target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react(), tailwind()],
  server: { proxy: apiProxy, strictPort: true },
  preview: { proxy: apiProxy, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
})
