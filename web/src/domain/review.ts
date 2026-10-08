import { formatDay, timeOf, toUtcMs } from '../data/localTime';
import type { Booking, Trip } from '../data/types';
import { t } from '../i18n';
import { endUtcMs } from './agenda';
import { shiftDate } from './alternatives';
import { groupSameTrip } from './today';

export interface ReviewIssue {
  level: 'danger' | 'warning' | 'info';
  message: string;
  /** Reservas afectadas, para ir a ellas. */
  bookings: Booking[];
}

const MINUTE = 60_000;

function checkOut(hotel: Booking): string {
  return hotel.endLocal?.slice(0, 10) ?? shiftDate(hotel.startLocal.slice(0, 10), 1);
}

function arrivalMs(b: Booking): number | null {
  if (!b.endLocal) {
    return null;
  }
  try {
    return toUtcMs(b.endLocal, b.endTz ?? b.startTz);
  } catch {
    return null;
  }
}

/** Fechas seguidas en tramos: «sáb, 10 oct – dom, 18 oct, mar, 20 oct». */
function ranges(dates: readonly string[]): string {
  const parts: string[] = [];
  let start = dates[0];
  let prev = dates[0];
  for (const date of [...dates.slice(1), '']) {
    if (date && date === shiftDate(prev, 1)) {
      prev = date;
      continue;
    }
    parts.push(start === prev ? formatDay(start) : `${formatDay(start)} – ${formatDay(prev)}`);
    start = date;
    prev = date;
  }
  return parts.join(', ');
}

const isTransport = (b: Booking) => b.type === 'flight' || b.type === 'train';

/**
 * Lo que no cuadra en un viaje, mirando solo lo que queda por delante:
 * - una llegada antes de la salida;
 * - noches sin alojamiento (ni hotel ni un vuelo o tren nocturno);
 * - dos trayectos que se solapan (sin contar el mismo vuelo de varios pasajeros);
 * - escalas cortas (menos de 1 h en el mismo aeropuerto o estación) y cambios de aeropuerto con poco margen;
 * - reservas fuera de las fechas del viaje.
 */
export function reviewTrip(trip: Trip, bookings: readonly Booking[], nowMs: number, today: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const alive = bookings.filter((b) => b.deletedAtMs === null);
  const ahead = alive.filter((b) => (arrivalMs(b) ?? b.startUtcMs) >= nowMs || b.startUtcMs >= nowMs);

  // Llegada antes de la salida.
  for (const b of ahead) {
    const end = arrivalMs(b);
    if (end !== null && end < b.startUtcMs && b.type !== 'hotel') {
      issues.push({ level: 'danger', message: t('«{name}»: la llegada es anterior a la salida.', { name: b.title }), bookings: [b] });
    }
  }

  // Noches sin alojamiento.
  const first = trip.startDate ?? alive.map((b) => b.startLocal.slice(0, 10)).sort()[0];
  const last = trip.endDate ?? alive.map((b) => (b.endLocal ?? b.startLocal).slice(0, 10)).sort().pop();
  if (first && last) {
    const hotels = alive.filter((b) => b.type === 'hotel');
    const nights: string[] = [];
    for (let night = first > today ? first : today; night < last; night = shiftDate(night, 1)) {
      const covered =
        hotels.some((h) => h.startLocal.slice(0, 10) <= night && night < checkOut(h)) ||
        // Un vuelo o tren que sale ese día y llega al día siguiente o más tarde: se duerme viajando.
        alive.some((b) => isTransport(b) && b.startLocal.slice(0, 10) <= night && (b.endLocal?.slice(0, 10) ?? '') > night);
      if (!covered) {
        nights.push(night);
      }
    }
    if (nights.length > 0) {
      issues.push({
        level: 'warning',
        message:
          nights.length === 1
            ? t('Noche sin alojamiento: {days}.', { days: formatDay(nights[0]) })
            : t('{n} noches sin alojamiento: {days}.', { n: nights.length, days: ranges(nights) }),
        bookings: [],
      });
    }
  }

  // Trayectos: solapes, escalas cortas y cambios de aeropuerto.
  const legs = groupSameTrip(ahead.filter(isTransport).sort((a, b) => a.startUtcMs - b.startUtcMs)).map((group) => group[0]);
  for (let i = 0; i + 1 < legs.length; i++) {
    const a = legs[i];
    const b = legs[i + 1];
    const aEnd = endUtcMs(a);
    if (aEnd === null) {
      continue;
    }
    const gap = b.startUtcMs - aEnd;
    if (gap < 0) {
      issues.push({ level: 'danger', message: t('«{a}» y «{b}» se solapan.', { a: a.title, b: b.title }), bookings: [a, b] });
      continue;
    }
    const samePlace = !!a.endPlace && !!b.startPlace && a.endPlace.trim().toLowerCase() === b.startPlace.trim().toLowerCase();
    const minutes = Math.round(gap / MINUTE);
    if (samePlace && minutes < 60) {
      issues.push({
        level: 'warning',
        message: t('Escala corta en {place}: {min} min entre «{a}» y «{b}».', { place: a.endPlace ?? '', min: minutes, a: a.title, b: b.title }),
        bookings: [a, b],
      });
    } else if (!samePlace && a.endPlace && b.startPlace && minutes < 180) {
      issues.push({
        level: 'warning',
        message: t('Cambio de {from} a {to} con {time} de margen (llegas a las {arrive}).', {
          from: a.endPlace,
          to: b.startPlace,
          time: minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`,
          arrive: a.endLocal ? timeOf(a.endLocal) : '',
        }),
        bookings: [a, b],
      });
    }
  }

  // Fuera de las fechas del viaje.
  if (trip.startDate && trip.endDate) {
    for (const b of ahead) {
      const day = b.startLocal.slice(0, 10);
      if (day < trip.startDate || day > trip.endDate) {
        issues.push({ level: 'info', message: t('«{name}» es del {day}, fuera de las fechas del viaje.', { name: b.title, day: formatDay(day) }), bookings: [b] });
      }
    }
  }

  return issues;
}
