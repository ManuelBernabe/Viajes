import { dateOf, toUtcMs } from '../data/localTime';
import type { Booking, BookingType, Trip } from '../data/types';

const HOUR = 3_600_000;

/** Instante real de llegada (o salida del hotel), si la reserva la tiene y es posterior a la salida. */
export function endUtcMs(booking: Booking): number | null {
  if (!booking.endLocal || !booking.endTz) {
    return null;
  }
  try {
    const end = toUtcMs(booking.endLocal, booking.endTz);
    return end >= booking.startUtcMs ? end : null;
  } catch {
    return null;
  }
}

/**
 * Hasta cuándo una reserva cuenta como vigente: una hora después de la llegada o del check-out; sin llegada,
 * tres horas después de la salida. Así el tren deja de estar «lo siguiente» al llegar y el hotel sigue arriba toda la estancia.
 */
export function activeUntilMs(booking: Booking): number {
  const end = endUtcMs(booking);
  return end !== null ? end + HOUR : booking.startUtcMs + 3 * HOUR;
}

/** Ya ha empezado y aún no ha terminado (el tren en el que vas, el hotel en el que estás). */
export function isInProgress(booking: Booking, nowMs: number): boolean {
  return booking.startUtcMs <= nowMs && nowMs <= activeUntilMs(booking);
}

/** La próxima reserva vigente por instante real, entre todas las de todos los viajes. */
export function nextBooking(bookings: readonly Booking[], nowMs: number): Booking | undefined {
  return upcomingBookings(bookings, nowMs, 1)[0];
}

/** Las próximas `limit` reservas vigentes por instante real, la más cercana primero. */
export function upcomingBookings(bookings: readonly Booking[], nowMs: number, limit: number): Booking[] {
  return [...bookings]
    .sort((a, b) => a.startUtcMs - b.startUtcMs)
    .filter((b) => activeUntilMs(b) >= nowMs)
    .slice(0, limit);
}

/** Ya terminada: pasó la hora hasta la que cuenta como vigente (ver `activeUntilMs`). */
export function isPast(booking: Booking, nowMs: number): boolean {
  return activeUntilMs(booking) < nowMs;
}

/** Las reservas ya terminadas, la más reciente primero: el histórico que va debajo de lo que queda. */
export function pastBookings(bookings: readonly Booking[], nowMs: number): Booking[] {
  return bookings.filter((b) => isPast(b, nowMs)).sort((a, b) => b.startUtcMs - a.startUtcMs);
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
