/**
 * Tarjetas de embarque: el QR sigue el formato IATA BCBP («M1APELLIDO/NOMBRE  EABC123 MADLHRIB 3170 285Y012A0001 100»).
 * De los campos obligatorios salen el pasajero, el localizador, origen y destino, vuelo, fecha (día del año) y asiento.
 * La hora no viene: la pone la persona.
 */

export interface BoardingPassLeg {
  pnr: string;
  from: string;
  to: string;
  carrier: string;
  flight: string;
  /** Día del año (1–366) según la tarjeta. */
  dayOfYear: number;
  /** «2026-10-12», resuelto con el año más plausible respecto a `now`. */
  date: string;
  seat: string | null;
}

export interface BoardingPass {
  passenger: string;
  legs: BoardingPassLeg[];
}

const LEG_LENGTH = 37;

/** Día del año → fecha: el año en curso, salvo que quede más de 60 días atrás, en cuyo caso el siguiente. */
export function dateFromDayOfYear(dayOfYear: number, now: Date): string {
  const year = now.getFullYear();
  const candidate = new Date(Date.UTC(year, 0, dayOfYear));
  const today = Date.UTC(year, now.getMonth(), now.getDate());
  const chosen = today - candidate.getTime() > 60 * 86_400_000 ? new Date(Date.UTC(year + 1, 0, dayOfYear)) : candidate;
  return chosen.toISOString().slice(0, 10);
}

function cleanName(raw: string): string {
  const [last, first] = raw.trim().split('/');
  const words = [first, last].filter(Boolean).map((w) => w!.trim());
  return words.join(' ');
}

/** Devuelve null si el texto no es una tarjeta de embarque IATA. */
export function parseBoardingPass(text: string, now = new Date()): BoardingPass | null {
  if (!/^M[1-4]/.test(text) || text.length < 60) {
    return null;
  }
  const legCount = Number(text[1]);
  const passenger = cleanName(text.slice(2, 22));
  const legs: BoardingPassLeg[] = [];
  let position = 22;
  for (let index = 0; index < legCount; index++) {
    // El indicador de billete electrónico solo va en el primer tramo.
    if (index === 0) {
      position += 1;
    }
    const leg = text.slice(position, position + LEG_LENGTH);
    if (leg.length < LEG_LENGTH) {
      break;
    }
    const dayOfYear = Number(leg.slice(21, 24));
    const from = leg.slice(7, 10).trim();
    const to = leg.slice(10, 13).trim();
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 366) {
      return null;
    }
    const seat = leg.slice(25, 29).trim().replace(/^0+(?=\d)/, '');
    legs.push({
      pnr: leg.slice(0, 7).trim(),
      from,
      to,
      carrier: leg.slice(13, 16).trim(),
      flight: leg.slice(16, 21).trim().replace(/^0+(?=\d)/, ''),
      dayOfYear,
      date: dateFromDayOfYear(dayOfYear, now),
      seat: seat || null,
    });
    const variableSize = parseInt(leg.slice(35, 37), 16);
    position += LEG_LENGTH + (Number.isNaN(variableSize) ? 0 : variableSize);
  }
  return legs.length === 0 ? null : { passenger, legs };
}

/** Lo que se vuelca en el formulario de reserva a partir del primer tramo. */
export interface BookingPrefill {
  type: 'flight';
  title: string;
  reference: string;
  startDate: string;
  startPlace: string;
  endPlace: string;
  notes: string;
}

export function prefillFromBoardingPass(pass: BoardingPass): BookingPrefill {
  const leg = pass.legs[0];
  const flight = [leg.carrier, leg.flight].filter(Boolean).join(' ');
  const notes = [pass.passenger && `Pasajero: ${pass.passenger}`, leg.seat && `Asiento ${leg.seat}`]
    .filter(Boolean)
    .join(' · ');
  return {
    type: 'flight',
    title: `${flight} ${leg.from} → ${leg.to}`.trim(),
    reference: leg.pnr,
    startDate: leg.date,
    startPlace: leg.from,
    endPlace: leg.to,
    notes,
  };
}
