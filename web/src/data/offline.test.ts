import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, resetDb } from './db';
import { downloadMissing, dropBlobs, offlineStatus, storedBlobIds, wantedOffline } from './offline';
import type { Attachment, Booking, Trip } from './types';

beforeEach(() => resetDb());

const attachment = (id: string, uploaded = true): Attachment => ({
  id, bookingId: 'b1', name: 'f.pdf', mime: 'application/pdf', size: 1, qrText: null, uploaded, createdBy: 'yo', version: 1, deletedAtMs: null,
});

describe('wantedOffline', () => {
  const trip = (startDate: string | null, endDate: string | null): Pick<Trip, 'startDate' | 'endDate'> => ({ startDate, endDate });

  it('el interruptor manda', () => {
    expect(wantedOffline(trip('2027-01-01', null), '2026-09-26', true)).toBe(true);
    expect(wantedOffline(trip('2026-09-27', null), '2026-09-26', false)).toBe(false);
  });

  it('sin interruptor: los que empiezan en 7 días o ya están en marcha', () => {
    expect(wantedOffline(trip('2026-10-03', '2026-10-10'), '2026-09-26', undefined)).toBe(true);
    expect(wantedOffline(trip('2026-10-04', '2026-10-10'), '2026-09-26', undefined)).toBe(false);
    expect(wantedOffline(trip('2026-09-20', '2026-09-28'), '2026-09-26', undefined)).toBe(true);
    expect(wantedOffline(trip('2026-09-20', '2026-09-25'), '2026-09-26', undefined)).toBe(false);
    expect(wantedOffline(trip(null, null), '2026-09-26', undefined)).toBe(false);
  });
});

describe('offlineStatus', () => {
  it('cuenta lo que falta y lo que aún no ha subido', () => {
    const status = offlineStatus([attachment('a'), attachment('b'), attachment('c', false)], new Set(['a', 'c']));
    expect(status).toEqual({ total: 3, missing: 1, pendingUpload: 1 });
  });
});

describe('downloadMissing y dropBlobs', () => {
  async function seed() {
    const database = await openDb();
    const trip: Trip = { id: 't1', title: 't', destination: null, startDate: null, endDate: null, createdBy: 'yo', version: 1, deletedAtMs: null };
    const booking: Booking = { id: 'b1', tripId: 't1', type: 'flight', title: 'v', startLocal: '2026-10-12T10:05', startTz: 'Europe/Madrid', startPlace: null, endLocal: null, endTz: null, endPlace: null, startUtcMs: 1, reference: null, address: null, notes: null, createdBy: 'yo', version: 1, deletedAtMs: null };
    await database.put('trips', trip);
    await database.put('bookings', booking);
    await database.put('attachments', attachment('ya'));
    await database.put('attachments', attachment('falta'));
    await database.put('attachments', attachment('local', false));
    await database.put('blobs', { id: 'ya', mime: 'application/pdf', size: 1, bytes: new Uint8Array([1]).buffer });
  }

  it('baja solo lo que falta y está en el servidor', async () => {
    await seed();
    const asked: string[] = [];

    const result = await downloadMissing('t1', async (a) => { asked.push(a.id); return new Uint8Array([9, 9]).buffer; });

    expect(asked).toEqual(['falta']);
    expect(result).toEqual({ downloaded: 1, failed: false });
    expect(await storedBlobIds()).toEqual(new Set(['ya', 'falta']));
  });

  it('sin red se para y lo dice', async () => {
    await seed();

    const result = await downloadMissing('t1', async () => { throw new TypeError('sin red'); });

    expect(result).toEqual({ downloaded: 0, failed: true });
  });

  it('quitar del móvil conserva lo que aún no ha subido', async () => {
    await seed();
    const database = await openDb();
    await database.put('blobs', { id: 'local', mime: 'application/pdf', size: 1, bytes: new Uint8Array([1]).buffer });

    const removed = await dropBlobs('t1');

    expect(removed).toBe(1);
    expect(await storedBlobIds()).toEqual(new Set(['local']));
  });
});
