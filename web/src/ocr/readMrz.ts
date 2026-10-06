import { findMrz, type MrzResult } from './mrz';

/**
 * Lee la zona MRZ de la foto de un pasaporte o un DNI **en el propio móvil** (tesseract.js, sin mandar la foto a ningún
 * sitio). Los ficheros del OCR (~7 MB) se sirven desde /ocr/ y se bajan la primera vez; el idioma queda guardado en el
 * móvil para las siguientes.
 */
export async function readMrzFromImage(bytes: ArrayBuffer, mime: string, onProgress?: (fraction: number) => void): Promise<MrzResult | null> {
  if (!mime.startsWith('image/')) {
    return null;
  }
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/',
    langPath: '/ocr/',
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.(m.progress);
      }
    },
  });
  try {
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
      // Bloque de texto uniforme: las líneas de la MRZ.
      tessedit_pageseg_mode: '6' as never,
    });
    // La MRZ está abajo de la página de datos; en una foto del pasaporte abierto, abajo de la mitad inferior. Se prueba
    // primero la parte baja (más rápido y menos ruido) y luego la foto entera, también girada por si está de lado.
    for (const crop of crops(bitmap)) {
      const { data } = await worker.recognize(crop);
      (globalThis as { __mrzText?: string[] }).__mrzText?.push(data.text);
      const result = findMrz(data.text);
      if (result) {
        return result;
      }
    }
    return null;
  } finally {
    bitmap.close();
    await worker.terminate();
  }
}

/** Recortes en escala de grises y con contraste, de unos 1600 px de ancho. */
function crops(bitmap: ImageBitmap): HTMLCanvasElement[] {
  const make = (sx: number, sy: number, sw: number, sh: number, rotate = 0) => {
    const scale = Math.min(1, 1600 / Math.max(sw, sh));
    const w = Math.round(sw * scale);
    const h = Math.round(sh * scale);
    // Margen blanco alrededor: tesseract pierde a veces el primer carácter si el texto toca el borde.
    const pad = 40;
    const canvas = document.createElement('canvas');
    canvas.width = (rotate ? h : w) + pad * 2;
    canvas.height = (rotate ? w : h) + pad * 2;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(pad, pad);
    if (rotate) {
      context.translate((canvas.width - pad * 2) / 2, (canvas.height - pad * 2) / 2);
      context.rotate((rotate * Math.PI) / 180);
      context.drawImage(bitmap, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
    } else {
      context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    // Gris y más contraste a mano (el «filter» del canvas no está en todos los Safari).
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const value = Math.max(0, Math.min(255, (gray - 128) * 1.6 + 128));
      d[i] = d[i + 1] = d[i + 2] = value;
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  };
  const { width, height } = bitmap;
  return [
    make(0, height * 0.55, width, height * 0.45),
    make(0, height * 0.3, width, height * 0.7),
    make(0, 0, width, height),
    make(0, 0, width, height, 90),
    make(0, 0, width, height, -90),
  ];
}
