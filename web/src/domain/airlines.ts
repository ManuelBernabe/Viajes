/**
 * Aerolíneas conocidas: nombre, web (para gestionar la reserva, hacer el check-in y elegir asiento) y cuándo abre el
 * check-in online, en horas antes de la salida. Comprobado en octubre de 2026; las que no están usan 24 h. La misma
 * tabla de horas está en el servidor (Push/Airlines.cs), que manda el aviso.
 */
export interface Airline {
  name: string;
  url: string;
  checkInHours: number;
}

export const DEFAULT_CHECK_IN_HOURS = 24;

const AIRLINES: Record<string, Airline> = {
  IB: { name: 'Iberia', url: 'https://www.iberia.com', checkInHours: 24 },
  I2: { name: 'Iberia Express', url: 'https://www.iberiaexpress.com', checkInHours: 24 },
  VY: { name: 'Vueling', url: 'https://www.vueling.com', checkInHours: 168 },
  FR: { name: 'Ryanair', url: 'https://www.ryanair.com', checkInHours: 24 },
  UX: { name: 'Air Europa', url: 'https://www.aireuropa.com', checkInHours: 48 },
  AR: { name: 'Aerolíneas Argentinas', url: 'https://www.aerolineas.com.ar', checkInHours: 48 },
  LA: { name: 'LATAM', url: 'https://www.latamairlines.com', checkInHours: 48 },
  JJ: { name: 'LATAM', url: 'https://www.latamairlines.com', checkInHours: 48 },
  JA: { name: 'JetSMART', url: 'https://jetsmart.com', checkInHours: 72 },
  WJ: { name: 'JetSMART', url: 'https://jetsmart.com', checkInHours: 72 },
  G3: { name: 'GOL', url: 'https://www.voegol.com.br', checkInHours: 48 },
  AD: { name: 'Azul', url: 'https://www.voeazul.com.br', checkInHours: 72 },
};

/** «JA 3140 AEP → IGR» → «JA». */
export function flightCode(title: string): string | null {
  return /^\s*([A-Z0-9]{2})\s?\d{1,4}\b/.exec(title)?.[1] ?? null;
}

export function airlineOf(title: string): (Airline & { code: string }) | null {
  const code = flightCode(title);
  if (!code) {
    return null;
  }
  return { code, ...(AIRLINES[code] ?? { name: code, url: '', checkInHours: DEFAULT_CHECK_IN_HOURS }) };
}

/** Cuándo abre el check-in (instante UTC). */
export function checkInOpensMs(startUtcMs: number, title: string): number {
  return startUtcMs - (airlineOf(title)?.checkInHours ?? DEFAULT_CHECK_IN_HOURS) * 3_600_000;
}

/** Asientos que aparecen en las notas o el título: «Manuel Bernabe (23G)», «Asiento 12A»… sin repetir. */
export function seatsIn(...texts: (string | null | undefined)[]): string[] {
  const seats = new Set<string>();
  for (const text of texts) {
    for (const match of (text ?? '').matchAll(/(?:\(|\b(?:asiento|seat|siège|posto|assento)s?:?\s*)(\d{1,2}[A-K])\b\)?/gi)) {
      seats.add(match[1].toUpperCase());
    }
  }
  return [...seats];
}
