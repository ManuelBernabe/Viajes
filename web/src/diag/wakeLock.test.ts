import { describe, expect, it } from 'vitest';
import { requestWakeLock } from './wakeLock';

describe('requestWakeLock', () => {
  it('sin API dice que no está soportado', async () => {
    expect(await requestWakeLock({})).toBe('no soportado');
  });

  it('con la API disponible queda activo', async () => {
    expect(await requestWakeLock({ wakeLock: { request: async () => ({}) } })).toBe('activo');
  });

  it('si el sistema lo rechaza lo indica', async () => {
    const nav = { wakeLock: { request: async () => Promise.reject(new Error('NotAllowedError')) } };

    expect(await requestWakeLock(nav)).toBe('rechazado');
  });
});
