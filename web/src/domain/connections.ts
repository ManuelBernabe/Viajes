import type { Booking } from '../data/types';
import { endUtcMs } from './agenda';
import { groupSameTrip, passengerOf } from './today';

const HOUR = 3_600_000;
/** Con el mismo localizador, una escala puede durar hasta 24 h (la regla de los billetes con conexión). */
const MAX_TICKETED_LAYOVER_MS = 24 * HOUR;
/** Con billetes sueltos, solo se junta si el siguiente sale pronto: más tiempo ya es una parada en la ciudad. */
const MAX_LOOSE_LAYOVER_MS = 12 * HOUR;
/** Una escala larga con hotel en medio es una parada (se duerme allí), no una conexión. */
const HOTEL_STOP_MS = 6 * HOUR;

/** Un tramo de un viaje con escalas: el mismo vuelo o tren, una reserva por pasajero (ver `groupSameTrip`). */
export type Leg = Booking[];

/** «Buenos Aires (EZE)» → {«eze», «buenos aires»}; «GRU» → {«gru»}. Sirve para ver si un tramo sale de donde llegó el otro. */
function placeKeys(place: string | null): Set<string> {
  const keys = new Set<string>();
  if (!place) {
    return keys;
  }
  const code = /\(([A-Za-z]{3})\)/.exec(place) ?? /^\s*([A-Z]{3})\s*$/.exec(place);
  if (code) {
    keys.add(code[1].toLowerCase());
  }
  const name = place
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toLowerCase();
  if (name && !(code && name === code[1].toLowerCase())) {
    keys.add(name);
  }
  return keys;
}

export function samePlace(a: string | null, b: string | null): boolean {
  const keys = placeKeys(b);
  return [...placeKeys(a)].some((key) => keys.has(key));
}

function travellers(leg: Leg): string {
  return leg
    .map((b) => passengerOf(b.title) ?? '')
    .sort()
    .join('|');
}

function references(leg: Leg): Set<string> {
  return new Set(leg.map((b) => b.reference?.trim().toUpperCase()).filter((r): r is string => Boolean(r)));
}

/** Instante de llegada de un tramo; sin hora de llegada, la de salida. */
export function arrivalMs(leg: Leg): number {
  return endUtcMs(leg[0]) ?? leg[0].startUtcMs;
}

/** El tramo `next` continúa el viaje de `prev`: mismo tipo, mismas personas, sale de donde llegó `prev` y poco después. */
export function connects(prev: Leg, next: Leg, hotels: readonly Booking[] = []): boolean {
  const a = prev[0];
  const b = next[0];
  if (a.type !== b.type || (a.type !== 'flight' && a.type !== 'train') || a.tripId !== b.tripId || travellers(prev) !== travellers(next)) {
    return false;
  }
  const arrival = arrivalMs(prev);
  const gap = b.startUtcMs - arrival;
  if (gap < 0) {
    return false;
  }
  const refs = references(next);
  const sameTicket = [...references(prev)].some((r) => refs.has(r));
  const placesKnown = Boolean(a.endPlace && b.startPlace);
  if (placesKnown ? !samePlace(a.endPlace, b.startPlace) : !sameTicket) {
    return false;
  }
  if (gap > (sameTicket ? MAX_TICKETED_LAYOVER_MS : MAX_LOOSE_LAYOVER_MS)) {
    return false;
  }
  // Si se duerme en la ciudad de la escala, es una parada del viaje, no una conexión.
  const sleeps = hotels.some((h) => h.type === 'hotel' && h.tripId === a.tripId && h.startUtcMs >= arrival - HOUR && h.startUtcMs <= b.startUtcMs);
  return !(sleeps && gap > HOTEL_STOP_MS);
}

/**
 * Junta los tramos de un mismo viaje con escalas: AEP → GRU y GRU → MAD son un solo viaje «AEP → GRU → MAD».
 * Devuelve cada viaje como su lista de tramos, en orden; lo que no tiene escala va solo (una lista de un tramo).
 */
export function groupConnections(legs: readonly Leg[], all: readonly Booking[] = []): Leg[][] {
  const hotels = all.filter((b) => b.type === 'hotel' && b.deletedAtMs === null);
  const chains: Leg[][] = [];
  for (const leg of [...legs].sort((x, y) => x[0].startUtcMs - y[0].startUtcMs)) {
    const chain = chains.find((c) => {
      const last = c[c.length - 1];
      // Volver al punto de partida es la vuelta, no una escala (ida y vuelta en el día).
      return connects(last, leg, hotels) && !samePlace(c[0][0].startPlace, leg[0].endPlace);
    });
    if (chain) {
      chain.push(leg);
    } else {
      chains.push([leg]);
    }
  }
  return chains;
}

/** Todos los viajes con escalas que se pueden formar con estas reservas (vuelos y trenes, agrupados por pasajeros). */
export function allConnections(all: readonly Booking[]): Leg[][] {
  const moving = all.filter((b) => b.deletedAtMs === null && (b.type === 'flight' || b.type === 'train')).sort((x, y) => x.startUtcMs - y.startUtcMs);
  return groupConnections(groupSameTrip(moving), all).filter((chain) => chain.length > 1);
}

/**
 * Para pintar una lista: cada grupo (`groupSameTrip`) se sustituye por su viaje completo con escalas, si lo tiene, y los
 * demás tramos de ese viaje ya no salen sueltos. `all` son todas las reservas, para encontrar los tramos que no están en
 * la lista (el segundo vuelo sale mañana, el primero ya aterrizó). `skip`: ids ya pintados en otra parte de la página.
 */
export function withConnections(groups: readonly Leg[], all: readonly Booking[], skip: ReadonlySet<string> = new Set()): Leg[][] {
  const chains = allConnections(all);
  const used = new Set(skip);
  const result: Leg[][] = [];
  for (const group of groups) {
    if (group.some((b) => used.has(b.id))) {
      continue;
    }
    const chain = chains.find((c) => c.some((leg) => leg.some((b) => b.id === group[0].id))) ?? [group];
    if (chain.flat().some((b) => used.has(b.id))) {
      continue;
    }
    chain.flat().forEach((b) => used.add(b.id));
    result.push(chain);
  }
  return result;
}

/** Los ids de todas las reservas de estos viajes (para no repetirlas en otra lista de la misma página). */
export function idsOf(chains: readonly Leg[][]): Set<string> {
  return new Set(chains.flat(2).map((b) => b.id));
}

/** «GRU» de «São Paulo (GRU)»; si no hay código, el sitio tal cual. */
export function shortPlace(place: string | null): string {
  if (!place) {
    return '–';
  }
  return /\(([A-Za-z]{3})\)/.exec(place)?.[1].toUpperCase() ?? place;
}

/** «AEP → GRU → MAD». */
export function connectionRoute(legs: readonly Leg[]): string {
  return [legs[0][0].startPlace, ...legs.map((leg) => leg[0].endPlace)].map(shortPlace).join(' → ');
}
