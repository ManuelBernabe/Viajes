import { emitChange } from './bus';
import { openDb } from './db';
import { toUtcMs } from './localTime';
import { enqueue } from './outbox';
import type { Attachment, AttachmentBody, Booking, BookingBody, InboxItem, Place, PlaceBody, StoredBlob, Trip, TripBody } from './types';

/**
 * Escrituras: se aplican en local al instante, se encolan para el servidor y se avisa a las pantallas.
 * Lecturas: siempre de IndexedDB, que es la copia completa de lo que ve el usuario.
 */

function newId(): string {
  return crypto.randomUUID();
}

// ---- Viajes ----

export async function listTrips(): Promise<Trip[]> {
  return (await openDb()).getAll('trips');
}

export async function getTrip(id: string): Promise<Trip | undefined> {
  return (await openDb()).get('trips', id);
}

export async function saveTrip(body: TripBody, createdBy: string, id = newId()): Promise<Trip> {
  const database = await openDb();
  const existing = await database.get('trips', id);
  const trip: Trip = {
    id,
    title: body.title,
    destination: body.destination,
    startDate: body.startDate,
    endDate: body.endDate,
    createdBy: existing?.createdBy ?? createdBy,
    version: existing?.version ?? 0,
    deletedAtMs: null,
  };
  await database.put('trips', trip);
  await enqueue({ kind: 'put-trip', id, body });
  emitChange();
  return trip;
}

export async function deleteTrip(id: string): Promise<void> {
  const database = await openDb();
  for (const booking of await database.getAllFromIndex('bookings', 'tripId', id)) {
    await removeBookingLocally(booking.id);
  }
  for (const place of await database.getAllFromIndex('places', 'tripId', id)) {
    await database.delete('places', place.id);
  }
  await database.delete('trips', id);
  await enqueue({ kind: 'delete-trip', id });
  emitChange();
}

// ---- Lugares recomendados ----

export async function listPlaces(tripId: string): Promise<Place[]> {
  return (await openDb()).getAllFromIndex('places', 'tripId', tripId);
}

export async function savePlace(body: PlaceBody, createdBy: string, id = newId()): Promise<Place> {
  const database = await openDb();
  const existing = await database.get('places', id);
  const place: Place = {
    id,
    ...body,
    createdBy: existing?.createdBy ?? createdBy,
    createdAtMs: existing ? existing.createdAtMs : Date.now(),
    version: existing?.version ?? 0,
    deletedAtMs: null,
  };
  await database.put('places', place);
  await enqueue({ kind: 'put-place', id, body });
  emitChange();
  return place;
}

export async function deletePlace(id: string): Promise<void> {
  await (await openDb()).delete('places', id);
  await enqueue({ kind: 'delete-place', id });
  emitChange();
}

// ---- Reservas ----

/** Las reservas guardadas antes de que existiera «quién la ve» no traen esos campos: se completan al leer. */
export function normalizeBooking(booking: Booking): Booking {
  return { ...booking, visibility: booking.visibility ?? 'household', sharedWith: booking.sharedWith ?? [] };
}

export async function listBookings(tripId: string): Promise<Booking[]> {
  const bookings = await (await openDb()).getAllFromIndex('bookings', 'tripId', tripId);
  return bookings.map(normalizeBooking).sort((a, b) => a.startUtcMs - b.startUtcMs);
}

export async function listAllBookings(): Promise<Booking[]> {
  return (await (await openDb()).getAll('bookings')).map(normalizeBooking).sort((a, b) => a.startUtcMs - b.startUtcMs);
}

export async function getBooking(id: string): Promise<Booking | undefined> {
  const booking = await (await openDb()).get('bookings', id);
  return booking ? normalizeBooking(booking) : undefined;
}

export async function saveBooking(body: BookingBody, createdBy: string, id = newId()): Promise<Booking> {
  const database = await openDb();
  const existing = await database.get('bookings', id);
  const booking: Booking = {
    id,
    ...body,
    visibility: body.visibility ?? existing?.visibility ?? 'household',
    sharedWith: body.sharedWith ?? existing?.sharedWith ?? [],
    startUtcMs: toUtcMs(body.startLocal, body.startTz),
    createdBy: existing?.createdBy ?? createdBy,
    version: existing?.version ?? 0,
    deletedAtMs: null,
  };
  await database.put('bookings', booking);
  await enqueue({ kind: 'put-booking', id, body });
  emitChange();
  return booking;
}

