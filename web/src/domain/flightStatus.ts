import { api } from '../api';
import type { Booking } from '../data/types';
import { locale, t } from '../i18n';

/** Lo que el servidor sabe de un vuelo (horas en ms UTC). */
export interface FlightInfo {
  status: 'scheduled' | 'delayed' | 'boarding' | 'departed' | 'landed' | 'cancelled' | 'diverted' | 'unknown';
  origin: string | null;
  destination: string | null;
  depScheduledMs: number | null;
  depEstimatedMs: number | null;
  depActualMs: number | null;
  depTerminal: string | null;
  depGate: string | null;
  checkInDesk: string | null;
  arrScheduledMs: number | null;
  arrEstimatedMs: number | null;
  arrActualMs: number | null;
  arrTerminal: string | null;
  arrGate: string | null;
  baggage: string | null;
  source: string;
}

export interface FlightStatusResponse {
  configured: boolean;
  flight: string;
  trackingFromMs: number;
  fetchedMs: number | null;
  info: FlightInfo | null;
  delayMinutes: number;
  /** Por qué no hay datos si el proveedor falla («Se han acabado las consultas del mes…»). */
  problem?: string | null;
}

const NUMBER = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})(?![0-9:.,])/;
const BARE = /(?:vuelo|flight|vol|volo)\s*(?:n[º°o.]*\s*)?:?\s*(\d{1,4})(?![0-9])/i;
const AIRLINE_NAMES: [string, string][] = [
  ['iberia express', 'I2'], ['iberia', 'IB'], ['vueling', 'VY'], ['ryanair', 'FR'], ['air europa', 'UX'], ['aerolineas argentinas', 'AR'],
  ['aerolíneas argentinas', 'AR'], ['latam', 'LA'], ['jetsmart', 'JA'], ['gol', 'G3'], ['azul', 'AD'], ['air france', 'AF'], ['klm', 'KL'],
  ['lufthansa', 'LH'], ['british airways', 'BA'], ['easyjet', 'U2'], ['tap', 'TP'], ['ita airways', 'AZ'], ['american airlines', 'AA'],
  ['united', 'UA'], ['delta', 'DL'],
];

/** El mismo criterio que el servidor: número de vuelo en el título, si no en las notas, o aerolínea + «Vuelo: 3157». */
export function flightNumberOf(booking: Pick<Booking, 'type' | 'title' | 'notes'>): string | null {
  if (booking.type !== 'flight') {
    return null;
  }
  const clean = (code: string, digits: string) => code + (digits.replace(/^0+/, '') || '0');
  for (const text of [booking.title, booking.notes ?? '']) {
    const match = NUMBER.exec(text);
    if (match) {
      return clean(match[1], match[2]);
    }
  }
  const bare = booking.notes ? BARE.exec(booking.notes) : null;
  if (bare) {
    const text = `${booking.title} ${booking.notes}`.toLowerCase();
    const airline = AIRLINE_NAMES.find(([name]) => new RegExp(`(?<![a-záéíóú])${name}(?![a-záéíóú])`).test(text));
    if (airline) {
      return clean(airline[1], bare[1]);
    }
  }
  return null;
}

export function hasFlightNumber(booking: Pick<Booking, 'type' | 'title' | 'notes'>): boolean {
  return flightNumberOf(booking) !== null;
}

/** Icono, texto y tono del estado: «🟠 Retraso de 40 min». */
export function statusLabel(info: FlightInfo, delayMinutes: number): { icon: string; text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' } {
  switch (info.status) {
    case 'cancelled':
      return { icon: '❌', text: t('Cancelado'), tone: 'danger' };
    case 'diverted':
      return { icon: '↪️', text: t('Desviado'), tone: 'danger' };
    case 'landed':
      return { icon: '🛬', text: t('Ha aterrizado'), tone: 'ok' };
    case 'departed':
      return { icon: '🛫', text: t('En el aire'), tone: 'ok' };
    case 'boarding':
      return { icon: '🚶', text: t('Embarcando'), tone: 'ok' };
    default:
      if (delayMinutes >= 15) {
        return { icon: '🟠', text: t('Retraso de {time}', { time: duration(delayMinutes) }), tone: 'warn' };
      }
      return info.status === 'unknown' ? { icon: '⚪', text: t('Sin datos aún'), tone: 'muted' } : { icon: '🟢', text: t('En hora'), tone: 'ok' };
  }
}

export function duration(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
}

/** «09:29» en la zona dada. */
export function clock(ms: number | null, timeZone: string): string | null {
  if (ms === null) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(ms));
  } catch {
    return null;
  }
}

/** «Puerta 5 · Terminal A»: lo que hay que saber en el aeropuerto de salida. */
export function departureHint(info: FlightInfo): string {
  return [info.depTerminal && t('Terminal {t}', { t: info.depTerminal }), info.depGate && t('Puerta {g}', { g: info.depGate })].filter(Boolean).join(' · ');
}

const cacheKey = (bookingId: string) => `viajes:vuelo:${bookingId}`;

export function cachedFlight(bookingId: string): FlightStatusResponse | null {
  try {
    const raw = localStorage.getItem(cacheKey(bookingId));
    return raw ? (JSON.parse(raw) as FlightStatusResponse) : null;
  } catch {
    return null;
  }
}

/** Pide el estado; dentro de la ventana de seguimiento, pide además que se vuelva a consultar (el servidor limita cada cuánto). */
/** Cuándo se preguntó por última vez al servidor por cada reserva, en esta sesión de la app. */
const lastAsked = new Map<string, number>();

export async function loadFlight(booking: Booking, now = Date.now(), force = false): Promise<FlightStatusResponse | null> {
  const cached = cachedFlight(booking.id);
  const tracking = now >= booking.startUtcMs - 24 * 3_600_000 && now <= booking.startUtcMs + 20 * 3_600_000;
  // Varias tarjetas del mismo vuelo en pantalla (o volver a la misma página) no vuelven a preguntar en 2 minutos.
  const last = lastAsked.get(booking.id);
  if (!force && cached && last !== undefined && now - last < 2 * 60_000) {
    return cached;
  }
  lastAsked.set(booking.id, now);
  try {
    const result = await api<FlightStatusResponse>(`/api/bookings/${booking.id}/flight-status${tracking ? '?refresh=true' : ''}`);
    try {
      localStorage.setItem(cacheKey(booking.id), JSON.stringify(result));
    } catch {
      // Sin almacenamiento: no pasa nada.
    }
    return result;
  } catch {
    return cached;
  }
}
