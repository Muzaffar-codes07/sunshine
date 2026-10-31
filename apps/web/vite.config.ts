import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The API consumes CommonJS contracts. Workspace links live outside node_modules,
  // so explicitly transform that package for both Vite development and Rollup.
  // Contracts are rebuilt without changing their package version. Refresh the CJS
  // dependency bundle on startup so switching branches cannot strip new fields.
  optimizeDeps: { include: ['@sunshine/contracts'], force: true },
  build: { commonjsOptions: { include: [/node_modules/, /packages\/contracts\/dist/] } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
