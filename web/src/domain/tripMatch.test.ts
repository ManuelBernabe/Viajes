import { describe, expect, it } from 'vitest';
import type { Trip } from '../data/types';
import { draftTrip, matchTrip, type IncomingBooking } from './tripMatch';

const trip = (id: string, title: string, destination: string | null, startDate: string | null, endDate: string | null): Trip => ({
  id, title, destination, startDate, endDate, createdBy: 'yo', version: 1, deletedAtMs: null,
});
const booking = (extra: Partial<IncomingBooking>): IncomingBooking => ({
  type: 'flight', title: null, startLocal: null, endLocal: null, startPlace: null, endPlace: null, address: null, ...extra,
});

const trips = [
  trip('ar', 'Argentina Brasil', 'Buenos Aires', '2026-10-01', '2026-10-19'),
  trip('ro', 'Roma', 'Roma', '2026-12-05', '2026-12-09'),
  trip('ls', 'Lisboa algún día', 'Lisboa', null, null),
];

describe('matchTrip', () => {
  it('por fechas, con dos días de margen para la ida y la vuelta', () => {
    expect(matchTrip(trips, booking({ startLocal: '2026-10-06T13:33', title: 'JA 3140 AEP → IGR' }))?.id).toBe('ar');
    expect(matchTrip(trips, booking({ startLocal: '2026-12-03T07:00', endPlace: 'FCO' }))?.id).toBe('ro');
    expect(matchTrip(trips, booking({ startLocal: '2026-12-20T07:00', endPlace: 'Roma' }))).toBeNull();
  });

  it('sin fechas en el viaje vale el destino; si no coincide nada, viaje nuevo', () => {
    expect(matchTrip(trips, booking({ type: 'hotel', startLocal: '2027-03-01T15:00', startPlace: 'Hotel Avenida, Lisboa' }))?.id).toBe('ls');
    expect(matchTrip(trips, booking({ startLocal: '2027-03-01T15:00', endPlace: 'Oporto' }))).toBeNull();
  });

  it('si dos viajes tienen esas fechas, gana el que nombra el destino', () => {
    const both = [...trips, trip('br', 'Brasil', 'Río de Janeiro', '2026-10-10', '2026-10-19')];
    expect(matchTrip(both, booking({ startLocal: '2026-10-12T10:00', title: 'G3 1234 IGU → GIG', endPlace: 'Río de Janeiro' }))?.id).toBe('br');
  });
});

describe('draftTrip', () => {
  it('el destino del vuelo y las fechas de la reserva', () => {
    expect(draftTrip(booking({ startLocal: '2026-12-12T07:00', endLocal: '2026-12-12T08:10', startPlace: 'BCN', endPlace: 'LIS' }), 'Tu vuelo')).toEqual({
      title: 'LIS', destination: 'LIS', startDate: '2026-12-12', endDate: '2026-12-12',
    });
    expect(draftTrip(booking({ type: 'hotel', startLocal: '2026-12-12T15:00', endLocal: '2026-12-15T11:00', startPlace: 'Hotel Avenida' }), 'Reserva')).toMatchObject({
      destination: 'Hotel Avenida', startDate: '2026-12-12', endDate: '2026-12-15',
    });
    expect(draftTrip(booking({}), 'Confirmación de reserva').title).toBe('Confirmación de reserva');
  });
});
