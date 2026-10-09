import jsQR from 'jsqr';

export { joinQrCodes, QR_SEPARATOR, splitQrCodes } from './qrText';

/** Como mucho, cuántos códigos se buscan en una misma imagen o página. */
const MAX_PER_IMAGE = 8;

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface Found {
  text: string;
  x: number;
  y: number;
}


function decode(image: Pixels) {
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
}

/** Tapa con blanco el código encontrado (con margen) para que la siguiente pasada encuentre el de al lado. */
function blankOut(image: Pixels, corners: { x: number; y: number }[]) {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const pad = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.15;
  const left = Math.max(0, Math.floor(Math.min(...xs) - pad));
  const right = Math.min(image.width - 1, Math.ceil(Math.max(...xs) + pad));
  const top = Math.max(0, Math.floor(Math.min(...ys) - pad));
  const bottom = Math.min(image.height - 1, Math.ceil(Math.max(...ys) + pad));
  for (let y = top; y <= bottom; y++) {
    image.data.fill(255, (y * image.width + left) * 4, (y * image.width + right + 1) * 4);
  }
}

/** Busca todos los QR de la imagen: lee uno, lo tapa y vuelve a buscar. Modifica `image`. */
function scan(image: Pixels, offsetX: number, offsetY: number, out: Found[]) {
  for (let i = 0; i < MAX_PER_IMAGE; i++) {
    const code = decode(image);
    if (!code?.data) {
      return;
    }
    const corners = [code.location.topLeftCorner, code.location.topRightCorner, code.location.bottomRightCorner, code.location.bottomLeftCorner];
    out.push({
      text: code.data,
      x: offsetX + corners.reduce((sum, p) => sum + p.x, 0) / 4,
      y: offsetY + corners.reduce((sum, p) => sum + p.y, 0) / 4,
    });
    blankOut(image, corners);
  }
}

function crop(image: Pixels, left: number, top: number, width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = ((top + y) * image.width + left) * 4;
    data.set(image.data.subarray(start, start + width * 4), y * width * 4);
  }
  return { data, width, height };
}

/**
 * Todos los QR distintos de una imagen (o página de PDF), de arriba abajo y de izquierda a derecha: el orden en que
 * suelen ir los pasajeros. Con dos códigos juntos el lector a veces no ve ninguno, así que también prueba por mitades.
 */
export function findQrCodes(image: Pixels): string[] {
  const found: Found[] = [];
  scan(crop(image, 0, 0, image.width, image.height), 0, 0, found);

  if (new Set(found.map((f) => f.text)).size < 2) {
    const halfW = Math.floor(image.width / 2);
    const halfH = Math.floor(image.height / 2);
    const halves: [number, number, number, number][] = [
      [0, 0, halfW, image.height],
      [halfW, 0, image.width - halfW, image.height],
      [0, 0, image.width, halfH],
      [0, halfH, image.width, image.height - halfH],
    ];
    for (const [left, top, width, height] of halves) {
      if (width > 0 && height > 0) {
        scan(crop(image, left, top, width, height), left, top, found);
      }
    }
  }

  const first = new Map<string, Found>();
  for (const f of found) {
    if (!first.has(f.text)) {
      first.set(f.text, f);
    }
  }
  // Misma fila si la diferencia de altura es pequeña: entonces manda la posición horizontal.
  const rowTolerance = image.height * 0.05;
  return [...first.values()]
    .sort((a, b) => (Math.abs(a.y - b.y) > rowTolerance ? a.y - b.y : a.x - b.x))
    .map((f) => f.text);
}
