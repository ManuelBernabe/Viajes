import { ApiError } from '../api';
import type { TextSuggestion } from './extract';

/** Lo que devuelve el servidor tras leer el documento con IA. */
export interface AiExtraction {
  type: string | null;
  title: string | null;
  reference: string | null;
  startLocal: string | null;
  startTz: string | null;
  startPlace: string | null;
  endLocal: string | null;
  endTz: string | null;
  endPlace: string | null;
  address: string | null;
  notes: string | null;
}

export type AiResult = { status: 'ok'; extraction: AiExtraction } | { status: 'unavailable' } | { status: 'nothing' } | { status: 'offline' };

/**
 * Pide al servidor que lea el fichero (PDF o imagen) con IA. «unavailable» si el servidor no tiene clave,
 * «offline» si no hay red o el servidor falla: en ambos casos la app sigue con sus reglas locales.
 */
export async function extractWithAi(bytes: ArrayBuffer, mime: string, name: string): Promise<AiResult> {
  try {
    const response = await fetch(`/api/extract?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': mime },
      body: bytes,
    });
    if (response.status === 503) {
      return { status: 'unavailable' };
    }
    if (response.status === 422) {
      return { status: 'nothing' };
    }
    if (!response.ok) {
      throw new ApiError(response.status, 'No se ha podido leer con IA.');
    }
    return { status: 'ok', extraction: (await response.json()) as AiExtraction };
  } catch {
    return { status: 'offline' };
  }
}

const TYPES = new Set(['flight', 'train', 'hotel', 'car', 'ticket', 'other']);

/** Convierte la respuesta de la IA a la forma que ya entiende el formulario. */
export function toSuggestion(e: AiExtraction): TextSuggestion {
  const split = (local: string | null) => (local && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local) ? { date: local.slice(0, 10), time: local.slice(11, 16) } : { date: null, time: null });
  const start = split(e.startLocal);
  const end = split(e.endLocal);
  return {
    type: e.type && TYPES.has(e.type) ? (e.type as TextSuggestion['type']) : null,
    title: e.title,
    reference: e.reference,
    startDate: start.date,
    startTime: start.time,
    startPlace: e.startPlace,
    startTz: e.startTz,
    endDate: end.date,
    endTime: end.time,
    endPlace: e.endPlace,
    endTz: e.endTz,
    address: e.address,
    notes: e.notes,
  };
}
