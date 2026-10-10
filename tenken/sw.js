// 古い版のキャッシュだけ消す（同じ場所にある他のアプリのキャッシュは残す）
const VERSION = "gj-v24";
const ASSETS = [
  "./",
  "./index.html",
  "./zumen.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "../common/project.js",
  "../common/keypad.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k.startsWith(VERSION.replace(/\d+$/, ""))).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (e.request.mode === "navigate") {
    // アプリ本体は「ネット優先」: オンラインなら常に最新版、圏外ならキャッシュ
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(VERSION).then(c => { c.put("./index.html", clone.clone()); c.put("./", clone); });
        return res;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }
  // 共通部品（../common/*.js）などのコードは「まず通信」。古い版と新しい画面が食い違わないように
  const u = new URL(e.request.url);
  if (u.origin === location.origin && /\.(?:js|html|webmanifest)$/.test(u.pathname)) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) { const clone = res.clone(); caches.open(VERSION).then(c => c.put(e.request, clone)); }
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(cached => {
      const fetched = fetch(e.request)
        .then(res => {
          if (res.ok && new URL(e.request.url).origin === location.origin) {
            const clone = res.clone();
            caches.open(VERSION).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
