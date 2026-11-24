import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devApi = 'http://127.0.0.1:8000';

// A portable build uses the API served alongside it. GitHub Pages uses the hosted API.
export default defineConfig(({ command }) => ({
  define: command === 'build' && process.env.GITHUB_ACTIONS === 'true' ? {
    'import.meta.env.VITE_HISTORY_API_URL': JSON.stringify(
      process.env.VITE_HISTORY_API_URL || 'https://mera-college-api.onrender.com/api',
    ),
  } : undefined,
  esbuild: { target: 'es2022', supported: { decorators: false } },
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': {
        target: devApi,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (outgoing, request) => {
            if (request.headers.origin === 'http://' + request.headers.host) {
              outgoing.setHeader('Origin', devApi);
            }
          });
        },
      },
    },
  },
}));
