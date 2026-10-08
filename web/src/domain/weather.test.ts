import { describe, expect, it } from 'vitest';
import { describeWeather, temps } from './weather';

describe('weather', () => {
  it('códigos WMO a icono y palabra', () => {
    expect(describeWeather(0)).toEqual({ icon: '☀️', label: 'Despejado' });
    expect(describeWeather(63).icon).toBe('🌧️');
    expect(describeWeather(null).label).toBe('Tiempo variable');
  });

  it('temperaturas redondeadas, o nada si falta una', () => {
    expect(temps({ date: '2026-10-08', place: 'X', code: 0, max: 24.4, min: 15.6, rain: 0 })).toBe('24° / 16°');
    expect(temps({ date: '2026-10-08', place: 'X', code: 0, max: 24.4, min: null, rain: 0 })).toBe('');
  });
});
