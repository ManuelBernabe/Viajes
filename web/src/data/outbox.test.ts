import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { resetDb } from './db';
import { enqueue, flush, pending, toSendResult } from './outbox';
import type { Op } from './types';

const put = (id: string): Op => ({ kind: 'put-trip', id, body: { title: id, destination: null, startDate: null, endDate: null } });

beforeEach(() => resetDb());

describe('cola de operaciones', () => {
  it('se envía en orden y se vacía', async () => {
    await enqueue(put('a'));
    await enqueue({ kind: 'delete-trip', id: 'b' });
    const seen: string[] = [];

    const result = await flush(async (op) => {
      seen.push(`${op.kind}:${op.id}`);
      return 'ok';
    });

    expect(seen).toEqual(['put-trip:a', 'delete-trip:b']);
    expect(result).toEqual({ sent: 2, dropped: [], left: 0 });
    expect(await pending()).toEqual([]);
  });

  it('un reintento para la cola y conserva todo desde ahí', async () => {
    await enqueue(put('a'));
    await enqueue(put('b'));

    const result = await flush(async (op) => (op.id === 'a' ? 'retry' : 'ok'));

    expect(result.left).toBe(2);
    expect((await pending()).map((op) => op.id)).toEqual(['a', 'b']);
  });

  it('lo rechazado se descarta y se sigue con lo demás', async () => {
    await enqueue(put('mala'));
    await enqueue(put('buena'));

    const result = await flush(async (op) => (op.id === 'mala' ? 'drop' : 'ok'));

    expect(result.sent).toBe(1);
    expect(result.dropped.map((op) => op.id)).toEqual(['mala']);
    expect(result.left).toBe(0);
  });

  it('dos vaciados a la vez no envían dos veces la misma operación', async () => {
    await enqueue(put('a'));
    let calls = 0;
    const send = async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 'ok' as const;
    };

    await Promise.all([flush(send), flush(send)]);

    expect(calls).toBe(1);
  });
});

describe('toSendResult', () => {
  it('descarta los rechazos definitivos del servidor', () => {
    expect(toSendResult(new ApiError(404, 'no'))).toBe('drop');
    expect(toSendResult(new ApiError(409, 'borrada'))).toBe('drop');
    expect(toSendResult(new ApiError(400, 'mal'))).toBe('drop');
  });

  it('reintenta lo pasajero', () => {
    expect(toSendResult(new TypeError('Failed to fetch'))).toBe('retry');
    expect(toSendResult(new ApiError(500, 'caído'))).toBe('retry');
    expect(toSendResult(new ApiError(401, 'sesión'))).toBe('retry');
    expect(toSendResult(new ApiError(429, 'espera'))).toBe('retry');
    expect(toSendResult(new ApiError(403, 'origen', 'origin_rejected'))).toBe('retry');
  });
});
