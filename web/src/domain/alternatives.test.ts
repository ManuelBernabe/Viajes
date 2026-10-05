import { describe, expect, it } from 'vitest';
import { airlineCode, flightRoute, flightSearches, shiftDate, trainRoute } from './alternatives';

describe('flightRoute', () => {
  it('saca los aeropuertos de los lugares de la reserva', () => {
    expect(flightRoute({ startPlace: 'aep', endPlace: 'IGR', title: 'Vuelo', startLocal: '2026-10-06T13:33' })).toEqual({ from: 'AEP', to: 'IGR', date: '2026-10-06' });
  });

  it('si los lugares no son códigos, los busca en el título', () => {
    expect(flightRoute({ startPlace: 'Aeroparque', endPlace: null, title: 'JA 3140 AEP → IGR', startLocal: '2026-10-06T13:33' })).toEqual({ from: 'AEP', to: 'IGR', date: '2026-10-06' });
    expect(flightRoute({ startPlace: null, endPlace: null, title: 'IB 3170 MAD-LHR', startLocal: '2026-10-12T10:05' })?.to).toBe('LHR');
  });

  it('sin códigos no hay trayecto', () => {
    expect(flightRoute({ startPlace: 'Madrid', endPlace: 'Londres', title: 'Vuelo a Londres', startLocal: '2026-10-12T10:05' })).toBeNull();
  });
});

describe('trainRoute y fechas', () => {
  it('el tren usa las estaciones tal cual', () => {
    expect(trainRoute({ startPlace: 'Alicante-Terminal', endPlace: 'Madrid Chamartín', startLocal: '2026-10-01T14:35' })).toEqual({ from: 'Alicante-Terminal', to: 'Madrid Chamartín', date: '2026-10-01' });
    expect(trainRoute({ startPlace: 'Alicante', endPlace: null, startLocal: '2026-10-01T14:35' })).toBeNull();
  });

  it('cambia de día, de mes y de año', () => {
    expect(shiftDate('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('flightSearches', () => {
  it('primero solo directos y después con escalas, en el idioma de la app', () => {
    const { direct, withStops } = flightSearches({ from: 'AEP', to: 'IGR', date: '2026-10-06' }, 'es');
    expect(direct[0].url).toBe('https://www.google.com/travel/flights?q=Flights%20from%20AEP%20to%20IGR%20on%202026-10-06%20one%20way%20nonstop&hl=es');
    expect(direct[1].url).toBe('https://www.skyscanner.es/transport/flights/aep/igr/261006/?adultsv2=1&rtn=0&preferdirects=true&stops=!oneStop,!twoPlusStops');
    expect(withStops[0].url).not.toContain('nonstop');
    expect(withStops[1].url).toContain('preferdirects=false');
  });
});

describe('airlineCode', () => {
  it('saca el código de la aerolínea del título', () => {
    expect(airlineCode('JA 3140 AEP → IGR')).toBe('JA');
    expect(airlineCode('G31234 IGR → GIG')).toBe('G3');
    expect(airlineCode('AVE 05143 Alicante → Madrid')).toBeNull();
  });
});
