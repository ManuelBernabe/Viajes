import { locale } from '../i18n';

/** Hora local de un lugar («2026-10-12T10:05» en «Europe/Madrid») ↔ instante UTC, con Intl y sin librerías. */

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parts(local: string): { y: number; m: number; d: number; hh: number; mm: number } {
  const match = LOCAL.exec(local);
  if (!match) {
    throw new Error(`Hora local no válida: ${local}`);
  }
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]), hh: Number(match[4]), mm: Number(match[5]) };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let cached = formatters.get(tz);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, cached);
  }
  return cached;
}

/** Desfase de la zona respecto a UTC en ese instante, en ms (Madrid en verano: +7.200.000). */
export function zoneOffsetMs(tz: string, utcMs: number): number {
  const fields: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') {
      fields[part.type] = Number(part.value);
    }
  }
  const asUtc = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * «2026-10-12T10:05» en «Europe/Madrid» → ms UTC. Dos pasadas resuelven los cambios de hora; una hora que no
 * existe (salto de primavera) queda una hora más tarde, igual que en el servidor.
 */
export function toUtcMs(local: string, tz: string): number {
  const { y, m, d, hh, mm } = parts(local);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const first = naive - zoneOffsetMs(tz, naive);
  const second = naive - zoneOffsetMs(tz, first);
  return second;
}

export function isValidZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function isValidLocal(local: string): boolean {
  return LOCAL.test(local);
}

/** «2026-10-12T10:05» → «10:05». */
export function timeOf(local: string): string {
  return local.slice(11, 16);
}

/** «2026-10-12T10:05» o «2026-10-12» → «2026-10-12». */
export function dateOf(local: string): string {
  return local.slice(0, 10);
}

const dayFormatter = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDayFormatter = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortDateFormatter = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', timeZone: 'UTC' });

function asUtcDate(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** «2026-10-12» → «lun, 12 oct». La fecha es un texto local: se formatea sin pasar por la zona del móvil. */
export function formatDay(date: string): string {
  return dayFormatter.format(asUtcDate(date));
}

export function formatLongDay(date: string): string {
  return longDayFormatter.format(asUtcDate(date));
}

export function formatShortDate(date: string): string {
  return shortDateFormatter.format(asUtcDate(date));
}

/** «2026-10-12» y «2026-10-20» → «12 oct – 20 oct». */
export function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) {
    return '';
  }
  if (start && end && start !== end) {
    return `${formatShortDate(start)} – ${formatShortDate(end)}`;
  }
  return formatShortDate((start ?? end)!);
}

/** «Europe/Madrid» → «Madrid». */
export function zoneLabel(tz: string): string {
  const city = tz.split('/').pop() ?? tz;
  return city.replace(/_/g, ' ');
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';
}

export const COMMON_TIME_ZONES: readonly string[] = [
  'Europe/Madrid',
  'Atlantic/Canary',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Zurich',
  'Europe/Vienna',
  'Europe/Prague',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Sao_Paulo',
  'Africa/Cairo',
  'Africa/Marrakesh',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

/** Todas las zonas que conoce el navegador, con las comunes primero. */
export function allTimeZones(): string[] {
  const known: string[] =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const rest = known.filter((tz) => !COMMON_TIME_ZONES.includes(tz)).sort();
  return [...COMMON_TIME_ZONES, ...rest];
}
