import { describe, expect, it } from 'vitest';
import type { Booking } from '../data/types';
import { applyChanges, describeChanges, diffBooking, findExistingBooking, repairedArrival, consistencyFixes, type Proposal } from './changes';

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'b1', tripId: 't1', type: 'train', title: 'AVE 05143 Alicante → Chamartín', startLocal: '2026-10-01T14:35', startTz: 'Europe/Madrid',
  startPlace: 'Alicante-Termin', endLocal: '2026-10-01T17:08', endTz: 'Europe/Madrid', endPlace: 'Chamartin', startUtcMs: 1,
  reference: 'C3BMDV', address: null, notes: 'Coche 8 · Plazas 6B, 6A', changeNote: null, visibility: 'household', sharedWith: [], createdBy: 'yo', version: 1, deletedAtMs: null, ...overrides,
});

const proposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  type: 'train', title: 'AVE 05143 Alicante-Termin → Chamartin', startLocal: '2026-10-01T16:10', startTz: null, startPlace: 'Alicante-Termin',
  endLocal: '2026-10-01T18:45', endTz: null, endPlace: 'Chamartin', reference: 'C3BMDV', ...overrides,
});

describe('findExistingBooking', () => {
  it('encuentra por localizador, sin importar mayúsculas', () => {
    expect(findExistingBooking([booking()], proposal({ reference: 'c3bmdv' }))?.id).toBe('b1');
  });

  it('sin localizador, por tipo, fecha y origen', () => {
    expect(findExistingBooking([booking()], proposal({ reference: null, startPlace: 'ALICANTE-TERMIN', endPlace: null }))?.id).toBe('b1');
    // Misma ruta y un día de diferencia: es la misma reserva movida de día.
    expect(findExistingBooking([booking()], proposal({ reference: null, startLocal: '2026-10-02T14:35' }))?.id).toBe('b1');
    expect(findExistingBooking([booking()], proposal({ reference: 'OTRO01', startPlace: 'Valencia', endPlace: 'Sevilla' }))).toBeUndefined();
  });
});

describe('diffBooking y describeChanges', () => {
  it('detecta el cambio de horario', () => {
    const changes = diffBooking(booking(), proposal());

    expect(changes.map((c) => c.field)).toEqual(['startLocal', 'endLocal']);
    expect(changes[0].before).toMatch(/14:35/);
    expect(changes[0].after).toMatch(/16:10/);
    expect(describeChanges(changes, new Date(2026, 8, 27))).toBe(
      'Modificada el 27/09 según correo:\n• Salida: jue, 1 oct 14:35 → 16:10\n• Llegada: jue, 1 oct 17:08 → 18:45',
    );
  });

  it('sin diferencias no hay cambios', () => {
    expect(diffBooking(booking(), proposal({ startLocal: '2026-10-01T14:35', endLocal: '2026-10-01T17:08' }))).toEqual([]);
  });

  it('ignora lo que el correo no trae', () => {
    expect(diffBooking(booking(), proposal({ startLocal: null, endLocal: null, startPlace: null, endPlace: null }))).toEqual([]);
  });
});

describe('applyChanges', () => {
  it('aplica solo los campos cambiados, conserva el resto y pone el aviso', () => {
    const existing = booking();
    const changes = diffBooking(existing, proposal());
    const body = applyChanges(existing, proposal(), changes, new Date(2026, 8, 27));

    expect(body).toMatchObject({
      tripId: 't1',
      title: 'AVE 05143 Alicante → Chamartín',
      startLocal: '2026-10-01T16:10',
      startTz: 'Europe/Madrid',
      endLocal: '2026-10-01T18:45',
      notes: 'Coche 8 · Plazas 6B, 6A',
      reference: 'C3BMDV',
    });
    expect(body.changeNote).toMatch(/^Modificada el 27\/09/);
  });
});

