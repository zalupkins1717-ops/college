import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  esbuild: { target: 'es2022', supported: { decorators: false } },
  plugins: [react()],
  base: './',
});
