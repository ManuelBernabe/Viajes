import { useSyncExternalStore } from 'react';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { isAiOff } from '../attachments/aiExtract';
import { subscribe } from './bus';
import { getMeta, openDb } from './db';
import { todayLocal } from '../domain/agenda';
import { downloadMissing, getManualOffline, wantedOffline } from './offline';
import { pendingCount, toSendResult, type SendResult } from './outbox';
import { removeInboxItem } from './repo';
import { LAST_SYNC_KEY, syncAll, type SyncDeps, type SyncOutcome } from './sync';
import type { Attachment, InboxItem, Op, StoredBlob } from './types';
import { emitChange } from './bus';

export interface SyncStatus {
  running: boolean;
  pending: number;
  lastAt: number | null;
  incomplete: boolean;
  sessionExpired: boolean;
  dropped: number;
}

let status: SyncStatus = { running: false, pending: 0, lastAt: null, incomplete: false, sessionExpired: false, dropped: 0 };
const listeners = new Set<() => void>();

function set(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

function subscribeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeStatus, () => status);
}

export function sessionRenewed(): void {
  set({ sessionExpired: false });
}

function noteExpired(error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    set({ sessionExpired: true });
  }
}

async function send(op: Op): Promise<SendResult> {
  try {
    switch (op.kind) {
      case 'put-trip':
        await api(`/api/trips/${op.id}`, { method: 'PUT', body: JSON.stringify(op.body) });
        break;
      case 'delete-trip':
        await api(`/api/trips/${op.id}`, { method: 'DELETE' });
        break;
      case 'put-booking':
        await api(`/api/bookings/${op.id}`, { method: 'PUT', body: JSON.stringify(op.body) });
        break;
      case 'delete-booking':
        await api(`/api/bookings/${op.id}`, { method: 'DELETE' });
        break;
      case 'put-attachment':
        await api(`/api/attachments/${op.id}`, { method: 'PUT', body: JSON.stringify(op.body) });
        break;
      case 'delete-attachment':
        await api(`/api/attachments/${op.id}`, { method: 'DELETE' });
        break;
      case 'put-place':
        await api(`/api/places/${op.id}`, { method: 'PUT', body: JSON.stringify(op.body) });
        break;
      case 'delete-place':
        await api(`/api/places/${op.id}`, { method: 'DELETE' });
        break;
    }
    return 'ok';
  } catch (error) {
    noteExpired(error);
    return toSendResult(error);
  }
}

async function upload(attachment: Attachment, blob: StoredBlob): Promise<SendResult> {
  try {
    const response = await fetch(`/api/attachments/${attachment.id}/content`, {
      method: 'PUT',
      body: new Blob([blob.bytes], { type: blob.mime }),
      headers: { 'Content-Type': blob.mime },
    });
    if (response.ok) {
      return 'ok';
    }
    const error = new ApiError(response.status, t('No se ha podido subir el fichero.'));
    noteExpired(error);
    return toSendResult(error);
  } catch {
    return 'retry';
  }
}

const deps: SyncDeps = {
  fetchSync: async (since) => {
    try {
      return await api(`/api/sync?since=${since}`);
    } catch (error) {
      noteExpired(error);
      throw error;
    }
  },
  send,
  upload,
};

/** Descarga el contenido de un adjunto; null si el servidor no lo tiene (aún no subido). */
export async function downloadAttachment(attachment: Attachment): Promise<ArrayBuffer | null> {
  const response = await fetch(`/api/attachments/${attachment.id}/content`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const error = new ApiError(response.status, t('No se ha podido bajar el fichero.'));
    noteExpired(error);
    throw error;
  }
  return response.arrayBuffer();
}

/** Baja el contenido de un adjunto de la bandeja de entrada (solo con red). */
export async function downloadInboxAttachment(itemId: string, attachmentId: string): Promise<ArrayBuffer> {
  const response = await fetch(`/api/inbox/${itemId}/attachments/${attachmentId}/content`);
  if (!response.ok) {
    const error = new ApiError(response.status, t('No se ha podido bajar el adjunto del correo.'));
    noteExpired(error);
    throw error;
  }
  return response.arrayBuffer();
}

/** Pide al servidor que vuelva a leer el borrador con IA; null si no hay IA, no reconoce nada o no hay red. */
export async function reExtractInbox(itemId: string): Promise<InboxItem | null> {
  if (await isAiOff()) {
    return null;
  }
  try {
    const item = await api<InboxItem>(`/api/inbox/${itemId}/extract`, { method: 'POST' });
    await (await openDb()).put('inbox', item);
    emitChange();
    return item;
  } catch (error) {
    noteExpired(error);
    return null;
  }
}

/** Marca el borrador como confirmado o descartado en el servidor y lo quita del móvil. */
export async function setInboxStatus(itemId: string, status: 'confirmed' | 'discarded', bookingId?: string): Promise<void> {
  await api(`/api/inbox/${itemId}/status`, { method: 'POST', body: JSON.stringify({ status, bookingId: bookingId ?? null }) });
  await removeInboxItem(itemId);
}

/** Baja los ficheros de los viajes que deben estar en el móvil. */
export async function downloadWantedTrips(): Promise<void> {
  const database = await openDb();
  const today = todayLocal();
  for (const trip of await database.getAll('trips')) {
    if (wantedOffline(trip, today, await getManualOffline(trip.id))) {
      const result = await downloadMissing(trip.id, downloadAttachment);
      if (result.failed) {
        return;
      }
    }
  }
}

export async function refreshPending(): Promise<void> {
  set({ pending: await pendingCount() });
}

export async function syncNow(): Promise<SyncOutcome> {
  if (status.running) {
    // Ya hay una en marcha: syncAll la comparte.
    return syncAll(deps);
  }
  set({ running: true });
  try {
    const outcome = await syncAll(deps);
    await downloadWantedTrips().catch(() => undefined);
    set({
      pending: await pendingCount(),
      lastAt: (await getMeta<number>(LAST_SYNC_KEY)) ?? status.lastAt,
      incomplete: outcome.incomplete,
      dropped: status.dropped + outcome.dropped.length,
    });
    return outcome;
  } finally {
    set({ running: false });
  }
}

async function hasLocalWork(): Promise<boolean> {
  if ((await pendingCount()) > 0) {
    return true;
  }
  const database = await openDb();
  for (const attachment of await database.getAll('attachments')) {
    if (!attachment.uploaded && (await database.getKey('blobs', attachment.id))) {
      return true;
    }
  }
  return false;
}

/** Sincroniza al abrir, al volver la red, al volver a primer plano, cada 2 minutos y poco después de cada cambio local. */
export function startSyncLoop(): () => void {
  const run = () => void syncNow();
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      run();
    }
  };
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(run, 120_000);

  let scheduled: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = subscribe(() => {
    void refreshPending();
    if (scheduled) {
      return;
    }
    scheduled = setTimeout(() => {
      scheduled = null;
      void hasLocalWork().then((work) => work && run());
    }, 800);
  });

  void getMeta<number>(LAST_SYNC_KEY).then((lastAt) => set({ lastAt: lastAt ?? null }));
  void refreshPending();
  run();

  return () => {
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(timer);
    if (scheduled) {
      clearTimeout(scheduled);
    }
    unsubscribe();
  };
}
