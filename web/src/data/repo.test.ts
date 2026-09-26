import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from './db';
import { pending } from './outbox';
import {
  addAttachment,
  deleteBooking,
  deleteTrip,
  getBlob,
  listAttachments,
  listBookings,
  listTrips,
  saveBooking,
  saveTrip,
} from './repo';
import type { BookingBody } from './types';

beforeEach(() => resetDb());

const flight = (tripId: string, overrides: Partial<BookingBody> = {}): BookingBody => ({
  tripId,
  type: 'flight',
  title: 'Vuelo',
  startLocal: '2026-10-12T10:05',
  startTz: 'Europe/Madrid',
  startPlace: 'MAD',
  endLocal: null,
  endTz: null,
  endPlace: null,
  reference: null,
  address: null,
  notes: null,
  changeNote: null,
  ...overrides,
});

describe('repositorio local', () => {
  it('guarda el viaje en local y lo encola', async () => {
    const trip = await saveTrip({ title: 'Japón', destination: 'Tokio', startDate: '2026-10-12', endDate: null }, 'yo');

    expect((await listTrips()).map((t) => t.title)).toEqual(['Japón']);
    expect(await pending()).toEqual([{ kind: 'put-trip', id: trip.id, body: { title: 'Japón', destination: 'Tokio', startDate: '2026-10-12', endDate: null } }]);
  });

  it('calcula el instante UTC de la reserva y ordena por él aunque las zonas cambien', async () => {
    const trip = await saveTrip({ title: 'Japón', destination: null, startDate: null, endDate: null }, 'yo');
    await saveBooking(flight(trip.id, { title: 'Llegada', startLocal: '2026-10-13T08:55', startTz: 'Asia/Tokyo' }), 'yo');
    await saveBooking(flight(trip.id, { title: 'Salida', startLocal: '2026-10-12T12:00', startTz: 'Europe/Madrid' }), 'yo');

    const bookings = await listBookings(trip.id);

    expect(bookings.map((b) => b.title)).toEqual(['Salida', 'Llegada']);
    expect(bookings[0].startUtcMs).toBe(Date.UTC(2026, 9, 12, 10, 0));
  });

  it('editar conserva la versión y el autor', async () => {
    const trip = await saveTrip({ title: 'Antes', destination: null, startDate: null, endDate: null }, 'ana');
    await saveTrip({ title: 'Después', destination: null, startDate: null, endDate: null }, 'bea', trip.id);

    const [saved] = await listTrips();
    expect(saved.title).toBe('Después');
    expect(saved.createdBy).toBe('ana');
    expect((await pending()).length).toBe(2);
  });

  it('borrar un viaje se lleva sus reservas, adjuntos y ficheros locales', async () => {
    const trip = await saveTrip({ title: 'Japón', destination: null, startDate: null, endDate: null }, 'yo');
    const booking = await saveBooking(flight(trip.id), 'yo');
    const attachment = await addAttachment(
      { bookingId: booking.id, name: 'tarjeta.pdf', mime: 'application/pdf', size: 3, qrText: null },
      new Uint8Array([1, 2, 3]).buffer,
      'yo',
    );
    expect(await getBlob(attachment.id)).toBeDefined();

    await deleteTrip(trip.id);

    expect(await listTrips()).toEqual([]);
    expect(await listBookings(trip.id)).toEqual([]);
    expect(await listAttachments(booking.id)).toEqual([]);
    expect(await getBlob(attachment.id)).toBeUndefined();
    expect((await pending()).at(-1)).toEqual({ kind: 'delete-trip', id: trip.id });
  });

  it('un adjunto nuevo queda pendiente de subir con su fichero en el móvil', async () => {
    const trip = await saveTrip({ title: 'Japón', destination: null, startDate: null, endDate: null }, 'yo');
    const booking = await saveBooking(flight(trip.id), 'yo');

    const attachment = await addAttachment(
      { bookingId: booking.id, name: 'foto.jpg', mime: 'image/jpeg', size: 2, qrText: 'M1XYZ' },
      new Uint8Array([7, 8]).buffer,
      'yo',
    );

    expect(attachment.uploaded).toBe(false);
    expect((await getBlob(attachment.id))!.size).toBe(2);
    expect((await pending()).at(-1)).toMatchObject({ kind: 'put-attachment', id: attachment.id });

    await deleteBooking(booking.id);
    expect(await getBlob(attachment.id)).toBeUndefined();
  });
});
