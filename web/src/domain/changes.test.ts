import { describe, expect, it } from 'vitest';
import type { Booking } from '../data/types';
import { applyChanges, describeChanges, diffBooking, findExistingBooking, type Proposal } from './changes';

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'b1', tripId: 't1', type: 'train', title: 'AVE 05143 Alicante → Chamartín', startLocal: '2026-10-01T14:35', startTz: 'Europe/Madrid',
  startPlace: 'Alicante-Termin', endLocal: '2026-10-01T17:08', endTz: 'Europe/Madrid', endPlace: 'Chamartin', startUtcMs: 1,
  reference: 'C3BMDV', address: null, notes: 'Coche 8 · Plazas 6B, 6A', changeNote: null, createdBy: 'yo', version: 1, deletedAtMs: null, ...overrides,
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
      'Localizador: C3BMDV → NUEVO1',
      'Notas: Coche 8 · Plazas 6B, 6A → Coche 3 · Plazas 1A, 1B',
    ]);
    const body = applyChanges(booking(), proposal({ startLocal: '2026-10-02T09:00', startTz: 'Europe/Lisbon', endLocal: '2026-10-01T17:08', reference: 'NUEVO1', notes: 'Coche 3 · Plazas 1A, 1B' }), changes, new Date(2026, 8, 27));
    expect(body).toMatchObject({ startLocal: '2026-10-02T09:00', startTz: 'Europe/Lisbon', reference: 'NUEVO1', notes: 'Coche 3 · Plazas 1A, 1B' });
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
