/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

/** Lo que manda el servidor en cada aviso (véase PushMessage en el servidor). */
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

// Misma caché de antes (generateSW): la app entera precargada para funcionar sin red.
const manifest = self.__WB_MANIFEST;
precacheAndRoute(manifest);
/** Identifica esta versión del worker: la revisión de index.html cambia en cada compilación. */
const BUILD = (manifest.find((entry) => typeof entry !== 'string' && entry.url === 'index.html') as { revision?: string | null } | undefined)?.revision ?? '?';
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//, /^\/i\//] }));

/** Bitácora de pushes recibidos (caché «push-log»), para diagnosticar desde Ajustes si llegan al móvil. */
const LOG_CACHE = 'push-log';
const LOG_URL = '/__push-log';

async function logPush(entry: string): Promise<void> {
  try {
    const cache = await caches.open(LOG_CACHE);
    const previous = await cache.match(LOG_URL);
    const lines: string[] = previous ? ((await previous.json()) as string[]) : [];
    lines.push(`${new Date().toISOString()} ${entry}`);
    await cache.put(LOG_URL, new Response(JSON.stringify(lines.slice(-20)), { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // Sin caché no hay bitácora, pero el aviso se muestra igual.
  }
}

// La versión nueva espera a que la persona pulse «Actualizar ahora» (UpdatePrompt).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
  if (event.data && event.data.type === 'PING') {
    const reply = { type: 'PONG', build: BUILD };
    event.ports[0]?.postMessage(reply);
    event.source?.postMessage(reply);
  }
});
clientsClaim();

self.addEventListener('activate', (event) => {
  event.waitUntil(logPush(`worker activado: ${BUILD}`));
});

self.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  let raw = '';
  try {
    raw = event.data?.text() ?? '';
    payload = raw ? (JSON.parse(raw) as PushPayload) : {};
  } catch {
    payload = { body: raw };
  }
  const title = payload.title ?? 'Viajes';
  event.waitUntil(
    (async () => {
      await logPush(`push recibido: ${raw.slice(0, 80) || '(sin datos)'}`);
      try {
        await self.registration.showNotification(title, {
          body: payload.body ?? '',
          tag: payload.tag,
          icon: '/pwa-192x192.png',
          data: { url: payload.url ?? '/' },
        });
        await logPush('aviso mostrado');
      } catch (error) {
        await logPush(`fallo al mostrar: ${String(error)}`);
        throw error;
      }
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', () => {
  void logPush('la suscripción ha cambiado (pushsubscriptionchange)');
});

// Al tocar el aviso se abre la reserva (o se trae al frente la app si ya está abierta).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data as { url?: string } | undefined)?.url ?? '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => 'focus' in w);
      if (open) {
        await open.focus();
        if ('navigate' in open) {
          await open.navigate(url).catch(() => undefined);
        }
        return;
      }
      await self.clients.openWindow(url);
    }),
  );
});
