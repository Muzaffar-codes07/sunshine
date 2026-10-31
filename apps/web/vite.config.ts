import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The API consumes CommonJS contracts. Workspace links live outside node_modules,
  // so explicitly transform that package for both Vite development and Rollup.
  optimizeDeps: { include: ['@sunshine/contracts'] },
  build: { commonjsOptions: { include: [/node_modules/, /packages\/contracts\/dist/] } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
