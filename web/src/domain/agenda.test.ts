import { describe, expect, it } from 'vitest';
import type { Booking, Trip } from '../data/types';
import { activeUntilMs, groupByDay, isInProgress, nextBooking, pastBookings, sortTrips, todayLocal, tripStatus, upcomingBookings } from './agenda';
import { toUtcMs } from '../data/localTime';

const booking = (id: string, startLocal: string, startUtcMs: number): Booking => ({
  id, tripId: 't', type: 'flight', title: id, startLocal, startTz: 'Europe/Madrid', startPlace: null, endLocal: null,
  endTz: null, endPlace: null, startUtcMs, reference: null, address: null, notes: null, changeNote: null, visibility: 'household', sharedWith: [], createdBy: 'yo', version: 1, deletedAtMs: null,
});
const trip = (id: string, startDate: string | null, endDate: string | null): Trip => ({
  id, title: id, destination: null, startDate, endDate, createdBy: 'yo', version: 1, deletedAtMs: null,
});

describe('nextBooking', () => {
  const h = 3_600_000;
  const list = [booking('mañana', '2026-10-13T09:00', 100 * h), booking('ayer', '2026-10-11T09:00', 10 * h), booking('hace-2h', '2026-10-12T09:00', 48 * h)];

  it('sin hora de llegada, una reserva sigue vigente tres horas después de salir', () => {
    expect(nextBooking(list, 50 * h)?.id).toBe('hace-2h');
    expect(nextBooking(list, 60 * h)?.id).toBe('mañana');
  });

  it('sin nada por venir no devuelve nada', () => {
    expect(nextBooking(list, 200 * h)).toBeUndefined();
    expect(nextBooking([], 0)).toBeUndefined();
  });

  it('las próximas van en orden y con límite', () => {
    expect(upcomingBookings(list, 0, 3).map((b) => b.id)).toEqual(['ayer', 'hace-2h', 'mañana']);
    expect(upcomingBookings(list, 50 * h, 1).map((b) => b.id)).toEqual(['hace-2h']);
  });
});

describe('pastBookings', () => {
  const h = 3_600_000;
  const list = [booking('mañana', '2026-10-13T09:00', 100 * h), booking('ayer', '2026-10-11T09:00', 10 * h), booking('hace-2h', '2026-10-12T09:00', 48 * h)];

  it('el histórico tiene solo las terminadas, la más reciente primero', () => {
    expect(pastBookings(list, 50 * h).map((b) => b.id)).toEqual(['ayer']);
    expect(pastBookings(list, 60 * h).map((b) => b.id)).toEqual(['hace-2h', 'ayer']);
    expect(pastBookings(list, 0)).toEqual([]);
  });

  it('ninguna está a la vez en lo que queda y en el histórico', () => {
    for (const now of [0, 50 * h, 60 * h, 200 * h]) {
      const upcoming = upcomingBookings(list, now, 99).map((b) => b.id);
      const past = pastBookings(list, now).map((b) => b.id);
      expect([...upcoming, ...past].sort()).toEqual(list.map((b) => b.id).sort());
    }
  });
});

describe('groupByDay', () => {
  it('agrupa por el día local del lugar y respeta el orden real', () => {
    const days = groupByDay([
      booking('tokio', '2026-10-13T08:55', 200),
      booking('madrid-tarde', '2026-10-12T19:00', 150),
      booking('madrid-mañana', '2026-10-12T10:05', 100),
    ]);

    expect(days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-13']);
    expect(days[0].bookings.map((b) => b.id)).toEqual(['madrid-mañana', 'madrid-tarde']);
  });
});

describe('tripStatus y sortTrips', () => {
  it('clasifica por fechas', () => {
    expect(tripStatus(trip('a', '2026-10-12', '2026-10-20'), '2026-10-15')).toBe('current');
    expect(tripStatus(trip('a', '2026-10-12', '2026-10-20'), '2026-10-12')).toBe('current');
    expect(tripStatus(trip('a', '2026-10-12', '2026-10-20'), '2026-10-21')).toBe('past');
    expect(tripStatus(trip('a', '2026-10-12', '2026-10-20'), '2026-10-01')).toBe('upcoming');
    expect(tripStatus(trip('a', '2026-10-12', null), '2026-10-13')).toBe('past');
    expect(tripStatus(trip('a', null, null), '2026-10-13')).toBe('upcoming');
  });

  it('próximos ascendentes, pasados descendentes, sin fecha al final de los próximos', () => {
    const sorted = sortTrips(
      [trip('viejo', '2025-01-01', '2025-01-05'), trip('sin-fecha', null, null), trip('lejano', '2027-01-01', null), trip('cerca', '2026-10-12', '2026-10-20'), trip('reciente', '2026-05-01', '2026-05-03')],
      '2026-09-26',
    );

    expect(sorted.active.map((t) => t.id)).toEqual(['cerca', 'lejano', 'sin-fecha']);
    expect(sorted.past.map((t) => t.id)).toEqual(['reciente', 'viejo']);
  });

  it('todayLocal usa la fecha del móvil', () => {
    expect(todayLocal(new Date(2026, 8, 5, 23, 59))).toBe('2026-09-05');
  });
});

describe('vigencia según la llegada', () => {
  const at = (local: string, tz = 'Europe/Madrid') => toUtcMs(local, tz);
  const train = {
    ...({} as Booking), id: 'ave', tripId: 't', type: 'train' as const, title: 'AVE', startLocal: '2026-10-01T14:35', startTz: 'Europe/Madrid',
    startUtcMs: at('2026-10-01T14:35'), endLocal: '2026-10-01T17:08', endTz: 'Europe/Madrid', startPlace: null, endPlace: null,
    reference: null, address: null, notes: null, changeNote: null, visibility: 'household' as const, sharedWith: [], createdBy: 'yo', version: 1, deletedAtMs: null,
  };
  const hotel = { ...train, id: 'hotel', type: 'hotel' as const, startLocal: '2026-10-02T15:00', startTz: 'America/Argentina/Buenos_Aires',
    startUtcMs: at('2026-10-02T15:00', 'America/Argentina/Buenos_Aires'), endLocal: '2026-10-06T11:00', endTz: 'America/Argentina/Buenos_Aires' };

  it('el tren deja de estar vigente una hora después de llegar y está en curso durante el trayecto', () => {
    expect(activeUntilMs(train)).toBe(at('2026-10-01T18:08'));
    expect(isInProgress(train, at('2026-10-01T15:30'))).toBe(true);
    expect(nextBooking([train], at('2026-10-01T18:00'))?.id).toBe('ave');
    expect(nextBooking([train], at('2026-10-01T18:15'))).toBeUndefined();
  });

  it('el hotel sigue vigente toda la estancia, no solo seis horas tras el check-in', () => {
    const tercerDia = at('2026-10-04T12:00', 'America/Argentina/Buenos_Aires');
    expect(nextBooking([hotel], tercerDia)?.id).toBe('hotel');
    expect(isInProgress(hotel, tercerDia)).toBe(true);
    expect(nextBooking([hotel], at('2026-10-06T12:30', 'America/Argentina/Buenos_Aires'))).toBeUndefined();
  });

  it('una llegada anterior a la salida (dato erróneo) se ignora y vale el margen de tres horas', () => {
    const bad = { ...train, endLocal: '2026-10-01T10:00' };
    expect(activeUntilMs(bad)).toBe(at('2026-10-01T17:35'));
  });
});
