import { describe, expect, it } from 'vitest';
import type { TravelDocumentBody } from '../data/types';
import { fillFromRead, type DocumentRead } from './documentRead';

const empty: TravelDocumentBody = { person: '', kind: 'passport', number: null, country: null, issuedDate: null, expiryDate: null, notes: null, visibility: 'household' };
const read: DocumentRead = {
  kind: 'id', givenNames: 'Francisco Javier', surnames: 'Belso Pérez', number: '12345678Z', country: 'España', issuedDate: '2021-03-01', expiryDate: '2031-03-01', mrzChecked: true,
};

describe('fillFromRead', () => {
  it('rellena lo vacío y pone el nombre de pila', () => {
    const { form, filled } = fillFromRead(empty, read, false);
    expect(form).toEqual({ ...empty, kind: 'id', person: 'Francisco', number: '12345678Z', country: 'España', issuedDate: '2021-03-01', expiryDate: '2031-03-01', notes: 'Titular: Francisco Javier Belso Pérez' });
    expect(filled).toBe(7);
  });

  it('no pisa lo escrito ni el tipo elegido a mano', () => {
    const { form } = fillFromRead({ ...empty, person: 'Paco', number: 'ABC' }, read, true);
    expect(form.person).toBe('Paco');
    expect(form.number).toBe('ABC');
    expect(form.kind).toBe('passport');
    expect(form.expiryDate).toBe('2031-03-01');
  });
});
