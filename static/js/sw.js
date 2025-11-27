const CACHE_NAME = "pwa-clientes-static-v3";
const DYNAMIC_CACHE = "pwa-clientes-dynamic-v3";

const PRECACHE_URLS = [
  "/",
  "/login",
  "/static/css/styles.css",
  "/static/js/app.js",
  "/static/js/clientes.js",
  "/static/img/logo.png",
  "/static/img/icons/icon-192.png",
  "/static/img/icons/icon-512.png",
  "/manifest.json",
];

// Rutas protegidas que NO deben cachearse sin sesión válida
const PROTECTED_ROUTES = ["/dashboard", "/clientes"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Estrategia cache-first con fallback a red
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    url.pathname.startsWith(route)
  );

  // Para las APIs (datos dinámicos) usamos estrategia network-first
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Solo cachear si la respuesta es exitosa
          if (networkResponse.ok) {
            return caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, networkResponse.clone());
              return networkResponse;
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Si no hay red, devolver lo que haya en caché (si existe)
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(
              JSON.stringify({
                success: false,
                error: "Sin conexión y sin datos en caché",
              }),
              {
                status: 503,
                headers: { "Content-Type": "application/json" },
              }
            );
          });
        })
    );
    return;
  }

  // Para rutas protegidas: network-first (siempre preguntar al servidor primero)
  if (isProtectedRoute) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Solo cachear si la respuesta es 200 (sesión válida)
          if (networkResponse.ok && networkResponse.status === 200) {
            return caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, networkResponse.clone());
              return networkResponse;
            });
          }
          // Si no es 200 (ej: 302 redirect a login), no cachear y devolver tal cual
          return networkResponse;
        })
        .catch(() => {
          // Si estamos offline, intentar devolver desde caché solo si existe
          return caches.match(request).then((cachedPage) => {
            if (cachedPage) return cachedPage;
            // Si no hay caché, redirigir a login
            return Response.redirect(new URL("/login", self.location.origin));
          });
        })
    );
    return;
  }

  // Resto de recursos: cache-first con fallback a red
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          // Solo cachear si la respuesta es exitosa
          if (networkResponse.ok) {
            return caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, networkResponse.clone());
              return networkResponse;
            });
          }
          return networkResponse;
        })
        .catch(() => {
          if (request.mode === "navigate") {
            // Si estamos offline, intentar devolver la página solicitada desde caché
            return caches.match(request).then((cachedPage) => {
              if (cachedPage) return cachedPage;
              // Si no está, devolver la home como fallback genérico
              return caches.match("/");
            });
          }
          return new Response("Sin conexión y el recurso no está en caché.", {
            status: 503,
            statusText: "Offline",
          });
        });
    })
  );
});






