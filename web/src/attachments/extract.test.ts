import { describe, expect, it } from 'vitest';
import { applySuggestion, findDates, findTimes, suggestFromText } from './extract';

describe('findDates y findTimes', () => {
  it('reconoce fechas numéricas, ISO y con mes en palabras', () => {
    expect(findDates('Salida 26/09/2026 y vuelta el 3 de octubre de 2026, ref 2026-10-05, 12.10.26').map((d) => d.date)).toEqual([
      '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-12',
    ]);
  });

  it('reconoce horas y no confunde fechas con puntos ni importes', () => {
    expect(findTimes('Sale a las 14:35 h y llega 17.05, precio 45.90 €, fecha 12.10.2026').map((t) => t.time)).toEqual(['14:35', '17:05']);
  });
});

describe('suggestFromText', () => {
  it('billete de Renfe', () => {
    const text = `RENFE VIAJEROS
Billete AVE
Origen: ALICANTE TERMINAL   Destino: MADRID-PUERTA DE ATOCHA
Fecha: 26/09/2026   Salida: 14:35   Llegada: 17:05
Tren: AVE 05123   Coche: 5   Plaza: 3A
Localizador: ABCDE1`;

    const s = suggestFromText(text, 'billete.pdf');

    expect(s.type).toBe('train');
    expect(s.reference).toBe('ABCDE1');
    expect(s.startDate).toBe('2026-09-26');
    expect(s.startTime).toBe('14:35');
    expect(s.endTime).toBe('17:05');
    expect(s.startPlace).toBe('Alicante Terminal');
    expect(s.endPlace).toBe('Madrid-Puerta De Atocha');
    expect(s.title).toBe('AVE 05123 Alicante Terminal → Madrid-Puerta De Atocha');
  });

  it('confirmación de vuelo', () => {
    const text = `Iberia · Tarjeta de embarque
Vuelo IB 3170  Madrid (MAD) → Londres Heathrow (LHR)
Fecha 12 oct 2026  Salida 10:05  Llegada 11:35
Código de reserva: XK7P2Q`;

    const s = suggestFromText(text);

    expect(s.type).toBe('flight');
    expect(s.title).toBe('IB 3170 MAD → LHR');
    expect(s.reference).toBe('XK7P2Q');
    expect(s.startDate).toBe('2026-10-12');
    expect(s.startTime).toBe('10:05');
    expect(s.endTime).toBe('11:35');
    expect(s.startPlace).toBe('MAD');
    expect(s.endPlace).toBe('LHR');
  });

  it('reserva de hotel', () => {
    const text = `Booking.com
Hotel Playa Sol
Dirección: Calle del Mar 12, 03001 Alicante
Check-in: 26/09/2026 a partir de las 15:00
Check-out: 28/09/2026 hasta las 12:00
Número de reserva: 1234567890`;

    const s = suggestFromText(text);

    expect(s.type).toBe('hotel');
    expect(s.title).toBe('Hotel Playa Sol');
    expect(s.startDate).toBe('2026-09-26');
    expect(s.endDate).toBe('2026-09-28');
    expect(s.address).toBe('Calle del Mar 12, 03001 Alicante');
    expect(s.reference).toBe('1234567890');
  });

  it('sin nada reconocible deja los campos vacíos', () => {
    const s = suggestFromText('Hola, ¿qué tal? Nos vemos.');

    expect(s).toMatchObject({ type: null, title: null, reference: null, startDate: null, startTime: null });
  });
});

describe('applySuggestion', () => {
  const empty = { type: null, title: 'Fwd: Tu reserva', startLocal: null, startTz: null, startPlace: null, endLocal: null, endTz: null, endPlace: null, reference: null, address: null };

  it('rellena lo vacío y sustituye el título del asunto cuando se reconoce el tipo', () => {
    const s = suggestFromText('Billete AVE 05123 Origen: ALICANTE TERMINAL Destino: MADRID-PUERTA DE ATOCHA Fecha: 26/09/2026 Salida: 14:35 Llegada: 17:05 Localizador: ABCDE1');
    const filled = applySuggestion(empty, s);

    expect(filled).toMatchObject({
      type: 'train',
      title: 'AVE 05123 Alicante Terminal → Madrid-Puerta De Atocha',
      startLocal: '2026-09-26T14:35',
      endLocal: '2026-09-26T17:05',
      startPlace: 'Alicante Terminal',
      reference: 'ABCDE1',
    });
  });

  it('no pisa lo que ya venía', () => {
    const base = { ...empty, type: 'flight', title: 'IB 3170', reference: 'XK7P2Q', startLocal: '2026-10-12T10:05' };
    const filled = applySuggestion(base, suggestFromText('Localizador: OTRO12 Fecha 01/01/2027 09:00'));

    expect(filled).toMatchObject({ type: 'flight', title: 'IB 3170', reference: 'XK7P2Q', startLocal: '2026-10-12T10:05' });
  });
});
