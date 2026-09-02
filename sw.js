/* ランチャー用 Service Worker（サブアプリは各ディレクトリの sw.js が担当）

   HTML・JS は「まず通信、だめならキャッシュ」。
   古いキャッシュのまま新しい画面と食い違うのを防ぐため、コードは常に最新を取りに行く。
   アイコンなどは「まずキャッシュ」で速さを優先する。 */
const VERSION = "sys-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./common/project.js",
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
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
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
