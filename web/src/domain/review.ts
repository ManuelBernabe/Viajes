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
  /** Si es el aviso de noches sin alojamiento: cuáles (para poder darlas por buenas). */
  nights?: string[];
}

const MINUTE = 60_000;

const isTransport = (b: Booking) => b.type === 'flight' || b.type === 'train';

/** Alojamientos que no son de tipo hotel: apartamentos, casas, cruceros… apuntados como «Otro». */
const STAY_WORDS = /\b(apartamento|apartment|appartement|appartamento|airbnb|vrbo|alojamiento|accommodation|hébergement|alloggio|casa rural|hostal|hostel|posada|pousada|lodge|caba[ñn]a|cabin|resort|villa|crucero|cruise|croisière|crociera|camping|glamping|b&b|bed and breakfast|guest ?house|estancia)\b/i;

function isStay(b: Booking): boolean {
  if (b.type === 'hotel') {
    return true;
  }
  if (b.type !== 'other' || !b.endLocal || b.endLocal.slice(0, 10) <= b.startLocal.slice(0, 10)) {
    return false;
  }
  return STAY_WORDS.test(`${b.title} ${b.startPlace ?? ''} ${b.notes ?? ''}`);
}

/**
 * Día de salida de un alojamiento. Si no tiene (una reserva apuntada a mano sin fecha de salida), se supone que dura
 * hasta el siguiente alojamiento o el siguiente vuelo o tren, y como mínimo una noche.
 */
function stayEnd(stay: Booking, all: readonly Booking[]): string {
  const from = stay.startLocal.slice(0, 10);
  const end = stay.endLocal?.slice(0, 10);
  if (end && end > from) {
    return end;
  }
  const next = all
    .filter((b) => b.id !== stay.id && (isTransport(b) || b.type === 'hotel') && b.startLocal.slice(0, 10) > from)
    .map((b) => b.startLocal.slice(0, 10))
    .sort()[0];
  return next ?? shiftDate(from, 1);
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


/**
 * Lo que no cuadra en un viaje, mirando solo lo que queda por delante:
 * - una llegada antes de la salida;
 * - noches sin alojamiento (ni hotel u otro alojamiento ni un vuelo o tren nocturno), salvo las que se den por buenas;
 * - dos trayectos que se solapan (sin contar el mismo vuelo de varios pasajeros);
 * - escalas cortas (menos de 1 h en el mismo aeropuerto o estación) y cambios de aeropuerto con poco margen;
 * - reservas fuera de las fechas del viaje.
 */
export function reviewTrip(
  trip: Trip,
  bookings: readonly Booking[],
  nowMs: number,
  today: string,
  ignoredNights: ReadonlySet<string> = new Set(),
): ReviewIssue[] {
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

  // Noches sin alojamiento: solo entre la primera y la última reserva de viaje (antes y después se está en casa).
  const stays = alive.filter(isStay);
  const travel = alive.filter((b) => isTransport(b) || isStay(b));
  const first = travel.map((b) => b.startLocal.slice(0, 10)).sort()[0];
  // Hasta la vuelta a casa (un trayecto que llega a donde salió el primero) o, si no hay vuelta, hasta el fin del viaje.
  const journeys = alive.filter(isTransport).sort((a, b) => a.startUtcMs - b.startUtcMs);
  const home = journeys[0]?.startPlace?.trim().toLowerCase();
  const back = home ? journeys.slice(1).find((b) => b.endPlace?.trim().toLowerCase() === home) : undefined;
  const last = back
    ? back.startLocal.slice(0, 10)
    : [trip.endDate, ...journeys.map((b) => b.startLocal.slice(0, 10)), ...stays.map((h) => stayEnd(h, alive))]
        .filter((d): d is string => !!d)
        .sort()
        .pop();
  if (first && last) {
    const nights: string[] = [];
    for (let night = first > today ? first : today; night < last; night = shiftDate(night, 1)) {
      const covered =
        stays.some((h) => h.startLocal.slice(0, 10) <= night && night < stayEnd(h, alive)) ||
        // Un vuelo o tren que sale ese día y llega al día siguiente o más tarde: se duerme viajando.
        alive.some((b) => isTransport(b) && b.startLocal.slice(0, 10) <= night && (b.endLocal?.slice(0, 10) ?? '') > night);
      if (!covered && !ignoredNights.has(night)) {
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
        nights,
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
