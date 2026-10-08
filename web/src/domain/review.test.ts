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

  it('noches: hotel sin fecha de salida, apartamento como «Otro», vuelta a casa antes del fin del viaje y noches dadas por buenas', () => {
    const bookings = [
      b('ida', { startLocal: '2026-10-09T22:00', startTz: 'Europe/Madrid', startPlace: 'MAD', endLocal: '2026-10-10T07:00', endPlace: 'EZE' }),
      // Sin salida: dura hasta el siguiente vuelo (12).
      b('hotel', { type: 'hotel', startLocal: '2026-10-10T15:00', endLocal: null, startPlace: 'Hotel', endPlace: null }),
      b('a', { startLocal: '2026-10-12T09:00', startPlace: 'AEP', endPlace: 'IGR', endLocal: '2026-10-12T11:00' }),
      b('piso', { type: 'other', title: 'Apartamento en Foz', startLocal: '2026-10-12T14:00', endLocal: '2026-10-15T10:00', startPlace: 'Foz' }),
      // Vuelta a casa el 15; el viaje dice hasta el 20.
      b('vuelta', { startLocal: '2026-10-15T20:00', startPlace: 'IGR', endPlace: 'MAD', endLocal: '2026-10-16T12:00', endTz: 'Europe/Madrid' }),
    ];
    const longTrip = { ...trip, endDate: '2026-10-20' };
    expect(reviewTrip(longTrip, bookings, now, '2026-10-09').filter((i) => i.nights)).toEqual([]);

    // Sin el apartamento faltan las noches del 12, 13 y 14; dando por buena la del 12 quedan dos.
    const without = bookings.filter((x) => x.id !== 'piso');
    expect(reviewTrip(longTrip, without, now, '2026-10-09').find((i) => i.nights)?.nights).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(reviewTrip(longTrip, without, now, '2026-10-09', new Set(['2026-10-12'])).find((i) => i.nights)?.nights).toEqual(['2026-10-13', '2026-10-14']);
  });
});
