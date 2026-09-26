/* 事前調査アプリ用 Service Worker（図面・調査結果は IndexedDB と localStorage にあり、ここでは扱わない）

   HTML・JS は「まず通信、だめならキャッシュ」。
   古いキャッシュのまま新しい画面と食い違うのを防ぐため、コードは常に最新を取りに行く。
   アイコンなどは「まずキャッシュ」で速さを優先する。 */
// 古い版のキャッシュだけ消す（同じ場所にある他のアプリのキャッシュは残す）
const VERSION = "jizen-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k.startsWith(VERSION.replace(/\d+$/, ""))).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCode(url) {
  return /\.(?:html|js|webmanifest)$/.test(url.pathname) || url.pathname.endsWith("/");
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === "navigate" || isCode(url)) {
    // コードは最新を優先（オフラインならキャッシュ）
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(VERSION).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then(c => c || caches.match("./index.html")))
    );
    return;
  }

  // 画像などはキャッシュ優先
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => cached || fetch(req).then(res => {
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(VERSION).then(c => c.put(req, clone));
      }
      return res;
    }))
  );
});
