import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/admin/api': 'http://notification-api:8080',
      '/api': 'http://notification-api:8080'
    }
  }
});
