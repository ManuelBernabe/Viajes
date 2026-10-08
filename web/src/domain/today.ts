import type { Booking } from '../data/types';
import { shiftDate } from './alternatives';
import { isInProgress, nextBookings } from './agenda';

export interface TodayView {
  /** Lo siguiente (y lo que empieza con ello), solo si es hoy o ya está en marcha. */
  next: Booking[];
  /** Hoteles en los que se duerme esta noche. */
  tonight: Booking[];
  /** El resto de reservas de hoy, en orden. */
  today: Booking[];
}

/** Lo que importa hoy: lo próximo, dónde se duerme y lo demás del día. Null si hoy no hay nada. */
export function todayView(bookings: readonly Booking[], nowMs: number, today: string): TodayView | null {
  const alive = bookings.filter((b) => b.deletedAtMs === null);
  // Lo siguiente sin las estancias en curso (el hotel va en «Esta noche»).
  const candidates = nextBookings(alive, nowMs).filter((b) => !(b.type === 'hotel' && b.startUtcMs <= nowMs));
  // Lo de mañana no es de «Hoy», aunque falten pocas horas (el vuelo del jueves no sale el miércoles).
  const next = candidates.filter((b) => isInProgress(b, nowMs) || b.startLocal.slice(0, 10) === today);
  const shown = new Set(next.map((b) => b.id));
  const tonight = alive.filter((b) => {
    if (b.type !== 'hotel' || shown.has(b.id)) {
      return false;
    }
    const checkIn = b.startLocal.slice(0, 10);
    const checkOut = b.endLocal?.slice(0, 10) ?? shiftDate(checkIn, 1);
    return checkIn <= today && today < checkOut;
  });
  tonight.forEach((b) => shown.add(b.id));
  const rest = alive
    .filter((b) => b.startLocal.slice(0, 10) === today && !shown.has(b.id))
    .sort((a, b) => a.startUtcMs - b.startUtcMs);
  return next.length + tonight.length + rest.length === 0 ? null : { next, tonight, today: rest };
}

/** Milisegundos que faltan → partes para «en 2 h 15 min». */
export function countdown(ms: number): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.round(ms / 60_000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}

/** Lo de un día: lo que empieza, las salidas de hotel y dónde se duerme esa noche. */
export interface DayPlan {
  date: string;
  starting: Booking[];
  checkOuts: Booking[];
  night: Booking | null;
}

/** Junta lo de un día (fecha local de cada reserva), como el resumen de la víspera. */
export function dayPlan(bookings: readonly Booking[], date: string): DayPlan {
  const alive = bookings.filter((b) => b.deletedAtMs === null);
  const starting = alive.filter((b) => b.startLocal.slice(0, 10) === date).sort((a, b) => a.startUtcMs - b.startUtcMs);
  const hotels = alive.filter((b) => b.type === 'hotel');
  const checkOuts = hotels
    .filter((h) => h.endLocal?.slice(0, 10) === date && h.startLocal.slice(0, 10) !== date)
    .sort((a, b) => (a.endLocal ?? '').localeCompare(b.endLocal ?? ''));
  const night =
    hotels
      .filter((h) => h.startLocal.slice(0, 10) <= date && date < (h.endLocal?.slice(0, 10) ?? shiftDate(h.startLocal.slice(0, 10), 1)))
      .sort((a, b) => a.startUtcMs - b.startUtcMs)
      .pop() ?? null;
  return { date, starting, checkOuts, night };
}

/** Los próximos `days` días a partir de `from`, solo los que tienen algo. */
export function weekPlans(bookings: readonly Booking[], from: string, days: number): DayPlan[] {
  return Array.from({ length: days }, (_, i) => dayPlan(bookings, shiftDate(from, i))).filter((d) => d.starting.length + d.checkOuts.length > 0);
}

/** «JA 3157 IGR → AEP · Paco» → «JA 3157 IGR → AEP»: el mismo trayecto sin el nombre del pasajero. */
export function withoutPassenger(title: string): string {
  return title.replace(/\s+·\s+[^·→]+$/, '').trim();
}

/**
 * Agrupa las reservas que son el mismo viaje con varios pasajeros (mismo tipo, misma hora, mismo trayecto): en «Hoy»
 * se ven como una sola tarjeta con los pasajeros dentro.
 */
export function groupSameTrip(bookings: readonly Booking[]): Booking[][] {
  const groups: Booking[][] = [];
  for (const booking of bookings) {
    const group = groups.find(
      (g) => g[0].type === booking.type && g[0].startUtcMs === booking.startUtcMs && withoutPassenger(g[0].title) === withoutPassenger(booking.title),
    );
    if (group) {
      group.push(booking);
    } else {
      groups.push([booking]);
    }
  }
  return groups;
}

/** «Paco» de «JA 3157 IGR → AEP · Paco»; null si el título no lleva pasajero. */
export function passengerOf(title: string): string | null {
  const match = /\s+·\s+([^·→]+)$/.exec(title);
  return match ? match[1].trim() : null;
}
