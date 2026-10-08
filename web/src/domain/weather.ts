import { api } from '../api';
import { t } from '../i18n';

/** El tiempo de un día del viaje en el sitio donde se está ese día (lo calcula el servidor con Open-Meteo). */
export interface DayWeather {
  date: string;
  place: string;
  code: number | null;
  max: number | null;
  min: number | null;
  rain: number | null;
}

/** Código WMO → icono y palabra. */
export function describeWeather(code: number | null): { icon: string; label: string } {
  switch (code) {
    case 0:
      return { icon: '☀️', label: t('Despejado') };
    case 1:
      return { icon: '🌤️', label: t('Casi despejado') };
    case 2:
      return { icon: '⛅', label: t('Nubes y claros') };
    case 3:
      return { icon: '☁️', label: t('Nublado') };
    case 45:
    case 48:
      return { icon: '🌫️', label: t('Niebla') };
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
      return { icon: '🌦️', label: t('Llovizna') };
    case 61:
    case 63:
    case 66:
    case 80:
    case 81:
      return { icon: '🌧️', label: t('Lluvia') };
    case 65:
    case 67:
    case 82:
      return { icon: '🌧️', label: t('Lluvia fuerte') };
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return { icon: '🌨️', label: t('Nieve') };
    case 95:
    case 96:
    case 99:
      return { icon: '⛈️', label: t('Tormenta') };
    default:
      return { icon: '🌡️', label: t('Tiempo variable') };
  }
}

/** «24° / 15°» (redondeado), o vacío si falta un dato. */
export function temps(day: DayWeather): string {
  return day.max !== null && day.min !== null ? `${Math.round(day.max)}° / ${Math.round(day.min)}°` : '';
}

const cacheKey = (tripId: string) => `viajes:tiempo:${tripId}`;
const FRESH_MS = 60 * 60_000;

interface Cached {
  at: number;
  days: DayWeather[];
}

/** Lo último que se guardó de este viaje (para verlo al momento y sin conexión). */
export function cachedWeather(tripId: string): Cached | null {
  try {
    const raw = localStorage.getItem(cacheKey(tripId));
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

/** Pide la previsión al servidor si la guardada tiene más de una hora; sin conexión, se queda con la guardada. */
export async function loadWeather(tripId: string, now = Date.now()): Promise<DayWeather[]> {
  const cached = cachedWeather(tripId);
  if (cached && now - cached.at < FRESH_MS) {
    return cached.days;
  }
  try {
    const { days } = await api<{ days: DayWeather[] }>(`/api/trips/${tripId}/weather`);
    try {
      localStorage.setItem(cacheKey(tripId), JSON.stringify({ at: now, days }));
    } catch {
      // Sin almacenamiento: se volverá a pedir.
    }
    return days;
  } catch {
    return cached?.days ?? [];
  }
}
