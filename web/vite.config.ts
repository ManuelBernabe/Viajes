import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      pwaAssets: { config: true },
      manifest: {
        name: 'Viajes',
        short_name: 'Viajes',
        lang: 'es',
        display: 'standalone',
        start_url: '/',
        background_color: '#ffffff',
        theme_color: '#1f3a5f',
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  define: {
    __BUILD_AT__: JSON.stringify(new Date().toISOString()),
    // Railway lo pasa como argumento de construcción (ARG en el Dockerfile); en local queda vacío.
    __BUILD_COMMIT__: JSON.stringify(process.env.RAILWAY_GIT_COMMIT_SHA ?? ''),
  },
  build: {
    outDir: '../server/Viajes.Api/wwwroot',
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': 'http://localhost:5080' },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
