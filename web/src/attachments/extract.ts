import type { BookingType } from '../data/types';

/**
 * Propuesta de campos a partir del texto de un billete o confirmación. Son reglas por patrones: aciertan con los
 * formatos habituales (Renfe, Iberia, Vueling, Booking…) y, cuando no, dejan el campo vacío. Siempre se revisan.
 */
export interface TextSuggestion {
  type: BookingType | null;
  title: string | null;
  reference: string | null;
  startDate: string | null;
  startTime: string | null;
  startPlace: string | null;
  /** Zona IANA del lugar cuando se deduce (aeropuertos conocidos). */
  startTz: string | null;
  endDate: string | null;
  endTime: string | null;
  endPlace: string | null;
  endTz: string | null;
  address: string | null;
  /** Coche y plazas, pasajeros… lo que conviene tener a mano pero no tiene campo propio. */
  notes: string | null;
}

/** Meses en español, portugués e inglés, sin acentos (el texto se normaliza antes de buscar). */
const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, janeiro: 1, january: 1,
  feb: 2, febrero: 2, fev: 2, fevereiro: 2, february: 2,
  mar: 3, marzo: 3, marco: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5, mai: 5, maio: 5,
  jun: 6, junio: 6, junho: 6, june: 6,
  jul: 7, julio: 7, julho: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, set: 9, setembro: 9, september: 9,
  oct: 10, octubre: 10, out: 10, outubro: 10, october: 10,
  nov: 11, noviembre: 11, novembro: 11, november: 11,
  dic: 12, diciembre: 12, dez: 12, dezembro: 12, dec: 12, december: 12,
};

