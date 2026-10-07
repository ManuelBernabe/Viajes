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
