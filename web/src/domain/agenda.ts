import { dateOf } from '../data/localTime';
import type { Booking, BookingType, Trip } from '../data/types';

/** Seis horas de margen: una reserva que empezó hace poco sigue siendo «lo siguiente» (el vuelo en el que estás). */
export const GRACE_MS = 6 * 3_600_000;

/** La próxima reserva por instante real, entre todas las de todos los viajes. */
export function nextBooking(bookings: readonly Booking[], nowMs: number, graceMs = GRACE_MS): Booking | undefined {
  return upcomingBookings(bookings, nowMs, 1, graceMs)[0];
}

/** Las próximas `limit` reservas por instante real, la más cercana primero. */
export function upcomingBookings(bookings: readonly Booking[], nowMs: number, limit: number, graceMs = GRACE_MS): Booking[] {
  return [...bookings]
    .sort((a, b) => a.startUtcMs - b.startUtcMs)
    .filter((b) => b.startUtcMs >= nowMs - graceMs)
    .slice(0, limit);
}

export interface Day {
  date: string;
  bookings: Booking[];
}

/** Agrupa por el día local del lugar de salida, ya ordenadas por instante real. */
export function groupByDay(bookings: readonly Booking[]): Day[] {
  const days = new Map<string, Booking[]>();
  for (const booking of [...bookings].sort((a, b) => a.startUtcMs - b.startUtcMs)) {
    const date = dateOf(booking.startLocal);
    const list = days.get(date);
    if (list) {
      list.push(booking);
    } else {
      days.set(date, [booking]);
    }
  }
  return [...days.entries()].map(([date, list]) => ({ date, bookings: list }));
}

export type TripStatus = 'current' | 'upcoming' | 'past';

/** Con `today` como «2026-10-12». Sin fechas, el viaje cuenta como próximo. */
export function tripStatus(trip: Pick<Trip, 'startDate' | 'endDate'>, today: string): TripStatus {
  const start = trip.startDate ?? trip.endDate;
  const end = trip.endDate ?? trip.startDate;
  if (!start || !end) {
    return 'upcoming';
  }
  if (end < today) {
    return 'past';
  }
  if (start > today) {
    return 'upcoming';
  }
  return 'current';
}

/** En curso y próximos primero (los más cercanos antes); los pasados al final, del más reciente al más antiguo. */
export function sortTrips(trips: readonly Trip[], today: string): { active: Trip[]; past: Trip[] } {
  const active = trips.filter((t) => tripStatus(t, today) !== 'past').sort((a, b) => key(a).localeCompare(key(b)));
  const past = trips.filter((t) => tripStatus(t, today) === 'past').sort((a, b) => key(b).localeCompare(key(a)));
  return { active, past };
}

function key(trip: Trip): string {
  return trip.startDate ?? trip.endDate ?? '9999-99-99';
}

export const TYPE_INFO: Record<BookingType, { icon: string; label: string; startLabel: string; endLabel: string }> = {
  flight: { icon: '✈️', label: 'Vuelo', startLabel: 'Salida', endLabel: 'Llegada' },
  train: { icon: '🚄', label: 'Tren', startLabel: 'Salida', endLabel: 'Llegada' },
  hotel: { icon: '🏨', label: 'Hotel', startLabel: 'Entrada', endLabel: 'Salida' },
  car: { icon: '🚗', label: 'Coche', startLabel: 'Recogida', endLabel: 'Devolución' },
  ticket: { icon: '🎟️', label: 'Entrada', startLabel: 'Inicio', endLabel: 'Fin' },
  other: { icon: '📌', label: 'Otro', startLabel: 'Inicio', endLabel: 'Fin' },
};

/** «2026-10-12» de hoy en la zona del móvil. */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
