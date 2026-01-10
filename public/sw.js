// public/sw.js
self.addEventListener('install', (event) => {
    console.log('TaxiManager Service Worker: Instalado');
});

self.addEventListener('fetch', (event) => {
    // Esto permite que la app funcione y responda peticiones
    event.respondWith(fetch(event.request));
});