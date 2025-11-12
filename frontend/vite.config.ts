import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        distributed: resolve(__dirname, 'distributed-test.html'),
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
