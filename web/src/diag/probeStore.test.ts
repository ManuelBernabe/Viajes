import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { daysSince, readProbe, saveProbe } from './probeStore';

beforeEach(() => {
  // Una base vacía por test; el cast evita el choque entre los tipos del DOM y los de fake-indexeddb.
  (globalThis as { indexedDB: unknown }).indexedDB = new IDBFactory();
});

describe('probeStore', () => {
  it('sin nada guardado devuelve null', async () => {
    expect(await readProbe()).toBeNull();
  });

  it('guarda un fichero de varios MB y lo recupera íntegro', async () => {
    await saveProbe(new Uint8Array(5_000_000).fill(7), 'billete.pdf', new Date('2026-09-20T10:00:00Z'));

    expect(await readProbe()).toEqual({
      name: 'billete.pdf',
      size: 5_000_000,
      savedAt: '2026-09-20T10:00:00.000Z',
      intact: true,
    });
  });

  it('cuenta los días transcurridos', () => {
    expect(daysSince('2026-09-20T10:00:00.000Z', new Date('2026-09-26T11:00:00Z'))).toBe(6);
  });
});
