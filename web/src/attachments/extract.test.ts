import { describe, expect, it } from 'vitest';
import { applySuggestion, findDates, findTimes, inferYear, suggestFromText } from './extract';

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
      notes: 'Pasajeros: Manuel Bernabe Escribano (23G), Francisco Jose Belso Alfonso (23H) · Billetes 0442167894233, 0442167894234 · Salida: TERMINAL 1',
    });
    const filled = applySuggestion({ type: null, title: null, startLocal: null, startTz: null, startPlace: null, endLocal: null, endTz: null, endPlace: null, reference: null, address: null }, s);
    expect(filled).toMatchObject({ startLocal: '2026-10-01T20:05', endLocal: '2026-10-02T04:10', endTz: 'America/Argentina/Buenos_Aires' });
  });
});

describe('pasajeros de un vuelo en columnas separadas', () => {
  it('empareja nombres, asientos y billetes aunque el PDF los saque por columnas', () => {
    const text = `Vuelo AR 1133 MAD → EZE 01 OCT 2026 20:05
Nombre del pasajero:
» Manuel Bernabe Escribano
» Francisco Jose Belso Alfonso
Asientos:
23G
23H
Recibo(s) de boleto(s) electrónico(s):
0442167894233
0442167894234
Terminal:
TERMINAL 1`;

    expect(suggestFromText(text).notes).toBe('Pasajeros: Manuel Bernabe Escribano (23G), Francisco Jose Belso Alfonso (23H) · Billetes 0442167894233, 0442167894234 · Salida: TERMINAL 1');
  });
});

describe('itinerario web de Aerolíneas Argentinas (pasajero en tres líneas)', () => {
  it('lee asientos y billetes por bloques y pone «Terminal 1»', () => {
    const text = `Vuelo AR 1133 MAD → EZE
01 OCT 2026 20:05
Terminal:
1
Cabina:
Turista / Q
Comida:
Cena, Desayuno
Distancia (en Millas):
6251
Manuel Bernabe Escribano
Asiento:
23G
Francisco Jose Belso Alfonso
Asiento:
23H
Agregar al calendario
Su(s) boleto(s):
Manuel Bernabe Escribano:
 0442167894233
Francisco Jose Belso Alfonso:
 0442167894234
Seguinos:`;

    expect(suggestFromText(text).notes).toBe('Pasajeros: Manuel Bernabe Escribano (23G), Francisco Jose Belso Alfonso (23H) · Billetes 0442167894233, 0442167894234 · Salida: Terminal 1');
  });
});

describe('caracteres invisibles', () => {
  it('lee igual con espacios duros, líneas en blanco dobles y guiones blandos', () => {
    const text = `Vuelo AR 1133 MAD → EZE\n\n01 OCT 2026 20:05\n\nTerminal:\n\n1\n\nManuel Bernabe Escribano\n\nAsiento:\n\n23G\n\nFrancisco Jose Belso Alfonso\n\nAsiento:\n\n23H\n\nSu(s) boleto(s):\n\nManuel Bernabe Escribano:\n 0442167894233\n\nFrancisco Jose Belso Alfonso:\n 0442167894234\n`;

    expect(suggestFromText(text).notes).toBe('Pasajeros: Manuel Bernabe Escribano (23G), Francisco Jose Belso Alfonso (23H) · Billetes 0442167894233, 0442167894234 · Salida: Terminal 1');
  });
});

describe('confirmación de compra de Aerolíneas Argentinas (texto real del iPhone)', () => {
  const text = `AS Dynamic Notification

Confirmación de compra

¡Gracias por elegirnos!

Código de Reserva

DWYOLX

AEROLINEAS ARGENTINAS

Número de vuelo

AR 1133

Confirmado

jueves, 01 octubre - 
viernes, 02 octubre

Salida:

MAD MADRID, SPAIN

20:05

TERMINAL 1

Llegada:

EZE AEROPUERTO INTERNACIONAL DE EZEIZA

04:10
 +1 día

INTERNATIONAL ARRIVALS TER

Cabina:

Turista
 / Q

Distancia (en Millas):

6251

Manuel B​ernab​e Esc​ribano

Asiento:

23G

Fra​ncisc​o Jose Be​lso A​lfonso

Asiento:

23H

Agregar al calendario

Su(s) boleto(s):

Manuel Bernabe Escribano: 
 0442167894233

Francisco Jose Belso Alfonso: 
 0442167894234

Seguinos:`;

  it('lee todo, con fecha sin año y nombres con caracteres invisibles', () => {
    const year = inferYear(10, 1);
    const s = suggestFromText(text, 'confirmacion.pdf');

    expect(s).toMatchObject({
      type: 'flight',
      title: 'AR 1133 MAD → EZE',
      reference: 'DWYOLX',
      startDate: `${year}-10-01`,
      startTime: '20:05',
      endDate: `${year}-10-02`,
      endTime: '04:10',
      startPlace: 'MAD',
      endPlace: 'EZE',
      notes: 'Pasajeros: Manuel Bernabe Escribano (23G), Francisco Jose Belso Alfonso (23H) · Billetes 0442167894233, 0442167894234 · Salida: Terminal 1',
    });
  });
});

