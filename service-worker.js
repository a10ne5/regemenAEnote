'use strict';
// This app owns only this prefix. Never delete the original application's cache.
const CACHE_PREFIX = 'regimen-pocket-guide-';
const CACHE_NAME = `${CACHE_PREFIX}v8`;
const SHELL = ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icon.svg'];
const scopedURL = path => new URL(path, self.registration.scope).href;
const SHELL_URLS = SHELL.map(scopedURL);
const SHELL_SET = new Set(SHELL_URLS);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_URLS.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const isDocument = event.request.mode === 'navigate';
  const isAppDocument = isDocument && (url.pathname === new URL(self.registration.scope).pathname || url.pathname === new URL(scopedURL('index.html')).pathname);
  if (!isAppDocument && !SHELL_SET.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const key = isAppDocument ? scopedURL('index.html') : event.request;
    try {
      const response = await fetch(event.request, { cache: 'no-cache' });
      if (response.ok) {
        try { await cache.put(key, response.clone()); } catch (_) { /* Display the network response even if storage is unavailable. */ }
        return response;
      }
      const cached = await cache.match(key);
      return cached || response;
    } catch (error) {
      const cached = await cache.match(key);
      if (cached) return cached;
      throw error;
    }
  })());
});