describe('otros cambios', () => {
  it('detecta cambio de plazas, de localizador y salida a otro día con zona', () => {
    const changes = diffBooking(
      booking(),
      proposal({ startLocal: '2026-10-02T09:00', startTz: 'Europe/Lisbon', endLocal: '2026-10-01T17:08', reference: 'NUEVO1', notes: 'Coche 3 · Plazas 1A, 1B' }),
    );

    expect(changes.map((c) => `${c.label}: ${c.before} → ${c.after}`)).toEqual([
      'Salida: jue, 1 oct 14:35 (Madrid) → vie, 2 oct 09:00 (Lisbon)',
      // El correo traía la llegada de antes: se mueve con la salida (el tren dura 2 h 33 min).
      'Llegada: jue, 1 oct 17:08 (Madrid) → vie, 2 oct 12:33 (Madrid)',
      'Localizador: C3BMDV → NUEVO1',
      'Notas: Coche 8 · Plazas 6B, 6A → Coche 3 · Plazas 1A, 1B',
    ]);
    const body = applyChanges(booking(), proposal({ startLocal: '2026-10-02T09:00', startTz: 'Europe/Lisbon', endLocal: '2026-10-01T17:08', reference: 'NUEVO1', notes: 'Coche 3 · Plazas 1A, 1B' }), changes, new Date(2026, 8, 27));
    expect(body).toMatchObject({ startLocal: '2026-10-02T09:00', startTz: 'Europe/Lisbon', endLocal: '2026-10-02T12:33', reference: 'NUEVO1', notes: 'Coche 3 · Plazas 1A, 1B' });
  });
});

describe('segundo cambio con localizador nuevo y fecha movida', () => {
  it('encuentra la reserva por tipo y ruta aunque cambien localizador y día', () => {
    const changed = booking({ reference: 'NUEVO1', startLocal: '2026-10-02T09:00', endLocal: '2026-10-02T11:30' });
    const secondEmail = proposal({ reference: 'OTRO22', startLocal: '2026-10-03T16:10', endLocal: '2026-10-03T18:45' });

    expect(findExistingBooking([changed], secondEmail)?.id).toBe('b1');
    expect(findExistingBooking([changed], proposal({ reference: 'OTRO22', startLocal: '2026-10-20T16:10' }))).toBeUndefined();
    expect(findExistingBooking([changed], proposal({ reference: 'OTRO22', startLocal: '2026-10-03T16:10', startPlace: 'Valencia', endPlace: 'Chamartin' }))).toBeUndefined();
  });

  it('con varias candidatas elige la de fecha más cercana', () => {
    const near = booking({ id: 'near', reference: 'A', startLocal: '2026-10-03T08:00' });
    const far = booking({ id: 'far', reference: 'B', startLocal: '2026-10-08T08:00' });

    expect(findExistingBooking([far, near], proposal({ reference: 'X', startLocal: '2026-10-04T16:10' }))?.id).toBe('near');
  });
});

describe('la llegada se mueve con la salida', () => {
  it('si el correo solo cambia la salida, la llegada se mueve lo mismo (el vuelo dura lo mismo)', () => {
    const vuelo = booking({
      type: 'flight', title: 'JA3157 IGR → AEP', startLocal: '2026-10-08T08:49', startTz: 'America/Argentina/Buenos_Aires', startPlace: 'IGR',
      endLocal: '2026-10-08T10:40', endTz: 'America/Argentina/Buenos_Aires', endPlace: 'AEP', reference: 'OEGC6H',
    });
    const cambio = proposal({ type: 'flight', startLocal: '2026-10-08T13:04', startPlace: 'IGR', endLocal: null, endPlace: 'AEP', reference: 'OEGC6H' });
    const changes = diffBooking(vuelo, cambio);
    expect(changes.map((c) => c.field)).toEqual(['startLocal', 'endLocal']);
    expect(changes[1].after).toBe('14:55');
    const body = applyChanges(vuelo, cambio, changes, new Date(2026, 9, 8));
    expect(body.startLocal).toBe('2026-10-08T13:04');
    expect(body.endLocal).toBe('2026-10-08T14:55');

    // Si el correo trae la llegada de antes (copiada), también se mueve.
    expect(diffBooking(vuelo, { ...cambio, endLocal: '2026-10-08T10:40' })[1].value).toBe('2026-10-08T14:55');
    // Si trae una llegada nueva, manda la del correo.
    expect(applyChanges(vuelo, { ...cambio, endLocal: '2026-10-08T15:10' }, diffBooking(vuelo, { ...cambio, endLocal: '2026-10-08T15:10' }), new Date()).endLocal).toBe('2026-10-08T15:10');
  });
});

describe('reservas ya guardadas con la llegada antes de la salida', () => {
  it('propone la llegada movida según la hora de salida anterior del aviso', () => {
    const roto = booking({
      type: 'flight', startLocal: '2026-10-08T13:04', startTz: 'America/Argentina/Buenos_Aires', endLocal: '2026-10-08T10:40',
      endTz: 'America/Argentina/Buenos_Aires', changeNote: 'Modificada el 08/10 según correo:\n• Salida: jue, 8 oct 08:49 → 13:04',
    });
    expect(repairedArrival(roto)).toBe('2026-10-08T14:55');
    expect(repairedArrival(booking())).toBeNull();
    expect(repairedArrival({ ...roto, changeNote: null })).toBeNull();
  });
});

