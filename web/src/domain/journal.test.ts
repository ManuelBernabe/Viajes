import { describe, expect, it } from 'vitest';
import { journalDates } from './journal';

describe('journalDates', () => {
  it('los días del viaje hasta hoy, más recientes primero, y los que ya tienen algo', () => {
    expect(journalDates('2026-10-01', '2026-10-19', '2026-10-03', [])).toEqual(['2026-10-03', '2026-10-02', '2026-10-01']);
    expect(journalDates('2026-10-01', '2026-10-02', '2026-10-09', ['2026-09-30'])).toEqual(['2026-10-02', '2026-10-01', '2026-09-30']);
    expect(journalDates(null, null, '2026-10-09', [])).toEqual(['2026-10-09']);
  });
});
