import { describe, expect, it } from 'vitest';
import type { Booking } from '../data/types';
import { allConnections, connects, groupConnections, samePlace, withConnections } from './connections';
import { groupSameTrip } from './today';

const h = 3_600_000;
const base = Date.UTC(2026, 10, 2, 10, 0);
const local = (ms: number) => new Date(ms).toISOString().slice(0, 16);
/** Un vuelo en UTC: sale a `dep` horas de `base` y dura `dur` horas. */
const f = (id: string, from: string, to: string, dep: number, dur: number, extra: Partial<Booking> = {}): Booking => ({
  id,
  tripId: 't',
  type: 'flight',
  title: `${id} ${from} → ${to}`,
  startLocal: local(base + dep * h),
  startTz: 'UTC',
  startPlace: from,
  endLocal: local(base + (dep + dur) * h),
  endTz: 'UTC',
  endPlace: to,
  startUtcMs: base + dep * h,
  reference: null,
  address: null,
  notes: null,
  changeNote: null,
  visibility: 'household',
  sharedWith: [],
  createdBy: 'yo',
  version: 1,
  deletedAtMs: null,
  ...extra,
});
const ids = (chains: Booking[][][]) => chains.map((c) => c.map((leg) => leg.map((b) => b.id).join('+')).join(' > '));

describe('samePlace', () => {
  it('reconoce el aeropuerto por su código o por el nombre', () => {
    expect(samePlace('São Paulo (GRU)', 'GRU')).toBe(true);
    expect(samePlace('Madrid', 'Madrid (MAD)')).toBe(true);
    expect(samePlace('GRU', 'MAD')).toBe(false);
  });
});

describe('groupConnections', () => {
  it('junta AEP → GRU y GRU → MAD en un viaje con una escala', () => {
    const legs = groupSameTrip([f('G3', 'AEP', 'GRU', 0, 3), f('LA', 'GRU', 'MAD', 5, 10), f('otro', 'MAD', 'ALC', 40, 1)]);
    expect(ids(groupConnections(legs))).toEqual(['G3 > LA', 'otro']);
  });

  it('con el mismo localizador vale una escala larga; con billetes sueltos, no', () => {
    const loose = [f('a', 'AEP', 'GRU', 0, 3), f('b', 'GRU', 'MAD', 18, 10)];
    expect(ids(groupConnections(groupSameTrip(loose)))).toEqual(['a', 'b']);
    const ticketed = [f('a', 'AEP', 'GRU', 0, 3, { reference: 'ABC123' }), f('b', 'GRU', 'MAD', 18, 10, { reference: 'abc123' })];
    expect(ids(groupConnections(groupSameTrip(ticketed)))).toEqual(['a > b']);
  });

  it('no junta si sale de otro sitio, va hacia atrás o es la vuelta', () => {
    expect(connects([f('a', 'AEP', 'GRU', 0, 3)], [f('b', 'GIG', 'MAD', 5, 10)])).toBe(false);
    expect(connects([f('a', 'AEP', 'GRU', 0, 3)], [f('b', 'GRU', 'MAD', 2, 10)])).toBe(false);
    expect(ids(groupConnections(groupSameTrip([f('ida', 'ALC', 'MAD', 0, 1), f('vuelta', 'MAD', 'ALC', 8, 1)])))).toEqual(['ida', 'vuelta']);
  });

  it('si se duerme en la ciudad de la escala, es una parada', () => {
    const legs = groupSameTrip([f('a', 'AEP', 'GRU', 0, 3), f('b', 'GRU', 'MAD', 11, 10)]);
    const hotel = f('hotel', 'São Paulo', 'São Paulo', 4, 20, { type: 'hotel' });
    expect(ids(groupConnections(legs, [hotel]))).toEqual(['a', 'b']);
    expect(ids(groupConnections(legs))).toEqual(['a > b']);
  });

  it('con varios pasajeros, cada tramo lleva a todos; si cambian las personas, no se junta', () => {
    const all = [
      f('a1', 'AEP', 'GRU', 0, 3, { title: 'G3 AEP → GRU · Paco' }),
      f('a2', 'AEP', 'GRU', 0, 3, { title: 'G3 AEP → GRU · Ana' }),
      f('b1', 'GRU', 'MAD', 5, 10, { title: 'LA GRU → MAD · Paco' }),
      f('b2', 'GRU', 'MAD', 5, 10, { title: 'LA GRU → MAD · Ana' }),
      f('c1', 'MAD', 'ALC', 16, 1, { title: 'IB MAD → ALC · Paco' }),
    ];
    expect(ids(allConnections(all))).toEqual(['a1+a2 > b1+b2']);
  });
});

describe('withConnections', () => {
  it('cambia cada tramo por su viaje entero y no repite el otro tramo', () => {
    const all = [f('a', 'AEP', 'GRU', 0, 3), f('b', 'GRU', 'MAD', 5, 10), f('cena', 'x', 'y', 7, 1, { type: 'other' })];
    expect(ids(withConnections(groupSameTrip([all[1], all[2]]), all))).toEqual(['a > b', 'cena']);
    expect(ids(withConnections(groupSameTrip([all[1], all[2]]), all, new Set(['a'])))).toEqual(['cena']);
  });
});
