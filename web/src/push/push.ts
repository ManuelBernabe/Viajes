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

/** Pide permiso, se suscribe y registra el dispositivo en el servidor. */
export async function enablePush(): Promise<PushState> {
  const support = pushSupport();
  if (!support.ok) {
    return { kind: 'unsupported', reason: support.reason };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { kind: 'denied' };
  }
  const { publicKey } = await api<{ publicKey: string }>('/api/push/public-key');
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toUint8(publicKey) as BufferSource,
    });
  }
  await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify(toJson(subscription)) });
  return { kind: 'on' };
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
