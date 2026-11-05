// Tiene sull'iPad tutti i file dell'app: dopo la prima apertura funziona anche senza internet.
// Cambia VERSIONE a ogni aggiornamento, così l'iPad scarica i file nuovi.
const VERSIONE = 'solitario-3';
const FILE = ["./", "index.html", "logica.js", "occhio.js", "tracciamento.js", "piantina.js", "icona.png", "manifest.json", "carte/c10_faceup.png", "carte/c11_faceup.png", "carte/c12_faceup.png", "carte/c13_faceup.png", "carte/c1_faceup.png", "carte/c2_faceup.png", "carte/c3_faceup.png", "carte/c4_faceup.png", "carte/c5_faceup.png", "carte/c6_faceup.png", "carte/c7_faceup.png", "carte/c8_faceup.png", "carte/c9_faceup.png", "carte/card_facedown.png", "carte/d10_faceup.png", "carte/d11_faceup.png", "carte/d12_faceup.png", "carte/d13_faceup.png", "carte/d1_faceup.png", "carte/d2_faceup.png", "carte/d3_faceup.png", "carte/d4_faceup.png", "carte/d5_faceup.png", "carte/d6_faceup.png", "carte/d7_faceup.png", "carte/d8_faceup.png", "carte/d9_faceup.png", "carte/h10_faceup.png", "carte/h11_faceup.png", "carte/h12_faceup.png", "carte/h13_faceup.png", "carte/h1_faceup.png", "carte/h2_faceup.png", "carte/h3_faceup.png", "carte/h4_faceup.png", "carte/h5_faceup.png", "carte/h6_faceup.png", "carte/h7_faceup.png", "carte/h8_faceup.png", "carte/h9_faceup.png", "carte/s10_faceup.png", "carte/s11_faceup.png", "carte/s12_faceup.png", "carte/s13_faceup.png", "carte/s1_faceup.png", "carte/s2_faceup.png", "carte/s3_faceup.png", "carte/s4_faceup.png", "carte/s5_faceup.png", "carte/s6_faceup.png", "carte/s7_faceup.png", "carte/s8_faceup.png", "carte/s9_faceup.png"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== VERSIONE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});

// prima la rete (così gli aggiornamenti arrivano), e senza rete la copia salvata
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSIONE).then(c => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
