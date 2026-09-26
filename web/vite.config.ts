import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // Service worker propio (src/sw.ts): la misma precarga de antes más los avisos push.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
      injectManifest: {
        // El worker de pdf.js es .mjs y los iconos .png: sin ellos en la caché, sin red no se abren los PDF.
        // El manifest.webmanifest lo añade el propio plugin; si además lo recoge el glob, queda duplicado con otra
        // revisión y Workbox aborta el worker al arrancar («conflicting entries»): sin popup de versión ni avisos.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2}'],
        // Las capturas de la guía se ven con red; no merece la pena guardarlas en todos los móviles.
        globIgnores: ['**/guia/**'],
        maximumFileSizeToCacheInBytes: 5_000_000,
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
