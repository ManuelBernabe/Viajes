import { describe, expect, it } from 'vitest';
import { allTimeZones, formatDay, formatRange, isValidZone, timeOf, toUtcMs, zoneLabel, zoneOffsetMs } from './localTime';

describe('toUtcMs', () => {
  it('Madrid en verano va dos horas por delante de UTC', () => {
    expect(toUtcMs('2026-10-12T10:05', 'Europe/Madrid')).toBe(Date.UTC(2026, 9, 12, 8, 5));
  });

  it('Madrid en invierno va una hora por delante', () => {
    expect(toUtcMs('2026-12-01T10:05', 'Europe/Madrid')).toBe(Date.UTC(2026, 11, 1, 9, 5));
  });

  it('Tokio va nueve horas por delante todo el año', () => {
    expect(toUtcMs('2026-10-13T07:30', 'Asia/Tokyo')).toBe(Date.UTC(2026, 9, 12, 22, 30));
  });

  it('el vuelo Madrid–Tokio se ordena por el instante real', () => {
    const departure = toUtcMs('2026-10-12T12:00', 'Europe/Madrid');
    const arrival = toUtcMs('2026-10-13T08:55', 'Asia/Tokyo');
    expect(arrival).toBeGreaterThan(departure);
    expect((arrival - departure) / 60_000).toBe(13 * 60 + 55);
  });

  it('una hora que no existe por el cambio de hora se mueve una hora adelante, como en el servidor', () => {
    expect(toUtcMs('2026-03-29T02:30', 'Europe/Madrid')).toBe(Date.UTC(2026, 2, 29, 1, 30));
  });

  it('acepta segundos y rechaza otros formatos', () => {
    expect(toUtcMs('2026-10-12T10:05:00', 'Europe/Madrid')).toBe(Date.UTC(2026, 9, 12, 8, 5));
    expect(() => toUtcMs('12/10/2026 10:05', 'Europe/Madrid')).toThrow();
  });

  it('el desfase de Nueva York en octubre es de cuatro horas', () => {
    expect(zoneOffsetMs('America/New_York', Date.UTC(2026, 9, 12, 12))).toBe(-4 * 3_600_000);
  });
});

describe('zonas', () => {
  it('valida zonas', () => {
    expect(isValidZone('Europe/Madrid')).toBe(true);
    expect(isValidZone('Marte/Olympus')).toBe(false);
  });

  it('etiqueta con la ciudad', () => {
    expect(zoneLabel('America/New_York')).toBe('New York');
    expect(zoneLabel('Europe/Madrid')).toBe('Madrid');
  });

  it('las comunes van primero y no se repiten', () => {
    const zones = allTimeZones();
    expect(zones[0]).toBe('Europe/Madrid');
    expect(new Set(zones).size).toBe(zones.length);
  });
});

describe('formato', () => {
  it('saca la hora sin pasar por la zona del móvil', () => {
    expect(timeOf('2026-10-12T10:05')).toBe('10:05');
  });

  it('formatea el día en español', () => {
    expect(formatDay('2026-10-12')).toMatch(/lun.*12.*oct/);
  });

  it('formatea rangos', () => {
    expect(formatRange('2026-10-12', '2026-10-20')).toMatch(/12 oct.*20 oct/);
    expect(formatRange('2026-10-12', '2026-10-12')).toMatch(/^12 oct$/);
    expect(formatRange(null, null)).toBe('');
  });
});
