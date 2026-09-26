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
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));

// La versión nueva espera a que la persona pulse «Actualizar ahora» (UpdatePrompt).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});
clientsClaim();

self.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const title = payload.title ?? 'Viajes';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? '',
      tag: payload.tag,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: payload.url ?? '/' },
    }),
  );
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
