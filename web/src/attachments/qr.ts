import QRCode from 'qrcode';
import { isImage, isPdf } from './files';
import { renderPdf } from './pdf';
import { findQrCodes, joinQrCodes } from './qrCodes';
import { t } from '../i18n';

const MAX_SIDE = 1600;

/** Todos los QR del lienzo (uno por pasajero, si hay varios). */
function decodeCanvas(canvas: HTMLCanvasElement): string[] {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return [];
  }
  return findQrCodes(context.getImageData(0, 0, canvas.width, canvas.height));
}

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob);
  } catch {
    // HEIC y otros formatos que createImageBitmap no decodifica: Safari sí los pinta en <img>.
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(t('No se puede leer la imagen.')));
        img.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }
}

/** Busca los QR de la imagen, a tamaño reducido y a tamaño completo. Varios códigos van juntos (ver `qrCodes.ts`). */
export async function readQrFromImage(bytes: ArrayBuffer, mime: string): Promise<string | null> {
  const bitmap = await loadBitmap(new Blob([bytes], { type: mime }));
  const width = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width;
  const height = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height;
  const scales = [Math.min(1, MAX_SIDE / Math.max(width, height)), Math.min(1, 800 / Math.max(width, height))];
  for (const scale of [...new Set(scales)]) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const codes = decodeCanvas(canvas);
    if (codes.length > 0) {
      return joinQrCodes(codes);
    }
  }
  return null;
}

/**
 * Busca los QR de las primeras páginas del PDF (las tarjetas de embarque suelen llegar así). Todas las páginas, no solo
 * la primera: con dos pasajeros cada uno suele tener la suya, y a veces van los dos en la misma.
 */
export async function readQrFromPdf(bytes: ArrayBuffer): Promise<string | null> {
  const canvases = await renderPdf(bytes, { width: MAX_SIDE, maxPages: 8 });
  return joinQrCodes(canvases.flatMap(decodeCanvas));
}

export async function readQr(bytes: ArrayBuffer, mime: string): Promise<string | null> {
  try {
    if (isImage(mime)) {
      return await readQrFromImage(bytes, mime);
    }
    if (isPdf(mime)) {
      return await readQrFromPdf(bytes);
    }
  } catch {
    // Un fichero que no se puede decodificar simplemente no tiene QR legible.
  }
  return null;
}

/** Redibuja el QR nítido al tamaño pedido (en píxeles). */
export async function drawQr(canvas: HTMLCanvasElement, text: string, size: number): Promise<void> {
  await QRCode.toCanvas(canvas, text, { width: size, margin: 2, errorCorrectionLevel: 'M' });
  // La librería fija el tamaño en pantalla a los píxeles dibujados (tres veces más en un iPhone): lo decide el CSS.
  canvas.style.width = '';
  canvas.style.height = '';
}
