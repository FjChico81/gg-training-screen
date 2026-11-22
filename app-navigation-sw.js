// Both editions use the same public HTML shell. API, session and asset requests
// stay outside this worker.
const appRoot = new URL(self.registration.scope);
const shell = new URL('index.html', appRoot);
const shellCache = 'gg-training-screen-public-shell-v1:' + appRoot.pathname;

async function getAppPage(forceFresh = false, signal) {
 const requestUrl = new URL(shell);
 requestUrl.searchParams.set('_gg_launch', String(forceFresh ? Date.now() : Math.floor(Date.now() / 60000) * 60000));
 const response = await fetch(requestUrl, {cache:'no-store', credentials:'omit', signal});
 if (response.ok && response.headers.get('Content-Type')?.includes('text/html')) {
  try {
   const cache = await caches.open(shellCache);
   await cache.put(shell, response.clone());
  } catch { /* A storage failure must not interrupt an online launch. */ }
 }
 return response;
}

self.addEventListener('install', event => {
 event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
 event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
 const {request} = event;
 if (request.mode !== 'navigate' || request.method !== 'GET') return;
 const url = new URL(request.url);
 if (url.origin !== appRoot.origin || (url.pathname !== appRoot.pathname && url.pathname !== shell.pathname)) return;
 const forceFresh = url.searchParams.has('_actualiza');
 event.respondWith((async () => {
  const cached = await caches.open(shellCache).then(cache => cache.match(shell)).catch(() => undefined);
  const controller = cached ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 3500) : undefined;
  let response;
  try {
   response = await getAppPage(forceFresh, controller?.signal);
   if (response.ok) return response;
  } catch { /* Use the previously fetched public shell when offline. */ }
  finally { clearTimeout(timeout); }
  return cached ?? response ?? fetch(request);
 })());
});

self.addEventListener('message', event => {
 if (event.data !== 'cache-public-app-shell') return;
 event.waitUntil(caches.open(shellCache)
  .then(cache => cache.match(shell))
  .then(cached => cached || getAppPage())
  .catch(() => {}));
});
