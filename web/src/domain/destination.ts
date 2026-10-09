import { api } from '../api';
import { lang } from '../i18n';

/** Lo que el servidor sabe de cada país del viaje (lo redacta la IA; el cambio es del día). */
export interface CountryInfo {
  country: string;
  flag?: string;
  currencyCode?: string;
  currencyName?: string;
  plugs?: string;
  voltage?: string;
  emergency?: string;
  tipping?: string;
  language?: string;
  visa?: string;
  tips?: string[];
  embassy?: string;
  rate?: number;
}

export interface DestinationInfo {
  countries: CountryInfo[];
  generatedMs: number;
  ratesMs?: number;
}

const cacheKey = (tripId: string) => `viajes.destino.${tripId}.${lang()}`;

/** Lo último que se vio, para tenerlo sin conexión. */
export function cachedDestination(tripId: string): DestinationInfo | null {
  try {
    const raw = localStorage.getItem(cacheKey(tripId));
    return raw ? (JSON.parse(raw) as DestinationInfo) : null;
  } catch {
    return null;
  }
}

export async function loadDestination(tripId: string, refresh = false): Promise<DestinationInfo> {
  const info = await api<DestinationInfo>(`/api/trips/${tripId}/destination-info?lang=${lang()}${refresh ? '&refresh=true' : ''}`);
  try {
    localStorage.setItem(cacheKey(tripId), JSON.stringify(info));
  } catch {
    // Sin almacenamiento: se volverá a pedir.
  }
  return info;
}

/** «1 € = 1.450,50 ARS»; con monedas fuertes, dos decimales; con las débiles, sin decimales de sobra. */
export function formatRate(rate: number, code: string, locale?: string): string {
  const digits = rate >= 100 ? 0 : rate >= 10 ? 1 : 2;
  return `1 € = ${rate.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${code}`;
}

/** Cuánto son 10, 50 y 100 € en la moneda local, para hacerse una idea en las tiendas. */
export function quickConversions(rate: number, locale?: string): string[] {
  return [10, 50, 100].map((eur) => `${eur} € ≈ ${Math.round(eur * rate).toLocaleString(locale)}`);
}
