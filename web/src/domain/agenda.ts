import { dateOf, toUtcMs } from '../data/localTime';
import type { Booking, BookingType, Trip } from '../data/types';
import { t } from '../i18n';

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

/** Margen para tratar como «a la vez» dos reservas: el mismo vuelo en dos reservas, o dos trenes casi seguidos. */
export const SAME_TIME_MS = 60 * 60_000;

/**
 * Lo siguiente: la próxima reserva vigente y las que empiezan con ella, en la hora siguiente (dos reservas del mismo
 * vuelo, uno por pasajero, por ejemplo). Vacío si no queda nada.
 */
export function nextBookings(bookings: readonly Booking[], nowMs: number): Booking[] {
  const upcoming = upcomingBookings(bookings, nowMs, Number.MAX_SAFE_INTEGER);
  const first = upcoming[0];
  return first ? upcoming.filter((b) => b.startUtcMs - first.startUtcMs <= SAME_TIME_MS) : [];
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

/**
 * Palabras con dos sentidos («Entrada» del hotel o de un concierto, «Inicio» de la reserva o de la app): la clave lleva
 * el contexto entre corchetes, que en español se quita.
 */
const noContext = (text: string) => text.replace(/ \[[^\]]*\]$/, '');

export const TYPE_INFO: Record<BookingType, { icon: string; label: string; startLabel: string; endLabel: string }> = {
  flight: { icon: '✈️', label: t('Vuelo'), startLabel: t('Salida'), endLabel: t('Llegada') },
  train: { icon: '🚄', label: t('Tren'), startLabel: t('Salida'), endLabel: t('Llegada') },
  hotel: { icon: '🏨', label: t('Hotel'), startLabel: noContext(t('Entrada [hotel]')), endLabel: noContext(t('Salida [hotel]')) },
  car: { icon: '🚗', label: t('Coche'), startLabel: t('Recogida'), endLabel: t('Devolución') },
  ticket: { icon: '🎟️', label: t('Entrada'), startLabel: noContext(t('Inicio [reserva]')), endLabel: t('Fin') },
  other: { icon: '📌', label: t('Otro'), startLabel: noContext(t('Inicio [reserva]')), endLabel: t('Fin') },
};

/** «2026-10-12» de hoy en la zona del móvil. */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
