// Service Worker — Ginno push notifications
// Debe estar en la raíz del scope (/ginno/sw.js)

self.addEventListener('push', function (event) {
  if (!event.data) return;
  const data = event.data.json();
  const title   = data.title   || 'Ginno';
  const options = {
    body  : data.body   || '',
    icon  : '/ginno/assets/img/logo.png',
    badge : '/ginno/assets/img/logo.png',
    tag   : data.tag    || 'ginno-recordatorio',
    requireInteraction: false,
    data  : { url: data.url || '/ginno/tareas-equipo.html' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url)
    || '/ginno/tareas-equipo.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('/ginno/') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(target);
    })
  );
});
