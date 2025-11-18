import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 7767,
    host: true,
    allowedHosts: ['72c3bcaa38cf.ngrok.app'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});

