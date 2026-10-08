import { api } from '../api';
import { t } from '../i18n';

export interface PackingItem {
  id: string;
  text: string;
  category: string | null;
  forWhom: string | null;
  checked: boolean;
  checkedBy: string | null;
  createdMs: number;
}

export interface NewPackingItem {
  text: string;
  category?: string | null;
  forWhom?: string | null;
}

/** Grupos de la lista, en este orden; lo que no tiene grupo va a «Otros». */
export function categories(): string[] {
  return [t('Documentos'), t('Ropa'), t('Aseo'), t('Electrónica'), t('Salud'), t('Niños'), t('Otros')];
}

export interface PackingTemplate {
  id: string;
  icon: string;
  name: string;
  items: NewPackingItem[];
}

/** Plantillas para empezar una lista en un toque. Se añaden sin repetir lo que ya está. */
export function templates(): PackingTemplate[] {
  const docs = t('Documentos');
  const clothes = t('Ropa');
  const wash = t('Aseo');
  const tech = t('Electrónica');
  const health = t('Salud');
  const kids = t('Niños');
  const item = (text: string, category: string): NewPackingItem => ({ text, category });
  return [
    {
      id: 'basic',
      icon: '🧳',
      name: t('Básico'),
      items: [
        item(t('Pasaporte o DNI'), docs), item(t('Tarjetas y algo de efectivo'), docs), item(t('Seguro de viaje'), docs), item(t('Carné de conducir'), docs),
        item(t('Móvil y cargador'), tech), item(t('Batería externa'), tech), item(t('Adaptador de enchufe'), tech), item(t('Auriculares'), tech),
        item(t('Cepillo y pasta de dientes'), wash), item(t('Desodorante'), wash), item(t('Gafas o lentillas'), wash),
        item(t('Medicinas habituales'), health), item(t('Ropa interior'), clothes), item(t('Calcetines'), clothes), item(t('Pijama'), clothes), item(t('Chaqueta'), clothes),
      ],
    },
    {
      id: 'beach',
      icon: '🏖️',
      name: t('Playa'),
      items: [
        item(t('Bañador'), clothes), item(t('Chanclas'), clothes), item(t('Gorra o sombrero'), clothes), item(t('Gafas de sol'), clothes),
        item(t('Toalla de playa'), t('Otros')), item(t('Crema solar'), wash), item(t('After sun'), wash), item(t('Repelente de mosquitos'), health),
      ],
    },
    {
      id: 'snow',
      icon: '❄️',
      name: t('Frío y nieve'),
      items: [item(t('Abrigo'), clothes), item(t('Guantes'), clothes), item(t('Gorro'), clothes), item(t('Bufanda'), clothes), item(t('Ropa térmica'), clothes), item(t('Botas'), clothes), item(t('Cacao para los labios'), wash)],
    },
    {
      id: 'work',
      icon: '💼',
      name: t('Trabajo'),
      items: [item(t('Portátil y cargador'), tech), item(t('Ropa formal'), clothes), item(t('Documentación de la reunión'), docs), item(t('Tarjetas de visita'), docs)],
    },
    {
      id: 'kids',
      icon: '🧸',
      name: t('Con niños'),
      items: [item(t('Pañales'), kids), item(t('Toallitas'), kids), item(t('Biberón'), kids), item(t('Juguetes'), kids), item(t('Carrito'), kids), item(t('Medicinas infantiles'), health)],
    },
  ];
}

/** Agrupa por categoría, en el orden de `categories()`; lo demás después, «Otros» al final. */
export function groupItems(items: readonly PackingItem[]): { category: string; items: PackingItem[] }[] {
  const order = categories();
  const other = t('Otros');
  const groups = new Map<string, PackingItem[]>();
  for (const item of items) {
    const category = item.category || other;
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  const rank = (c: string) => (c === other ? 999 : order.indexOf(c) === -1 ? 500 : order.indexOf(c));
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0])).map(([category, list]) => ({ category, items: list }));
}

const cacheKey = (tripId: string) => `viajes:equipaje:${tripId}`;

export function cachedPacking(tripId: string): PackingItem[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(tripId));
    return raw ? (JSON.parse(raw) as PackingItem[]) : null;
  } catch {
    return null;
  }
}

export function cachePacking(tripId: string, items: readonly PackingItem[]) {
  try {
    localStorage.setItem(cacheKey(tripId), JSON.stringify(items));
  } catch {
    // Sin almacenamiento: se pedirá al servidor.
  }
}

export const packingApi = {
  list: (tripId: string) => api<PackingItem[]>(`/api/trips/${tripId}/packing`),
  add: (tripId: string, items: NewPackingItem[]) => api<PackingItem[]>(`/api/trips/${tripId}/packing`, { method: 'POST', body: JSON.stringify({ items }) }),
  update: (id: string, change: Partial<Pick<PackingItem, 'checked' | 'text' | 'category' | 'forWhom'>>) =>
    api<PackingItem>(`/api/packing/${id}`, { method: 'PATCH', body: JSON.stringify(change) }),
  remove: (id: string) => api<void>(`/api/packing/${id}`, { method: 'DELETE' }),
};
