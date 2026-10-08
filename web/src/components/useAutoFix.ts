import { useEffect, useRef } from 'react';
import { useSession } from '../app/SessionContext';
import { saveBooking } from '../data/repo';
import type { Booking } from '../data/types';
import { consistencyFixes, type Fixes } from '../domain/changes';
import type { FlightStatusResponse } from '../domain/flightStatus';

/** Lo que no cuadra en la reserva, con lo que dice el estado del vuelo si lo hay. */
export function fixesFor(booking: Booking | null | undefined, flight: FlightStatusResponse | null): Fixes | null {
  if (!booking) {
    return null;
  }
  const info = flight?.configured ? flight.info : null;
  return consistencyFixes(
    booking,
    info ? { origin: info.origin, destination: info.destination, arrivalUtcMs: info.arrActualMs ?? info.arrEstimatedMs ?? info.arrScheduledMs } : null,
  );
}

export async function applyFixes(booking: Booking, fixes: Fixes, email: string) {
  await saveBooking(
    {
      tripId: booking.tripId, type: booking.type, title: booking.title, startLocal: booking.startLocal, startTz: booking.startTz,
      startPlace: fixes.startPlace ?? booking.startPlace, endLocal: fixes.endLocal ?? booking.endLocal, endTz: booking.endTz,
      endPlace: fixes.endPlace ?? booking.endPlace, reference: booking.reference, address: booking.address, notes: booking.notes,
      changeNote: booking.changeNote, visibility: booking.visibility ?? 'household', sharedWith: booking.sharedWith ?? [],
    },
    email,
    booking.id,
  );
}

/**
 * Corrige sola, una vez, una reserva cuyos datos no cuadran cuando el arreglo es seguro (todo lo que falla tiene
 * corrección): origen y destino al revés, o la llegada que no se movió con la salida.
 */
export function useAutoFix(booking: Booking | null | undefined, flight: FlightStatusResponse | null): Fixes | null {
  const session = useSession();
  const done = useRef(new Set<string>());
  const fixes = fixesFor(booking, flight);
  const safe = !!fixes && !!booking && (fixes.startPlace !== undefined || fixes.endLocal !== undefined) && fixes.lines.length === Number(!!fixes.startPlace) + Number(!!fixes.endLocal);
  useEffect(() => {
    if (safe && booking && fixes && !done.current.has(booking.id)) {
      done.current.add(booking.id);
      void applyFixes(booking, fixes, session.email ?? '');
    }
  }, [safe, booking, fixes, session.email]);
  return safe ? null : fixes;
}
