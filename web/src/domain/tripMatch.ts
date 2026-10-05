import type { Trip } from '../data/types';
import { shiftDate } from './alternatives';

/** Lo que se sabe de la reserva que llega por correo o por el atajo. */
export interface IncomingBooking {
  type: string | null;
  title: string | null;
  startLocal: string | null;
  endLocal: string | null;
  startPlace: string | null;
  endPlace: string | null;
  address: string | null;
}

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Palabras con sustancia del nombre y el destino del viaje («Argentina Brasil» → argentina, brasil). */
function tripWords(trip: Trip): string[] {
  return plain(`${trip.title} ${trip.destination ?? ''}`)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !['viaje', 'vacaciones', 'semana', 'puente'].includes(word));
}

/**
 * El viaje al que pertenece la reserva: el que tiene sus fechas (con dos días de margen, por el vuelo de ida o de vuelta)
 * y, si hay varios, el que nombra el destino. Sin fechas en la reserva, solo vale que el destino coincida. Null si
 * ninguno encaja: entonces se propone un viaje nuevo.
 */
export function matchTrip(trips: readonly Trip[], booking: IncomingBooking): Trip | null {
  const date = booking.startLocal?.slice(0, 10) ?? null;
  const text = plain([booking.title, booking.startPlace, booking.endPlace, booking.address].filter(Boolean).join(' '));
  let best: { trip: Trip; score: number } | null = null;
  for (const trip of trips) {
    if (trip.deletedAtMs !== null) {
      continue;
    }
    const named = tripWords(trip).some((word) => text.includes(word));
    let score = 0;
    if (date && trip.startDate) {
      const end = trip.endDate ?? trip.startDate;
      if (date >= trip.startDate && date <= end) {
        score = 3;
      } else if (date >= shiftDate(trip.startDate, -2) && date <= shiftDate(end, 2)) {
        score = 2;
      } else {
        continue; // Otras fechas: es otro viaje aunque vaya al mismo sitio.
      }
    }
    if (named) {
      score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { trip, score };
    }
  }
  return best?.trip ?? null;
}

/** El viaje nuevo que se propone mientras llega (o si no llega) el nombre que sugiere la IA. */
export function draftTrip(booking: IncomingBooking, subject: string): { title: string; destination: string | null; startDate: string | null; endDate: string | null } {
  const moving = booking.type === 'flight' || booking.type === 'train';
  const destination = (moving ? booking.endPlace : booking.startPlace ?? booking.address)?.trim() || null;
  const startDate = booking.startLocal?.slice(0, 10) ?? null;
  const endDate = booking.endLocal?.slice(0, 10) ?? startDate;
  return { title: destination ?? subject.slice(0, 60), destination, startDate, endDate: endDate && startDate && endDate < startDate ? startDate : endDate };
}
