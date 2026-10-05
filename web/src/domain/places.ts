import type { Place, PlaceCategory } from '../data/types';
import { t } from '../i18n';

export const PLACE_INFO: Record<PlaceCategory, { icon: string; label: string }> = {
  see: { icon: '👀', label: t('Visitar') },
  eat: { icon: '🍽️', label: t('Comer') },
  drink: { icon: '🍹', label: t('Tomar algo') },
  shop: { icon: '🛍️', label: t('Compras') },
  nature: { icon: '🌿', label: t('Naturaleza') },
  other: { icon: '📌', label: t('Otros') },
};

/** Abre el sitio en Google Maps (en el iPhone, la app si está instalada; si no, la web). */
export function mapsUrl(place: Pick<Place, 'name' | 'address'>, destination: string | null): string {
  const where = place.address ?? destination;
  const query = where && !place.name.toLowerCase().includes(where.toLowerCase()) ? `${place.name}, ${where}` : place.name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Lo que alguien pega en el campo del nombre. Si es un enlace, se guarda como enlace y, si es de Google Maps con
 * «/place/Nombre/», se saca el nombre; si no se puede, el nombre queda vacío para que lo escriba.
 */
export function parsePasted(text: string): { name: string; url: string | null } {
  const trimmed = text.trim();
  const link = /https?:\/\/\S+/i.exec(trimmed)?.[0] ?? null;
  if (!link) {
    return { name: trimmed, url: null };
  }
  // «Nombre del sitio https://maps.app.goo.gl/…» (lo que comparte Google Maps): el texto de delante es el nombre.
  const before = trimmed.slice(0, trimmed.indexOf(link)).trim().replace(/[\s:–-]+$/, '');
  if (before) {
    return { name: before.split('\n')[0].trim(), url: link };
  }
  const place = /\/maps\/place\/([^/?#]+)/.exec(link)?.[1];
  if (place) {
    try {
      return { name: decodeURIComponent(place.replace(/\+/g, ' ')).trim(), url: link };
    } catch {
      return { name: '', url: link };
    }
  }
  return { name: '', url: link };
}

/** Los que quedan por visitar primero; dentro, por categoría y nombre. */
export function sortPlaces(places: readonly Place[]): { pending: Place[]; visited: Place[] } {
  const order = Object.keys(PLACE_INFO);
  // Lo último que se añade sale primero; los sitios de antes de guardar la fecha, después, por categoría y nombre.
  const byCategoryThenName = (a: Place, b: Place) =>
    (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0) || order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name);
  return {
    pending: places.filter((p) => !p.visited).sort(byCategoryThenName),
    visited: places.filter((p) => p.visited).sort(byCategoryThenName),
  };
}

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Agrupa las ideas por país («Argentina», «Brasil»), en el orden en que aparecen en el nombre o el destino del viaje
 * («Argentina Brasil» → primero Argentina). Los países que no salen ahí van después, por orden alfabético; las ideas sin
 * país, al final (área null).
 */
export function groupByArea<T extends { area?: string | null }>(items: readonly T[], tripText: string): { area: string | null; items: T[] }[] {
  const groups = new Map<string | null, T[]>();
  for (const item of items) {
    const area = item.area?.trim() || null;
    const group = groups.get(area);
    if (group) {
      group.push(item);
    } else {
      groups.set(area, [item]);
    }
  }

  const text = plain(tripText);
  const rank = (area: string | null) => {
    if (area === null) {
      return Number.MAX_SAFE_INTEGER;
    }
    const at = text.indexOf(plain(area));
    return at < 0 ? Number.MAX_SAFE_INTEGER - 1 : at;
  };
  return [...groups.entries()]
    .map(([area, grouped]) => ({ area, items: grouped }))
    .sort((a, b) => rank(a.area) - rank(b.area) || (a.area ?? '').localeCompare(b.area ?? ''));
}