export async function deleteBooking(id: string): Promise<void> {
  await removeBookingLocally(id);
  await enqueue({ kind: 'delete-booking', id });
  emitChange();
}

async function removeBookingLocally(id: string): Promise<void> {
  const database = await openDb();
  for (const attachment of await database.getAllFromIndex('attachments', 'bookingId', id)) {
    await database.delete('blobs', attachment.id);
    await database.delete('attachments', attachment.id);
  }
  await database.delete('bookings', id);
}

// ---- Adjuntos ----

export async function listAttachments(bookingId: string): Promise<Attachment[]> {
  return (await openDb()).getAllFromIndex('attachments', 'bookingId', bookingId);
}

export async function listAllAttachments(): Promise<Attachment[]> {
  return (await openDb()).getAll('attachments');
}

export async function getAttachment(id: string): Promise<Attachment | undefined> {
  return (await openDb()).get('attachments', id);
}

export async function getBlob(id: string): Promise<StoredBlob | undefined> {
  return (await openDb()).get('blobs', id);
}

export async function putBlob(blob: StoredBlob): Promise<void> {
  await (await openDb()).put('blobs', blob);
  emitChange();
}

/** Guarda el fichero en el móvil y sus metadatos; la subida al servidor la hace la sincronización. */
export async function addAttachment(body: AttachmentBody, bytes: ArrayBuffer, createdBy: string, id = newId()): Promise<Attachment> {
  const database = await openDb();
  const attachment: Attachment = {
    id,
    ...body,
    uploaded: false,
    createdBy,
    version: 0,
    deletedAtMs: null,
  };
  await database.put('blobs', { id, mime: body.mime, size: bytes.byteLength, bytes });
  await database.put('attachments', attachment);
  await enqueue({ kind: 'put-attachment', id, body });
  emitChange();
  return attachment;
}

export async function updateAttachment(id: string, changes: { name?: string; qrText?: string | null }): Promise<void> {
  const database = await openDb();
  const attachment = await database.get('attachments', id);
  if (!attachment) {
    return;
  }
  const updated = { ...attachment, ...changes };
  await database.put('attachments', updated);
  await enqueue({
    kind: 'put-attachment',
    id,
    body: { bookingId: updated.bookingId, name: updated.name, mime: updated.mime, size: updated.size, qrText: updated.qrText },
  });
  emitChange();
}

export async function markUploaded(id: string): Promise<void> {
  const database = await openDb();
  const attachment = await database.get('attachments', id);
  if (attachment && !attachment.uploaded) {
    await database.put('attachments', { ...attachment, uploaded: true });
    emitChange();
  }
}

export async function deleteAttachment(id: string): Promise<void> {
  const database = await openDb();
  await database.delete('blobs', id);
  await database.delete('attachments', id);
  await enqueue({ kind: 'delete-attachment', id });
  emitChange();
}

// ---- Bandeja de entrada ----

export async function listInbox(): Promise<InboxItem[]> {
  return (await (await openDb()).getAll('inbox')).sort((a, b) => b.receivedMs - a.receivedMs);
}

export async function getInboxItem(id: string): Promise<InboxItem | undefined> {
  return (await openDb()).get('inbox', id);
}

/** Tras confirmar o descartar en el servidor, el borrador desaparece del móvil. */
export async function removeInboxItem(id: string): Promise<void> {
  await (await openDb()).delete('inbox', id);
  emitChange();
}

/** Borra todo lo local (al cerrar sesión). */
export async function clearAll(): Promise<void> {
  const database = await openDb();
  const tx = database.transaction(['trips', 'bookings', 'attachments', 'blobs', 'outbox', 'meta', 'inbox', 'places'], 'readwrite');
  await Promise.all([
    tx.objectStore('trips').clear(),
    tx.objectStore('bookings').clear(),
    tx.objectStore('attachments').clear(),
    tx.objectStore('blobs').clear(),
    tx.objectStore('outbox').clear(),
    tx.objectStore('meta').clear(),
    tx.objectStore('inbox').clear(),
    tx.objectStore('places').clear(),
  ]);
  await tx.done;
  emitChange();
}
