// Service Worker — Ginno
// Scope: /ginno/
// Funciones:
//   1. Push notifications (existente)
//   2. Caché offline de assets estáticos y respuestas de API (Network First / Cache First)
//   3. Background Sync para procesar cola offline al recuperar señal

// ======================================================
// Caché offline
// ======================================================
var CACHE_NAME = 'ginno-v1';

// Assets mínimos a pre-cachear en install.
// Los demás se cachean automáticamente la primera vez que se solicitan.
var STATIC_PRECACHE = [
  '/ginno/tareas-equipo.html',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_PRECACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  var url = req.url;

  // Solo interceptar GETs dentro del scope de Ginno
  if (req.method !== 'GET') return;
  if (!url.startsWith('https://grupoinnovate.com/ginno/')) return;

  var isAPI = url.includes('/backend/api/');

  if (isAPI) {
    // Network First: intenta red, cae a caché si falla
    event.respondWith(
      fetch(req).then(function (res) {
        if (res.ok) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, clone); });
        }
        return res;
      }).catch(function () {
        return caches.match(req);
      })
    );
  } else {
    // Cache First: sirve desde caché si existe; si no, busca en red y cachea
    event.respondWith(
      caches.match(req).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (res) {
          if (res.ok) {
            var clone = res.clone();
            caches.open(CACHE_NAME).then(function (c) { c.put(req, clone); });
          }
          return res;
        });
      })
    );
  }
});

// ======================================================
// Background Sync — procesa cola offline
// ======================================================
self.addEventListener('sync', function (event) {
  if (event.tag === 'ginno-sync') {
    event.waitUntil(_swProcesarCola());
  }
});

function _swOpenDB() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open('ginno-offline-db', 1);
    req.onsuccess = function (e) { resolve(e.target.result); };
    req.onerror   = function (e) { reject(e.target.error); };
  });
}

function _swProcesarCola() {
  var db;
  return _swOpenDB().then(function (d) {
    db = d;
    return new Promise(function (resolve, reject) {
      var req = db.transaction('cola', 'readonly').objectStore('cola').getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  }).then(function (items) {
    // Ordenar cronológicamente (check-in antes de checkout)
    items.sort(function (a, b) { return a.creado_en.localeCompare(b.creado_en); });

    return items.reduce(function (chain, item) {
      return chain.then(function () {
        return fetch(item.url, {
          method  : item.method,
          headers : { 'Content-Type': 'application/json' },
          body    : item.body,
        }).then(function (res) {
          if (res.ok) {
            return new Promise(function (resolve, reject) {
              var del = db.transaction('cola', 'readwrite').objectStore('cola').delete(item.id);
              del.onsuccess = function () { resolve(); };
              del.onerror   = function (e) { reject(e.target.error); };
            });
          }
        }).catch(function () {
          // Falla de red — Background Sync reintentará automáticamente
        });
      });
    }, Promise.resolve());
  }).then(function () {
    // Notificar a las páginas abiertas para que recarguen los datos
    return self.clients.matchAll({ type: 'window' }).then(function (clients) {
      clients.forEach(function (client) {
        client.postMessage({ type: 'SYNC_COMPLETE' });
      });
    });
  }).catch(function (e) {
    console.error('[SW] Error procesando cola offline', e);
  });
}

// ======================================================
// Push notifications (original)
// ======================================================
self.addEventListener('push', function (event) {
  if (!event.data) return;
  var data    = event.data.json();
  var title   = data.title || 'Ginno';
  var options = {
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
  var target = (event.notification.data && event.notification.data.url)
    || '/ginno/tareas-equipo.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.includes('/ginno/') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(target);
    })
  );
});
