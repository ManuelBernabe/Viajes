import { describe, expect, it } from 'vitest';
import { dateFromDayOfYear, parseBoardingPass, prefillFromBoardingPass, seatsFromCodes } from './bcbp';

// Ejemplo del estándar IATA (Resolution 792), con un tramo.
const IATA_EXAMPLE = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 226F001A0025 100';
const now = new Date(2026, 8, 26);

describe('parseBoardingPass', () => {
  it('lee pasajero, localizador, ruta, vuelo, fecha y asiento', () => {
    const pass = parseBoardingPass(IATA_EXAMPLE, now);

    expect(pass?.passenger).toBe('LUC DESMARAIS');
    expect(pass?.legs).toEqual([
      { pnr: 'ABC123', from: 'YUL', to: 'FRA', carrier: 'AC', flight: '834', dayOfYear: 226, date: '2026-08-14', seat: '1A' },
    ]);
  });

  it('lee un pase con dos tramos y campos variables', () => {
    const leg1 = 'EABC123 MADLHRIB 3170 285Y012A0001 100';
    const leg2 = 'ABC123 LHRJFKBA 0117 285Y024C0002 100';
    const pass = parseBoardingPass(`M2GARCIA/MANUEL       ${leg1}${leg2}`, now);

    expect(pass?.passenger).toBe('MANUEL GARCIA');
    expect(pass?.legs.map((l) => `${l.carrier}${l.flight} ${l.from}-${l.to} ${l.seat}`)).toEqual(['IB3170 MAD-LHR 12A', 'BA117 LHR-JFK 24C']);
    expect(pass?.legs[0].date).toBe('2026-10-12');
  });

  it('rechaza lo que no es una tarjeta de embarque', () => {
    expect(parseBoardingPass('https://example.com/entrada/123', now)).toBeNull();
    expect(parseBoardingPass('M1', now)).toBeNull();
    expect(parseBoardingPass('M1DESMARAIS/LUC       EABC123 1234567 0834 999F001A0025 100', now)).toBeNull();
  });
});

describe('dateFromDayOfYear', () => {
  it('usa el año en curso salvo que la fecha quede muy atrás', () => {
    expect(dateFromDayOfYear(285, now)).toBe('2026-10-12');
    expect(dateFromDayOfYear(250, now)).toBe('2026-09-07');
    expect(dateFromDayOfYear(15, now)).toBe('2027-01-15');
  });
});

describe('prefillFromBoardingPass', () => {
  it('prepara el formulario con el primer tramo', () => {
    const prefill = prefillFromBoardingPass(parseBoardingPass(IATA_EXAMPLE, now)!);

    expect(prefill).toEqual({
      type: 'flight',
      title: 'AC 834 YUL → FRA',
      reference: 'ABC123',
      startDate: '2026-08-14',
      startPlace: 'YUL',
      endPlace: 'FRA',
      notes: 'Pasajero: LUC DESMARAIS · Asiento 1A',
    });
  });
});

describe('seatsFromCodes', () => {
  it('saca el asiento de cada pasajero del tramo de esa reserva', () => {
    const now = new Date(2026, 9, 8);
    const paco = 'M1BELSO/PACO          EOEGC6H IGRAEPJA 3157 281Y019A0093 100';
    const manuel = 'M1BERNABE/MANUEL      EOEGC6H IGRAEPJA 3157 281Y019B0094 100';
    const otro = 'M1BELSO/PACO          EOEGC6H AEPGIGG3 7651 282Y012C0011 100';
    expect(seatsFromCodes([paco, manuel, otro], { startPlace: 'IGR', endPlace: 'AEP', flightNumber: 'JA3157' }, now)).toEqual([
      { passenger: 'Paco', seat: '19A' },
      { passenger: 'Manuel', seat: '19B' },
    ]);
    expect(seatsFromCodes(['https://example.com'], { startPlace: null, endPlace: null, flightNumber: null }, now)).toEqual([]);
  });
});
