import { describe, expect, it } from 'vitest';
import type { Booking, Trip } from '../data/types';
import { groupByDay, nextBooking, sortTrips, todayLocal, tripStatus, upcomingBookings } from './agenda';

const booking = (id: string, startLocal: string, startUtcMs: number): Booking => ({
  id, tripId: 't', type: 'flight', title: id, startLocal, startTz: 'Europe/Madrid', startPlace: null, endLocal: null,
  endTz: null, endPlace: null, startUtcMs, reference: null, address: null, notes: null, changeNote: null, shared: false, createdBy: 'yo', version: 1, deletedAtMs: null,
});
const trip = (id: string, startDate: string | null, endDate: string | null): Trip => ({
  id, title: id, destination: null, startDate, endDate, createdBy: 'yo', version: 1, deletedAtMs: null,
});

describe('nextBooking', () => {
  const h = 3_600_000;
  const list = [booking('mañana', '2026-10-13T09:00', 100 * h), booking('ayer', '2026-10-11T09:00', 10 * h), booking('hace-2h', '2026-10-12T09:00', 48 * h)];

  it('devuelve la primera que no ha pasado, con seis horas de margen', () => {
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
