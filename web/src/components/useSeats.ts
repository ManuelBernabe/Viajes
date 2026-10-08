import { seatsFromCodes } from '../attachments/bcbp';
import { splitQrCodes } from '../attachments/qrCodes';
import { listAttachments } from '../data/repo';
import type { Booking } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { seatsIn } from '../domain/airlines';
import { flightNumberOf } from '../domain/flightStatus';

/** Un asiento, con el nombre del pasajero si se sabe (de la tarjeta de embarque). */
export interface Seat {
  passenger: string | null;
  seat: string;
}

/**
 * Los asientos de unas reservas (las de los pasajeros de un mismo vuelo): los de las notas y los de las tarjetas de
 * embarque adjuntas (su QR lleva el asiento de cada pasajero), sin repetir.
 */
export function useSeats(bookings: readonly Booking[]): Seat[] {
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
      for (const booking of bookings) {
        const codes = (await listAttachments(booking.id)).flatMap((a) => splitQrCodes(a.qrText));
        for (const seat of seatsFromCodes(codes, { startPlace: booking.startPlace, endPlace: booking.endPlace, flightNumber: flightNumberOf(booking) })) {
          add(seat);
        }
        for (const seat of seatsIn(booking.notes, booking.title)) {
          add({ passenger: null, seat });
        }
      }
      return result;
    }, [key]) ?? []
  );
}

/** «Paco 19A · Manuel 19B» o «19A». */
export function formatSeats(seats: readonly Seat[]): string {
  return seats.map((s) => (s.passenger ? `${s.passenger} ${s.seat}` : s.seat)).join(' · ');
}
