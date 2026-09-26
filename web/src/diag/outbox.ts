import { openDB } from 'idb';
import { ApiError } from '../api';

export interface Mark {
  id: string;
  local: string;
}

export type SendResult = 'ok' | 'retry' | 'drop';

const DB_NAME = 'viajes-outbox';
const STORE = 'queue';

function open() {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE, { autoIncrement: true });
    },
  });
}

export async function enqueue(mark: Mark): Promise<void> {
  const database = await open();
  await database.add(STORE, mark);
  database.close();
}

export async function pending(): Promise<Mark[]> {
  const database = await open();
  const marks = (await database.getAll(STORE)) as Mark[];
  database.close();
  return marks;
}

export interface FlushResult {
  sent: number;
  dropped: number;
  left: number;
}

let running: Promise<FlushResult> | null = null;

// Un solo vaciado a la vez: si ya hay uno en marcha, se comparte en vez de reenviar la misma cabeza de la cola.
export function flush(send: (mark: Mark) => Promise<SendResult>): Promise<FlushResult> {
  running ??= drain(send).finally(() => {
    running = null;
  });
  return running;
}

async function drain(send: (mark: Mark) => Promise<SendResult>): Promise<FlushResult> {
  const database = await open();
  let sent = 0;
  let dropped = 0;
  try {
    for (;;) {
      const cursor = await database.transaction(STORE).store.openCursor();
      if (!cursor) {
        break;
      }
      const key = cursor.key;
      const result = await send(cursor.value as Mark);
      if (result === 'retry') {
        break;
      }
      await database.delete(STORE, key);
      if (result === 'ok') {
        sent++;
      } else {
        dropped++;
      }
    }
    return { sent, dropped, left: await database.count(STORE) };
  } finally {
    database.close();
  }
}

// Solo se descarta lo que el servidor rechaza de verdad. Lo pasajero espera: 401 (sesión caducada), 408, 429,
// y el rechazo de origen, que delata una configuración rota y no una falta de permisos.
const TRANSIENT = new Set([401, 408, 429]);

export function toSendResult(error: unknown): SendResult {
  if (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    !TRANSIENT.has(error.status) &&
    error.code !== 'origin_rejected'
  ) {
    return 'drop';
  }
  return 'retry';
}