describe('datos que no cuadran', () => {
  const manuel = booking({
    type: 'flight', title: 'JA3157 IGR → AEP', startLocal: '2026-10-08T13:04', startTz: 'America/Argentina/Buenos_Aires', startPlace: 'AEP',
    endLocal: '2026-10-08T10:49', endTz: 'America/Argentina/Buenos_Aires', endPlace: 'IGR', changeNote: null, startUtcMs: Date.UTC(2026, 9, 8, 16, 4),
  });

  it('origen y destino al revés y llegada antes de la salida, con la llegada del estado del vuelo', () => {
    const fixes = consistencyFixes(manuel, { origin: 'IGR', destination: 'AEP', arrivalUtcMs: Date.UTC(2026, 9, 8, 17, 55) })!;
    expect(fixes).toMatchObject({ startPlace: 'IGR', endPlace: 'AEP', endLocal: '2026-10-08T14:55' });
    expect(fixes.lines).toHaveLength(2);
  });

  it('sin estado del vuelo: el título dice el sentido; la llegada queda para corregir a mano', () => {
    const fixes = consistencyFixes(manuel)!;
    expect(fixes.startPlace).toBe('IGR');
    expect(fixes.endLocal).toBeUndefined();
    expect(fixes.lines[1]).toMatch(/Editar/);
  });

  it('una reserva que cuadra no tiene arreglos', () => {
    expect(consistencyFixes(booking())).toBeNull();
  });
});

describe('ida y vuelta con el mismo localizador', () => {
  const ida = booking({
    id: 'ida', type: 'flight', title: 'JA 3140 AEP → IGR', startLocal: '2026-10-06T13:33', startTz: 'America/Argentina/Buenos_Aires', startPlace: 'AEP',
    endLocal: '2026-10-06T15:27', endTz: 'America/Argentina/Buenos_Aires', endPlace: 'IGR', reference: 'AE9RPH',
  });
  const correoVuelta = proposal({
    type: 'flight', title: 'JA 3157 IGR → AEP', startLocal: '2026-10-08T08:49', startTz: 'America/Argentina/Buenos_Aires', startPlace: 'IGR',
    endLocal: '2026-10-08T10:49', endPlace: 'AEP', reference: 'AE9RPH',
  });

  it('el correo de la vuelta no pisa la ida: es otra reserva', () => {
    expect(findExistingBooking([ida], correoVuelta)).toBeUndefined();
  });

  it('si la vuelta ya está cargada, va a la vuelta y no a la ida', () => {
    const vuelta = booking({ ...ida, id: 'vuelta', title: 'JA 3157 IGR → AEP', startLocal: '2026-10-08T08:49', startPlace: 'IGR', endPlace: 'AEP', endLocal: '2026-10-08T10:49' });
    expect(findExistingBooking([ida, vuelta], { ...correoVuelta, startLocal: '2026-10-08T13:04', endLocal: null })?.id).toBe('vuelta');
  });

  it('un cambio de número de vuelo el mismo día sigue siendo la misma reserva', () => {
    expect(findExistingBooking([ida], proposal({ ...correoVuelta, title: 'JA 3142 AEP → IGR', startPlace: 'AEP', endPlace: 'IGR', startLocal: '2026-10-06T16:10' }))?.id).toBe('ida');
  });
});

describe('reserva pisada por el correo de otro trayecto', () => {
  it('no se corrige sola: se avisa', () => {
    const pisada = booking({
      type: 'flight', title: 'JA 3140 AEP → IGR', startLocal: '2026-10-08T08:49', startTz: 'America/Argentina/Buenos_Aires', startPlace: 'IGR',
      endLocal: '2026-10-08T10:49', endTz: 'America/Argentina/Buenos_Aires', endPlace: 'AEP',
      changeNote: 'Changed on 08/10 according to an email:\n• Departure: Tue 6 Oct 13:33 → Thu 8 Oct 08:49\n• From: AEP → IGR\n• Destination: IGR → AEP',
    });
    const fixes = consistencyFixes(pisada)!;
    expect(fixes.startPlace).toBeUndefined();
    expect(fixes.lines[0]).toMatch(/otro vuelo/);
  });
});
