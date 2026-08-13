/* VATask service worker — web push + offline shell for installed shortcut */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'VATask', body: '', link: '/' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = {
        title: parsed.title || 'VATask',
        body: parsed.body || '',
        link: parsed.link || '/',
      };
    }
  } catch (_) {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch (_) {
      /* ignore */
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo.png',
      badge: '/logo.png',
      data: { link: data.link },
      tag: 'vatask-notif',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  const path = link.startsWith('/') ? link : `/${link}`;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            client.postMessage({ type: 'vatask-navigate', path });
            return client.focus();
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(path);
      }
      return undefined;
    })
  );
});
