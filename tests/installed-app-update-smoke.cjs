const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const head = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const worker = readFileSync(resolve(root, 'app-navigation-sw.js'), 'utf8');
const scope = 'https://example.test/gg-training-screen/';

function launch(path, { saved, offline = false } = {}) {
 const title = html.match(/<title>([^<]+)<\/title>/)[1];
 const redirects = [];
 const url = new URL(path, scope);
 const state = { version: saved };
 const document = {
  title, documentElement: { dataset: {} }, head: { append() {} },
  querySelector: () => ({ remove() {} }),
  getElementById: () => ({ href: 'test.png' }), createElement: () => ({})
 };
 const context = vm.createContext({
  document, URL, URLSearchParams, navigator: { onLine: !offline },
  location: { href: url.href, search: url.search, replace: href => redirects.push(new URL(href)) },
  localStorage: { getItem: () => state.version, setItem: (_, version) => { state.version = version; } }
 });
 vm.runInContext(head, context);
 return { redirects, state, document, version: title.match(/\d+\.\d+\.\d+$/)[0] };
}

test('a returning icon launches the highest previously served version while keeping edition and profile', () => {
 const first = launch('?app=hf&perfil=test');
 assert.equal(first.state.version, first.version);
 assert.equal(first.redirects.length, 0);
 const cached = launch('?app=hf&perfil=test', { saved: '3.11.0' });
 assert.equal(cached.redirects.length, 1);
 const params = cached.redirects[0].searchParams;
 assert.equal(params.get('app'), 'hf');
 assert.equal(params.get('perfil'), 'test');
 assert.equal(params.get('_gg_v'), '3.11.0');
 assert.match(params.get('_actualiza'), /^\d+$/);
 assert.equal(cached.state.version, '3.11.0');
 assert.equal(cached.document.documentElement.dataset.access, 'locked');
 assert.equal(launch('?app=hf&_gg_v=3.11.0', { saved: '3.11.0' }).redirects.length, 0);
 assert.equal(launch('', { saved: '3.11.0', offline: true }).redirects.length, 0);
});

test('the worker refreshes only the two public entry paths and can reopen their HTML offline', async () => {
 const handlers = new Map();
 const cacheEntries = new Map();
 const requests = [];
 let online = true;
 let skipped = false;
 let claimed = false;
 const cache = {
  put: async (key, response) => cacheEntries.set(String(key), response),
  match: async key => cacheEntries.get(String(key))?.clone()
 };
 vm.runInNewContext(worker, {
  URL, AbortController, setTimeout, clearTimeout,
  self: {
   registration: { scope }, addEventListener: (name, handler) => handlers.set(name, handler),
   skipWaiting: async () => { skipped = true; }, clients: { claim: async () => { claimed = true; } }
  },
  caches: { open: async () => cache },
  fetch: async (url, options) => {
   requests.push({ url: new URL(url), options });
   if (!online) throw Error('Sin conexión');
   return new Response('app-html', { headers: { 'Content-Type': 'text/html' } });
  }
 });
 function dispatch(name, fields = {}) {
  let response;
  handlers.get(name)({ ...fields, waitUntil: p => { response = p; }, respondWith: p => { response = p; } });
  return response;
 }
 await dispatch('install');
 await dispatch('activate');
 assert.ok(skipped && claimed);
 await dispatch('message', { data: 'cache-public-app-shell' });
 assert.equal(cacheEntries.size, 1);
 await dispatch('message', { data: 'cache-public-app-shell' });
 assert.equal(requests.length, 1);

 function navigate(path, mode = 'navigate') {
  return dispatch('fetch', { request: { url: new URL(path, scope).href, method: 'GET', mode } });
 }
 assert.equal(navigate('hf-class-display.html'), undefined);
 assert.equal(navigate('https://database.example/api'), undefined);
 assert.equal(navigate('?_gg_check=1', 'cors'), undefined);
 assert.equal(await (await navigate('?app=hf&perfil=test')).text(), 'app-html');
 assert.equal(await (await navigate('index.html?_actualiza=123')).text(), 'app-html');
 for (const { url, options } of requests) {
  assert.equal(url.pathname, '/gg-training-screen/index.html');
  assert.match(url.searchParams.get('_gg_launch'), /^\d+$/);
  assert.equal(url.searchParams.has('perfil'), false);
  assert.equal(options.cache, 'no-store');
  assert.equal(options.credentials, 'omit');
 }
 online = false;
 assert.equal(await (await navigate('')).text(), 'app-html');
 assert.equal(cacheEntries.size, 1);
});
