/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Precache all build assets injected by vite-plugin-pwa.
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// --- Push notifications ---
// The app (via api.subscribePush) POSTs the subscription and/or we cache it here.
const subscriptionKey = 'ttm_push_subscription';

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type === 'PUSH_SUBSCRIPTION') {
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients[0]?.postMessage({ type: 'PUSH_SUBSCRIPTION_ACK' });
    });
  }
});

self.addEventListener('push', (event) => {
  let payload: { title?: string; body?: string; url?: string } = {};
  try {
    payload = event.data ? JSON.parse(event.data.text()) : {};
  } catch {
    payload = { title: event.data?.text() ?? 'To The Moon' };
  }
  const title = payload.title ?? 'To The Moon';
  const options: NotificationOptions = {
    body: payload.body ?? 'Your Bitcoin finance update is ready.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.url ?? '/' },
    vibrate: [100, 50, 100],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && url !== '/') client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
