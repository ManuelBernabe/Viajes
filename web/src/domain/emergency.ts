import { api } from '../api';

export interface Insurance {
  company?: string | null;
  phone?: string | null;
  policy?: string | null;
  notes?: string | null;
}

export interface EmergencyContact {
  name?: string | null;
  relation?: string | null;
  phone?: string | null;
}

export interface EmergencyPerson {
  name?: string | null;
  blood?: string | null;
  allergies?: string | null;
  medication?: string | null;
  notes?: string | null;
}

/** La tarjeta de emergencia del hogar (la misma para todos). */
export interface EmergencyCard {
  insurance?: Insurance | null;
  contacts?: EmergencyContact[] | null;
  people?: EmergencyPerson[] | null;
  notes?: string | null;
  updatedMs?: number | null;
  updatedBy?: string | null;
}

const CACHE = 'viajes.emergency';

/** Lo último que se vio: la tarjeta tiene que abrirse sin cobertura. */
export function cachedEmergency(): EmergencyCard | null {
  try {
    const raw = localStorage.getItem(CACHE);
    return raw ? (JSON.parse(raw) as EmergencyCard) : null;
  } catch {
    return null;
  }
}

function remember(card: EmergencyCard): EmergencyCard {
  try {
    localStorage.setItem(CACHE, JSON.stringify(card));
  } catch {
    // Sin almacenamiento: se pedirá al servidor.
  }
  return card;
}

export const emergencyApi = {
  get: async () => remember(await api<EmergencyCard>('/api/household/emergency')),
  save: async (card: EmergencyCard) => remember(await api<EmergencyCard>('/api/household/emergency', { method: 'PUT', body: JSON.stringify(card) })),
};

/** Teléfonos que aparecen en un texto («911 (policía 101)», «+54 11 4809 4900»), para poder llamar con un toque. */
export function phonesIn(text: string | null | undefined): { label: string; tel: string }[] {
  const found: { label: string; tel: string }[] = [];
  for (const match of (text ?? '').matchAll(/\+?\d[\d\s().-]{1,18}\d/g)) {
    const label = match[0].trim();
    const digits = label.replace(/[^\d+]/g, '');
    // Años, horas o códigos postales no son teléfonos: al menos 3 cifras y no un año suelto.
    if (digits.replace('+', '').length < 3 || /^(19|20)\d{2}$/.test(digits)) {
      continue;
    }
    if (!found.some((f) => f.tel === digits)) {
      found.push({ label, tel: digits });
    }
  }
  return found;
}
