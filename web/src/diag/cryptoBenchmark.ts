export interface CryptoCheckResult {
  ok: boolean;
  pbkdf2Ms: number;
  error?: string;
}

const SAMPLE = 'contenido de prueba';

export async function runCryptoCheck(iterations = 600_000): Promise<CryptoCheckResult> {
  const encoder = new TextEncoder();
  const start = performance.now();
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const base = await crypto.subtle.importKey(
      'raw',
      encoder.encode('seis palabras de prueba para derivar'),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const pbkdf2Ms = performance.now() - start;

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(SAMPLE));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);

    return { ok: new TextDecoder().decode(plain) === SAMPLE, pbkdf2Ms };
  } catch (e) {
    return { ok: false, pbkdf2Ms: performance.now() - start, error: String(e) };
  }
}
