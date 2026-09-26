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

describe('billete de Trenes.com (Renfe, dos pasajeros)', () => {
  const text = `09/06/2026 - 11:05 0000
IVA: (10%) 2,67 €
DNI ó DOC.ID: *****279Z
M.BERNABE.ESCRIBA
Localizador: C3BMDV 5NLPM CERCANIAS/TRAM:
TOTAL 29,35 € S.O.V., S.R.C. e I.V.A. Incluidos N.I.F.: A86868189
08027 BARCELONA
CARRER FILIPINES, 1, ,
Nº Billete: 7598102037622
Cierre del acceso al tren 2 minutos antes de la salida
05143
01/10/2026
01/10/2026
Origen: ALICANTE-TERMIN
Destino: CHAMARTIN
Sin Restauración
ESTANDAR AVE
14:35
17:08
Coche: 8 Plaza: 6B

09/06/2026 - 11:05 0000
F.BELSO.ALFONSO
Localizador: C3BMDV NXHKC CERCANIAS/TRAM:
Nº Billete: 7598102037630
05143
01/10/2026
01/10/2026
Origen: ALICANTE-TERMIN
Destino: CHAMARTIN
ESTANDAR AVE
14:35
17:08
Coche: 8 Plaza: 6A`;

  it('ignora la fecha de emisión y coge la del viaje, las horas, el tren y las plazas', () => {
    const s = suggestFromText(text, 'billetes.pdf');

    expect(s).toMatchObject({
      type: 'train',
      title: 'AVE 05143 Alicante-Termin → Chamartin',
      reference: 'C3BMDV',
      startDate: '2026-10-01',
      startTime: '14:35',
      endTime: '17:08',
      startPlace: 'Alicante-Termin',
      endPlace: 'Chamartin',
      notes: 'Coche 8 · Plazas 6B, 6A',
    });
  });
});

describe('localizador con palabra intermedia', () => {
  it('«Localizador Renfe: C3BMDV»', () => {
    expect(suggestFromText('Tu billete de tren. Localizador Renfe: C3BMDV. Salida 01/10/2026 14:35').reference).toBe('C3BMDV');
  });

  it('no coge palabras normales como localizador', () => {
    expect(suggestFromText('Localizador de vuelos baratos para tu viaje').reference).toBeNull();
  });
});

describe('cuerpo del correo de Trenes.com', () => {
  const body = `Manuel, ¡todo ha ido sobre raíles!Has completado la compra de tu viaje de Alicante / Alacant a Madrid Chamartín
Información sobre tu reservaCódigo de reserva: C3BMDV
Viaje de ida
jueves, 01 oct 202614:35 Alicante / Alacant
2h 33m
AVE - 05143 en clase Estándar
17:08Madrid Chamartín
2 x Elige
Total: 66.19 €`;

  it('lee fecha y hora pegadas, el localizador pegado y las estaciones tras la hora', () => {
    const s = suggestFromText(body);

    expect(s).toMatchObject({
      type: 'train',
      reference: 'C3BMDV',
      startDate: '2026-10-01',
      startTime: '14:35',
      endTime: '17:08',
      startPlace: 'Alicante / Alacant',
      endPlace: 'Madrid Chamartín',
      title: 'AVE 05143 Alicante / Alacant → Madrid Chamartín',
    });
  });
});

describe('itinerario de Aerolíneas Argentinas', () => {
  const text = `Millaje:
01 OCT 2026 02 OCT 2026 DESTINO AEROPUERTO INTERNACIONAL DE
EZEIZA
PREPARADO PARA
MANUEL BERNABE ESCRIBANO
FRANCISCO JOSE BELSO
ALFONSO
CÓDIGO DE RESERVA DWYOLX
PARTIDA: JUEVES 01 OCT ARRIBO: VIERNES 02 OCT
AEROLINEAS
ARGENTINAS
AR 1133
Duración:
13horas 5minutos
Cabina:
Turista / Q
Estado:
Confirmado
MAD
MADRID,
SPAIN
EZE
AEROPUERTO INTERNACIONAL DE
EZEIZA
Avión:
AIRBUS INDUSTRIE
A330 JET
6251
Sale a la(s):
20:05
(jue, oct 1)
Terminal:
TERMINAL 1
Llega a la(s):
04:10
(vie, oct 2)
Nombre del pasajero: Asientos: Recibo(s) de boleto(s) electrónico(s):
» Manuel Bernabe Escribano 23G 0442167894233
» Francisco Jose Belso Alfonso 23H 0442167894234`;

  it('no confunde PARTIDA con el localizador y saca vuelo, aeropuertos, zonas y llegada al día siguiente', () => {
    const s = suggestFromText(text, 'Reserva de viaje 01 octubre.pdf');

    expect(s).toMatchObject({
      type: 'flight',
      reference: 'DWYOLX',
      title: 'AR 1133 MAD → EZE',
      startDate: '2026-10-01',
      startTime: '20:05',
      endDate: '2026-10-02',
      endTime: '04:10',
      startPlace: 'MAD',
      endPlace: 'EZE',
      startTz: 'Europe/Madrid',
      endTz: 'America/Argentina/Buenos_Aires',
    });
    const filled = applySuggestion({ type: null, title: null, startLocal: null, startTz: null, startPlace: null, endLocal: null, endTz: null, endPlace: null, reference: null, address: null }, s);
    expect(filled).toMatchObject({ startLocal: '2026-10-01T20:05', endLocal: '2026-10-02T04:10', endTz: 'America/Argentina/Buenos_Aires' });
  });
});
