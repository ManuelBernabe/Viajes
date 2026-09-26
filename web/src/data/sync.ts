import { emitChange } from './bus';
import { getMeta, openDb, setMeta } from './db';
import { flush, pendingCount, type SendResult } from './outbox';
import { markUploaded } from './repo';
import type { Attachment, Op, StoredBlob, SyncResponse } from './types';

export const VERSION_KEY = 'sync.version';
export const LAST_SYNC_KEY = 'sync.lastAt';

export interface SyncDeps {
  fetchSync(since: number): Promise<SyncResponse>;
  send(op: Op): Promise<SendResult>;
  upload(attachment: Attachment, blob: StoredBlob): Promise<SendResult>;
}

export interface SyncOutcome {
  pushed: number;
  dropped: Op[];
  uploaded: number;
  pulled: number;
  /** Algo se quedó sin enviar o sin bajar (sin red, sesión caducada…). */
  incomplete: boolean;
}

/** Baja los cambios del servidor y los aplica; las filas borradas se quitan junto con lo que cuelga de ellas. */
export async function pull(deps: Pick<SyncDeps, 'fetchSync'>): Promise<number> {
  const since = (await getMeta<number>(VERSION_KEY)) ?? 0;
  const response = await deps.fetchSync(since);
  const database = await openDb();
  const keep = new Set(response.tripIds);
  let applied = 0;

  for (const trip of response.trips) {
    applied++;
    if (trip.deletedAtMs !== null || !keep.has(trip.id)) {
      await removeTrip(trip.id);
    } else {
      await database.put('trips', trip);
    }
  }

  for (const booking of response.bookings) {
    applied++;
    if (booking.deletedAtMs !== null) {
      await removeBooking(booking.id);
    } else if (keep.has(booking.tripId)) {
      await database.put('bookings', booking);
    }
  }

  for (const attachment of response.attachments) {
    applied++;
    if (attachment.deletedAtMs !== null) {
      await database.delete('blobs', attachment.id);
      await database.delete('attachments', attachment.id);
    } else if (await database.get('bookings', attachment.bookingId)) {
      await database.put('attachments', attachment);
    }
  }

  // Bandeja de entrada: en el móvil solo viven los borradores pendientes.
  for (const item of response.inbox ?? []) {
    applied++;
    if (item.deletedAtMs !== null || item.status !== 'pending') {
      await database.delete('inbox', item.id);
    } else {
      await database.put('inbox', item);
    }
  }

  // Un viaje que ya no está en la lista (acceso retirado) se purga aunque no llegue ninguna fila suya.
  for (const trip of await database.getAll('trips')) {
    if (!keep.has(trip.id)) {
      await removeTrip(trip.id);
      applied++;
    }
  }

  await setMeta(VERSION_KEY, response.version);
  await setMeta(LAST_SYNC_KEY, Date.now());
  if (applied > 0) {
    emitChange();
  }
  return applied;
}

async function removeTrip(id: string): Promise<void> {
  const database = await openDb();
  for (const booking of await database.getAllFromIndex('bookings', 'tripId', id)) {
    await removeBooking(booking.id);
  }
  await database.delete('trips', id);
}

async function removeBooking(id: string): Promise<void> {
  const database = await openDb();
  for (const attachment of await database.getAllFromIndex('attachments', 'bookingId', id)) {
    await database.delete('blobs', attachment.id);
    await database.delete('attachments', attachment.id);
  }
  await database.delete('bookings', id);
}

/** Sube los ficheros de los adjuntos que aún no están en el servidor. Solo cuando la cola de metadatos ya se envió. */
export async function uploads(deps: Pick<SyncDeps, 'upload'>): Promise<{ uploaded: number; incomplete: boolean }> {
  const database = await openDb();
  let uploaded = 0;
  for (const attachment of await database.getAll('attachments')) {
    if (attachment.uploaded) {
      continue;
    }
    const blob = await database.get('blobs', attachment.id);
    if (!blob) {
      continue;
    }
    const result = await deps.upload(attachment, blob);
    if (result === 'retry') {
      return { uploaded, incomplete: true };
    }
    if (result === 'ok') {
      await markUploaded(attachment.id);
      uploaded++;
    }
  }
  return { uploaded, incomplete: false };
}

let running: Promise<SyncOutcome> | null = null;

/** Envía lo pendiente, sube ficheros y baja cambios. Nunca dos a la vez. */
export function syncAll(deps: SyncDeps): Promise<SyncOutcome> {
  running ??= run(deps).finally(() => {
    running = null;
  });
  return running;
}

async function run(deps: SyncDeps): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { pushed: 0, dropped: [], uploaded: 0, pulled: 0, incomplete: false };
  const flushed = await flush(deps.send);
  outcome.pushed = flushed.sent;
  outcome.dropped = flushed.dropped;
  if (flushed.left > 0) {
    outcome.incomplete = true;
  } else {
    const up = await uploads(deps);
    outcome.uploaded = up.uploaded;
    outcome.incomplete = up.incomplete;
  }

  try {
    outcome.pulled = await pull(deps);
  } catch {
    outcome.incomplete = true;
  }
  if (outcome.dropped.length > 0 && (await pendingCount()) === 0) {
    // Lo descartado ya no existe en el servidor: la bajada lo habrá retirado también de aquí.
    emitChange();
  }
  return outcome;
}
