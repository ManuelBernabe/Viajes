import { describe, expect, it } from 'vitest';
import { baggageOf, checkedBags, withBaggage } from './baggage';

describe('baggage', () => {
  it('lee el tramo de equipaje de las notas', () => {
    expect(baggageOf('Pasajero: Manuel (23G) · Equipaje: 2 × 23 kg por pasajero · Terminal A')).toBe('2 × 23 kg por pasajero');
    expect(baggageOf('Billete 123\nBaggage: 1 x 23 kg')).toBe('1 x 23 kg');
    expect(baggageOf('Pasajero: Manuel (23G)')).toBeNull();
    expect(baggageOf(null)).toBeNull();
  });

  it('pone, cambia y quita el equipaje sin tocar el resto', () => {
    expect(withBaggage('Pasajero: Manuel (23G)', '1 × 23 kg')).toBe('Pasajero: Manuel (23G) · Equipaje: 1 × 23 kg');
    expect(withBaggage(null, '1 × 23 kg')).toBe('Equipaje: 1 × 23 kg');
    expect(withBaggage('A · Equipaje: 1 × 23 kg · B', '2 × 23 kg')).toBe('A · Equipaje: 2 × 23 kg · B');
    expect(withBaggage('A · Equipaje: 1 × 23 kg · B', '')).toBe('A · B');
    expect(withBaggage('Equipaje: 1 × 23 kg', null)).toBeNull();
  });

  it('cuenta las maletas facturadas', () => {
    expect(checkedBags('2 × 23 kg por pasajero')).toBe(2);
    expect(checkedBags('Sin maleta facturada; 1 × 10 kg de mano')).toBe(0);
    expect(checkedBags('Incluido')).toBeNull();
  });
});
