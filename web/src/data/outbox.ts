import { ApiError } from '../api';
import { openDb } from './db';
import type { Op } from './types';

export type SendResult = 'ok' | 'retry' | 'drop';

export async function enqueue(op: Op): Promise<void> {
  await (await openDb()).add('outbox', op);
}

export async function pending(): Promise<Op[]> {
  return (await openDb()).getAll('outbox');
}

export async function pendingCount(): Promise<number> {
  return (await openDb()).count('outbox');
}

export interface FlushResult {
  sent: number;
  dropped: Op[];
  left: number;
}

let running: Promise<FlushResult> | null = null;

/** Envía la cola en orden. Un solo vaciado a la vez: el segundo que llega comparte el que ya corre. */
export function flush(send: (op: Op) => Promise<SendResult>): Promise<FlushResult> {
  running ??= drain(send).finally(() => {
    running = null;
  });
  return running;
}

async function drain(send: (op: Op) => Promise<SendResult>): Promise<FlushResult> {
  const database = await openDb();
  let sent = 0;
  const dropped: Op[] = [];
  for (;;) {
    const cursor = await database.transaction('outbox').store.openCursor();
    if (!cursor) {
      break;
    }
    const key = cursor.key;
    const op = cursor.value;
    const result = await send(op);
    if (result === 'retry') {
      break;
    }
    await database.delete('outbox', key);
    if (result === 'ok') {
      sent++;
    } else {
      dropped.push(op);
    }
  }
  return { sent, dropped, left: await database.count('outbox') };
}

// Solo se descarta lo que el servidor rechaza de verdad (400, 403, 404, 409…). Lo pasajero espera:
// red caída, 5xx, 401 (sesión caducada), 408, 429 y el rechazo de origen, que delata una configuración rota.
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
