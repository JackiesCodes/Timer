/* TAIMER service worker — keeps the whole sheet usable with no network. */

var CACHE = 'taimer-v10';

var SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './404.html',
  './logo.png',
  './share-card.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE)
      // One missing file must not fail the whole install, so each is added
      // on its own and a failure is tolerated.
      .then(function (cache) {
        return Promise.all(SHELL.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Serve from the cache first — the sheet never needs the network — while
  // quietly refreshing the copy whenever the network happens to be there.
  ev.respondWith(
    caches.match(req).then(function (hit) {
      var live = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });

      if (hit) return hit;
      return live.then(function (res) {
        return res || caches.match('./index.html');
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});

self.addEventListener('message', function (ev) {
  if (ev.data === 'skipWaiting') self.skipWaiting();
});
