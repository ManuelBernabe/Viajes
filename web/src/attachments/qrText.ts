/** Los QR guardados en un adjunto, como texto (sin el lector de QR: esto lo usa la pantalla de inicio). */
/**
 * Varios QR en un mismo adjunto (una tarjeta por pasajero) se guardan en el mismo campo `qrText`, separados por este
 * carácter de control, que no aparece en los códigos de billetes. Un adjunto con un solo QR queda igual que antes.
 */
export const QR_SEPARATOR = '\u001e';

/** El servidor guarda como mucho 4000 caracteres por adjunto. */
const MAX_STORED = 4000;

/** Los códigos guardados en un adjunto, en orden. */
export function splitQrCodes(text: string | null | undefined): string[] {
  return (text ?? '').split(QR_SEPARATOR).filter((code) => code.length > 0);
}

/** Junta los códigos para guardarlos, sin repetidos y sin pasarse del límite del servidor. */
export function joinQrCodes(codes: readonly string[]): string | null {
  const kept: string[] = [];
  let length = 0;
  for (const code of new Set(codes.filter((c) => c.length > 0))) {
    const extra = code.length + (kept.length > 0 ? 1 : 0);
    if (length + extra > MAX_STORED) {
      continue;
    }
    kept.push(code);
    length += extra;
  }
  return kept.length > 0 ? kept.join(QR_SEPARATOR) : null;
}
