/* Matte Office: online-only installation support.
 * No fetch handler and no Cache Storage: pages, credentials, API responses,
 * socket traffic and audio/video keep their normal network behavior.
 */
self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim())
})
