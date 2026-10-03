import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { findQrCodes, joinQrCodes, QR_SEPARATOR, splitQrCodes, type Pixels } from './qrCodes';

// Dos tarjetas de embarque (formato BCBP) de la misma reserva, una por pasajero.
const ANA = 'M1GARCIA/ANA          EABC123 MADBCNIB 3011 280Y012A0001 100';
const LUIS = 'M1GARCIA/LUIS         EABC123 MADBCNIB 3011 280Y012B0002 100';

const SCALE = 5;

/** Página en blanco con los QR dibujados en las posiciones dadas (en píxeles). */
function page(width: number, height: number, codes: { text: string; x: number; y: number }[]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const { text, x, y } of codes) {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (!modules.get(row, col)) continue;
        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            const i = ((y + row * SCALE + dy) * width + (x + col * SCALE + dx)) * 4;
            data[i] = data[i + 1] = data[i + 2] = 0;
          }
        }
      }
    }
  }
  return { data, width, height };
}

describe('findQrCodes', () => {
  it('una tarjeta: un código', () => {
    expect(findQrCodes(page(400, 400, [{ text: ANA, x: 60, y: 60 }]))).toEqual([ANA]);
  });

  it('dos pasajeros en la misma página, uno al lado del otro', () => {
    expect(findQrCodes(page(900, 400, [{ text: ANA, x: 40, y: 60 }, { text: LUIS, x: 500, y: 60 }]))).toEqual([ANA, LUIS]);
  });

  it('dos pasajeros en la misma página, uno debajo del otro', () => {
    expect(findQrCodes(page(400, 900, [{ text: LUIS, x: 60, y: 500 }, { text: ANA, x: 60, y: 40 }]))).toEqual([ANA, LUIS]);
  });

  it('una página sin QR', () => {
    expect(findQrCodes(page(300, 300, []))).toEqual([]);
  });
});

describe('guardar varios QR en un adjunto', () => {
  it('una página por pasajero (o el mismo QR repetido) se guarda sin repetidos', () => {
    const stored = joinQrCodes([...findQrCodes(page(400, 400, [{ text: ANA, x: 60, y: 60 }])), ANA, LUIS]);
    expect(stored).toBe(`${ANA}${QR_SEPARATOR}${LUIS}`);
    expect(splitQrCodes(stored)).toEqual([ANA, LUIS]);
  });

  it('un adjunto antiguo con un solo QR se lee igual', () => {
    expect(splitQrCodes(ANA)).toEqual([ANA]);
    expect(splitQrCodes(null)).toEqual([]);
    expect(joinQrCodes([])).toBeNull();
  });

  it('no se pasa del límite del servidor', () => {
    const big = 'x'.repeat(2500);
    expect(splitQrCodes(joinQrCodes([big, 'y'.repeat(2500), ANA]))).toEqual([big, ANA]);
  });
});
