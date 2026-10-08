import { formatDay, fromUtcMs, timeOf, toUtcMs, zoneLabel } from '../data/localTime';
import type { Booking, BookingBody } from '../data/types';
import { t } from '../i18n';

/** Lo que propone un correo, tal y como lo entrega la bandeja de entrada. */
export interface Proposal {
  type: string | null;
  title: string | null;
  startLocal: string | null;
  startTz: string | null;
  startPlace: string | null;
  endLocal: string | null;
  endTz: string | null;
  endPlace: string | null;
  reference: string | null;
  notes?: string | null;
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const DAY_MS = 86_400_000;

function daysApart(a: string, b: string): number {
  const [ay, am, ad] = a.slice(0, 10).split('-').map(Number);
  const [by, bm, bd] = b.slice(0, 10).split('-').map(Number);
  return Math.abs(Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / DAY_MS;
}

/**
 * La reserva ya cargada a la que se refiere el correo, por este orden:
 * 1. mismo localizador;
 * 2. mismo tipo y misma ruta (origen y destino) con salida a menos de 7 días: un cambio que mueve la fecha y
 *    emite localizador nuevo (Renfe lo hace) sigue siendo la misma reserva;
 * 3. mismo tipo, mismo día de salida y mismo origen o destino.
 */
export function findExistingBooking(bookings: readonly Booking[], proposal: Proposal): Booking | undefined {
  if (proposal.reference) {
    const byReference = bookings.find((b) => norm(b.reference) === norm(proposal.reference));
    if (byReference) {
      return byReference;
    }
  }
  if (!proposal.type || !proposal.startLocal) {
    return undefined;
  }
  const sameType = bookings.filter((b) => b.type === proposal.type);
  if (proposal.startPlace && proposal.endPlace) {
    const byRoute = sameType
      .filter((b) => norm(b.startPlace) === norm(proposal.startPlace) && norm(b.endPlace) === norm(proposal.endPlace))
      .filter((b) => daysApart(b.startLocal, proposal.startLocal!) <= 7)
      .sort((a, b) => daysApart(a.startLocal, proposal.startLocal!) - daysApart(b.startLocal, proposal.startLocal!));
    if (byRoute.length > 0) {
      return byRoute[0];
    }
  }
  const date = proposal.startLocal.slice(0, 10);
  return sameType.find(
    (b) =>
      b.startLocal.slice(0, 10) === date &&
      ((proposal.startPlace && norm(b.startPlace) === norm(proposal.startPlace)) ||
        (proposal.endPlace && norm(b.endPlace) === norm(proposal.endPlace))),
  );
}

export interface Change {
  field: 'startLocal' | 'endLocal' | 'startPlace' | 'endPlace' | 'title' | 'reference' | 'notes';
  label: string;
  before: string;
  after: string;
  /** Valor nuevo cuando no viene del correo sino que se calcula (la llegada movida con la salida). */
  value?: string;
}

/**
 * Si el correo solo cambia la salida (y no trae llegada, o trae la de antes), la llegada se mueve lo mismo: el vuelo o el
 * tren dura lo mismo. Null si no hace falta o no se puede calcular.
 */
export function shiftedArrival(existing: Booking, proposal: Proposal): string | null {
  if (!proposal.startLocal || proposal.startLocal === existing.startLocal || !existing.endLocal) {
    return null;
  }
  if (proposal.endLocal && proposal.endLocal !== existing.endLocal) {
    return null;
  }
  try {
    const endTz = existing.endTz ?? existing.startTz;
    const duration = toUtcMs(existing.endLocal, endTz) - toUtcMs(existing.startLocal, existing.startTz);
    if (duration < 0) {
      return null;
    }
    return fromUtcMs(toUtcMs(proposal.startLocal, proposal.startTz ?? existing.startTz) + duration, endTz);
  } catch {
    return null;
  }
}

function describeMoment(local: string | null, tz: string | null): string {
  if (!local) {
    return t('sin hora');
  }
  return `${formatDay(local)} ${timeOf(local)}${tz ? ` (${zoneLabel(tz)})` : ''}`;
}

/** «14:35 → 16:10» si solo cambia la hora del mismo día; si no, fecha y hora completas. */
function momentChange(beforeLocal: string | null, beforeTz: string | null, afterLocal: string, afterTz: string | null): { before: string; after: string } {
  const sameDay = beforeLocal?.slice(0, 10) === afterLocal.slice(0, 10);
  const sameTz = (beforeTz ?? '') === (afterTz ?? beforeTz ?? '');
  if (beforeLocal && sameDay && sameTz) {
    return { before: `${formatDay(beforeLocal)} ${timeOf(beforeLocal)}`, after: timeOf(afterLocal) };
  }
  return { before: describeMoment(beforeLocal, beforeTz), after: describeMoment(afterLocal, afterTz ?? beforeTz) };
}

/** Qué cambia entre la reserva cargada y lo que dice el correo. Solo campos que el correo trae. */
export function diffBooking(existing: Booking, proposal: Proposal): Change[] {
  const changes: Change[] = [];
  if (proposal.startLocal && proposal.startLocal !== existing.startLocal) {
    changes.push({ field: 'startLocal', label: t('Salida'), ...momentChange(existing.startLocal, existing.startTz, proposal.startLocal, proposal.startTz) });
  }
  const moved = shiftedArrival(existing, proposal);
  if (moved) {
    changes.push({
      field: 'endLocal',
      label: t('Llegada'),
      ...momentChange(existing.endLocal, existing.endTz ?? existing.startTz, moved, existing.endTz),
      value: moved,
    });
  } else if (proposal.endLocal && proposal.endLocal !== existing.endLocal) {
    changes.push({ field: 'endLocal', label: t('Llegada'), ...momentChange(existing.endLocal, existing.endTz ?? existing.startTz, proposal.endLocal, proposal.endTz) });
  }
  if (proposal.startPlace && norm(proposal.startPlace) !== norm(existing.startPlace)) {
    changes.push({ field: 'startPlace', label: t('Origen'), before: existing.startPlace ?? t('sin lugar'), after: proposal.startPlace });
  }
  if (proposal.endPlace && norm(proposal.endPlace) !== norm(existing.endPlace)) {
    changes.push({ field: 'endPlace', label: t('Destino'), before: existing.endPlace ?? t('sin lugar'), after: proposal.endPlace });
  }
  if (proposal.reference && existing.reference && norm(proposal.reference) !== norm(existing.reference)) {
    changes.push({ field: 'reference', label: t('Localizador'), before: existing.reference, after: proposal.reference });
  }
  // El título no se compara: cada fuente lo redacta a su manera y no es un dato de la reserva.
  if (proposal.notes && norm(proposal.notes) !== norm(existing.notes)) {
    changes.push({ field: 'notes', label: t('Notas'), before: existing.notes ?? t('sin notas'), after: proposal.notes });
  }
  return changes;
}

/**
 * «Modificada el 27/09 según correo:
 *  • Salida: jue, 1 oct 14:35 → 16:10
 *  • Llegada: jue, 1 oct 17:08 → 18:45»
 */
export function describeChanges(changes: readonly Change[], when: Date): string {
  const date = `${String(when.getDate()).padStart(2, '0')}/${String(when.getMonth() + 1).padStart(2, '0')}`;
  const lines = changes.map((c) => `• ${c.label}: ${c.before} → ${c.after}`);
  return [t('Modificada el {date} según correo:', { date }), ...lines].join('\n');
}

/** La reserva existente con los cambios del correo aplicados y el aviso puesto. */
export function applyChanges(existing: Booking, proposal: Proposal, changes: readonly Change[], when: Date): BookingBody {
  const body: BookingBody = {
    tripId: existing.tripId,
    type: existing.type,
    title: existing.title,
    startLocal: existing.startLocal,
    startTz: existing.startTz,
    startPlace: existing.startPlace,
    endLocal: existing.endLocal,
    endTz: existing.endTz,
    endPlace: existing.endPlace,
    reference: existing.reference ?? proposal.reference,
    address: existing.address,
    notes: existing.notes,
    changeNote: changes.length > 0 ? describeChanges(changes, when) : existing.changeNote,
  };
  for (const change of changes) {
    switch (change.field) {
      case 'startLocal':
        body.startLocal = proposal.startLocal!;
        body.startTz = proposal.startTz ?? existing.startTz;
        break;
      case 'endLocal':
        body.endLocal = change.value ?? proposal.endLocal;
        body.endTz = change.value ? (existing.endTz ?? existing.startTz) : (proposal.endTz ?? existing.endTz ?? existing.startTz);
        break;
      case 'startPlace':
        body.startPlace = proposal.startPlace;
        break;
      case 'endPlace':
        body.endPlace = proposal.endPlace;
        break;
      case 'title':
        body.title = proposal.title ?? existing.title;
        break;
      case 'reference':
        body.reference = proposal.reference ?? existing.reference;
        break;
      case 'notes':
        body.notes = proposal.notes ?? existing.notes;
        break;
    }
  }
  return body;
}

/**
 * Arreglo para reservas guardadas antes de mover la llegada con la salida: si la llegada ha quedado antes que la salida y
 * el aviso de cambio dice a qué hora salía antes (el mismo día), la llegada correcta es la salida nueva más lo que duraba.
 * Null si la reserva está bien o no se puede saber.
 */
export function repairedArrival(booking: Booking): string | null {
  if (!booking.endLocal || !booking.changeNote) {
    return null;
  }
  try {
    const endTz = booking.endTz ?? booking.startTz;
    const start = toUtcMs(booking.startLocal, booking.startTz);
    const end = toUtcMs(booking.endLocal, endTz);
    if (end >= start) {
      return null;
    }
    // «• Salida: jue, 8 oct 08:49 → 13:04»: solo cambió la hora, el mismo día.
    const match = /Salida[^:\n]*:[^\n]*?(\d{2}:\d{2})(?:\s*\([^)]*\))?\s*→\s*(\d{2}:\d{2})\s*$/m.exec(booking.changeNote);
    if (!match || match[2] !== timeOf(booking.startLocal)) {
      return null;
    }
    const before = toUtcMs(`${booking.startLocal.slice(0, 10)}T${match[1]}`, booking.startTz);
    const duration = end - before;
    if (duration <= 0 || duration > 24 * 3_600_000) {
      return null;
    }
    return fromUtcMs(start + duration, endTz);
  } catch {
    return null;
  }
}