describe('confirmación de Airbnb reenviada', () => {
  const text = `---------- Mensaje reenviado ---------
De: Airbnb <automated@airbnb.com>
Fecha: El sáb, 26 sept 2026 a las 12:19
Asunto: Confirmado: recibo de Airbnb de tu viaje (15–18 oct)

Ya está todo listo para tu reserva en Salvador
Luxo, conforto e vista mar da Praia da Barra!

Casa/apto. entero, anfitrión: Glauber

Llegada

jue, 15 oct

Después de las 15:00

Salida

dom, 18 oct

Hasta las 11:00
Dirección

R. Afonso Celso, 535 - Barra, Salvador - BA, 40140-080, Brazil
Viajeros

2 adultos
Desglose del precio

68,28 € por 3 noches
Pago completado el 26 sept
Cobro el 30 sept
Código de confirmación: HMSR4NN3H9`;

  it('coge llegada y salida por etiqueta, no la fecha del reenvío ni la del pago', () => {
    const year = inferYear(10, 15);
    const s = suggestFromText(text);

    expect(s).toMatchObject({
      type: 'hotel',
      title: 'Airbnb · Luxo, conforto e vista mar da Praia da Barra!',
      reference: 'HMSR4NN3H9',
      startDate: `${year}-10-15`,
      startTime: '15:00',
      endDate: `${year}-10-18`,
      endTime: '11:00',
      address: 'R. Afonso Celso, 535 - Barra, Salvador - BA, 40140-080, Brazil',
    });
  });
});

describe('fechas y horas en portugués e inglés', () => {
  it('lee «6 de outubro de 2026», «October 6, 2026» y «9:10 PM»', () => {
    expect(findDates('Embarque: 6 de outubro de 2026. Departure: October 9, 2026. Volta em 19 dez 2026').map((d) => d.date)).toEqual([
      '2026-10-06', '2026-10-09', '2026-12-19',
    ]);
    expect(findTimes('Departs 9:10 PM, arrives 12:05 AM, price 45.90 $').map((t) => t.time)).toEqual(['21:10', '00:05']);
  });
});

describe('confirmação da GOL (portugués)', () => {
  const text = `GOL Linhas Aéreas
Sua reserva está confirmada
Código da reserva: RJX4T7
Voo G3 2115
Data: 9 de outubro de 2026
Partida 12:30 Foz do Iguaçu (IGU)
Chegada 15:20 Rio de Janeiro (GIG)
Passageiro: MANUEL BERNABE  Assento 14C`;

  it('saca tipo, vuelo, localizador, aeropuertos con zona horaria y horas', () => {
    const s = suggestFromText(text);
    expect(s.type).toBe('flight');
    expect(s.title).toBe('G3 2115 IGU → GIG');
    expect(s.reference).toBe('RJX4T7');
    expect(s.startDate).toBe('2026-10-09');
    expect(s.startTime).toBe('12:30');
    expect(s.endTime).toBe('15:20');
    expect(s.startTz).toBe('America/Sao_Paulo');
    expect(s.endTz).toBe('America/Sao_Paulo');
  });
});

describe('itinerario de Aerolíneas con terminal y año cerca', () => {
  it('no toma «T4 2026» por un vuelo y prefiere la compañía conocida', () => {
    const s = suggestFromText(`Aerolíneas Argentinas · Itinerario
Terminal T4 2026 · Vuelo AR 1728 Buenos Aires (AEP) → Puerto Iguazú (IGR)
06/10/2026 16:10 → 18:00
Código de reserva: KQ8R2M`);
    expect(s.title).toBe('AR 1728 AEP → IGR');
    expect(s.startTz).toBe('America/Argentina/Buenos_Aires');
    expect(s.reference).toBe('KQ8R2M');
  });
});

describe('reserva de hotel en portugués (Booking)', () => {
  it('lee pousada, check-in y check-out con sus horas, endereço y número de confirmação', () => {
    const s = suggestFromText(`Booking.com
Pousada Ipanema Mar
Endereço: Rua Visconde de Pirajá 400, Ipanema, Rio de Janeiro
Check-in: 9 de outubro de 2026 a partir das 15:00
Check-out: 19 de outubro de 2026 até as 10:00
Número de confirmação: 4471820`);
    expect(s.type).toBe('hotel');
    expect(s.title).toBe('Pousada Ipanema Mar');
    expect(s.address).toBe('Rua Visconde de Pirajá 400, Ipanema, Rio de Janeiro');
    expect(s.startDate).toBe('2026-10-09');
    expect(s.startTime).toBe('15:00');
    expect(s.endDate).toBe('2026-10-19');
    expect(s.endTime).toBe('10:00');
    expect(s.reference).toBe('4471820');
  });
});

