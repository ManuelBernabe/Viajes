import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Lector de pasaportes en el móvil (tesseract.js): su worker, el motor (WebAssembly) y el idioma se sirven desde /ocr/,
 * sin CDN (la CSP solo deja cargar de aquí). No van en la precarga del service worker: se bajan la primera vez que se usan.
 */
function ocrAssets() {
  const files: [string, string][] = [
    ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
    ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
    ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
    ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
    ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
  ];
  return {
    name: 'ocr-assets',
    apply: 'build' as const,
    writeBundle(options: { dir?: string }) {
      const target = resolve(options.dir ?? 'dist', 'ocr');
      mkdirSync(target, { recursive: true });
      for (const [from, to] of files) {
        copyFileSync(resolve(from), resolve(target, to));
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    ocrAssets(),
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
        background_color: '#0f1d3a',
        theme_color: '#0f1d3a',
      },
      injectManifest: {
        // El worker de pdf.js es .mjs y los iconos .png: sin ellos en la caché, sin red no se abren los PDF.
        // El manifest.webmanifest lo añade el propio plugin; si además lo recoge el glob, queda duplicado con otra
        // revisión y Workbox aborta el worker al arrancar («conflicting entries»): sin popup de versión ni avisos.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2}'],
        // Las capturas de la guía se ven con red; no merece la pena guardarlas en todos los móviles.
        globIgnores: ['**/guia/**', '**/ocr/**'],
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
