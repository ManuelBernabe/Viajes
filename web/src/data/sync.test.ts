import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getMeta, openDb, resetDb } from './db';
import { pending } from './outbox';
import { addAttachment, getBlob, hiddenBookings, setBookingHidden, listAttachments, listBookings, listDocuments, listTrips, saveBooking, saveDocument, saveTrip } from './repo';
import { pull, syncAll, uploads, VERSION_KEY } from './sync';
import type { Attachment, Booking, Op, SyncResponse, TravelDocument, Trip } from './types';

beforeEach(() => resetDb());

const trip = (id: string, extra: Partial<Trip> = {}): Trip => ({
  id, title: id, destination: null, startDate: null, endDate: null, createdBy: 'yo', version: 1, deletedAtMs: null, ...extra,
});
const booking = (id: string, tripId: string, extra: Partial<Booking> = {}): Booking => ({
  id, tripId, type: 'flight', title: id, startLocal: '2026-10-12T10:05', startTz: 'Europe/Madrid', startPlace: null,
  endLocal: null, endTz: null, endPlace: null, startUtcMs: 1, reference: null, address: null, notes: null, changeNote: null, visibility: 'household', sharedWith: [],
  createdBy: 'yo', version: 1, deletedAtMs: null, ...extra,
});
const attachment = (id: string, bookingId: string, extra: Partial<Attachment> = {}): Attachment => ({
  id, bookingId, name: 'f.pdf', mime: 'application/pdf', size: 1, qrText: null, uploaded: true, createdBy: 'yo', version: 1, deletedAtMs: null, ...extra,
});
const response = (extra: Partial<SyncResponse>): SyncResponse => ({ version: 10, tripIds: [], trips: [], bookings: [], attachments: [], ...extra });

describe('pull', () => {
  it('aplica altas y guarda la versión para la siguiente vez', async () => {
    const asked: number[] = [];
    await pull({
      fetchSync: async (since) => {
        asked.push(since);
        return response({ version: 7, tripIds: ['t1'], trips: [trip('t1')], bookings: [booking('b1', 't1')], attachments: [attachment('a1', 'b1')] });
      },
    });

    expect(asked).toEqual([0]);
    expect((await listTrips()).map((t) => t.id)).toEqual(['t1']);
    expect((await listBookings('t1')).map((b) => b.id)).toEqual(['b1']);
    expect((await listAttachments('b1')).map((a) => a.id)).toEqual(['a1']);
    expect(await getMeta(VERSION_KEY)).toBe(7);

    await pull({ fetchSync: async (since) => { asked.push(since); return response({ version: 7, tripIds: ['t1'] }); } });
    expect(asked).toEqual([0, 7]);
  });

  it('una fila borrada desaparece con todo lo que cuelga de ella, ficheros incluidos', async () => {
    const database = await openDb();
    await database.put('trips', trip('t1'));
    await database.put('bookings', booking('b1', 't1'));
    await database.put('attachments', attachment('a1', 'b1'));
    await database.put('blobs', { id: 'a1', mime: 'application/pdf', size: 1, bytes: new Uint8Array([1]).buffer });

    await pull({ fetchSync: async () => response({ tripIds: [], trips: [trip('t1', { deletedAtMs: 5 })] }) });

    expect(await listTrips()).toEqual([]);
    expect(await listBookings('t1')).toEqual([]);
    expect(await listAttachments('b1')).toEqual([]);
    expect(await getBlob('a1')).toBeUndefined();
  });

  it('purga un viaje que ya no está en la lista aunque no llegue ninguna fila suya', async () => {
    const database = await openDb();
    await database.put('trips', trip('retirado'));
    await database.put('trips', trip('mio'));

    await pull({ fetchSync: async () => response({ tripIds: ['mio'] }) });

    expect((await listTrips()).map((t) => t.id)).toEqual(['mio']);
  });

  it('no purga un viaje recién creado en el móvil que aún espera en la cola, ni sus reservas', async () => {
    const nuevo = await saveTrip({ title: 'Lisboa', destination: 'Lisboa', startDate: '2026-12-12', endDate: '2026-12-12' }, 'yo');
    const { id: _sinId, ...cuerpo } = booking('x', nuevo.id);
    void _sinId;
    await saveBooking(cuerpo, 'yo', 'b-lisboa');

    // Una bajada que salió antes de crear el viaje: su lista no lo trae.
    await pull({ fetchSync: async () => response({ tripIds: [], bookingIds: [] }) });

    expect((await listTrips()).map((t) => t.id)).toEqual([nuevo.id]);
    expect((await listBookings(nuevo.id)).map((b) => b.id)).toEqual(['b-lisboa']);
  });

  it('una edición del servidor pisa la copia local', async () => {
    await saveTrip({ title: 'local', destination: null, startDate: null, endDate: null }, 'yo', 't1');

    await pull({ fetchSync: async () => response({ tripIds: ['t1'], trips: [trip('t1', { title: 'servidor', version: 9 })] }) });

    expect((await listTrips())[0]).toMatchObject({ title: 'servidor', version: 9 });
  });
});

