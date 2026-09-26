import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { enqueue, flush, pending, toSendResult, type Mark } from './outbox';

beforeEach(() => {
  (globalThis as { indexedDB: unknown }).indexedDB = new IDBFactory();
});

const first: Mark = { id: 'a', local: 'primera' };
const second: Mark = { id: 'b', local: 'segunda' };

describe('outbox', () => {
  it('envía los pendientes en orden y vacía la cola', async () => {
    await enqueue(first);
    await enqueue(second);
    const sent: string[] = [];

    const result = await flush(async (mark) => {
      sent.push(mark.id);
      return 'ok';
    });

    expect(sent).toEqual(['a', 'b']);
    expect(result).toEqual({ sent: 2, dropped: 0, left: 0 });
  });

  it('si hay que reintentar, se detiene y conserva el orden', async () => {
    await enqueue(first);
    await enqueue(second);

    const result = await flush(async () => 'retry');

    expect(result).toEqual({ sent: 0, dropped: 0, left: 2 });
    expect((await pending()).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('una operación rechazada se descarta y la cola sigue', async () => {
    await enqueue(first);
    await enqueue(second);

    const result = await flush(async (mark) => (mark.id === 'a' ? 'drop' : 'ok'));

    expect(result).toEqual({ sent: 1, dropped: 1, left: 0 });
  });

  it('clasifica los errores: la sesión caducada y la red se reintentan, el rechazo se descarta', () => {
    expect(toSendResult(new ApiError(401, 'x'))).toBe('retry');
    expect(toSendResult(new TypeError('Failed to fetch'))).toBe('retry');
    expect(toSendResult(new ApiError(500, 'x'))).toBe('retry');
    expect(toSendResult(new ApiError(403, 'x'))).toBe('drop');
    expect(toSendResult(new ApiError(409, 'x'))).toBe('drop');
  });

  it('lo pasajero se reintenta: demasiadas peticiones, tiempo agotado o un origen rechazado por configuración', () => {
    expect(toSendResult(new ApiError(429, 'x'))).toBe('retry');
    expect(toSendResult(new ApiError(408, 'x'))).toBe('retry');
    expect(toSendResult(new ApiError(403, 'x', 'origin_rejected'))).toBe('retry');
  });

  it('dos vaciados a la vez no envían dos veces la misma operación', async () => {
    await enqueue(first);
    await enqueue(second);
    const sent: string[] = [];
    const slowSend = async (mark: Mark) => {
      sent.push(mark.id);
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'ok' as const;
    };

    await Promise.all([flush(slowSend), flush(slowSend)]);

    expect(sent).toEqual(['a', 'b']);
  });
});
