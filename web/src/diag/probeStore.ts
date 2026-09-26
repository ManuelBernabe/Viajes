import { openDB } from 'idb';

const DB_NAME = 'viajes-diag';
const STORE = 'probe';
const KEY = 'probe';

export interface Probe {
  name: string;
  size: number;
  savedAt: string;
  intact: boolean;
}

interface StoredProbe {
  name: string;
  size: number;
  savedAt: string;
  bytes: Uint8Array;
}

function open() {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE);
    },
  });
}

export async function saveProbe(bytes: Uint8Array, name: string, now: Date): Promise<void> {
  const database = await open();
  const record: StoredProbe = { name, size: bytes.byteLength, savedAt: now.toISOString(), bytes };
  await database.put(STORE, record, KEY);
  database.close();
}

export async function readProbe(): Promise<Probe | null> {
  const database = await open();
  const record = (await database.get(STORE, KEY)) as StoredProbe | undefined;
  database.close();
  if (!record) {
    return null;
  }
  return {
    name: record.name,
    size: record.size,
    savedAt: record.savedAt,
    intact: record.bytes?.byteLength === record.size,
  };
}

export function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}