describe('uploads', () => {
  it('sube los ficheros pendientes y los marca subidos', async () => {
    const t = await saveTrip({ title: 'Japón', destination: null, startDate: null, endDate: null }, 'yo');
    const b = await saveBooking({ tripId: t.id, type: 'flight', title: 'Vuelo', startLocal: '2026-10-12T10:05', startTz: 'Europe/Madrid', startPlace: null, endLocal: null, endTz: null, endPlace: null, reference: null, address: null, notes: null, changeNote: null }, 'yo');
    const a = await addAttachment({ bookingId: b.id, name: 'f.pdf', mime: 'application/pdf', size: 1, qrText: null }, new Uint8Array([1]).buffer, 'yo');
    const sent: string[] = [];

    const result = await uploads({ upload: async (att) => { sent.push(att.id); return 'ok'; } });

    expect(sent).toEqual([a.id]);
    expect(result).toEqual({ uploaded: 1, incomplete: false });
    expect((await listAttachments(b.id))[0].uploaded).toBe(true);
    expect(await getBlob(a.id)).toBeDefined();
  });

  it('sin red se para y queda incompleto', async () => {
    const t = await saveTrip({ title: 'Japón', destination: null, startDate: null, endDate: null }, 'yo');
    const b = await saveBooking({ tripId: t.id, type: 'flight', title: 'Vuelo', startLocal: '2026-10-12T10:05', startTz: 'Europe/Madrid', startPlace: null, endLocal: null, endTz: null, endPlace: null, reference: null, address: null, notes: null, changeNote: null }, 'yo');
    await addAttachment({ bookingId: b.id, name: 'f.pdf', mime: 'application/pdf', size: 1, qrText: null }, new Uint8Array([1]).buffer, 'yo');

    const result = await uploads({ upload: async () => 'retry' });

    expect(result).toEqual({ uploaded: 0, incomplete: true });
    expect((await listAttachments(b.id))[0].uploaded).toBe(false);
  });
});

describe('syncAll', () => {
  it('envía la cola, sube ficheros y baja cambios, en ese orden', async () => {
    const t = await saveTrip({ title: 'Japón', destination: null, startDate: null, endDate: null }, 'yo');
    const b = await saveBooking({ tripId: t.id, type: 'flight', title: 'Vuelo', startLocal: '2026-10-12T10:05', startTz: 'Europe/Madrid', startPlace: null, endLocal: null, endTz: null, endPlace: null, reference: null, address: null, notes: null, changeNote: null }, 'yo');
    await addAttachment({ bookingId: b.id, name: 'f.pdf', mime: 'application/pdf', size: 1, qrText: null }, new Uint8Array([1]).buffer, 'yo');
    const log: string[] = [];

    const outcome = await syncAll({
      send: async (op: Op) => { log.push(op.kind); return 'ok'; },
      upload: async () => { log.push('upload'); return 'ok'; },
      fetchSync: async () => { log.push('pull'); return response({ version: 3, tripIds: [t.id], trips: [trip(t.id, { title: 'Japón', version: 3 })] }); },
    });

    expect(log).toEqual(['put-trip', 'put-booking', 'put-attachment', 'upload', 'pull']);
    expect(outcome).toMatchObject({ pushed: 3, uploaded: 1, pulled: 1, incomplete: false });
    expect(await pending()).toEqual([]);
  });

  it('si la cola no se vacía no se suben ficheros, pero sí se intenta bajar', async () => {
    const t = await saveTrip({ title: 'Japón', destination: null, startDate: null, endDate: null }, 'yo');
    const log: string[] = [];

    const outcome = await syncAll({
      send: async () => 'retry',
      upload: async () => { log.push('upload'); return 'ok'; },
      fetchSync: async () => { log.push('pull'); return response({ version: 1, tripIds: [t.id] }); },
    });

    expect(log).toEqual(['pull']);
    expect(outcome.incomplete).toBe(true);
    expect((await pending()).length).toBe(1);
  });

  it('sin red la bajada falla sin romper nada', async () => {
    const outcome = await syncAll({
      send: async () => 'ok',
      upload: async () => 'ok',
      fetchSync: async () => { throw new TypeError('Failed to fetch'); },
    });

    expect(outcome.incomplete).toBe(true);
  });
});

