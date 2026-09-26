import './modernPolyfills';
import * as pdfjs from 'pdfjs-dist';

let started = false;

/** Arranca el worker de pdf.js (una sola vez) con los polyfills que necesita en Safari. */
export function pdfLib(): typeof pdfjs {
  if (!started) {
    started = true;
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
  }
  return pdfjs;
}
