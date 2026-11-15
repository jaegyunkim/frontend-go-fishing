// 앱 셸만 캐시(오프라인 첫 화면). API 응답은 캐시하지 않는다(예보·특보는 항상 최신 조회).
const CACHE = 'gofishing-shell-v28';
const SHELL = ['./', './manifest.webmanifest', './assets/icon.svg'];  // 버전 표시가 붙은 파일은 네트워크 우선으로 받는다
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
