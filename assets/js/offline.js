// offline.js — Ginno PWA offline support
// Gestiona IndexedDB para encolar check-ins/checkouts sin conexión
// y los sincroniza automáticamente al recuperar señal.

(function () {
  'use strict';

  const DB_NAME    = 'ginno-offline-db';
  const DB_VERSION = 1;
  const STORE      = 'cola';

  let _db = null;

  // ---- IndexedDB helpers ----

  function _openDB() {
    return new Promise(function (resolve, reject) {
      if (_db) { resolve(_db); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  }

  // Encola una solicitud pendiente.
  // url: URL completa del endpoint
  // method: 'POST' | 'PUT'
  // bodyObj: objeto JS que se enviará como JSON
  // Devuelve el item encolado (con id generado)
  function offlineEnqueue(url, method, bodyObj) {
    return _openDB().then(function (db) {
      var item = {
        id        : crypto.randomUUID(),
        url       : url,
        method    : method.toUpperCase(),
        body      : JSON.stringify(bodyObj),
        creado_en : new Date().toISOString(),
      };
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(STORE, 'readwrite');
        var req = tx.objectStore(STORE).add(item);
        req.onsuccess = function () { resolve(item); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  // Devuelve todos los items de la cola (ordenados por creado_en).
  function offlineGetCola() {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = function () {
          var items = req.result || [];
          items.sort(function (a, b) { return a.creado_en.localeCompare(b.creado_en); });
          resolve(items);
        };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  // Elimina un item de la cola por su id.
  function offlineDeleteItem(id) {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
        req.onsuccess = function () { resolve(); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  // Procesa la cola: envía cada request pendiente en orden cronológico.
  // Al terminar refresca la pantalla si las funciones globales están disponibles.
  function offlineProcesarCola() {
    if (!navigator.onLine) return Promise.resolve();

    return offlineGetCola().then(function (items) {
      // Procesar secuencialmente (reduce encadenado de promesas)
      return items.reduce(function (chain, item) {
        return chain.then(function () {
          return fetch(item.url, {
            method  : item.method,
            headers : { 'Content-Type': 'application/json' },
            body    : item.body,
          }).then(function (res) {
            if (res.ok) {
              return offlineDeleteItem(item.id);
            }
          }).catch(function (e) {
            // Red inestable — dejar para próximo intento
            console.warn('[offline] Error al procesar item', item.id, e);
          });
        });
      }, Promise.resolve());
    }).then(function () {
      _actualizarBanner();
      // Refrescar datos en pantalla
      if (typeof cargarVisitasActivas === 'function') {
        try { cargarVisitasActivas(); } catch (e) {}
      }
      if (typeof render === 'function') {
        try { render(); } catch (e) {}
      }
    }).catch(function () {
      _actualizarBanner();
    });
  }

  // ---- Banner de estado ----

  function _actualizarBanner() {
    var banner = document.getElementById('offline-banner');
    if (!banner) return;

    offlineGetCola().then(function (items) {
      if (!navigator.onLine) {
        banner.style.display = 'block';
        banner.textContent = '📵 Sin conexión — los registros se guardarán al recuperar señal';
      } else if (items && items.length > 0) {
        banner.style.display = 'block';
        banner.textContent = '⏳ Sincronizando ' + items.length + ' registro(s) pendiente(s)…';
      } else {
        banner.style.display = 'none';
      }
    }).catch(function () {
      if (!navigator.onLine) {
        banner.style.display = 'block';
        banner.textContent = '📵 Sin conexión — los registros se guardarán al recuperar señal';
      } else {
        banner.style.display = 'none';
      }
    });
  }

  // ---- Inicialización ----

  function offlineInit() {
    // Abrir DB preventivamente
    _openDB().catch(function (e) {
      console.error('[offline] No se pudo abrir IndexedDB', e);
    });

    // Escuchar cambios de conectividad
    window.addEventListener('offline', function () {
      _actualizarBanner();
    });

    window.addEventListener('online', function () {
      _actualizarBanner();
      offlineProcesarCola();
      // Registrar Background Sync en SW si está disponible
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(function (reg) {
          if (reg.sync) {
            reg.sync.register('ginno-sync').catch(function () {});
          }
        });
      }
    });

    // Escuchar mensajes del Service Worker (ej. SYNC_COMPLETE)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (event) {
        if (event.data && event.data.type === 'SYNC_COMPLETE') {
          offlineProcesarCola();
        }
      });
    }

    // Estado inicial del banner
    _actualizarBanner();
  }

  // ---- Exponer API global ----
  window.offlineInit         = offlineInit;
  window.offlineEnqueue      = offlineEnqueue;
  window.offlineGetCola      = offlineGetCola;
  window.offlineDeleteItem   = offlineDeleteItem;
  window.offlineProcesarCola = offlineProcesarCola;

})();
