import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // API routes proxy
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[API Proxy] Error:', err.message);
          });
          proxy.on('proxyReq', (_proxyReq, req, _res) => {
            console.log('[API Proxy] Request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[API Proxy] Response:', proxyRes.statusCode, req.url);
          });
        },
      },
      // Auth routes proxy - required for OAuth flow
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        // Handle cookies properly across the proxy
        cookieDomainRewrite: 'localhost',
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[Auth Proxy] Error:', err.message);
          });
          proxy.on('proxyReq', (_proxyReq, req, _res) => {
            console.log('[Auth Proxy] Request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[Auth Proxy] Response:', proxyRes.statusCode, req.url);
          });
        },
      },
      // Health check proxy
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