/** «março» → «marco», «Sept.» → «sept». */
function monthOf(word: string): number | undefined {
  return MONTHS[word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const full = year < 100 ? 2000 + year : year;
  return `${full}-${pad(month)}-${pad(day)}`;
}

/** Todas las fechas del texto, en orden de aparición, con su posición. */
export function findDates(text: string): { date: string; index: number }[] {
  const found: { date: string; index: number }[] = [];
  const isIssueStamp = (index: number, length: number) => {
    // «09/06/2026 - 11:05» es el sello de emisión del billete; «Fecha: El sáb, 26 sept 2026 a las 12:19» la cabecera
    // de un reenvío; «Pago completado el 26 sept», un cobro. Ninguna es la fecha del viaje.
    const after = text.slice(index + length, index + length + 14);
    const before = text.slice(Math.max(0, index - 40), index).toLowerCase();
    return (
      /^\s*-\s*\d{1,2}[:.]\d{2}/.test(after) ||
      /^\s*a las \d{1,2}[:.]\d{2}/.test(after) ||
      /(emisi[oó]n|emitido|impreso|compra|fecha de reserva|issued|printed|pago completado el|cobro el|fecha:\s*el|date:)\W*$/.test(before)
    );
  };
  const push = (date: string | null, match: RegExpExecArray) => {
    if (date && !isIssueStamp(match.index, match[0].length)) {
      found.push({ date, index: match.index });
    }
  };
  const numeric = /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/g;
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  // «01 oct 202614:35»: en algunos correos el año va pegado a la hora. «6 de outubro de 2026» (portugués) y «15/oct/2026» entran igual.
  const worded = /\b(\d{1,2})[\s/\-]*(?:de\s+)?([a-záéíóúãç]{3,10})\.?[\s/\-]*(?:de\s+|,\s*)?(\d{4})(?=\d{1,2}[:.]\d{2}|\b)/gi;
  // «October 6, 2026» / «Oct 6 2026» (inglés, mes primero).
  const monthFirst = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = numeric.exec(text))) {
    push(isoDate(Number(match[1]), Number(match[2]), Number(match[3])), match);
  }
  while ((match = iso.exec(text))) {
    push(isoDate(Number(match[3]), Number(match[2]), Number(match[1])), match);
  }
  while ((match = worded.exec(text))) {
    const month = monthOf(match[2]);
    if (month) {
      push(isoDate(Number(match[1]), month, Number(match[3])), match);
    }
  }
  while ((match = monthFirst.exec(text))) {
    const month = monthOf(match[1]);
    if (month && !found.some((d) => Math.abs(d.index - match!.index) < 3)) {
      push(isoDate(Number(match[2]), month, Number(match[3])), match);
    }
  }
  // «jueves, 01 octubre» sin año: la próxima vez que caiga esa fecha (el año en curso, o el siguiente si ya pasó hace más de 60 días).
  // Se admiten siempre (un reenvío trae la fecha del reenvío con año y las del viaje sin él), pero sin duplicar las que ya tienen año.
  const noYear = /\b(\d{1,2})\s+(?:de\s+)?([a-záéíóúãç]{3,10})\b\.?(?!\s*(?:de\s+)?\d{4})/gi;
  while ((match = noYear.exec(text))) {
    const month = monthOf(match[2]);
    if (month && !found.some((d) => Math.abs(d.index - match!.index) < 3)) {
      push(isoDate(Number(match[1]), month, inferYear(month, Number(match[1]))), match);
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** La primera fecha que aparece poco después de una etiqueta («Llegada», «Check-in»…). */
function labeledDate(text: string, label: RegExp): { date: string; index: number } | undefined {
  const match = label.exec(text);
  if (!match) {
    return undefined;
  }
  const from = match.index;
  return findDates(text.slice(from, from + 80)).map((d) => ({ date: d.date, index: d.index + from }))[0];
}

/** Año más plausible para un día/mes sin año: el actual, salvo que quede más de 60 días atrás. */
export function inferYear(month: number, day: number, now = new Date()): number {
  const year = now.getFullYear();
  const candidate = Date.UTC(year, month - 1, day);
  const today = Date.UTC(year, now.getMonth(), now.getDate());
  return today - candidate > 60 * 86_400_000 ? year + 1 : year;
}

/**
 * La fecha del viaje: la que sigue a una etiqueta («Fecha:», «Data:», «PARTIDA:») si la hay; si no, la que más se repite
 * (un billete por pasajero la repite); en empate, la primera. Las fechas de hace más de 60 días (emisión, pago) no cuentan
 * si hay otras, salvo que se pida lo contrario.
 */
function travelDate(dates: { date: string; index: number }[], text = '', now = new Date()): { date: string; index: number } | undefined {
  if (dates.length === 0) {
    return undefined;
  }
  const labeled = labeledDate(text, /\b(?:fecha|data|date|partida|salida|departure|embarque|ida)\s*(?:d[eo]\s+(?:salida|viaje|vuelo|voo|ida|partida))?\s*:/i);
  if (labeled) {
    return labeled;
  }
  const cutoff = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
  const recent = dates.filter((d) => d.date >= cutoff);
  const pool = recent.length > 0 ? recent : dates;
  const counts = new Map<string, number>();
  for (const d of pool) {
    counts.set(d.date, (counts.get(d.date) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return pool.find((d) => d.date === best);
}

/** «Coche: 8 Plaza: 6B» (uno por pasajero) → «Coche 8 · Plazas 6B, 6A». */
function findSeats(text: string): string | null {
  const re = /\b(?:coche|car|wagon|vag[oó]n|carro|vag[aã]o)\b\s*[:.]?\s*(\w+)\s*[,·]?\s*(?:plaza|asiento|seat|assento|poltrona)\b\s*[:.]?\s*(\w+)/gi;
  const coaches = new Set<string>();
  const seats: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    coaches.add(match[1]);
    if (!seats.includes(match[2].toUpperCase())) {
      seats.push(match[2].toUpperCase());
    }
  }
  if (seats.length === 0) {
    return null;
  }
  return `Coche ${[...coaches].join('/')} · ${seats.length === 1 ? 'Plaza' : 'Plazas'} ${seats.join(', ')}`;
}

/** Horas «14:35», «14.35 h» o «9:10 PM» (inglés), con posición. */
export function findTimes(text: string): { time: string; index: number }[] {
  const found: { time: string; index: number }[] = [];
  // Una hora empieza tras algo que no sea cifra ni separador… o tras un año pegado («202614:35»), o tras una etiqueta
  // pegada con dos puntos («Partida:11:55», «Hora de salida:16:39»).
  const re = /(?:(?<![\d:.])|(?<=\b\d{4})|(?<=[a-záéíóúñ)]:))([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*h\b|\s*([ap])\.?m\.?\b)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    // Descarta lo que parece una fecha con puntos (12.10.2026) o un importe.
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 3);
    if (/^[.:]\d/.test(after) || /^\s*(€|R\$|US\$|\$)/.test(after)) {
      continue;
    }
    let hour = Number(match[1]);
    const meridian = match[3]?.toLowerCase();
    if (meridian === 'p' && hour < 12) hour += 12;
    if (meridian === 'a' && hour === 12) hour = 0;
    found.push({ time: `${pad(hour)}:${match[2]}`, index: match.index });
  }
  return found;
}

function detectType(text: string): BookingType | null {
  const t = text.toLowerCase();
  // Español, portugués e inglés, por este orden de prioridad (un hotel cerca del aeropuerto sigue siendo un hotel: se mira antes lo específico).
  if (/\b(renfe|ave\b|alvia|avlo|iryo|ouigo|tren|train|trem|coche\s+\d|vagón|vag[aã]o|wagon|rail)\b/.test(t)) return 'train';
  if (/\b(vuelos?|flights?|voos?|boarding pass|tarjeta de embarque|cart[aã]o de embarque|aerol[ií]neas?|airlines?|linhas a[eé]reas|companhia a[eé]rea|embarque|itinerario|itiner[aá]rio|avi[oó]n|aeropuerto|aeroporto|airport|terminal|cabina|boleto|passagem a[eé]rea|e-?ticket|iberia|vueling|ryanair|easyjet|air europa|lufthansa|klm|british airways|latam|jetsmart|flybondi|voegol|gol linhas|azul linhas|sky airline|aerol[ií]neas argentinas)\b/.test(t)) return 'flight';
  if (/\b(hotel|hostel|pousada|resort|check-?in|check-?out|habitaci[oó]n|quarto|room|noches?|noites?|nights?|di[aá]rias?|hospedagem|estadia|apartamento|booking\.com|airbnb|expedia|hoteles\.com|hotels\.com)\b/.test(t)) return 'hotel';
  if (/\b(alquiler de coche|aluguel de carro|locadora|rent a car|car rental|rental car|hertz|avis|europcar|sixt|localiza|movida|recogida del veh[ií]culo|pick-?up)\b/.test(t)) return 'car';
  if (/\b(entrada|entradas|ingressos?|ticket|tickets|museo|museu|concierto|espect[aá]culo|admission|excursi[oó]n|tour)\b/.test(t)) return 'ticket';
  return null;
}

/** Palabras que pueden seguir a «código de reserva» sin ser el código. */
const NOT_A_CODE = new Set([
  'PARTIDA', 'ARRIBO', 'SALIDA', 'LLEGADA', 'VUELO', 'FECHA', 'HOTEL', 'TREN', 'TOTAL', 'RESERVA', 'CODIGO', 'CÓDIGO', 'NUMERO', 'NÚMERO',
  'BILLETE', 'TICKET', 'BOOKING', 'NOMBRE', 'ORIGEN', 'DESTINO', 'PASAJERO', 'CLIENTE', 'PRECIO', 'IMPORTE', 'ESTADO', 'CABINA', 'ASIENTO',
  // Portugués e inglés.
  'CHEGADA', 'SAIDA', 'SAÍDA', 'EMBARQUE', 'DATA', 'ORIGEM', 'PASSAGEIRO', 'ASSENTO', 'VALOR', 'STATUS', 'CONFIRMADO', 'CONFIRMADA',
  'DEPARTURE', 'ARRIVAL', 'FLIGHT', 'DATE', 'PASSENGER', 'SEAT', 'CONFIRMED', 'GUEST', 'CHECK', 'TRAVEL', 'TRIP', 'PRICE', 'AMOUNT',
]);

function findReference(text: string): string | null {
  // La etiqueta se busca sin distinguir mayúsculas (y puede venir pegada: «reservaCódigo de reserva:»); lo que sigue, sí:
  // se admite una palabra con minúsculas («Localizador Renfe: C3BMDV») pero nunca un bloque en mayúsculas, que es el código.
  // Etiquetas en español, portugués e inglés.
  const label = /(?:localizador|localizer|locator|c[oó]digo (?:de|da) reserva(?:ci[oó]n)?|n[uú]mero (?:de|da) reserva|reserva n[.ºo]?|reserva confirmada|confirmaci[oó]n de (?:tu|la|su) reserva|c[oó]digo de confirma[cç][aã]o|n[uú]mero de confirma[cç][aã]o|booking (?:reference|number|code|id)|reservation (?:number|code|id)|reference|referencia|refer[eê]ncia|confirmation (?:number|code)|confirmaci[oó]n|confirma[cç][aã]o|pnr|record locator|asociad[oa] a)/gi;
  // Entre etiqueta y código puede ir una palabra («Renfe», «GOL», «Reserva»), nunca un bloque largo en mayúsculas.
  const code = /^(?:\s+(?:[A-Za-z]*[a-z][A-Za-z]*|[A-Z]{2,4}))?\s*[:#nº.]*\s*([A-Z0-9]{5,10})\b/;
  let match: RegExpExecArray | null;
  while ((match = label.exec(text))) {
    const rest = code.exec(text.slice(match.index + match[0].length, match.index + match[0].length + 60));
    if (!rest) {
      continue;
    }
    const candidate = rest[1];
    if (NOT_A_CODE.has(candidate) || !/[0-9]|^[A-Z0-9]+$/.test(candidate)) {
      continue;
    }
    return candidate;
  }
  return null;
}

/** Zona horaria de los aeropuertos más habituales: con ella la llegada sale en la hora del lugar. */
export const AIRPORT_TZ: Record<string, string> = {
  MAD: 'Europe/Madrid', BCN: 'Europe/Madrid', ALC: 'Europe/Madrid', VLC: 'Europe/Madrid', AGP: 'Europe/Madrid', PMI: 'Europe/Madrid',
  SVQ: 'Europe/Madrid', BIO: 'Europe/Madrid', IBZ: 'Europe/Madrid', MAH: 'Europe/Madrid', SCQ: 'Europe/Madrid', OVD: 'Europe/Madrid',
  XRY: 'Europe/Madrid', GRX: 'Europe/Madrid', VGO: 'Europe/Madrid', LCG: 'Europe/Madrid', SDR: 'Europe/Madrid', ZAZ: 'Europe/Madrid',
  RMU: 'Europe/Madrid', REU: 'Europe/Madrid', EAS: 'Europe/Madrid', LEI: 'Europe/Madrid', VLL: 'Europe/Madrid', PNA: 'Europe/Madrid',
  LPA: 'Atlantic/Canary', TFS: 'Atlantic/Canary', TFN: 'Atlantic/Canary', ACE: 'Atlantic/Canary', FUE: 'Atlantic/Canary', SPC: 'Atlantic/Canary',
  LIS: 'Europe/Lisbon', OPO: 'Europe/Lisbon', FAO: 'Europe/Lisbon', FNC: 'Atlantic/Madeira', PDL: 'Atlantic/Azores',
  NAP: 'Europe/Rome', BLQ: 'Europe/Rome', PSA: 'Europe/Rome', CTA: 'Europe/Rome', PMO: 'Europe/Rome', BRI: 'Europe/Rome', FLR: 'Europe/Rome',
  NCE: 'Europe/Paris', LYS: 'Europe/Paris', MRS: 'Europe/Paris', TLS: 'Europe/Paris', BOD: 'Europe/Paris', DUS: 'Europe/Berlin',
  HAM: 'Europe/Berlin', STR: 'Europe/Berlin', CGN: 'Europe/Berlin', EDI: 'Europe/London', BHX: 'Europe/London', BRS: 'Europe/London',
  GLA: 'Europe/London', KRK: 'Europe/Warsaw', OTP: 'Europe/Bucharest', SOF: 'Europe/Sofia', ZAG: 'Europe/Zagreb', SPU: 'Europe/Zagreb',
  DBV: 'Europe/Zagreb', LJU: 'Europe/Ljubljana', BTS: 'Europe/Bratislava', KEF: 'Atlantic/Reykjavik', TLV: 'Asia/Jerusalem',
  IAD: 'America/New_York', DCA: 'America/New_York', PHL: 'America/New_York', MCO: 'America/New_York', FLL: 'America/New_York',
  IAH: 'America/Chicago', MSP: 'America/Chicago', LAS: 'America/Los_Angeles', SEA: 'America/Los_Angeles', SAN: 'America/Los_Angeles',
  PHX: 'America/Phoenix', YVR: 'America/Vancouver', GDL: 'America/Mexico_City', MTY: 'America/Monterrey',
  LHR: 'Europe/London', LGW: 'Europe/London', STN: 'Europe/London', LTN: 'Europe/London', MAN: 'Europe/London', DUB: 'Europe/Dublin',
  CDG: 'Europe/Paris', ORY: 'Europe/Paris', AMS: 'Europe/Amsterdam', BRU: 'Europe/Brussels', FRA: 'Europe/Berlin', MUC: 'Europe/Berlin',
  BER: 'Europe/Berlin', ZRH: 'Europe/Zurich', GVA: 'Europe/Zurich', VIE: 'Europe/Vienna', FCO: 'Europe/Rome', MXP: 'Europe/Rome',
  LIN: 'Europe/Rome', VCE: 'Europe/Rome', ATH: 'Europe/Athens', IST: 'Europe/Istanbul', CPH: 'Europe/Copenhagen', OSL: 'Europe/Oslo',
  ARN: 'Europe/Stockholm', HEL: 'Europe/Helsinki', WAW: 'Europe/Warsaw', PRG: 'Europe/Prague', BUD: 'Europe/Budapest',
  JFK: 'America/New_York', EWR: 'America/New_York', BOS: 'America/New_York', MIA: 'America/New_York', ATL: 'America/New_York',
  ORD: 'America/Chicago', DFW: 'America/Chicago', DEN: 'America/Denver', LAX: 'America/Los_Angeles', SFO: 'America/Los_Angeles',
  YYZ: 'America/Toronto', YUL: 'America/Toronto', MEX: 'America/Mexico_City', CUN: 'America/Cancun', BOG: 'America/Bogota',
  LIM: 'America/Lima', CUZ: 'America/Lima', AQP: 'America/Lima', SCL: 'America/Santiago', ANF: 'America/Santiago', CJC: 'America/Santiago',
  PUQ: 'America/Punta_Arenas', IPC: 'Pacific/Easter',
  // Argentina: cada provincia tiene su zona IANA, aunque hoy todas marcan la misma hora.
  EZE: 'America/Argentina/Buenos_Aires', AEP: 'America/Argentina/Buenos_Aires', IGR: 'America/Argentina/Buenos_Aires',
  COR: 'America/Argentina/Cordoba', ROS: 'America/Argentina/Cordoba', MDZ: 'America/Argentina/Mendoza', SLA: 'America/Argentina/Salta',
  BRC: 'America/Argentina/Salta', USH: 'America/Argentina/Ushuaia', FTE: 'America/Argentina/Rio_Gallegos', TUC: 'America/Argentina/Tucuman',
  REL: 'America/Argentina/Catamarca', NQN: 'America/Argentina/Salta', JUJ: 'America/Argentina/Jujuy',
  // Brasil.
  GRU: 'America/Sao_Paulo', CGH: 'America/Sao_Paulo', VCP: 'America/Sao_Paulo', GIG: 'America/Sao_Paulo', SDU: 'America/Sao_Paulo',
  BSB: 'America/Sao_Paulo', CNF: 'America/Sao_Paulo', IGU: 'America/Sao_Paulo', FLN: 'America/Sao_Paulo', POA: 'America/Sao_Paulo',
  CWB: 'America/Sao_Paulo', VIX: 'America/Sao_Paulo', GYN: 'America/Sao_Paulo', SSA: 'America/Bahia', REC: 'America/Recife',
  FOR: 'America/Fortaleza', NAT: 'America/Fortaleza', MCZ: 'America/Maceio', BEL: 'America/Belem', MAO: 'America/Manaus',
  CGB: 'America/Cuiaba', FEN: 'America/Noronha',
  // Resto de Sudamérica y Caribe.
  MVD: 'America/Montevideo', PDP: 'America/Montevideo', ASU: 'America/Asuncion', LPB: 'America/La_Paz', VVI: 'America/La_Paz',
  UIO: 'America/Guayaquil', GYE: 'America/Guayaquil', GPS: 'Pacific/Galapagos', MDE: 'America/Bogota', CTG: 'America/Bogota',
  CCS: 'America/Caracas', HAV: 'America/Havana', PTY: 'America/Panama', SJO: 'America/Costa_Rica', PUJ: 'America/Santo_Domingo',
  SDQ: 'America/Santo_Domingo', SJU: 'America/Puerto_Rico',
  DXB: 'Asia/Dubai', DOH: 'Asia/Qatar', CAI: 'Africa/Cairo', RAK: 'Africa/Casablanca', CMN: 'Africa/Casablanca', JNB: 'Africa/Johannesburg',
  DEL: 'Asia/Kolkata', BOM: 'Asia/Kolkata', BKK: 'Asia/Bangkok', SIN: 'Asia/Singapore', HKG: 'Asia/Hong_Kong', PEK: 'Asia/Shanghai',
  PVG: 'Asia/Shanghai', ICN: 'Asia/Seoul', NRT: 'Asia/Tokyo', HND: 'Asia/Tokyo', KIX: 'Asia/Tokyo', SYD: 'Australia/Sydney',
  MEL: 'Australia/Melbourne', AKL: 'Pacific/Auckland',
};

const NOT_AN_AIRPORT = new Set(['OCT', 'NOV', 'DEC', 'DIC', 'JAN', 'ENE', 'FEB', 'MAR', 'APR', 'ABR', 'MAY', 'JUN', 'JUL', 'AUG', 'AGO', 'SEP', 'SET', 'THE', 'AND', 'VIA', 'IVA', 'PDF', 'JET', 'TER', 'AIR', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'LUN', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM']);

/** Compañías habituales (código IATA): con ellas «T4 2026» o «A1 2026» no se toman por un vuelo. */
const CARRIERS = [
  'IB', 'I2', 'UX', 'VY', 'FR', 'U2', 'EJU', 'TP', 'BA', 'AF', 'KL', 'LH', 'LX', 'OS', 'SN', 'EI', 'AZ', 'TK', 'EK', 'QR', 'EY', 'SK', 'AY',
  'AA', 'DL', 'UA', 'AC', 'AM', 'AV', 'CM', 'LA', 'JJ', 'LP', 'XL', '4C', '4M', 'AR', 'G3', 'JA', 'AD', 'FO', 'H2', 'WJ', 'OB', 'Z8', 'P9',
  'JU', 'CX', 'SQ', 'NH', 'JL', 'KE', 'QF', 'NZ', 'ET', 'MS', 'SA', 'AT',
];

/** Nombre de la compañía → código IATA, para cuando el número de vuelo va sin él («Voo:1890» de GOL). */
const AIRLINE_CODES: [RegExp, string][] = [
  [/\bgol\b|voegol/i, 'G3'], [/aerol[ií]neas argentinas/i, 'AR'], [/jetsmart/i, 'JA'], [/\blatam\b/i, 'LA'], [/\bazul\b/i, 'AD'],
  [/flybondi/i, 'FO'], [/\biberia\b/i, 'IB'], [/air europa/i, 'UX'], [/vueling/i, 'VY'], [/ryanair/i, 'FR'], [/easyjet/i, 'U2'],
  [/\btap\b|air portugal/i, 'TP'], [/lufthansa/i, 'LH'], [/british airways/i, 'BA'], [/air france/i, 'AF'], [/\bklm\b/i, 'KL'],
  [/sky airline/i, 'H2'], [/avianca/i, 'AV'], [/\bcopa\b/i, 'CM'], [/aerom[eé]xico/i, 'AM'], [/american airlines/i, 'AA'],
];

function findFlight(text: string): { carrier: string; number: string } | null {
  const clean = text.replace(/\b(?:vuelo|voo|flight)\b/gi, '');
  // Primero una compañía conocida; si no hay, cualquier par letra+letra/cifra seguido de 3 o 4 cifras.
  const known = new RegExp(String.raw`(?<![A-Z0-9])(${CARRIERS.join('|')})[ \t]{0,6}(\d{2,4})\b`).exec(clean);
  if (known) {
    return { carrier: known[1], number: known[2] };
  }
  const match = /\b([A-Z][A-Z0-9])\s?(\d{3,4})\b/.exec(clean);
  if (match && !/^\d\d$/.test(match[1]) && !/^T\d$/.test(match[1])) {
    return { carrier: match[1], number: match[2] };
  }
  // «Voo:1890» / «Número de vuelo 1133» sin compañía: se deduce de la aerolínea que firma el correo.
  const bare = /\b(?:voo|vuelo|flight)(?:\s+n[úu]mero|\s+number|\s+n[ºo.]?)?\s*:?\s*(\d{3,4})\b/i.exec(text);
  if (bare) {
    const airline = AIRLINE_CODES.find(([pattern]) => pattern.test(text));
    if (airline) {
      return { carrier: airline[1], number: bare[1] };
    }
  }
  return null;
}

/**
 * Códigos IATA: tras una etiqueta («Origem:GIG», «Salida: MAD MADRID»), entre paréntesis «(MAD)», o sueltos en su línea
 * o tras «→» / «-» («MAD  EZE», «MAD → EZE»).
 */
function findAirports(text: string, anchor?: number): string[] {
  const found: { code: string; index: number }[] = [];
  const add = (code: string, index: number) => {
    if (!found.some((f) => f.code === code) && !NOT_AN_AIRPORT.has(code)) {
      found.push({ code, index });
    }
  };
  let match: RegExpExecArray | null;
  const from = /\b(?:origem|origen|desde|from|salida|partida|departure|sa[ií]da)\s*:\s*([A-Z]{3})\b/i.exec(text);
  const to = /\b(?:destino|destination|hasta|to|llegada|chegada|arrival)\s*:\s*([A-Z]{3})\b/i.exec(text);
  if (from && to && from[1] !== to[1] && AIRPORT_TZ[from[1]] && AIRPORT_TZ[to[1]]) {
    return [from[1], to[1]];
  }
  const inParens = /\(([A-Z]{3})\)/g;
  while ((match = inParens.exec(text))) add(match[1], match.index);
  // Solo códigos conocidos cuando van sueltos: evita coger siglas cualesquiera.
  const loose = /(?:^|\n|\s[→\-–>]\s|\s{2,})([A-Z]{3})(?=\s|$)/g;
  while ((match = loose.exec(text))) {
    if (AIRPORT_TZ[match[1]]) add(match[1], match.index + match[0].length - 3);
  }
  // Con una hora de salida como ancla, los dos códigos más cercanos a ella son los del tramo (las tasas «(PSA)» quedan lejos).
  const chosen = anchor === undefined
    ? found.slice(0, 2)
    : [...found].sort((a, b) => Math.abs(a.index - anchor) - Math.abs(b.index - anchor)).slice(0, 2).sort((a, b) => a.index - b.index);
  return chosen.map((f) => f.code);
}

/** «Origen: ALICANTE TERMINAL» / «Salida ... Llegada ...» / «Destino: MADRID-PUERTA DE ATOCHA». */
function findStations(text: string): { from: string | null; to: string | null } {
  // El nombre de la estación va en mayúsculas; termina donde empieza otra etiqueta («Destino:», «Fecha:»), un número o una línea nueva.
  // Sin la bandera «i»: la clase de minúsculas debe distinguir «Fecha:» de «TERMINAL».
  const end = String.raw`(?=\s{2,}|\s*\n|\s+\d|\s+[A-ZÁÉÍÓÚÑ]?[a-záéíóúñ]|\s+(?:DESTINO|HASTA|TO|LLEGADA|FECHA|TREN|COCHE|PLAZA|SALIDA)\b|$)`;
  const from = new RegExp(String.raw`\b(?:[Oo]rigen|ORIGEN|[Dd]esde|DESDE|[Ff]rom|FROM|[Ss]alida|SALIDA)\s*[:\-]?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .\-']{3,40}?)` + end, 'm').exec(text);
  const to = new RegExp(String.raw`\b(?:[Dd]estino|DESTINO|[Hh]asta|HASTA|[Tt]o|TO|[Ll]legada|LLEGADA)\s*[:\-]?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .\-']{3,40}?)` + end, 'm').exec(text);
  const clean = (s: string | undefined) => (s ? s.trim().replace(/\s+/g, ' ') : null);
  return { from: clean(from?.[1]), to: clean(to?.[1]) };
}

/**
 * Notas de un vuelo: la tabla de pasajeros («» Manuel Bernabe Escribano 23G 0442167894233»), asientos sueltos
 * («Asiento: 23G») y la terminal de salida.
 */
function findFlightNotes(text: string): string | null {
  const parts: string[] = [];
  const NAME = String.raw`[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ .'\-]{3,60}?`;
  let passengers: string[] = [];
  let tickets: string[] = [];

  // Formato «Nombre \n Asiento: \n 23G» (itinerarios web de aerolíneas), con los billetes en «Nombre: \n 0442167894233».
  const blocks = [...text.matchAll(new RegExp(String.raw`^(${NAME})\s*\n\s*(?:asientos?|seats?)\s*:\s*\n?\s*([^\n]{1,20}?)\s*$`, 'gim'))];
  if (blocks.length > 0) {
    passengers = blocks.map((m) => `${m[1].trim().replace(/\s+/g, ' ')} (${m[2].trim()})`);
    tickets = [...text.matchAll(new RegExp(String.raw`^(${NAME})\s*:\s*\n?\s*(\d{10,14})\b`, 'gm'))].map((m) => m[2]);
  }

  // Formato tabla: nombres marcados con «»»; asientos «23G» y billetes de 13 cifras en la misma línea o en columnas.
  if (passengers.length === 0) {
    const names = [...text.matchAll(new RegExp(String.raw`^[»•>]\s*(${NAME})\s*(?=\s\d{1,3}[A-K]\b|\s\d{10,14}\b|$)`, 'gm'))].map((m) => m[1].trim().replace(/\s+/g, ' '));
    // Los asientos solo se buscan desde la palabra «asiento»; sin ella, cualquier «3B» del texto sería ruido.
    const seatsFrom = text.search(/\basientos?\b|\bseats?\b|\bassentos?\b/i);
    const seats = seatsFrom < 0 ? [] : [...text.slice(seatsFrom, seatsFrom + 600).matchAll(/(?<![A-Z0-9])(\d{1,3}[A-K])(?![A-Z0-9])/g)].map((m) => m[1]);
    // Un número de 13 cifras solo es un billete si cerca se habla de billetes (un CIF o un RUC también tienen 13).
    tickets = [...text.matchAll(/(?<!\d)(\d{13})(?!\d)/g)]
      .filter((m) => /billete|boleto|ticket|recibo|e-?ticket/i.test(text.slice(Math.max(0, m.index - 400), m.index)))
      .filter((m) => !/\b(?:RUC|CIF|NIF|CNPJ|CUIT|NIT|IBAN)\b[:\s]*$/i.test(text.slice(Math.max(0, m.index - 12), m.index)))
      .map((m) => m[1]);
    if (names.length > 0) {
      passengers = names.map((name, index) => (seats[index] ? `${name} (${seats[index]})` : name));
    } else if (seats.length > 0) {
      parts.push(`Asientos ${seats.join(', ')}`);
    }
  }

  if (passengers.length > 0) {
    parts.push(`${passengers.length === 1 ? 'Pasajero' : 'Pasajeros'}: ${passengers.join(', ')}`);
  }
  if (tickets.length > 0) {
    parts.push(`${tickets.length === 1 ? 'Billete' : 'Billetes'} ${tickets.join(', ')}`);
  }
  const terminal = /\bterminal\s*[:.]?\s*\n?\s*((?:terminal\s+)?[A-Z0-9][A-Za-z0-9 ]{0,20}?)\s*(?:\n|$)/i.exec(text);
  if (terminal) {
    const value = terminal[1].trim();
    parts.push(`Salida: ${/^terminal/i.test(value) ? value : `Terminal ${value}`}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** «AVE 05123» si aparece con número en algún sitio; si no, el tipo de tren más un número de tren en línea propia (Renfe). */
function findTrain(text: string): string | null {
  // «AVE 05123», «AVE - 05143», «AVE nº 5123».
  const re = /\b(AVE|ALVIA|AVLO|INTERCITY|EUROMED|MD|REGIONAL|IRYO|OUIGO|TALGO|AVANT)\b[\s\-–:]*(?:n[ºo.]?\s*)?(\d{3,5})?/gi;
  let first: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match[2]) {
      return `${match[1].toUpperCase()} ${match[2]}`;
    }
    first ??= match[1].toUpperCase();
  }
  if (first) {
    const alone = /^\s*(\d{5})\s*$/m.exec(text);
    if (alone) {
      return `${first} ${alone[1]}`;
    }
  }
  return first;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Campos de una propuesta de reserva tal y como los usa el formulario. */
export interface PrefillFields {
  type: string | null;
  title: string | null;
  startLocal: string | null;
  startTz: string | null;
  startPlace: string | null;
  endLocal: string | null;
  endTz: string | null;
  endPlace: string | null;
  reference: string | null;
  address: string | null;
  notes?: string | null;
}

/** Rellena con la sugerencia solo lo que en la base esté vacío. El título se sustituye si la sugerencia trae tipo. */
export function applySuggestion<T extends PrefillFields>(base: T, s: TextSuggestion): T {
  const local = (date: string | null, time: string | null) => (date ? `${date}T${time ?? '00:00'}` : null);
  const startLocal = local(s.startDate, s.startTime);
  const endLocal = local(s.endDate ?? (s.endTime ? s.startDate : null), s.endTime);
  return {
    ...base,
    type: base.type ?? s.type,
    title: s.type && s.title ? (base.type ? base.title ?? s.title : s.title) : base.title ?? s.title,
    startLocal: base.startLocal ?? startLocal,
    startTz: base.startTz ?? s.startTz,
    startPlace: base.startPlace ?? s.startPlace,
    endLocal: base.endLocal ?? endLocal,
    endTz: base.endTz ?? s.endTz,
    endPlace: base.endPlace ?? s.endPlace,
    reference: base.reference ?? s.reference,
    address: base.address ?? s.address,
    notes: base.notes ?? s.notes,
  };
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', euro: '€',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', iexcl: '¡', iquest: '¿', copy: '©', reg: '®', deg: '°',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ccedil: 'ç', atilde: 'ã', otilde: 'õ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü', Ccedil: 'Ç', Atilde: 'Ã', Otilde: 'Õ',
  agrave: 'à', egrave: 'è', ograve: 'ò', acirc: 'â', ecirc: 'ê', ocirc: 'ô',
};

/** «&#243;», «&eacute;», «&nbsp;»… → el carácter. Algunos correos llegan con las entidades sin decodificar. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d{1,7});/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]{2,8});/gi, (m, name: string) => ENTITIES[name] ?? m);
}

/** Un correo que llega como HTML crudo (JetSMART manda la «parte de texto» en HTML) se convierte a texto por líneas y celdas. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|ul|ol|section|article|header|footer)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]*\n[ \t]*/g, '\n');
}

function looksLikeHtml(text: string): boolean {
  return /<\s*(html|body|table|td|div|p|br)\b/i.test(text) && (text.match(/<\/?[a-z][^>]*>/gi)?.length ?? 0) > 5;
}

/**
 * HTML crudo → texto; entidades → caracteres; asteriscos de negrita (Gmail al reenviar) → espacio; espacios especiales → espacio
 * normal; caracteres invisibles fuera; líneas en blanco de más, fuera.
 */
export function normalizeText(text: string): string {
  const plain = decodeEntities(looksLikeHtml(text) ? htmlToText(text) : text);
  return plain
    // Los enlaces de seguimiento llevan códigos que parecen asientos, localizadores o aeropuertos.
    .replace(/<?https?:\/\/\S+>?/g, ' ')
    .replace(/\*/g, ' ')
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/[  -   　]/g, ' ')
    .replace(/[​-‍⁠﻿­͏᠎]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n');
}

/** Ciudades habituales sin código IATA en el correo («Salvador de Bahía (22:45) - Madrid (12:15)») → zona horaria. */
const CITY_TZ: [RegExp, string][] = [
  [/^(madrid|barcelona|alicante|valencia|m[aá]laga|sevilla|bilbao|palma|ibiza|menorca|santiago de compostela|zaragoza)\b/i, 'Europe/Madrid'],
  [/^(las palmas|tenerife|lanzarote|fuerteventura)\b/i, 'Atlantic/Canary'],
  [/^(lisboa|lisbon|oporto|porto|faro)\b/i, 'Europe/Lisbon'],
  [/^(par[ií]s|niza|lyon|marsella)\b/i, 'Europe/Paris'],
  [/^(londres|london|manchester|edimburgo)\b/i, 'Europe/London'],
  [/^(roma|rome|mil[aá]n|milano|venecia|n[aá]poles)\b/i, 'Europe/Rome'],
  [/^(buenos aires|aeroparque|ezeiza|iguaz[uú]|puerto iguaz[uú]|c[oó]rdoba|mendoza|bariloche|ushuaia|salta)\b/i, 'America/Argentina/Buenos_Aires'],
  [/^(r[ií]o de janeiro|rio de janeiro|s[aã]o paulo|sao paulo|foz do igua[cç]u|florian[oó]polis|curitiba|bras[ií]lia|belo horizonte)\b/i, 'America/Sao_Paulo'],
  [/^(salvador|salvador de bah[ií]a)\b/i, 'America/Bahia'],
  [/^(recife|fortaleza|natal)\b/i, 'America/Recife'],
  [/^(montevideo|punta del este)\b/i, 'America/Montevideo'],
  [/^(santiago( de chile)?)\b/i, 'America/Santiago'],
  [/^(lima|cusco|cuzco)\b/i, 'America/Lima'],
  [/^(bogot[aá]|medell[ií]n|cartagena)\b/i, 'America/Bogota'],
  [/^(ciudad de m[eé]xico|m[eé]xico|canc[uú]n)\b/i, 'America/Mexico_City'],
  [/^(miami|nueva york|new york|orlando)\b/i, 'America/New_York'],
];

function cityTz(place: string | null): string | null {
  if (!place) {
    return null;
  }
  return CITY_TZ.find(([pattern]) => pattern.test(place.trim()))?.[1] ?? null;
}

/**
 * Tramo «Ciudad (HH:MM) - Ciudad (HH:MM)» (Air Europa y otros correos sin códigos IATA): lugares y horas del primer tramo.
 */
function findCityLeg(text: string): { from: string; fromTime: string; to: string; toTime: string; index: number } | null {
  const leg = /([A-ZÁÉÍÓÚÑ][\p{L} .'\-]{2,40}?)\s*\((\d{1,2}[:.]\d{2})\)\s*[-–→]\s*([A-ZÁÉÍÓÚÑ][\p{L} .'\-]{2,40}?)\s*\((\d{1,2}[:.]\d{2})\)/u.exec(text);
  if (!leg) {
    return null;
  }
  const time = (t: string) => `${pad(Number(t.split(/[:.]/)[0]))}:${t.split(/[:.]/)[1]}`;
  return { from: leg[1].trim(), fromTime: time(leg[2]), to: leg[3].trim(), toTime: time(leg[4]), index: leg.index };
}

/**
 * Un aviso de cambio trae el vuelo antiguo y el nuevo: fechas, horas y lugares se leen solo desde donde empieza el nuevo.
 * El localizador y el tipo se buscan en todo el texto.
 */
function updatedSection(text: string): string | null {
  const markers = /\b(?:voo\s+novo|novo\s+voo|nuevo\s+vuelo|vuelo\s+nuevo|new\s+flight|itinerario\s+actualizado|detalles\s+actualizados\s+de\s+tu\s+itinerario|informa[cç][õo]es\s+atualizadas|updated\s+itinerary|nuevo\s+itinerario)\b/gi;
  // Vale el último marcador al que de verdad sigue un itinerario (una hora en los 600 caracteres siguientes): la introducción
  // («confira as informações atualizadas») va antes del vuelo antiguo, y las condiciones legales hablan de «nuevo vuelo» sin datos.
  let section: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = markers.exec(text))) {
    const candidate = text.slice(match.index);
    if (findTimes(candidate.slice(0, 600)).length > 0) {
      section = candidate;
    }
  }
  return section;
}

export function suggestFromText(rawText: string, fileName = ''): TextSuggestion {
  const whole = normalizeText(rawText);
  const type = detectType(whole) ?? detectType(fileName);
  const reference = findReference(whole);
  const text = updatedSection(whole) ?? whole;
  const dates = findDates(text);
  const times = findTimes(text);
  const start = travelDate(dates, text);
  const suggestion: TextSuggestion = {
    type,
    title: null,
    reference,
    startDate: start?.date ?? null,
    startTime: null,
    startPlace: null,
    startTz: null,
    endDate: null,
    endTime: null,
    endPlace: null,
    endTz: null,
    address: null,
    notes: findSeats(text),
  };

  // La primera hora que aparece tras la fecha del viaje suele ser la de salida; la siguiente, la de llegada.
  const afterDate = times.filter((t) => !start || t.index > start.index);
  suggestion.startTime = afterDate[0]?.time ?? times[0]?.time ?? null;
  suggestion.endTime = afterDate[1]?.time ?? null;
  // Fechas distintas de la del viaje que vengan poco después: la vuelta o la salida del hotel (no las de las condiciones legales).
  const later = dates.find((d) => start && d.index > start.index && d.index - start.index < 2500 && d.date > start.date);

  if (type === 'flight') {
    const flight = findFlight(text) ?? findFlight(whole);
    const departure = afterDate[0] ?? times[0];
    const airports = findAirports(text, departure?.index);
    const leg = airports.length < 2 ? findCityLeg(text) : null;
    suggestion.startPlace = airports[0] ?? leg?.from ?? null;
    suggestion.endPlace = airports[1] ?? leg?.to ?? null;
    suggestion.startTz = airports[0] ? (AIRPORT_TZ[airports[0]] ?? null) : cityTz(leg?.from ?? null);
    suggestion.endTz = airports[1] ? (AIRPORT_TZ[airports[1]] ?? null) : cityTz(leg?.to ?? null);
    if (leg) {
      suggestion.startTime = leg.fromTime;
      suggestion.endTime = leg.toTime;
    }
    // Un vuelo que llega al día siguiente: la fecha posterior del billete.
    suggestion.endDate = later?.date ?? null;
    const route = suggestion.startPlace && suggestion.endPlace ? `${suggestion.startPlace} → ${suggestion.endPlace}` : null;
    suggestion.title = [flight ? `${flight.carrier} ${flight.number}` : null, route].filter(Boolean).join(' ') || 'Vuelo';
    suggestion.notes ??= findFlightNotes(whole);
  } else if (type === 'train') {
    let stations = findStations(text);
    if (!stations.from || !stations.to) {
      // Formato de correo: «14:35 Alicante / Alacant … 17:08Madrid Chamartín».
      const afterTimes = [...text.matchAll(/\d{1,2}[:.]\d{2}\s*([^\n\d]{3,40}?)\s*(?:\n|$)/g)].map((m) => m[1].trim()).filter((s) => s.length > 2);
      stations = { from: stations.from ?? afterTimes[0] ?? null, to: stations.to ?? afterTimes[1] ?? null };
    }
    suggestion.startPlace = stations.from ? titleCase(stations.from) : null;
    suggestion.endPlace = stations.to ? titleCase(stations.to) : null;
    const route = stations.from && stations.to ? `${titleCase(stations.from)} → ${titleCase(stations.to)}` : null;
    suggestion.title = [findTrain(text), route].filter(Boolean).join(' ') || 'Tren';
  } else if (type === 'hotel') {
    // Entrada y salida por sus etiquetas («Llegada jue, 15 oct», «Check-in: 26/09/2026»); si no, por orden.
    const checkIn = labeledDate(text, /\b(?:llegada|entrada|chegada|check-?in|arrival)\b/i);
    const checkOut = labeledDate(text, /\b(?:salida|sa[ií]da|check-?out|departure)\b/i);
    suggestion.startDate = checkIn?.date ?? suggestion.startDate;
    suggestion.endDate = checkOut?.date ?? later?.date ?? null;
    const timeAfter = (index: number | undefined) => (index === undefined ? null : findTimes(text.slice(index, index + 80))[0]?.time ?? null);
    suggestion.startTime = timeAfter(checkIn?.index);
    suggestion.endTime = timeAfter(checkOut?.index);
    const name = /\b(?:hotel|hostal|hostel|pousada|resort|apartamentos?|parador)\s+([A-ZÁÉÍÓÚÑ][^\n,]{2,50})/i.exec(text);
    const airbnb = /airbnb/i.test(text) ? /^(.{6,80})\n+\s*(?:casa|apto|apartamento|habitaci[oó]n|alojamiento entero|quarto|entire home|room)[^\n]*(?:anfitri[oó]n|anfitri[aã]o|host)/im.exec(text) : null;
    const city = /reserva (?:en|em) ([A-ZÁÉÍÓÚÑ][^\n.!]{2,40})/i.exec(text);
    suggestion.title = airbnb ? `Airbnb · ${airbnb[1].trim()}` : name ? name[0].trim() : city ? `Alojamiento en ${city[1].trim()}` : 'Alojamiento';
    const address = /\b(?:direcci[oó]n|endere[cç]o|address)\s*[:\-]?\s*([^\n]{8,120})/i.exec(text);
    suggestion.address = address ? address[1].trim() : null;
    suggestion.startPlace = suggestion.title;
  } else if (type === 'car') {
    suggestion.title = 'Alquiler de coche';
    suggestion.endDate = later?.date ?? null;
  } else if (type === 'ticket') {
    const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 4 && l.length < 80);
    suggestion.title = firstLine ?? 'Entrada';
  }

  return suggestion;
}
