/* 事件镜 Service Worker
 *
 * 缓存策略（与 README「失败不伪造行情」保持一致）：
 * - 静态资源（JS/CSS/图片/字体/manifest）：cache-first，离线可用。
 * - /api/* 与一切行情/工作区数据：只走网络，绝不写入缓存，
 *   网络失败时让请求直接失败，由页面展示错误态，绝不把过期
 *   行情当新鲜数据展示。
 * - 页面导航：network-first，离线时回退到已缓存的应用外壳。
 */

const STATIC_CACHE = "event-mirror-static-v1";
const SHELL_CACHE = "event-mirror-shell-v1";
const PRECACHE_URLS = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (isApiRequest(url)) return false;
  return (
    /\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|webmanifest|json)$/.test(
      url.pathname,
    ) || url.pathname.startsWith("/_next/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 数据请求：只走网络，绝不缓存。失败即失败，不伪造行情。
  if (isApiRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // 静态资源：cache-first。
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // 页面导航：network-first，离线回退应用外壳。
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/")),
    );
  }
});
