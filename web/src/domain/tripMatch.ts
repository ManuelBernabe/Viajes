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

const IGNORED = ['viaje', 'vacaciones', 'semana', 'puente'];

/** Palabras con sustancia del nombre del viaje. */
function titleWords(trip: Trip): string[] {
  return plain(trip.title).split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !IGNORED.includes(word));
}

/** Palabras con sustancia del nombre y el destino del viaje («Argentina Brasil» → argentina, brasil). */
function tripWords(trip: Trip): string[] {
  return plain(`${trip.title} ${trip.destination ?? ''}`)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !['viaje', 'vacaciones', 'semana', 'puente'].includes(word));
}

/**
 * El viaje al que pertenece la reserva: el que tiene sus fechas (con dos días de margen, por el vuelo de ida o de vuelta,
 * o una semana si nombra el destino del viaje o sale de un sitio donde ya está el viaje) y, si hay varios, el que nombra
 * el destino. Sin fechas en la reserva, solo vale que el destino coincida. Null si ninguno encaja: entonces se propone un
 * viaje nuevo.
 */
export function matchTrip(trips: readonly Trip[], booking: IncomingBooking, placesByTrip: ReadonlyMap<string, ReadonlySet<string>> = new Map()): Trip | null {
  const date = booking.startLocal?.slice(0, 10) ?? null;
  const text = plain([booking.title, booking.startPlace, booking.endPlace, booking.address].filter(Boolean).join(' '));
  let best: { trip: Trip; score: number } | null = null;
  for (const trip of trips) {
    if (trip.deletedAtMs !== null) {
      continue;
    }
    const named = tripWords(trip).some((word) => text.includes(word));
    // Sale de un sitio donde ya está el viaje (llegó allí en un vuelo o tiene allí el hotel): es una etapa más.
    const from = booking.startPlace ? plain(booking.startPlace.trim()) : '';
    const continues = !!from && !!placesByTrip.get(trip.id)?.has(from);
    let score = 0;
    if (date && trip.startDate) {
      const end = trip.endDate ?? trip.startDate;
      if (date >= trip.startDate && date <= end) {
        score = 3;
      } else if (date >= shiftDate(trip.startDate, -2) && date <= shiftDate(end, 2)) {
        score = 2;
      } else if ((named || continues) && date >= shiftDate(trip.startDate, -7) && date <= shiftDate(end, 7)) {
        // Nombra el viaje o sale de uno de sus sitios, a pocos días: una etapa más («Buenos Aires → Río» tras Argentina).
        score = continues ? 2 : 1;
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

/** Los sitios de cada viaje (llegadas de vuelos y trenes, hoteles), para reconocer una etapa que sale de ahí. */
export function tripPlaces(bookings: readonly { tripId: string; type: string; startPlace: string | null; endPlace: string | null; deletedAtMs: number | null }[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const b of bookings) {
    if (b.deletedAtMs !== null) {
      continue;
    }
    const place = b.type === 'flight' || b.type === 'train' ? b.endPlace : b.startPlace;
    if (place?.trim()) {
      const set = map.get(b.tripId) ?? new Set<string>();
      set.add(plain(place.trim()));
      map.set(b.tripId, set);
    }
  }
  return map;
}

/**
 * ¿Este viaje parece una parte de otro? («Brasil» del 14 al 19 junto a «Argentina Brasil» del 1 al 12.) Las fechas se tocan
 * o están a menos de una semana y uno nombra lo que dice el otro. Para proponer unirlos.
 */
export function likelySameTrip(trip: Trip, others: readonly Trip[]): Trip | null {
  if (!trip.startDate) {
    return null;
  }
  // Solo se propone en la parte («Brasil»), no en el viaje que la abarca: el nombre de este cabe entero en el del otro.
  const words = titleWords(trip);
  const end = trip.endDate ?? trip.startDate;
  for (const other of others) {
    if (other.id === trip.id || other.deletedAtMs !== null || !other.startDate || words.length === 0) {
      continue;
    }
    const otherEnd = other.endDate ?? other.startDate;
    const near = trip.startDate <= shiftDate(otherEnd, 7) && other.startDate <= shiftDate(end, 7);
    const otherWords = tripWords(other);
    const part = words.every((w) => otherWords.includes(w)) && (titleWords(other).length > words.length || other.startDate < trip.startDate);
    if (near && part) {
      return other;
    }
  }
  return null;
}