describe('bandeja de entrada', () => {
  const inboxItem = (id: string, status: 'pending' | 'confirmed' | 'discarded' = 'pending') => ({
    id, fromAddress: 'a@b.c', subject: id, receivedMs: 1, suggestedType: null, suggestedTitle: null, suggestedStartLocal: null,
    suggestedStartTz: null, suggestedStartPlace: null, suggestedEndLocal: null, suggestedEndTz: null, suggestedEndPlace: null,
    suggestedReference: null, suggestedAddress: null, bodyText: null, status, bookingId: null, attachments: [], version: 1, deletedAtMs: null,
  });

  it('solo conserva los borradores pendientes', async () => {
    await pull({ fetchSync: async () => response({ inbox: [inboxItem('p'), inboxItem('c', 'confirmed')] }) });
    const database = await openDb();
    expect((await database.getAllKeys('inbox'))).toEqual(['p']);

    await pull({ fetchSync: async () => response({ inbox: [inboxItem('p', 'discarded')] }) });
    expect(await database.getAllKeys('inbox')).toEqual([]);
  });

  it('un servidor sin bandeja no rompe nada', async () => {
    await pull({ fetchSync: async () => ({ version: 1, tripIds: [], trips: [], bookings: [], attachments: [] }) });
    expect(await (await openDb()).getAllKeys('inbox')).toEqual([]);
  });
});

describe('reservas cuya visibilidad se ha retirado', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('purga las reservas locales que ya no están en la lista de visibles, salvo las que esperan en la cola', async () => {
    const database = await openDb();
    await database.put('trips', trip('t1'));
    await database.put('bookings', booking('b-vieja', 't1'));
    await database.put('attachments', attachment('a1', 'b-vieja'));
    await database.put('blobs', { id: 'a1', mime: 'application/pdf', size: 1, bytes: new Uint8Array([1]).buffer });
    // Una reserva creada en el móvil y aún sin enviar: el servidor no la conoce, pero no debe borrarse.
    const { id: _sinId, ...cuerpo } = booking('x', 't1');
    void _sinId;
    const local = await saveBooking(cuerpo, 'yo', 'b-nueva');

    await pull({ fetchSync: async () => response({ tripIds: ['t1'], bookingIds: ['b-otra'] }) });

    expect((await listBookings('t1')).map((b) => b.id)).toEqual([local.id]);
    expect(await listAttachments('b-vieja')).toEqual([]);
    expect(await getBlob('a1')).toBeUndefined();
    expect((await pending()).some((op) => op.id === 'b-nueva')).toBe(true);
  });

  it('sin la lista (servidor antiguo) no purga nada', async () => {
    const database = await openDb();
    await database.put('trips', trip('t1'));
    await database.put('bookings', booking('b1', 't1'));

    await pull({ fetchSync: async () => response({ tripIds: ['t1'] }) });

    expect((await listBookings('t1')).map((b) => b.id)).toEqual(['b1']);
  });
});

describe('documentos de viaje', () => {
  const document = (id: string, extra: Partial<TravelDocument> = {}): TravelDocument => ({
    id, person: 'Paco', kind: 'passport', number: null, country: null, issuedDate: null, expiryDate: '2030-01-01', notes: null,
    visibility: 'household', createdBy: 'yo', version: 1, deletedAtMs: null, ...extra,
  });

  it('guarda los documentos y sus fotos; purga los que ya no se ven, salvo los que esperan en la cola', async () => {
    await pull({
      fetchSync: async () =>
        response({
          documents: [document('pasaporte'), document('seguro', { kind: 'insurance' })],
          documentIds: ['pasaporte', 'seguro'],
          attachments: [attachment('foto', 'pasaporte', { mime: 'image/jpeg' })],
        }),
    });
    expect((await listDocuments()).map((d) => d.id).sort()).toEqual(['pasaporte', 'seguro']);
    expect((await listAttachments('pasaporte')).map((a) => a.id)).toEqual(['foto']);

    const local = await saveDocument({ person: 'Bea', kind: 'id', number: null, country: null, issuedDate: null, expiryDate: null, notes: null, visibility: 'household' }, 'yo');
    // El seguro pasa a privado de otra persona: deja de estar en la lista.
    await pull({ fetchSync: async () => response({ documentIds: ['pasaporte'] }) });

    expect((await listDocuments()).map((d) => d.id).sort()).toEqual([local.id, 'pasaporte'].sort());
    expect((await listAttachments('pasaporte')).map((a) => a.id)).toEqual(['foto']);
  });
});

describe('reservas ocultas', () => {
  it('toma la lista del servidor, con lo que aún espera en la cola encima', async () => {
    await pull({ fetchSync: async () => response({ hiddenBookingIds: ['a', 'b'] }) });
    expect([...(await hiddenBookings())].sort()).toEqual(['a', 'b']);

    await setBookingHidden('b', false);
    await setBookingHidden('c', true);
    // El servidor aún no se ha enterado: lo del móvil manda.
    await pull({ fetchSync: async () => response({ hiddenBookingIds: ['a', 'b'] }) });
    expect([...(await hiddenBookings())].sort()).toEqual(['a', 'c']);
  });
});
