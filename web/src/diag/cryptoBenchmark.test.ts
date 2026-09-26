import { describe, expect, it } from 'vitest';
import { runCryptoCheck } from './cryptoBenchmark';

describe('runCryptoCheck', () => {
  it('deriva la clave, cifra y descifra de ida y vuelta', async () => {
    const result = await runCryptoCheck(1_000);

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.pbkdf2Ms).toBeGreaterThanOrEqual(0);
  });
});
