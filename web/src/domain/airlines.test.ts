import { describe, expect, it } from 'vitest';
import { airlineOf, checkInOpensMs, seatsIn } from './airlines';

describe('airlines', () => {
  it('reconoce la aerolínea y cuándo abre su check-in', () => {
    expect(airlineOf('JA 3140 AEP → IGR')).toMatchObject({ code: 'JA', name: 'JetSMART', checkInHours: 72 });
    expect(airlineOf('XX 100 AAA → BBB')).toMatchObject({ code: 'XX', name: 'XX', url: '', checkInHours: 24 });
    expect(airlineOf('AVE 05143 Alicante → Madrid')).toBeNull();
    expect(checkInOpensMs(100 * 3_600_000, 'G3 1234 IGR → GIG')).toBe(52 * 3_600_000);
  });

  it('encuentra los asientos en las notas', () => {
    expect(seatsIn('Pasajeros: Manuel Bernabe (23G), Francisco Belso (23H) · Terminal 1', 'AR 1133')).toEqual(['23G', '23H']);
    expect(seatsIn('Asiento 12a · Puerta 7')).toEqual(['12A']);
    expect(seatsIn('Coche 8, plaza 6B', null)).toEqual([]);
  });
});
