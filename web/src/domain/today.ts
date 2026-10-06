import type { Booking } from '../data/types';
import { shiftDate } from './alternatives';
import { isInProgress, nextBookings } from './agenda';

/** «Hoy» solo enseña lo siguiente si empieza en menos de esto (o ya ha empezado). */
export const NEXT_WINDOW_MS = 36 * 3_600_000;

export interface TodayView {
  /** Lo siguiente (y lo que empieza con ello), si es pronto. */
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
  const next = candidates.length > 0 && (isInProgress(candidates[0], nowMs) || candidates[0].startUtcMs - nowMs <= NEXT_WINDOW_MS) ? candidates : [];
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
