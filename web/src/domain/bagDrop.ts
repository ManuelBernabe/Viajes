import { flightCode } from './airlines';

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** Cuándo abren y cierran los mostradores de facturación, en horas y minutos antes de la salida programada. */
interface CounterRule {
  openH: number;
  closeMin: number;
}

/** Lo habitual: en internacionales abren 3 h antes y cierran 60 min antes; en nacionales, 2 h y 45 min. */
const INTERNATIONAL: CounterRule = { openH: 3, closeMin: 60 };
const DOMESTIC: CounterRule = { openH: 2, closeMin: 45 };

/** Aerolíneas que lo publican distinto (las de bajo coste cierran a los 40 min). */
const AIRLINE_RULES: Record<string, CounterRule> = {
  FR: { openH: 2, closeMin: 40 },
  U2: { openH: 2, closeMin: 40 },
  VY: { openH: 2, closeMin: 40 },
};

export interface BagDrop {
  opensMs: number;
  closesMs: number;
  state: 'soon' | 'open' | 'closing' | 'closed';
}

/**
 * Los mostradores de facturación (dejar maletas o hacer el check-in en el aeropuerto) de un vuelo: cuándo abren y
 * cierran, aproximado, y si ahora están abiertos. `international`: null si no se sabe (se toma como internacional, que
 * cierra antes: mejor llegar de sobra). Solo el día del vuelo: antes de 24 h o con el vuelo ya fuera, null.
 */
export function bagDrop(departureMs: number, title: string, international: boolean | null | undefined, now: number): BagDrop | null {
  if (now < departureMs - 24 * HOUR || now >= departureMs) {
    return null;
  }
  const code = flightCode(title);
  const rule = (code && AIRLINE_RULES[code]) || (international === false ? DOMESTIC : INTERNATIONAL);
  const opensMs = departureMs - rule.openH * HOUR;
  const closesMs = departureMs - rule.closeMin * MINUTE;
  const state = now < opensMs ? 'soon' : now >= closesMs ? 'closed' : closesMs - now <= 20 * MINUTE ? 'closing' : 'open';
  return { opensMs, closesMs, state };
}
