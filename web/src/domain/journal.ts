import { api } from '../api';
import { shiftDate } from './alternatives';

export interface JournalPhoto {
  id: string;
  mime: string;
}

export interface JournalDay {
  date: string;
  text: string | null;
  updatedMs: number | null;
  updatedBy: string | null;
  photos: JournalPhoto[];
}

export interface JournalStats {
  flights: number;
  trains: number;
  km: number;
  nights: number;
  cities: string[];
  countries: { country: string; flag: string | null }[];
}

export interface Journal {
  days: JournalDay[];
  stats: JournalStats;
}

const cacheKey = (tripId: string) => `viajes.diario.${tripId}`;

/** Lo último que se vio (los textos), para leerlo sin conexión. */
export function cachedJournal(tripId: string): Journal | null {
  try {
    const raw = localStorage.getItem(cacheKey(tripId));
    return raw ? (JSON.parse(raw) as Journal) : null;
  } catch {
    return null;
  }
}

export const journalApi = {
  get: async (tripId: string) => {
    const journal = await api<Journal>(`/api/trips/${tripId}/journal`);
    try {
      localStorage.setItem(cacheKey(tripId), JSON.stringify(journal));
    } catch {
      // Sin almacenamiento.
    }
    return journal;
  },
  saveText: (tripId: string, date: string, text: string) =>
    api<void>(`/api/trips/${tripId}/journal/${date}`, { method: 'PUT', body: JSON.stringify({ text }) }),
  addPhoto: (tripId: string, date: string, photo: Blob) =>
    api<JournalPhoto>(`/api/trips/${tripId}/journal/${date}/photos`, { method: 'POST', body: photo, headers: { 'Content-Type': photo.type || 'image/jpeg' } }),
  removePhoto: (tripId: string, photoId: string) => api<void>(`/api/trips/${tripId}/journal/photos/${photoId}`, { method: 'DELETE' }),
  photoUrl: (tripId: string, photoId: string) => `/api/trips/${tripId}/journal/photos/${photoId}`,
};

/**
 * Los días que se muestran: los del viaje hasta hoy (no se escribe el diario de mañana) y cualquier otro que ya tenga algo.
 * Del más reciente al más antiguo, que es el que se está escribiendo.
 */
export function journalDates(startDate: string | null, endDate: string | null, today: string, written: readonly string[]): string[] {
  const dates = new Set(written);
  if (startDate) {
    const last = [endDate ?? startDate, today].sort()[0];
    for (let day = startDate; day <= last && dates.size < 400; day = shiftDate(day, 1)) {
      dates.add(day);
    }
  }
  if (dates.size === 0) {
    dates.add(today);
  }
  return [...dates].sort().reverse();
}

/** La foto reducida a 1600 px de lado y JPEG (unos 300 KB): sube rápido con datos móviles. Si no se puede, la original. */
export async function shrinkPhoto(file: File, max = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}
