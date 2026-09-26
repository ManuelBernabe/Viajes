import { api } from '../api';

export type PushState =
  | { kind: 'unsupported'; reason: string }
  | { kind: 'denied' }
  | { kind: 'off' }
  | { kind: 'on' };

/** iOS solo permite Web Push en la app añadida a la pantalla de inicio (modo standalone). */
function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function pushSupport(): { ok: true } | { ok: false; reason: string } {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    if (/iPhone|iPad/.test(navigator.userAgent) && !isStandalone()) {
      return { ok: false, reason: 'En iPhone los avisos solo funcionan desde la app añadida a la pantalla de inicio.' };
    }
    return { ok: false, reason: 'Este navegador no admite avisos.' };
  }
  return { ok: true };
}

export async function pushState(): Promise<PushState> {
  const support = pushSupport();
  if (!support.ok) {
    return { kind: 'unsupported', reason: support.reason };
  }
  if (Notification.permission === 'denied') {
    return { kind: 'denied' };
  }
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? { kind: 'on' } : { kind: 'off' };
}

function toUint8(base64Url: string): Uint8Array {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function toJson(subscription: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('Suscripción incompleta.');
  }
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/** Pide permiso, se suscribe y registra el dispositivo en el servidor. `onStep` recibe el paso en curso. */
export async function enablePush(onStep?: (step: string) => void): Promise<PushState> {
  const support = pushSupport();
  if (!support.ok) {
    return { kind: 'unsupported', reason: support.reason };
  }
  const step = onStep ?? (() => undefined);
  step('pidiendo permiso');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { kind: 'denied' };
  }
  step('pidiendo la clave al servidor');
  const { publicKey } = await withTimeout(api<{ publicKey: string }>('/api/push/public-key'), 15_000, 'el servidor no responde');
  step('esperando al service worker');
  const registration = await withTimeout(navigator.serviceWorker.ready, 15_000, 'el service worker no llega a activarse');
  step('consultando la suscripción actual');
  let subscription = await withTimeout(registration.pushManager.getSubscription(), 15_000, 'getSubscription no responde');
  if (!subscription) {
    step('suscribiendo el móvil al servicio push de Apple');
    subscription = await withTimeout(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toUint8(publicKey) as BufferSource,
      }),
      30_000,
      'la suscripción push no responde',
    );
  }
  step('registrando el móvil en el servidor');
  await withTimeout(api('/api/push/subscribe', { method: 'POST', body: JSON.stringify(toJson(subscription)) }), 15_000, 'el servidor no responde');
  return { kind: 'on' };
}

/** Falla con un mensaje claro si un paso se queda colgado (pasa en iOS con el service worker o con subscribe). */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Paso agotado: ${what}.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export async function disablePush(): Promise<PushState> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) });
    await subscription.unsubscribe();
  }
  return { kind: 'off' };
}

/** Manda un aviso de prueba a los dispositivos de la cuenta; devuelve a cuántos llegó (-1 si va con retardo). */
export async function sendTestPush(delaySeconds = 0): Promise<number> {
  const { sent } = await api<{ sent: number }>(`/api/push/test?delay=${delaySeconds}`, { method: 'POST', body: '{}' });
  return sent;
}

/** Muestra un aviso desde el propio móvil, sin servidor: comprueba permiso y service worker. */
export async function showLocalTest(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('Viajes', {
    body: 'Aviso local de prueba: el permiso y el service worker funcionan.',
    tag: 'local-test',
    icon: '/pwa-192x192.png',
  });
}

export interface PushDiagnostics {
  /** Fecha de compilación del service worker activo, o null si no responde (versión antigua sin avisos). */
  workerBuild: string | null;
  /** Dominio del servicio push al que está suscrito el móvil (Apple, Google…). */
  endpointHost: string | null;
  /** Estado de la instalación: qué worker controla la página y si hay otro instalándose o esperando. */
  workerState: string;
  /** Últimas líneas de la bitácora del service worker. */
  log: string[];
}

/** Datos para saber si los pushes llegan al móvil: versión del worker, servicio push y bitácora. */
export async function pushDiagnostics(): Promise<PushDiagnostics> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  let endpointHost: string | null = null;
  try {
    endpointHost = subscription ? new URL(subscription.endpoint).host : null;
  } catch {
    endpointHost = null;
  }

  const parts = [
    `controla: ${navigator.serviceWorker.controller ? 'sí' : 'no'}`,
    registration?.installing ? 'instalando otro' : '',
    registration?.waiting ? 'otro esperando' : '',
    registration?.active ? `activo (${registration.active.state})` : 'sin worker activo',
  ];
  const workerState = parts.filter(Boolean).join(' · ');

  const workerBuild = await new Promise<string | null>((resolve) => {
    const worker = registration?.active;
    if (!worker) {
      resolve(null);
      return;
    }
    const done = (build: string | null) => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve(build);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; build?: string } | undefined;
      if (data?.type === 'PONG') {
        done(data.build ?? null);
      }
    };
    const timer = setTimeout(() => done(null), 3000);
    // El worker responde por el puerto transferido y también al cliente; vale cualquiera de los dos.
    navigator.serviceWorker.addEventListener('message', onMessage);
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => done((event.data as { build?: string })?.build ?? null);
    worker.postMessage({ type: 'PING' }, [channel.port2]);
  });

  let log: string[] = [];
  try {
    const cache = await caches.open('push-log');
    const entry = await cache.match('/__push-log');
    log = entry ? ((await entry.json()) as string[]) : [];
  } catch {
    log = [];
  }
  return { workerBuild, endpointHost, workerState, log };
}

/** Si el dispositivo ya estaba suscrito, vuelve a registrarlo por si el servidor lo perdió o cambió la clave. */
export async function refreshPushSubscription(): Promise<void> {
  if (!pushSupport().ok || Notification.permission !== 'granted') {
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify(toJson(subscription)) });
  }
}
