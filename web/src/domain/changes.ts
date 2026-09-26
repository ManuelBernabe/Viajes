import { formatDay, timeOf, zoneLabel } from '../data/localTime';
import type { Booking, BookingBody } from '../data/types';

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

/**
 * La reserva ya cargada a la que se refiere el correo: mismo localizador o, sin localizador,
 * mismo tipo, misma fecha de salida y mismo origen o destino.
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
  const date = proposal.startLocal.slice(0, 10);
  return bookings.find(
    (b) =>
      b.type === proposal.type &&
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
}

function describeMoment(local: string | null, tz: string | null): string {
  if (!local) {
    return 'sin hora';
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
    changes.push({ field: 'startLocal', label: 'Salida', ...momentChange(existing.startLocal, existing.startTz, proposal.startLocal, proposal.startTz) });
  }
  if (proposal.endLocal && proposal.endLocal !== existing.endLocal) {
    changes.push({ field: 'endLocal', label: 'Llegada', ...momentChange(existing.endLocal, existing.endTz ?? existing.startTz, proposal.endLocal, proposal.endTz) });
  }
  if (proposal.startPlace && norm(proposal.startPlace) !== norm(existing.startPlace)) {
    changes.push({ field: 'startPlace', label: 'Origen', before: existing.startPlace ?? 'sin lugar', after: proposal.startPlace });
  }
  if (proposal.endPlace && norm(proposal.endPlace) !== norm(existing.endPlace)) {
    changes.push({ field: 'endPlace', label: 'Destino', before: existing.endPlace ?? 'sin lugar', after: proposal.endPlace });
  }
  if (proposal.reference && existing.reference && norm(proposal.reference) !== norm(existing.reference)) {
    changes.push({ field: 'reference', label: 'Localizador', before: existing.reference, after: proposal.reference });
  }
  // El título no se compara: cada fuente lo redacta a su manera y no es un dato de la reserva.
  if (proposal.notes && norm(proposal.notes) !== norm(existing.notes)) {
    changes.push({ field: 'notes', label: 'Notas', before: existing.notes ?? 'sin notas', after: proposal.notes });
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
  return [`Modificada el ${date} según correo:`, ...lines].join('\n');
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
        body.endLocal = proposal.endLocal;
        body.endTz = proposal.endTz ?? existing.endTz ?? existing.startTz;
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
