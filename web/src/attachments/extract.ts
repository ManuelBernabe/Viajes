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

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
};

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
    // «09/06/2026 - 11:05» es el sello de emisión del billete, no la fecha del viaje.
    const after = text.slice(index + length, index + length + 12);
    const before = text.slice(Math.max(0, index - 40), index).toLowerCase();
    return /^\s*-\s*\d{1,2}[:.]\d{2}/.test(after) || /(emisi[oó]n|emitido|impreso|compra|fecha de reserva|issued|printed)\W*$/.test(before);
  };
  const push = (date: string | null, match: RegExpExecArray) => {
    if (date && !isIssueStamp(match.index, match[0].length)) {
      found.push({ date, index: match.index });
    }
  };
  const numeric = /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/g;
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  // «01 oct 202614:35»: en algunos correos el año va pegado a la hora.
  const worded = /\b(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3,10})\.?\s*(?:de\s+|,\s*)?(\d{4})(?=\d{1,2}[:.]\d{2}|\b)/gi;
  let match: RegExpExecArray | null;
  while ((match = numeric.exec(text))) {
    push(isoDate(Number(match[1]), Number(match[2]), Number(match[3])), match);
  }
  while ((match = iso.exec(text))) {
    push(isoDate(Number(match[3]), Number(match[2]), Number(match[1])), match);
  }
  while ((match = worded.exec(text))) {
    const month = MONTHS[match[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
    if (month) {
      push(isoDate(Number(match[1]), month, Number(match[3])), match);
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** La fecha del viaje: la que más se repite (un billete por pasajero la repite); en empate, la primera. */
function travelDate(dates: { date: string; index: number }[]): { date: string; index: number } | undefined {
  if (dates.length === 0) {
    return undefined;
  }
  const counts = new Map<string, number>();
  for (const d of dates) {
    counts.set(d.date, (counts.get(d.date) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return dates.find((d) => d.date === best);
}

/** «Coche: 8 Plaza: 6B» (uno por pasajero) → «Coche 8 · Plazas 6B, 6A». */
function findSeats(text: string): string | null {
  const re = /\b(?:coche|car|wagon|vag[oó]n)\s*[:.]?\s*(\w+)\s*[,·]?\s*(?:plaza|asiento|seat)\s*[:.]?\s*(\w+)/gi;
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

/** Horas «14:35» o «14.35 h», con posición. */
export function findTimes(text: string): { time: string; index: number }[] {
  const found: { time: string; index: number }[] = [];
  // Una hora empieza tras algo que no sea cifra ni separador… o tras un año pegado («202614:35»).
  const re = /(?:(?<![\d:.])|(?<=\b\d{4}))([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*h\b)?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    // Descarta lo que parece una fecha con puntos (12.10.2026) o un importe.
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 3);
    if (/^[.:]\d/.test(after) || /^\s*€/.test(after)) {
      continue;
    }
    found.push({ time: `${pad(Number(match[1]))}:${match[2]}`, index: match.index });
  }
  return found;
}

function detectType(text: string): BookingType | null {
  const t = text.toLowerCase();
  if (/\b(renfe|ave\b|alvia|avlo|iryo|ouigo|tren|train|coche\s+\d|vagón|wagon|rail)\b/.test(t)) return 'train';
  if (/\b(vuelos?|flights?|boarding pass|tarjeta de embarque|aerol[ií]neas?|airlines?|embarque|itinerario|avi[oó]n|aeropuerto|airport|terminal|cabina|boleto|e-?ticket|iberia|vueling|ryanair|easyjet|air europa|lufthansa|klm|british airways)\b/.test(t)) return 'flight';
  if (/\b(hotel|check-?in|check-?out|habitaci[oó]n|room|noches?|nights?|apartamento|booking\.com|airbnb)\b/.test(t)) return 'hotel';
  if (/\b(alquiler de coche|rent a car|car rental|rental car|hertz|avis|europcar|sixt|recogida del veh[ií]culo|pick-?up)\b/.test(t)) return 'car';
  if (/\b(entrada|entradas|ticket|tickets|museo|concierto|espect[aá]culo|admission)\b/.test(t)) return 'ticket';
  return null;
}

/** Palabras que pueden seguir a «código de reserva» sin ser el código. */
const NOT_A_CODE = new Set([
  'PARTIDA', 'ARRIBO', 'SALIDA', 'LLEGADA', 'VUELO', 'FECHA', 'HOTEL', 'TREN', 'TOTAL', 'RESERVA', 'CODIGO', 'CÓDIGO', 'NUMERO', 'NÚMERO',
  'BILLETE', 'TICKET', 'BOOKING', 'NOMBRE', 'ORIGEN', 'DESTINO', 'PASAJERO', 'CLIENTE', 'PRECIO', 'IMPORTE', 'ESTADO', 'CABINA', 'ASIENTO',
]);

function findReference(text: string): string | null {
  // La etiqueta se busca sin distinguir mayúsculas (y puede venir pegada: «reservaCódigo de reserva:»); lo que sigue, sí:
  // se admite una palabra con minúsculas («Localizador Renfe: C3BMDV») pero nunca un bloque en mayúsculas, que es el código.
  const label = /(?:localizador|localizer|locator|c[oó]digo de reserva|n[uú]mero de reserva|reserva n[.ºo]?|booking (?:reference|number|code)|reference|referencia|confirmation (?:number|code)|confirmaci[oó]n|pnr|record locator)/gi;
  const code = /^(?:\s+[A-Za-z]*[a-z][A-Za-z]*)?\s*[:#nº.]*\s*([A-Z0-9]{5,10})\b/;
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
  SVQ: 'Europe/Madrid', BIO: 'Europe/Madrid', IBZ: 'Europe/Madrid', MAH: 'Europe/Madrid', LPA: 'Atlantic/Canary', TFS: 'Atlantic/Canary',
  TFN: 'Atlantic/Canary', ACE: 'Atlantic/Canary', FUE: 'Atlantic/Canary', LIS: 'Europe/Lisbon', OPO: 'Europe/Lisbon',
  LHR: 'Europe/London', LGW: 'Europe/London', STN: 'Europe/London', LTN: 'Europe/London', MAN: 'Europe/London', DUB: 'Europe/Dublin',
  CDG: 'Europe/Paris', ORY: 'Europe/Paris', AMS: 'Europe/Amsterdam', BRU: 'Europe/Brussels', FRA: 'Europe/Berlin', MUC: 'Europe/Berlin',
  BER: 'Europe/Berlin', ZRH: 'Europe/Zurich', GVA: 'Europe/Zurich', VIE: 'Europe/Vienna', FCO: 'Europe/Rome', MXP: 'Europe/Rome',
  LIN: 'Europe/Rome', VCE: 'Europe/Rome', ATH: 'Europe/Athens', IST: 'Europe/Istanbul', CPH: 'Europe/Copenhagen', OSL: 'Europe/Oslo',
  ARN: 'Europe/Stockholm', HEL: 'Europe/Helsinki', WAW: 'Europe/Warsaw', PRG: 'Europe/Prague', BUD: 'Europe/Budapest',
  JFK: 'America/New_York', EWR: 'America/New_York', BOS: 'America/New_York', MIA: 'America/New_York', ATL: 'America/New_York',
  ORD: 'America/Chicago', DFW: 'America/Chicago', DEN: 'America/Denver', LAX: 'America/Los_Angeles', SFO: 'America/Los_Angeles',
  YYZ: 'America/Toronto', YUL: 'America/Toronto', MEX: 'America/Mexico_City', CUN: 'America/Cancun', BOG: 'America/Bogota',
  LIM: 'America/Lima', SCL: 'America/Santiago', EZE: 'America/Argentina/Buenos_Aires', AEP: 'America/Argentina/Buenos_Aires',
  GRU: 'America/Sao_Paulo', GIG: 'America/Sao_Paulo', MVD: 'America/Montevideo', HAV: 'America/Havana', PTY: 'America/Panama',
  DXB: 'Asia/Dubai', DOH: 'Asia/Qatar', CAI: 'Africa/Cairo', RAK: 'Africa/Casablanca', CMN: 'Africa/Casablanca', JNB: 'Africa/Johannesburg',
  DEL: 'Asia/Kolkata', BOM: 'Asia/Kolkata', BKK: 'Asia/Bangkok', SIN: 'Asia/Singapore', HKG: 'Asia/Hong_Kong', PEK: 'Asia/Shanghai',
  PVG: 'Asia/Shanghai', ICN: 'Asia/Seoul', NRT: 'Asia/Tokyo', HND: 'Asia/Tokyo', KIX: 'Asia/Tokyo', SYD: 'Australia/Sydney',
  MEL: 'Australia/Melbourne', AKL: 'Pacific/Auckland',
};

const NOT_AN_AIRPORT = new Set(['OCT', 'NOV', 'DEC', 'DIC', 'JAN', 'ENE', 'FEB', 'MAR', 'APR', 'ABR', 'MAY', 'JUN', 'JUL', 'AUG', 'AGO', 'SEP', 'SET', 'THE', 'AND', 'VIA', 'IVA', 'PDF', 'JET', 'TER', 'AIR', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'LUN', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM']);

function findFlight(text: string): { carrier: string; number: string } | null {
  const match = /\b([A-Z][A-Z0-9])\s?(\d{3,4})\b/.exec(text.replace(/\bvuelo\b/gi, ''));
  return match && !/^\d\d$/.test(match[1]) ? { carrier: match[1], number: match[2] } : null;
}

/** Códigos IATA: entre paréntesis «(MAD)», o sueltos en su línea o tras «→» / «-» («MAD  EZE», «MAD → EZE»). */
function findAirports(text: string): string[] {
  const codes: string[] = [];
  const add = (code: string) => {
    if (!codes.includes(code) && !NOT_AN_AIRPORT.has(code)) {
      codes.push(code);
    }
  };
  let match: RegExpExecArray | null;
  const inParens = /\(([A-Z]{3})\)/g;
  while ((match = inParens.exec(text))) add(match[1]);
  if (codes.length >= 2) {
    return codes;
  }
  // Solo códigos conocidos cuando van sueltos: evita coger siglas cualesquiera.
  const loose = /(?:^|\n|\s[→\-–>]\s|\s{2,})([A-Z]{3})(?=\s|$)/g;
  while ((match = loose.exec(text))) {
    if (AIRPORT_TZ[match[1]]) add(match[1]);
  }
  return codes;
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

export function suggestFromText(text: string, fileName = ''): TextSuggestion {
  const type = detectType(text) ?? detectType(fileName);
  const dates = findDates(text);
  const times = findTimes(text);
  const reference = findReference(text);
  const start = travelDate(dates);
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
  // Fechas distintas de la del viaje que vengan después: la vuelta o la salida del hotel.
  const later = dates.find((d) => start && d.index > start.index && d.date > start.date);

  if (type === 'flight') {
    const flight = findFlight(text);
    const airports = findAirports(text);
    suggestion.startPlace = airports[0] ?? null;
    suggestion.endPlace = airports[1] ?? null;
    suggestion.startTz = airports[0] ? (AIRPORT_TZ[airports[0]] ?? null) : null;
    suggestion.endTz = airports[1] ? (AIRPORT_TZ[airports[1]] ?? null) : null;
    // Un vuelo que llega al día siguiente: la fecha posterior del billete.
    suggestion.endDate = later?.date ?? null;
    const route = airports.length >= 2 ? `${airports[0]} → ${airports[1]}` : null;
    suggestion.title = [flight ? `${flight.carrier} ${flight.number}` : null, route].filter(Boolean).join(' ') || 'Vuelo';
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
    const name = /\b(?:hotel|hostal|apartamentos?|parador)\s+([A-ZÁÉÍÓÚÑ][^\n,]{2,50})/i.exec(text);
    suggestion.title = name ? name[0].trim() : 'Hotel';
    suggestion.endDate = later?.date ?? null;
    suggestion.startTime = null;
    suggestion.endTime = null;
    const address = /\b(?:direcci[oó]n|address)\s*[:\-]?\s*([^\n]{8,120})/i.exec(text);
    suggestion.address = address ? address[1].trim() : null;
  } else if (type === 'car') {
    suggestion.title = 'Alquiler de coche';
    suggestion.endDate = later?.date ?? null;
  } else if (type === 'ticket') {
    const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 4 && l.length < 80);
    suggestion.title = firstLine ?? 'Entrada';
  }

  return suggestion;
}
