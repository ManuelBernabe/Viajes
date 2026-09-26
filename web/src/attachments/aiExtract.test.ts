import { describe, expect, it } from 'vitest';
import { toSuggestion } from './aiExtract';

describe('toSuggestion', () => {
  it('separa fecha y hora y respeta las zonas que deduce la IA', () => {
    const s = toSuggestion({
      type: 'flight', title: 'AR 1133 MAD → EZE', reference: 'DWYOLX', startLocal: '2026-10-01T20:05', startTz: 'Europe/Madrid',
      startPlace: 'MAD', endLocal: '2026-10-02T04:10', endTz: 'America/Argentina/Buenos_Aires', endPlace: 'EZE', address: null, notes: 'Terminal 1',
    });

    expect(s).toEqual({
      type: 'flight', title: 'AR 1133 MAD → EZE', reference: 'DWYOLX', startDate: '2026-10-01', startTime: '20:05', startPlace: 'MAD',
      startTz: 'Europe/Madrid', endDate: '2026-10-02', endTime: '04:10', endPlace: 'EZE', endTz: 'America/Argentina/Buenos_Aires', address: null, notes: 'Terminal 1',
    });
  });

  it('descarta tipos desconocidos y fechas mal formadas', () => {
    const s = toSuggestion({ type: 'bus', title: null, reference: null, startLocal: '1 de octubre', startTz: null, startPlace: null, endLocal: null, endTz: null, endPlace: null, address: null, notes: null });

    expect(s.type).toBeNull();
    expect(s.startDate).toBeNull();
  });
});
