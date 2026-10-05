import type { DocumentKind, TravelDocumentBody } from '../data/types';
import { DOCUMENT_KINDS } from '../data/types';
import { t } from '../i18n';

/** Lo que devuelve el servidor al leer la foto de un documento. */
export interface DocumentRead {
  kind: string | null;
  givenNames: string | null;
  surnames: string | null;
  number: string | null;
  country: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  mrzChecked: boolean;
}

/**
 * Rellena con lo leído solo los campos vacíos: lo que la persona ya haya escrito no se pisa. El tipo se cambia si sigue el
 * de por defecto y no se ha tocado. Si no hay nombre, se pone el primero de pila («Francisco Javier» → «Francisco»), y el
 * nombre completo va a las notas.
 */
export function fillFromRead(form: TravelDocumentBody, read: DocumentRead, kindTouched: boolean): { form: TravelDocumentBody; filled: number } {
  let filled = 0;
  const next = { ...form };
  const take = <K extends keyof TravelDocumentBody>(key: K, value: TravelDocumentBody[K] | null | undefined) => {
    const current = next[key];
    if (value && (current === null || current === undefined || (typeof current === 'string' && current.trim() === ''))) {
      next[key] = value;
      filled++;
    }
  };
  if (!kindTouched && read.kind && (DOCUMENT_KINDS as readonly string[]).includes(read.kind) && read.kind !== next.kind) {
    next.kind = read.kind as DocumentKind;
    filled++;
  }
  take('person', read.givenNames?.split(/\s+/)[0] ?? null);
  take('number', read.number);
  take('country', read.country);
  take('issuedDate', read.issuedDate);
  take('expiryDate', read.expiryDate);
  const fullName = [read.givenNames, read.surnames].filter(Boolean).join(' ');
  if (fullName) {
    take('notes', t('Titular: {name}', { name: fullName }));
  }
  return { form: next, filled };
}
