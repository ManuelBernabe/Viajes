import { describe, expect, it } from 'vitest';
import { toUtcMs } from '../data/localTime';
import type { Booking, Trip } from '../data/types';
import { reviewTrip } from './review';

const TZ = 'America/Argentina/Buenos_Aires';
const trip: Trip = { id: 't', title: 'Argentina', destination: null, startDate: '2026-10-10', endDate: '2026-10-14', createdBy: 'yo', version: 1, deletedAtMs: null };
const b = (id: string, extra: Partial<Booking>): Booking => {
  const base: Booking = {
    id, tripId: 't', type: 'flight', title: id, startLocal: '2026-10-10T10:00', startTz: TZ, startPlace: 'MAD', endLocal: null, endTz: TZ, endPlace: 'EZE',
    startUtcMs: 0, reference: null, address: null, notes: null, changeNote: null, visibility: 'household', sharedWith: [], createdBy: 'yo', version: 1, deletedAtMs: null, ...extra,
  };
  return { ...base, startUtcMs: toUtcMs(base.startLocal, base.startTz) };
};
const now = Date.UTC(2026, 9, 9, 12);

describe('reviewTrip', () => {
  it('noches sin hotel, escala corta, cambio de aeropuerto y llegada antes de salida', () => {
    const issues = reviewTrip(
      trip,
      [
        b('ida', { startLocal: '2026-10-09T22:00', startTz: 'Europe/Madrid', endLocal: '2026-10-10T07:00', endPlace: 'EZE' }),
        b('hotel', { type: 'hotel', startLocal: '2026-10-10T15:00', endLocal: '2026-10-12T11:00', startPlace: 'Hotel', endPlace: null }),
        b('a', { startLocal: '2026-10-12T09:00', startPlace: 'AEP', endPlace: 'IGR', endLocal: '2026-10-12T11:00' }),
        b('b', { startLocal: '2026-10-12T11:40', startPlace: 'IGR', endPlace: 'GRU', endLocal: '2026-10-12T14:00' }),
        b('c', { startLocal: '2026-10-12T16:00', startPlace: 'CGH', endPlace: 'GIG', endLocal: '2026-10-12T15:00' }),
      ],
      now,
      '2026-10-09',
    );
    const text = issues.map((i) => i.message).join('\n');
    expect(text).toMatch(/2 noches sin alojamiento/);
    expect(text).toMatch(/Escala corta en IGR: 40 min/);
    expect(text).toMatch(/Cambio de GRU a CGH con 2 h 00 min/);
    expect(text).toMatch(/«c»: la llegada es anterior a la salida/);
  });

  it('un viaje que cuadra no tiene avisos; el mismo vuelo de dos pasajeros no se solapa consigo mismo', () => {
    const issues = reviewTrip(
      { ...trip, endDate: '2026-10-11' },
      [
        b('p', { title: 'JA 1 AEP → IGR · Paco', startLocal: '2026-10-10T08:00', startPlace: 'AEP', endPlace: 'IGR', endLocal: '2026-10-10T10:00' }),
        b('m', { title: 'JA 1 AEP → IGR · Manuel', startLocal: '2026-10-10T08:00', startPlace: 'AEP', endPlace: 'IGR', endLocal: '2026-10-10T10:00' }),
        b('hotel', { type: 'hotel', startLocal: '2026-10-10T15:00', endLocal: '2026-10-11T11:00', startPlace: 'Hotel', endPlace: null }),
      ],
      now,
      '2026-10-09',
    );
    expect(issues).toEqual([]);
  });
});
