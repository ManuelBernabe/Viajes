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
  endDate: string | null;
  endTime: string | null;
  endPlace: string | null;
  address: string | null;
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
  const numeric = /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/g;
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  const worded = /\b(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3,10})\.?\s*(?:de\s+|,\s*)?(\d{4})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = numeric.exec(text))) {
    const date = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (date) found.push({ date, index: match.index });
  }
  while ((match = iso.exec(text))) {
    const date = isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
    if (date) found.push({ date, index: match.index });
  }
  while ((match = worded.exec(text))) {
    const month = MONTHS[match[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
    if (month) {
      const date = isoDate(Number(match[1]), month, Number(match[3]));
      if (date) found.push({ date, index: match.index });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** Horas «14:35» o «14.35 h», con posición. */
export function findTimes(text: string): { time: string; index: number }[] {
  const found: { time: string; index: number }[] = [];
  const re = /\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*h\b)?/g;
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
  if (/\b(vuelo|flight|boarding pass|tarjeta de embarque|aerol[ií]nea|airline|embarque|iberia|vueling|ryanair|easyjet|air europa|lufthansa|klm|british airways)\b/.test(t)) return 'flight';
  if (/\b(hotel|check-?in|check-?out|habitaci[oó]n|room|noches?|nights?|apartamento|booking\.com|airbnb)\b/.test(t)) return 'hotel';
  if (/\b(alquiler de coche|rent a car|car rental|rental car|hertz|avis|europcar|sixt|recogida del veh[ií]culo|pick-?up)\b/.test(t)) return 'car';
  if (/\b(entrada|entradas|ticket|tickets|museo|concierto|espect[aá]culo|admission)\b/.test(t)) return 'ticket';
  return null;
}

function findReference(text: string): string | null {
  const re = /\b(?:localizador|localizer|locator|c[oó]digo de reserva|n[uú]mero de reserva|reserva n[.ºo]?|booking (?:reference|number|code)|reference|referencia|confirmation (?:number|code)|confirmaci[oó]n|pnr|record locator)\s*[:#nº.]*\s*([A-Z0-9]{5,10})\b/i;
  const match = re.exec(text);
  return match ? match[1].toUpperCase() : null;
}

function findFlight(text: string): { carrier: string; number: string } | null {
  const match = /\b([A-Z][A-Z0-9])\s?(\d{3,4})\b/.exec(text.replace(/\bvuelo\b/gi, ''));
  return match && !/^\d\d$/.test(match[1]) ? { carrier: match[1], number: match[2] } : null;
}

function findAirports(text: string): string[] {
  const codes: string[] = [];
  const re = /\(([A-Z]{3})\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (!codes.includes(match[1])) codes.push(match[1]);
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

/** «AVE 05123» si aparece con número en algún sitio; si no, el tipo de tren a secas. */
function findTrain(text: string): string | null {
  const re = /\b(AVE|ALVIA|AVLO|INTERCITY|EUROMED|MD|REGIONAL|IRYO|OUIGO|TALGO|AVANT)\b\s*(?:n[ºo.]?\s*)?(\d{3,5})?/gi;
  let first: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match[2]) {
      return `${match[1].toUpperCase()} ${match[2]}`;
    }
    first ??= match[1].toUpperCase();
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
    startPlace: base.startPlace ?? s.startPlace,
    endLocal: base.endLocal ?? endLocal,
    endPlace: base.endPlace ?? s.endPlace,
    reference: base.reference ?? s.reference,
    address: base.address ?? s.address,
  };
}

export function suggestFromText(text: string, fileName = ''): TextSuggestion {
  const type = detectType(text) ?? detectType(fileName);
  const dates = findDates(text);
  const times = findTimes(text);
  const reference = findReference(text);
  const suggestion: TextSuggestion = {
    type,
    title: null,
    reference,
    startDate: dates[0]?.date ?? null,
    startTime: null,
    startPlace: null,
    endDate: null,
    endTime: null,
    endPlace: null,
    address: null,
  };

  // La primera hora que aparece tras la primera fecha suele ser la de salida; la siguiente, la de llegada.
  const afterDate = times.filter((t) => dates.length === 0 || t.index > dates[0].index);
  suggestion.startTime = afterDate[0]?.time ?? times[0]?.time ?? null;
  suggestion.endTime = afterDate[1]?.time ?? null;

  if (type === 'flight') {
    const flight = findFlight(text);
    const airports = findAirports(text);
    suggestion.startPlace = airports[0] ?? null;
    suggestion.endPlace = airports[1] ?? null;
    const route = airports.length >= 2 ? `${airports[0]} → ${airports[1]}` : null;
    suggestion.title = [flight ? `${flight.carrier} ${flight.number}` : null, route].filter(Boolean).join(' ') || 'Vuelo';
  } else if (type === 'train') {
    const stations = findStations(text);
    suggestion.startPlace = stations.from ? titleCase(stations.from) : null;
    suggestion.endPlace = stations.to ? titleCase(stations.to) : null;
    const route = stations.from && stations.to ? `${titleCase(stations.from)} → ${titleCase(stations.to)}` : null;
    suggestion.title = [findTrain(text), route].filter(Boolean).join(' ') || 'Tren';
  } else if (type === 'hotel') {
    const name = /\b(?:hotel|hostal|apartamentos?|parador)\s+([A-ZÁÉÍÓÚÑ][^\n,]{2,50})/i.exec(text);
    suggestion.title = name ? name[0].trim() : 'Hotel';
    suggestion.endDate = dates[1]?.date ?? null;
    suggestion.startTime = null;
    suggestion.endTime = null;
    const address = /\b(?:direcci[oó]n|address)\s*[:\-]?\s*([^\n]{8,120})/i.exec(text);
    suggestion.address = address ? address[1].trim() : null;
  } else if (type === 'car') {
    suggestion.title = 'Alquiler de coche';
    suggestion.endDate = dates[1]?.date ?? null;
  } else if (type === 'ticket') {
    const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 4 && l.length < 80);
    suggestion.title = firstLine ?? 'Entrada';
  }

  return suggestion;
}
