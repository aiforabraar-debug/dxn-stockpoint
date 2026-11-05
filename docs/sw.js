/**
 * Service worker for the Mohammadpur Stock Point web app.
 *
 * Caches the app shell so the POS opens with no signal; never touches API
 * responses (different origin) so sync always talks to the real server.
 */

const VERSION = 'dxn-stockpoint-2.1.2-r1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './privacy.html',
  './css/app.css',
  './js/app.js',
  './js/api.js',
  './js/store.js',
  './js/ui.js',
  './js/util.js',
  './js/views/catalog.js',
  './js/views/cart.js',
  './js/views/orders.js',
  './js/views/admin.js',
  './js/views/settings.js',
  './js/views/product-form.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/logo-mark-96.png',
  './icons/logo-mark-192.png',
  './icons/logo-full.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './images/products/aloe-body-lotion.jpg',
  './images/products/aloe-cleansing-gel.jpg',
  './images/products/aloe-facial-scrub.jpg',
  './images/products/apple-enzyme.jpg',
  './images/products/apple-jam.jpg',
  './images/products/body-scrub.jpg',
  './images/products/cocozhi.jpg',
  './images/products/cordyceps-cereal.jpg',
  './images/products/cordyceps-coffee.jpg',
  './images/products/cordyceps-powder-30.jpg',
  './images/products/eu-cafe.jpg',
  './images/products/ganozhi-beauty-soap.jpg',
  './images/products/ganozhi-shampoo.jpg',
  './images/products/ganozhi-toothpaste.jpg',
  './images/products/gl-powder-80.jpg',
  './images/products/goji-berry.jpg',
  './images/products/hair-oil.jpg',
  './images/products/lemonzhi.jpg',
  './images/products/lina-yobite.jpg',
  './images/products/lingzhi-black-coffee.jpg',
  './images/products/lingzhi-coffee-3in1.jpg',
  './images/products/lingzhi-coffee-lite.jpg',
  './images/products/lions-mane-coffee.jpg',
  './images/products/lions-mane-lemon-matcha.jpg',
  './images/products/lions-mane-ooocha.jpg',
  './images/products/lions-mane-powder-30.jpg',
  './images/products/masala-tea.jpg',
  './images/products/neem-bathing-bar.jpg',
  './images/products/neem-face-wash.jpg',
  './images/products/oocha-noodles-tyf.jpg',
  './images/products/oocha-noodles.jpg',
  './images/products/papaya-facial-scrub.jpg',
  './images/products/rg-powder-50.jpg',
  './images/products/rishi-gano-tea.jpg',
  './images/products/spirudle.jpg',
  './images/products/spirulina-cereal.jpg',
  './images/products/sun-screen-lotion.jpg',
  './images/products/talcum-powder.jpg',
  './images/products/veggie-noodle.jpg',
  './images/products/vita-cafe.jpg',
  './images/products/white-coffee.jpg',
  './images/products/zhi-mocha-premium.jpg',
  './images/products/zhi-yobite.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // One missing file must not abort the whole install.
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API calls and fonts go straight to the network

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
