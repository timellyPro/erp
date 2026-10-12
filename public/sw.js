/* Timelly PWA service worker — enables browser install and standalone app mode. */
self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Passthrough network fetch — but a rejected fetch (offline, request aborted by
  // fast navigation, dev server restart mid-request) must not surface as an
  // uncaught promise rejection in the client console.
  event.respondWith(
    fetch(event.request).catch(
      () => new Response("", { status: 503, statusText: "Network error" })
    )
  );
});
