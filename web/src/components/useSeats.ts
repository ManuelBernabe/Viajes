import { seatsFromCodes } from '../attachments/bcbp';
import { splitQrCodes } from '../attachments/qrText';
import { rescan } from '../attachments/rescan';
import { listAllBookings, listAttachments } from '../data/repo';
import type { Booking } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { seatsIn } from '../domain/airlines';
import { flightNumberOf } from '../domain/flightStatus';
import { withoutPassenger } from '../domain/today';

/** Un asiento, con el nombre del pasajero si se sabe (de la tarjeta de embarque). */
export interface Seat {
  passenger: string | null;
  seat: string;
}

/** Las reservas de los demás pasajeros del mismo vuelo (una por persona): mismo tipo, misma hora y mismo trayecto o número. */
export async function travelCompanions(booking: Booking): Promise<Booking[]> {
  const number = flightNumberOf(booking);
  return (await listAllBookings()).filter(
    (b) =>
      b.id !== booking.id &&
      b.deletedAtMs === null &&
      b.type === booking.type &&
      b.startUtcMs === booking.startUtcMs &&
      (withoutPassenger(b.title) === withoutPassenger(booking.title) || (number !== null && flightNumberOf(b) === number)),
  );
}

/**
 * Los asientos de unas reservas (las de los pasajeros de un mismo vuelo): los de las notas y los de las tarjetas de
 * embarque adjuntas (su QR lleva el asiento de cada pasajero; un PDF con dos pasajeros trae dos QR), sin repetir.
 * Con `companions`, también los de las reservas de los demás pasajeros del mismo vuelo.
 */
export function useSeats(bookings: readonly Booking[], companions = false): Seat[] {
  const key = bookings.map((b) => `${b.id}:${b.version}`).join(',');
  return (
    useLiveQuery(async () => {
      const result: Seat[] = [];
      const seen = new Set<string>();
      const add = (seat: Seat) => {
        if (!seen.has(seat.seat)) {
          seen.add(seat.seat);
          result.push(seat);
        }
      };
      const all = [...bookings];
      if (companions) {
        for (const booking of bookings) {
          for (const other of await travelCompanions(booking)) {
            if (!all.some((b) => b.id === other.id)) {
              all.push(other);
            }
          }
        }
      }
      for (const booking of all) {
        const attachments = await listAttachments(booking.id);
        // Lo guardado con la versión anterior solo tiene el primer QR del PDF: se relee una vez por si trae más pasajeros.
        if (booking.type === 'flight' && attachments.some((a) => a.qrText)) {
          void rescan(attachments.filter((a) => a.qrText));
        }
        const codes = attachments.flatMap((a) => splitQrCodes(a.qrText));
        for (const seat of seatsFromCodes(codes, { startPlace: booking.startPlace, endPlace: booking.endPlace, flightNumber: flightNumberOf(booking) })) {
          add(seat);
        }
        for (const seat of seatsIn(booking.notes, booking.title)) {
          add({ passenger: null, seat });
        }
      }
      return result;
    }, [key, companions]) ?? []
  );
}

/** «Paco 19A · Manuel 19B» o «19A». */
export function formatSeats(seats: readonly Seat[]): string {
  return seats.map((s) => (s.passenger ? `${s.passenger} ${s.seat}` : s.seat)).join(' · ');
}
