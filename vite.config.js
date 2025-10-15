import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Allow Cloudflare Tunnel host to access dev server
    allowedHosts: ['test.ganudenu.store'],
    proxy: {
      // Proxy API calls to the backend server to avoid JSON parse errors from Vite's index.html
      '/api': {
        target: 'http://localhost:5174',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:5174',
        changeOrigin: true
      }
    }
  }
})