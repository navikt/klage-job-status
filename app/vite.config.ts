import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const PROXY = {
  target: 'http://localhost:8080',
  changeOrigin: true,
};

// biome-ignore lint/style/noDefaultExport: https://vitejs.dev/config/
export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] }), react(), tailwindcss()],
  build: {
    sourcemap: true,
  },
  server: {
    port: 3001,
    proxy: {
      '/api': PROXY,
    },
  },
});
