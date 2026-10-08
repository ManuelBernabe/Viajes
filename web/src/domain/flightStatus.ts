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
}

/** El mismo criterio que el servidor: el título empieza por el número de vuelo («JA 3157 IGR → AEP»). */
export function hasFlightNumber(booking: Pick<Booking, 'type' | 'title'>): boolean {
  return booking.type === 'flight' && /^\s*([A-Z][A-Z0-9]|[0-9][A-Z])\s?\d{1,4}[A-Z]?\b/.test(booking.title.toUpperCase());
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
export async function loadFlight(booking: Booking, now = Date.now()): Promise<FlightStatusResponse | null> {
  const cached = cachedFlight(booking.id);
  const tracking = now >= booking.startUtcMs - 24 * 3_600_000 && now <= booking.startUtcMs + 20 * 3_600_000;
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
