import { describe, expect, it } from 'vitest';
import { phonesIn } from './emergency';

describe('phonesIn', () => {
  it('saca los teléfonos para llamar', () => {
    expect(phonesIn('911 (policía 101, ambulancia 107)').map((p) => p.tel)).toEqual(['911', '101', '107']);
    expect(phonesIn('Embajada en Buenos Aires: +54 11 0000 0000 · emergencia consular +54 9 11 0000 0000').map((p) => p.tel)).toEqual([
      '+541100000000',
      '+5491100000000',
    ]);
    expect(phonesIn('Desde 2026, sin teléfono')).toEqual([]);
    expect(phonesIn(null)).toEqual([]);
  });
});
