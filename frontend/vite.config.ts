import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Geliştirme: /api istekleri .NET backend'e (5080) yönlendirilir.
// Derleme: çıktı doğrudan backend'in wwwroot klasörüne yazılır, tek uygulama olarak yayınlanır.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5080',
    },
  },
  build: {
    outDir: '../backend/MeosKokpit.Api/wwwroot',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
})
