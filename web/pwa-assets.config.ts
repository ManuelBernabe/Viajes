import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

// El símbolo ya trae su fondo y sus esquinas redondeadas: sin márgenes blancos, y con el azul oscuro detrás por si el
// sistema recorta con otro radio.
const dark = { background: '#0f1d3a', fit: 'contain' as const };

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...preset,
    apple: { ...preset.apple, padding: 0, resizeOptions: dark },
    maskable: { ...preset.maskable, padding: 0, resizeOptions: dark },
  },
  images: ['public/logo.svg'],
});
