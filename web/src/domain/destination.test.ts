import { describe, expect, it } from 'vitest';
import { formatRate, quickConversions } from './destination';

describe('destination', () => {
  it('formats the rate with sensible decimals', () => {
    expect(formatRate(1.0832, 'USD', 'en')).toBe('1 € = 1.08 USD');
    expect(formatRate(1450.5, 'ARS', 'en')).toBe('1 € = 1,451 ARS');
    expect(formatRate(16.25, 'MXN', 'en')).toBe('1 € = 16.3 MXN');
  });

  it('gives quick conversions', () => {
    expect(quickConversions(6.2, 'en')).toEqual(['10 € ≈ 62', '50 € ≈ 310', '100 € ≈ 620']);
  });
});