describe('confirmación en inglés', () => {
  it('lee «Reservation number», mes primero y AM/PM', () => {
    const s = suggestFromText(`Your flight is confirmed
Reservation number: HX9K2L
Flight JA 3120 Santiago (SCL) to Lima (LIM)
Departure: October 12, 2026 at 7:45 AM · Arrival: 10:30 AM`);
    expect(s.type).toBe('flight');
    expect(s.reference).toBe('HX9K2L');
    expect(s.title).toBe('JA 3120 SCL → LIM');
    expect(s.startDate).toBe('2026-10-12');
    expect(s.startTime).toBe('07:45');
    expect(s.endTime).toBe('10:30');
    expect(s.startTz).toBe('America/Santiago');
  });
});

describe('aviso de cambio de GOL (portugués, vuelo antiguo y nuevo)', () => {
  it('coge la hora del vuelo nuevo, no la del antiguo, y no inventa asientos con los códigos de los enlaces', () => {
    const s = suggestFromText(`Olá, ANA!
Houve uma pequena alteração no horário do seu voo. Confira abaixo as informações atualizadas e considere-as para o embarque.
Código de Reserva: IFOXRO
Plane icon [https://images.example.com/LinkTracking?q=Wxo3ckL8BwPkHf5w57E4bkT0pkmkpmPFNRbLXHPc3B] Voo
antigo
Data Voo Origem 09/10/26 G3 7651 Argentina - Aeroparque (AEP)
Partida Chegada Destino 10:20 13:20 Brasil - Rio de Janeiro - Galeão (GIG)
Plane icon [https://images.example.com/LinkTracking?q=7MqiqYwVIaMKTNV5jLaoYpvk5ZcLuy9Ms4I] Voo
novo
Data Voo Origem 09/10/26 G3 7651 Argentina - Aeroparque (AEP)
Partida Chegada Destino 10:20 13:10 Brasil - Rio de Janeiro - Galeão (GIG)
Clientes
ANA EJEMPLO`);
    expect(s.type).toBe('flight');
    expect(s.title).toBe('G3 7651 AEP → GIG');
    expect(s.reference).toBe('IFOXRO');
    expect(s.startDate).toBe('2026-10-09');
    expect(s.startTime).toBe('10:20');
    expect(s.endTime).toBe('13:10');
    expect(s.notes).toBeNull();
  });
});

describe('confirmação de pagamento de GOL (etiquetas pegadas, vuelo sin compañía)', () => {
  it('lee «Partida:11:55», «Origem:GIG» y deduce G3 del nombre de la aerolínea', () => {
    const s = suggestFromText(`GOL Linhas Aéreas
Olá, ANA. Está tudo certo com a sua compra! Veja abaixo os detalhes do seu voo:
LOCALIZADOR GOL: EXDYMG
Passageiros:ANA EJEMPLO
Data:15/10/2026
Voo:1890
Origem:GIG
Destino:SSA
Partida:11:55
Chegada:13:55`);
    expect(s.title).toBe('G3 1890 GIG → SSA');
    expect(s.reference).toBe('EXDYMG');
    expect(s.startDate).toBe('2026-10-15');
    expect(s.startTime).toBe('11:55');
    expect(s.endTime).toBe('13:55');
    expect(s.startTz).toBe('America/Sao_Paulo');
    expect(s.endTz).toBe('America/Bahia');
  });
});

describe('confirmación de Air Europa (entidades HTML y ciudades sin código)', () => {
  it('lee el localizador tras «Reserva confirmada», el tramo «Ciudad (hora) - Ciudad (hora)» y el vuelo UX', () => {
    const s = suggestFromText(` Confirmaci&#243;n de tu reserva 8UNAMP
 Recuerda, este correo electr&#243;nico no es v&#225;lido como tarjeta de embarque
 &#8199;&#847; &#8199;&#847;
 Reserva confirmada

 8UNAMP

 Tus vuelos
 Salvador de Bah&#237;a - Alicante
 18/10/26 | Salvador de Bah&#237;a (22:45) - Madrid (12:15) | UX0084<br />19/10/26 | Madrid (15:10) - Alicante (16:20) | UX4049<br />
 Informaci&#243;n de pasajeros
 ANA EJEMPLO`);
    expect(s.type).toBe('flight');
    expect(s.reference).toBe('8UNAMP');
    expect(s.title).toBe('UX 0084 Salvador de Bahía → Madrid');
    expect(s.startDate).toBe('2026-10-18');
    expect(s.startTime).toBe('22:45');
    expect(s.endTime).toBe('12:15');
    expect(s.endDate).toBe('2026-10-19');
    expect(s.startTz).toBe('America/Bahia');
    expect(s.endTz).toBe('Europe/Madrid');
  });
});

