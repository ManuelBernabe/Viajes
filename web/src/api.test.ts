import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, describeError } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('devuelve el JSON de una respuesta correcta', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ email: 'ana@example.com' }), { status: 200 }));

    expect(await api<{ email: string }>('/api/auth/me')).toEqual({ email: 'ana@example.com' });
  });

  it('convierte un problema del servidor en ApiError con su mensaje', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ detail: 'Email o contraseña incorrectos.' }), { status: 401 }),
    );

    await expect(api('/api/auth/login', { method: 'POST' })).rejects.toMatchObject({
      status: 401,
      message: 'Email o contraseña incorrectos.',
    });
  });
});

describe('api: tipo del problema', () => {
  it('conserva el tipo del problema para que el llamante distinga rechazos', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ type: 'origin_rejected', detail: 'x' }), { status: 403 }),
    );

    await expect(api('/api/diag/marks', { method: 'POST' })).rejects.toMatchObject({ code: 'origin_rejected' });
  });
});

describe('describeError', () => {
  it('un fallo de red se explica como falta de conexión', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe('Sin conexión. Inténtalo cuando tengas cobertura.');
  });

  it('cualquier otra cosa da un mensaje genérico', () => {
    expect(describeError(new Error('raro'))).toBe('No se ha podido completar. Inténtalo de nuevo.');
  });
});
