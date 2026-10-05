import { emitChange } from './bus';
import { getMeta, openDb, setMeta } from './db';
import type { Attachment, Trip } from './types';

/** Los viajes que empiezan en los próximos 7 días (o ya han empezado y no han acabado) se bajan solos. */
export const AUTO_DAYS = 7;

const DAY_MS = 86_400_000;

function dateMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** ¿Hay que tener este viaje entero en el móvil? Por interruptor o por cercanía. */
export function wantedOffline(trip: Pick<Trip, 'startDate' | 'endDate'>, todayDate: string, manual: boolean | undefined): boolean {
  if (manual !== undefined) {
    return manual;
  }
  const start = trip.startDate ?? trip.endDate;
  const end = trip.endDate ?? trip.startDate;
  if (!start || !end) {
    return false;
  }
  const today = dateMs(todayDate);
  return dateMs(end) >= today && dateMs(start) - today <= AUTO_DAYS * DAY_MS;
}

export interface OfflineStatus {
  total: number;
  missing: number;
  /** Adjuntos que aún no han subido al servidor (solo existen en este móvil). */
  pendingUpload: number;
}

export function offlineStatus(attachments: readonly Attachment[], storedIds: ReadonlySet<string>): OfflineStatus {
  let missing = 0;
  let pendingUpload = 0;
  for (const attachment of attachments) {
    if (!storedIds.has(attachment.id)) {
      missing++;
    }
    if (!attachment.uploaded) {
      pendingUpload++;
    }
  }
  return { total: attachments.length, missing, pendingUpload };
}

const KEY = (tripId: string) => `offline:${tripId}`;

export function getManualOffline(tripId: string): Promise<boolean | undefined> {
  return getMeta<boolean>(KEY(tripId));
}

export async function setManualOffline(tripId: string, wanted: boolean | undefined): Promise<void> {
  if (wanted === undefined) {
    await (await openDb()).delete('meta', KEY(tripId));
  } else {
    await setMeta(KEY(tripId), wanted);
  }
  emitChange();
}

/** Adjuntos de un viaje: por sus reservas. */
export async function attachmentsOfTrip(tripId: string): Promise<Attachment[]> {
  const database = await openDb();
  const result: Attachment[] = [];
  for (const booking of await database.getAllFromIndex('bookings', 'tripId', tripId)) {
    result.push(...(await database.getAllFromIndex('attachments', 'bookingId', booking.id)));
  }
  return result;
}

export async function storedBlobIds(): Promise<Set<string>> {
  return new Set(await (await openDb()).getAllKeys('blobs'));
}

export interface Downloader {
  (attachment: Attachment): Promise<ArrayBuffer | null>;
}

/** Baja los ficheros que faltan de un viaje. Devuelve cuántos ha bajado; se para al primer fallo de red. */
export async function downloadMissing(tripId: string, download: Downloader): Promise<{ downloaded: number; failed: boolean }> {
  return downloadAll(await attachmentsOfTrip(tripId), download);
}

/** Las fotos de los documentos (pasaportes, visados…) se tienen siempre en el móvil: hacen falta justo sin cobertura. */
export async function downloadDocumentFiles(download: Downloader): Promise<{ downloaded: number; failed: boolean }> {
  const database = await openDb();
  const attachments: Attachment[] = [];
  for (const document of await database.getAll('documents')) {
    attachments.push(...(await database.getAllFromIndex('attachments', 'bookingId', document.id)));
  }
  return downloadAll(attachments, download);
}

async function downloadAll(attachments: readonly Attachment[], download: Downloader): Promise<{ downloaded: number; failed: boolean }> {
  const database = await openDb();
  const stored = await storedBlobIds();
  let downloaded = 0;
  for (const attachment of attachments) {
    if (stored.has(attachment.id) || !attachment.uploaded) {
      continue;
    }
    let bytes: ArrayBuffer | null;
    try {
      bytes = await download(attachment);
    } catch {
      return { downloaded, failed: true };
    }
    if (bytes === null) {
      continue;
    }
    await database.put('blobs', { id: attachment.id, mime: attachment.mime, size: bytes.byteLength, bytes });
    downloaded++;
  }
  if (downloaded > 0) {
    emitChange();
  }
  return { downloaded, failed: false };
}

/** Quita del móvil los ficheros de un viaje (los metadatos se quedan; se pueden volver a bajar). */
export async function dropBlobs(tripId: string): Promise<number> {
  const database = await openDb();
  let removed = 0;
  for (const attachment of await attachmentsOfTrip(tripId)) {
    if (attachment.uploaded && (await database.get('blobs', attachment.id))) {
      await database.delete('blobs', attachment.id);
      removed++;
    }
  }
  if (removed > 0) {
    emitChange();
  }
  return removed;
}
