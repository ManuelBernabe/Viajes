import { describe, expect, it } from 'vitest';
import type { Booking } from '../data/types';
import { countdown, dayPlan, groupSameTrip, passengerOf, todayView, weekPlans, withoutPassenger } from './today';
import { destinationOf, directionsUrls } from './directions';

const h = 3_600_000;
const now = Date.UTC(2026, 9, 6, 12, 0);
const b = (id: string, extra: Partial<Booking>): Booking => ({
  id, tripId: 't', type: 'flight', title: id, startLocal: '2026-10-06T13:33', startTz: 'UTC', startPlace: null, endLocal: null, endTz: null,
  endPlace: null, startUtcMs: now + 2 * h, reference: null, address: null, notes: null, changeNote: null, visibility: 'household', sharedWith: [],
  createdBy: 'yo', version: 1, deletedAtMs: null, ...extra,
});

describe('todayView', () => {
  it('lo siguiente, el hotel de esta noche y el resto del día', () => {
    const view = todayView(
      [
        b('vuelo', {}),
        b('vuelo2', {}),
        b('cena', { type: 'other', startLocal: '2026-10-06T21:00', startUtcMs: now + 9 * h }),
        b('hotel', { type: 'hotel', startLocal: '2026-10-05T15:00', endLocal: '2026-10-08T11:00', startUtcMs: now - 21 * h }),
        b('mañana', { startLocal: '2026-10-07T09:00', startUtcMs: now + 21 * h }),
      ],
      now,
      '2026-10-06',
    )!;
    expect(view.next.map((x) => x.id)).toEqual(['vuelo', 'vuelo2']);
    expect(view.tonight.map((x) => x.id)).toEqual(['hotel']);
    expect(view.today.map((x) => x.id)).toEqual(['cena']);
  });

  it('nada hoy y lo siguiente lejos: no hay panel', () => {
    expect(todayView([b('lejos', { startLocal: '2026-10-20T09:00', startUtcMs: now + 14 * 24 * h })], now, '2026-10-06')).toBeNull();
  });

  it('el vuelo de mañana no sale en «Hoy», aunque falten menos de 24 h', () => {
    const tarde = Date.UTC(2026, 9, 7, 19, 57);
    const vuelo = b('JA3157', { startLocal: '2026-10-08T08:49', startTz: 'America/Argentina/Buenos_Aires', startUtcMs: Date.UTC(2026, 9, 8, 11, 49) });
    expect(todayView([vuelo], tarde, '2026-10-07')).toBeNull();
    // Al día siguiente, sí.
    expect(todayView([vuelo], Date.UTC(2026, 9, 8, 9, 0), '2026-10-08')?.next.map((x) => x.id)).toEqual(['JA3157']);
  });

  it('el día de salida del hotel ya no se duerme allí', () => {
    const view = todayView([b('hotel', { type: 'hotel', startLocal: '2026-10-03T15:00', endLocal: '2026-10-06T11:00', startUtcMs: now - 3 * 24 * h })], now, '2026-10-06');
    expect(view?.tonight ?? []).toEqual([]);
  });
});

describe('estancia en curso', () => {
  it('el hotel en el que se está no tapa el vuelo de esta tarde', () => {
    const view = todayView(
      [b('hotel', { type: 'hotel', startLocal: '2026-10-05T15:00', endLocal: '2026-10-08T11:00', startUtcMs: now - 21 * h }), b('vuelo', {})],
      now,
      '2026-10-06',
    )!;
    expect(view.next.map((x) => x.id)).toEqual(['vuelo']);
    expect(view.tonight.map((x) => x.id)).toEqual(['hotel']);
  });
});

describe('countdown', () => {
  it('días, horas y minutos', () => {
    expect(countdown(2 * h + 15 * 60_000)).toEqual({ days: 0, hours: 2, minutes: 15 });
    expect(countdown(26 * h)).toEqual({ days: 1, hours: 2, minutes: 0 });
    expect(countdown(-5)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});

describe('destinationOf', () => {
  it('aeropuerto de salida, hotel con su dirección, estación tal cual', () => {
    expect(destinationOf({ type: 'flight', title: 'JA 3140', startPlace: 'aep', address: null })).toBe('AEP Airport');
    expect(destinationOf({ type: 'hotel', title: 'Hotel', startPlace: 'Hotel Panamericano', address: 'Carlos Pellegrini 551, Buenos Aires' })).toBe(
      'Hotel Panamericano, Carlos Pellegrini 551, Buenos Aires',
    );
    expect(destinationOf({ type: 'train', title: 'AVE', startPlace: 'Madrid Chamartín', address: null })).toBe('Madrid Chamartín');
    expect(destinationOf({ type: 'ticket', title: 'Museo', startPlace: null, address: null })).toBeNull();
    expect(directionsUrls('AEP Airport').google).toBe('https://www.google.com/maps/dir/?api=1&destination=AEP%20Airport');
  });
});

describe('agenda por días', () => {
  it('lo de mañana: lo que empieza, la salida del hotel y la noche', () => {
    const plan = dayPlan(
      [
        b('vuelo', { startLocal: '2026-10-07T08:49', startUtcMs: now + 20 * h }),
        b('viejo', { type: 'hotel', startLocal: '2026-10-04T15:00', endLocal: '2026-10-07T10:00', startUtcMs: now - 48 * h }),
        b('nuevo', { type: 'hotel', startLocal: '2026-10-07T15:00', endLocal: '2026-10-09T11:00', startUtcMs: now + 27 * h }),
      ],
      '2026-10-07',
    );
    expect(plan.starting.map((x) => x.id)).toEqual(['vuelo', 'nuevo']);
    expect(plan.checkOuts.map((x) => x.id)).toEqual(['viejo']);
    expect(plan.night?.id).toBe('nuevo');
    expect(weekPlans([b('x', { startLocal: '2026-10-09T10:00' })], '2026-10-06', 7).map((d) => d.date)).toEqual(['2026-10-09']);
  });

  it('el mismo vuelo de dos pasajeros es una sola tarjeta', () => {
    const groups = groupSameTrip([b('p', { title: 'JA 3157 IGR → AEP · Paco' }), b('m', { title: 'JA 3157 IGR → AEP · Manuel' }), b('c', { title: 'Cena', type: 'other' })]);
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([['p', 'm'], ['c']]);
    expect(passengerOf('JA 3157 IGR → AEP · Manuel')).toBe('Manuel');
    expect(passengerOf('JA 3157 IGR → AEP')).toBeNull();
    expect(withoutPassenger('JA 3157 IGR → AEP · Paco')).toBe('JA 3157 IGR → AEP');
  });
});