describe('itinerario de JetSMART que llega como HTML crudo', () => {
  it('convierte el HTML, ignora la fecha de emisión y las tasas «(PSA)», y lee vuelo, aeropuertos y horas', () => {
    const s = suggestFromText(`<html><head><style>p { margin: 0 }</style></head><body>
<table><tr><td>Confirmación Reserva <span style="font-weight:bold;">OEGC6H</span></td><td>¡Gracias por escogernos!</td></tr></table>
<table><tr><td>NOMBRE PASAJERO</td><td>№ TICKET</td><td>FECHA EMISIÓN</td></tr>
<tr><td> MR ANA EJEMPLO</td><td>3602593359410954</td><td>11/07/2026</td></tr></table>
<td>DETALLE RESERVA</td>
<td> Fecha: 08/10/2026</td>
<table><tr><td><table><tr><td>Iguazu</td></tr><tr><td>IGR</td></tr><tr><td><span>Hora de salida:</span>16:39</td></tr></table></td>
<td><table><tr><td>Buenos Aires, Aeroparque</td></tr><tr><td>AEP</td></tr><tr><td><span>Hora de llegada:</span>18:39</td></tr></table></td></tr>
<tr><td colspan="3"><span>*Vuelo </span>JA<span></span>3149 (WJ)<span> - </span>Operado por JetSMART Airlines SA</td></tr></table>
<tr><td>Tasa de Seguridad de Aviación (PSA):</td><td>ARS $ 1.725,00</td></tr>
<tr><td>TRANSACCIONES</td></tr><tr><td>11/07/2026</td><td>ARS $ 404.111,04</td><td>Aprobado</td></tr>
<p>Si el vuelo se cancela se ofrecerá un nuevo vuelo. RUC: 0993377110001</p>
</body></html>`);
    expect(s.type).toBe('flight');
    expect(s.reference).toBe('OEGC6H');
    expect(s.title).toBe('JA 3149 IGR → AEP');
    expect(s.startDate).toBe('2026-10-08');
    expect(s.startTime).toBe('16:39');
    expect(s.endTime).toBe('18:39');
    expect(s.startTz).toBe('America/Argentina/Buenos_Aires');
    expect(s.notes).toBeNull();
  });

  it('en el aviso de modificación lee el localizador tras «asociado a» y el itinerario actualizado', () => {
    const s = suggestFromText(`HOLA, ANA EJEMPLO
Queremos informarte que, por motivos operacionales, tu itinerario asociado a
OEGC6H sufrió una modificación.
Aquí tienes los detalles actualizados de tu itinerario:
JA3157 - Puerto Iguazú (IGR) - 08/10/2026 08:59 - → - Buenos Aires (AEP) -
08/10/2026 10:59 ✈️`);
    expect(s.reference).toBe('OEGC6H');
    expect(s.title).toBe('JA 3157 IGR → AEP');
    expect(s.startDate).toBe('2026-10-08');
    expect(s.startTime).toBe('08:59');
    expect(s.endTime).toBe('10:59');
  });
});

describe('reserva de GOL reenviada desde Gmail (negritas con asteriscos)', () => {
  it('lee el vuelo «* G3 * * 1890 *», los aeropuertos entre asteriscos y los pasajeros con asiento', () => {
    const s = suggestFromText(`*Tu compra ha sido confirmada!*
Código de reserva EXDYMG
* GIG * RIO JANEIRO GIG, BRAZIL - * SSA * SALVADOR, BRAZIL
Jue, 15 Oct  ⋅  2hr(s).  ⋅  Sin escalas
* GOL LINHAS AEREAS, * * G3 * * 1890 * Verifique el horario de vuelo antes de la salida
*11:55*, 15 Oct *13:55*, 15 Oct
TERMINAL 2   * Tipo de tarifa: * CLASSIC
* ANA * * EJEMPLO *
Asiento: 15F
* LUIS * * EJEMPLO *
Asiento: 17F
*Tu(s) boleto(s):*
*Ana Ejemplo:* 1272307909640`);
    expect(s.title).toBe('G3 1890 GIG → SSA');
    expect(s.reference).toBe('EXDYMG');
    expect(s.startDate).toBe('2026-10-15');
    expect(s.startTime).toBe('11:55');
    expect(s.endTime).toBe('13:55');
    expect(s.notes).toContain('ANA EJEMPLO (15F)');
    expect(s.notes).toContain('LUIS EJEMPLO (17F)');
  });
});
