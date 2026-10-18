import { describe, expect, it } from 'vitest';
import { bagDrop } from './bagDrop';

const h = 3_600_000;
const dep = Date.UTC(2026, 10, 2, 20, 0);

describe('bagDrop', () => {
  it('internacional: abre 3 h antes y cierra 1 h antes', () => {
    expect(bagDrop(dep, 'G3 7465 AEP → GRU', true, dep - 4 * h)).toEqual({ opensMs: dep - 3 * h, closesMs: dep - h, state: 'soon' });
    expect(bagDrop(dep, 'G3 7465 AEP → GRU', true, dep - 2 * h)?.state).toBe('open');
    expect(bagDrop(dep, 'G3 7465 AEP → GRU', true, dep - 1.2 * h)?.state).toBe('closing');
    expect(bagDrop(dep, 'G3 7465 AEP → GRU', true, dep - 0.5 * h)?.state).toBe('closed');
  });

  it('nacional: 2 h y 45 min; sin saberlo, como internacional', () => {
    expect(bagDrop(dep, 'IB 3170 MAD → ALC', false, dep - 2.5 * h)?.state).toBe('soon');
    expect(bagDrop(dep, 'IB 3170 MAD → ALC', false, dep - 50 * 60_000)?.state).toBe('closing');
    expect(bagDrop(dep, 'IB 3170 MAD → ALC', null, dep - 50 * 60_000)?.state).toBe('closed');
  });

  it('Ryanair cierra a los 40 min; fuera del día del vuelo no hay nada', () => {
    expect(bagDrop(dep, 'FR 1234 ALC → STN', true, dep - 45 * 60_000)?.state).toBe('closing');
    expect(bagDrop(dep, 'FR 1234 ALC → STN', true, dep - 30 * h)).toBeNull();
    expect(bagDrop(dep, 'FR 1234 ALC → STN', true, dep + 60_000)).toBeNull();
  });
});
