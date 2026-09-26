import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Attachment, Booking, Op, StoredBlob, Trip } from './types';

export interface ViajesDb extends DBSchema {
  trips: { key: string; value: Trip };
  bookings: { key: string; value: Booking; indexes: { tripId: string } };
  attachments: { key: string; value: Attachment; indexes: { bookingId: string } };
  blobs: { key: string; value: StoredBlob };
  outbox: { key: number; value: Op };
  meta: { key: string; value: unknown };
}

export const DB_NAME = 'viajes';

let opening: Promise<IDBPDatabase<ViajesDb>> | null = null;

/** Una sola conexión compartida: abrir y cerrar en cada consulta es lento en iOS. */
export function openDb(): Promise<IDBPDatabase<ViajesDb>> {
  opening ??= openDB<ViajesDb>(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('trips', { keyPath: 'id' });
      database.createObjectStore('bookings', { keyPath: 'id' }).createIndex('tripId', 'tripId');
      database.createObjectStore('attachments', { keyPath: 'id' }).createIndex('bookingId', 'bookingId');
      database.createObjectStore('blobs', { keyPath: 'id' });
      database.createObjectStore('outbox', { autoIncrement: true });
      database.createObjectStore('meta');
    },
    blocked() {
      // Otra pestaña con una versión vieja: no pasa en la app instalada.
    },
  });
  return opening;
}

/** Solo para tests: cierra y borra la base para empezar de cero. */
export async function resetDb(): Promise<void> {
  if (opening) {
    (await opening).close();
    opening = null;
  }
  await deleteDB(DB_NAME);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await openDb()).get('meta', key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await openDb()).put('meta', value, key);
}
