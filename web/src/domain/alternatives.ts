import type { Booking } from '../data/types';
import type { Lang } from '../i18n';

/** Un trayecto para buscar alternativas: origen, destino y día local («2026-10-06»). */
export interface Route {
  from: string;
  to: string;
  date: string;
}

export interface SearchLink {
  /** Quién busca: «Google Flights», «Skyscanner»… */
  site: string;
  url: string;
}

const IATA = /^[A-Z]{3}$/;

/** Origen y destino de un vuelo como códigos IATA: de los lugares de la reserva o, si no, del título («JA 3140 AEP → IGR»). */
export function flightRoute(booking: Pick<Booking, 'startPlace' | 'endPlace' | 'title' | 'startLocal'>): Route | null {
  const date = booking.startLocal.slice(0, 10);
  const from = booking.startPlace?.trim().toUpperCase() ?? '';
  const to = booking.endPlace?.trim().toUpperCase() ?? '';
  if (IATA.test(from) && IATA.test(to)) {
    return { from, to, date };
  }
  const match = /\b([A-Z]{3})\s*(?:→|->|–|-|—|\/)\s*([A-Z]{3})\b/.exec(booking.title);
  return match ? { from: match[1], to: match[2], date } : null;
}

/** Origen y destino de un tren: los nombres de las estaciones tal cual. */
export function trainRoute(booking: Pick<Booking, 'startPlace' | 'endPlace' | 'startLocal'>): Route | null {
  const from = booking.startPlace?.trim();
  const to = booking.endPlace?.trim();
  return from && to ? { from, to, date: booking.startLocal.slice(0, 10) } : null;
}

/** «2026-10-06» ± días, sin pasar por la zona del móvil. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const SKYSCANNER: Record<Lang, string> = { es: 'es', en: 'net', fr: 'fr', it: 'it' };

/**
 * Búsquedas ya hechas del mismo trayecto y día. Primero solo directos; después con escalas. La app no cambia el billete:
 * eso se hace en la aerolínea (y el correo del cambio actualiza la reserva).
 */
export function flightSearches(route: Route, lang: Lang): { direct: SearchLink[]; withStops: SearchLink[] } {
  const google = (nonstop: boolean) =>
    `https://www.google.com/travel/flights?q=${encodeURIComponent(
      `Flights from ${route.from} to ${route.to} on ${route.date} one way${nonstop ? ' nonstop' : ''}`,
    )}&hl=${lang}`;
  const yymmdd = route.date.slice(2).replace(/-/g, '');
  const skyscanner = (nonstop: boolean) =>
    `https://www.skyscanner.${SKYSCANNER[lang]}/transport/flights/${route.from.toLowerCase()}/${route.to.toLowerCase()}/${yymmdd}/?adultsv2=1&rtn=0` +
    (nonstop ? '&preferdirects=true&stops=!oneStop,!twoPlusStops' : '&preferdirects=false');
  return {
    direct: [
      { site: 'Google Flights', url: google(true) },
      { site: 'Skyscanner', url: skyscanner(true) },
    ],
    withStops: [
      { site: 'Google Flights', url: google(false) },
      { site: 'Skyscanner', url: skyscanner(false) },
    ],
  };
}

/** Trenes: búsqueda en Google del trayecto y el día (muestra los horarios de Renfe, Iryo, Ouigo, Trenitalia…). */
export function trainSearches(route: Route, lang: Lang, words: { trains: string }): SearchLink[] {
  return [
    {
      site: 'Google',
      url: `https://www.google.com/search?q=${encodeURIComponent(`${words.trains} ${route.from} ${route.to} ${route.date}`)}&hl=${lang}`,
    },
  ];
}

/** El código de la aerolínea del título («JA 3140 …» → «JA»), para buscar su página de gestionar la reserva. */
export function airlineCode(title: string): string | null {
  return /^\s*([A-Z0-9]{2})\s?\d{1,4}\b/.exec(title)?.[1] ?? null;
}
