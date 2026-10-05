import type { DocumentKind, TravelDocument, Trip } from '../data/types';
import { locale, t } from '../i18n';
import { shiftDate } from './alternatives';

export const DOCUMENT_INFO: Record<DocumentKind, { icon: string; label: string }> = {
  passport: { icon: '🛂', label: t('Pasaporte') },
  id: { icon: '🪪', label: t('DNI o carné de identidad') },
  visa: { icon: '🛃', label: t('Visado o autorización (ESTA, eTA…)') },
  insurance: { icon: '🩺', label: t('Seguro de viaje') },
  vaccine: { icon: '💉', label: t('Vacuna o certificado') },
  license: { icon: '🚗', label: t('Carné de conducir') },
  other: { icon: '📄', label: t('Otro') },
};

/** «2027-03-01» → «1 mar 2027» (con año: en una caducidad importa). */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Documentos que identifican a la persona y que una frontera mira: los que se comprueban contra las fechas de cada viaje. */
const IDENTITY: ReadonlySet<DocumentKind> = new Set(['passport', 'id', 'license']);

/** Días antes de caducar en que ya se avisa aunque no haya viaje. */
export const SOON_DAYS = 90;

/** «2026-10-05» + meses, sin pasar por la zona del móvil. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

export interface DocumentAlert {
  document: TravelDocument;
  level: 'danger' | 'warning';
  /** Viaje al que afecta, si es por un viaje. */
  trip: Trip | null;
  message: string;
}

/**
 * Avisos de caducidad: lo caducado; lo que caduca antes de acabar un viaje próximo; un pasaporte con menos de 6 meses de
 * validez al empezar el viaje (lo piden muchos países); y lo que caduca en los próximos 90 días.
 */
export function documentAlerts(documents: readonly TravelDocument[], trips: readonly Trip[], today: string): DocumentAlert[] {
  const alerts: DocumentAlert[] = [];
  const upcoming = trips.filter((trip) => trip.deletedAtMs === null && trip.startDate && (trip.endDate ?? trip.startDate) >= today);
  for (const document of documents) {
    const expiry = document.expiryDate;
    if (document.deletedAtMs !== null || !expiry) {
      continue;
    }
    const label = `${DOCUMENT_INFO[document.kind].label} · ${document.person}`;
    if (expiry < today) {
      alerts.push({ document, level: 'danger', trip: null, message: t('{doc}: caducó el {date}.', { doc: label, date: formatDate(expiry) }) });
      continue;
    }
    let tripAlert = false;
    if (IDENTITY.has(document.kind)) {
      for (const trip of upcoming) {
        const end = trip.endDate ?? trip.startDate!;
        if (expiry < end) {
          alerts.push({
            document,
            level: 'danger',
            trip,
            message: t('{doc}: caduca el {date}, antes de acabar «{trip}».', { doc: label, date: formatDate(expiry), trip: trip.title }),
          });
          tripAlert = true;
        } else if (document.kind === 'passport' && trip.startDate! > today && expiry < addMonths(trip.startDate!, 6)) {
          // (Solo antes de salir: si el viaje ya ha empezado, la frontera ya se ha cruzado.)
          alerts.push({
            document,
            level: 'warning',
            trip,
            message: t('{doc}: al empezar «{trip}» le quedarán menos de 6 meses de validez (caduca el {date}). Muchos países lo exigen: compruébalo.', {
              doc: label,
              trip: trip.title,
              date: formatDate(expiry),
            }),
          });
          tripAlert = true;
        }
      }
    }
    if (!tripAlert && expiry <= shiftDate(today, SOON_DAYS)) {
      alerts.push({ document, level: 'warning', trip: null, message: t('{doc}: caduca pronto, el {date}.', { doc: label, date: formatDate(expiry) }) });
    }
  }
  return alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'danger' ? -1 : 1));
}

/** Por persona y, dentro, por tipo (pasaporte primero) y caducidad. */
export function groupByPerson(documents: readonly TravelDocument[]): { person: string; documents: TravelDocument[] }[] {
  const order = Object.keys(DOCUMENT_INFO);
  const groups = new Map<string, TravelDocument[]>();
  for (const document of documents) {
    const key = document.person.trim();
    groups.set(key, [...(groups.get(key) ?? []), document]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([person, list]) => ({
      person,
      documents: list.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.expiryDate ?? '9').localeCompare(b.expiryDate ?? '9')),
    }));
}
