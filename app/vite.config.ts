import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type ProxyOptions } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const PROXY: ProxyOptions = {
  target: 'http://localhost:8080',
  changeOrigin: true,
};

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
