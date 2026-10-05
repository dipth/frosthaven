import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const server = `http://localhost:${process.env['PORT'] ?? 3000}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: server, ws: true },
      '/game-data': server,
      '/assets': server,
      '/login': server,
      '/invite': server
    }
  },
  build: {
    chunkSizeWarningLimit: 2000
  }
});
