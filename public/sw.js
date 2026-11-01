// The Onboarding Hub does not use a service worker. This file only exists to remove one left behind by
// another app that once ran at this address (e.g. the Observation App's offline worker), which can make
// pages spin forever in a regular browser window. Browsers that never installed a worker never load it.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
    })(),
  );
});
