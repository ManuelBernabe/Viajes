import { describe, expect, it } from 'vitest';
import type { TravelDocument, Trip } from '../data/types';
import { addMonths, documentAlerts, groupByPerson } from './documents';

const doc = (id: string, extra: Partial<TravelDocument>): TravelDocument => ({
  id, person: 'Paco', kind: 'passport', number: null, country: null, issuedDate: null, expiryDate: null, notes: null,
  visibility: 'household', createdBy: 'yo', version: 1, deletedAtMs: null, ...extra,
});
const trip = (id: string, startDate: string, endDate: string): Trip => ({
  id, title: id, destination: null, startDate, endDate, createdBy: 'yo', version: 1, deletedAtMs: null,
});
const today = '2026-10-05';

describe('documentAlerts', () => {
  it('caducado, caduca durante el viaje, menos de 6 meses al empezar y caduca pronto', () => {
    const alerts = documentAlerts(
      [
        doc('viejo', { expiryDate: '2026-09-01' }),
        doc('justo', { person: 'Lucía', expiryDate: '2026-12-08' }),
        doc('seis', { person: 'Manuel', expiryDate: '2027-04-01' }),
        doc('seguro', { kind: 'insurance', expiryDate: '2026-11-15' }),
        doc('bien', { person: 'Bea', expiryDate: '2030-01-01' }),
        doc('sin-fecha', {}),
      ],
      [trip('Roma', '2026-12-05', '2026-12-10'), trip('Pasado', '2026-01-01', '2026-01-05'), trip('EnCurso', '2026-10-01', '2026-10-19')],
      today,
    );
    expect(alerts.map((a) => [a.document.id, a.level, a.trip?.id ?? null])).toEqual([
      ['viejo', 'danger', null],
      ['justo', 'danger', 'Roma'],
      ['seis', 'warning', 'Roma'],
      ['seguro', 'warning', null],
    ]);
    expect(alerts[1].message).toContain('antes de acabar «Roma»');
  });

  it('los meses se suman en el calendario', () => {
    expect(addMonths('2026-12-05', 6)).toBe('2027-06-05');
    expect(addMonths('2026-08-31', 6)).toBe('2027-03-03');
  });
});

describe('groupByPerson', () => {
  it('por persona y con el pasaporte primero', () => {
    const groups = groupByPerson([doc('a', { person: 'Paco', kind: 'insurance' }), doc('b', { person: 'Lucía' }), doc('c', { person: 'Paco' })]);
    expect(groups.map((g) => [g.person, g.documents.map((d) => d.id)])).toEqual([
      ['Lucía', ['b']],
      ['Paco', ['c', 'a']],
    ]);
  });
});
