// Occhio: dalla fotocamera al tavolo di cardgames.io/solitaire.
// 1) aggancio: cerca le carte (zone chiare a forma di carta), ne ricava il colore del tavolo (qualsiasi),
//    trova i quattro angoli del tavolo e lo raddrizza; poi cerca le pile e ne ricava scala e griglia,
//    come _da_pile del programma Python.
// 2) lettura: a ogni fotogramma raddrizza il tavolo a S pixel per punto CSS e legge le carte con le
//    immagini del sito (cartella carte/), come la classe Occhio del Python.

// --- Geometria del sito (dal suo codice, solitaire.min.js), in punti "carta larga 69" dall'area di gioco.
// La carta è sempre 69 x 94 in queste unità e le carte di una colonna stanno a 0,26 altezze (24 punti).
// Quello che CAMBIA con la larghezza della finestra è la distanza fra le colonne (69 + spazio, 85 di
// solito): la misuro all'aggancio e imposto la griglia con impostaPasso().
const CW = 69, CH = 94;
const TOPY = 162;            // 30 + 1,4 altezze di carta
const STOCK = [61, 30];
const FY = 30;
const PASSO = 24;            // distanza fra due carte di una colonna (coperte e scoperte)
let PASSO_COL = 85;
let COLX = [], WASTE = [], FOUND_X = {};
function impostaPasso(p) {
  PASSO_COL = p;
  COLX = [0, 1, 2, 3, 4, 5, 6].map(i => 61 + p * i);
  WASTE = [61 + p, 30];
  FOUND_X = {h: 61 + 3 * p, s: 61 + 4 * p, d: 61 + 5 * p, c: 61 + 6 * p};
}
impostaPasso(85);
let S = 1.5;                 // pixel per punto CSS dell'immagine di lavoro: 1,5 o 2, secondo quanti pixel
const SCALE_LAVORO = [1.5, 2];  // dà la fotocamera per ogni punto del tavolo (più pixel = carte più nitide)
const ALT_MAX = 820;         // quanti punti CSS leggere in altezza al massimo

// soglie (più basse del Python: la fotocamera sfoca e ha riflessi)
const SOGLIA_CARTA = 0.55;
const SOGLIA_VALORE = 0.62;
const SOGLIA_DORSO = 0.45;
const DIFF_FELTRO = 40;
const NON_CHIARA = 'non chiara';
const MARGINE_MIN = 0.012;          // stacco minimo dalla seconda ipotesi per fidarsi di una carta   // c'è una carta ma non si legge

// ---------------------------------------------------------------- immagini in grigio e confronto

function grigio(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  return g;
}

/** Immagine in grigio con le somme cumulate (per il confronto normalizzato veloce). */
function conIntegrali(g, w, h) {
  const I = new Float64Array((w + 1) * (h + 1)), I2 = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let s = 0, s2 = 0;
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x]; s += v; s2 += v * v;
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + s;
      I2[(y + 1) * (w + 1) + x + 1] = I2[y * (w + 1) + x + 1] + s2;
    }
  }
  return {g, w, h, I, I2};
}

function modello(g, w, h) {
  let m = 0;
  for (let i = 0; i < g.length; i++) m += g[i];
  m /= g.length;
  const d = new Float32Array(g.length);
  let n2 = 0;
  for (let i = 0; i < g.length; i++) { d[i] = g[i] - m; n2 += d[i] * d[i]; }
  return {w, h, d, norma: Math.sqrt(n2) || 1};
}

/** Confronto normalizzato (come cv2.TM_CCOEFF_NORMED) del modello T in una posizione. */
function punteggio(im, T, px, py) {
  const W = im.w, g = im.g, d = T.d, tw = T.w, th = T.h;
  let dot = 0;
  for (let y = 0; y < th; y++) {
    const r = (py + y) * W + px, t = y * tw;
    for (let x = 0; x < tw; x++) dot += d[t + x] * g[r + x];
  }
  const W1 = W + 1, a = py * W1 + px, b = a + tw, c = (py + th) * W1 + px, e = c + tw;
  const s = im.I[e] - im.I[b] - im.I[c] + im.I[a];
  const s2 = im.I2[e] - im.I2[b] - im.I2[c] + im.I2[a];
  const varianza = s2 - s * s / (tw * th);
  return varianza > 1 ? dot / (T.norma * Math.sqrt(varianza)) : 0;
}

/** Miglior posizione del modello T nel rettangolo [x0,x1) x [y0,y1): prima a passi di 2, poi rifinita. */
function cerca(im, T, x0, y0, x1, y1) {
  x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(im.w, Math.round(x1)) - T.w; y1 = Math.min(im.h, Math.round(y1)) - T.h;
  let best = {s: -1, x: x0, y: y0};
  if (x1 < x0 || y1 < y0) return best;
  for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
    const s = punteggio(im, T, x, y);
    if (s > best.s) best = {s, x, y};
  }
  const bx = best.x, by = best.y;
  for (let y = Math.max(y0, by - 1); y <= Math.min(y1, by + 1); y++)
    for (let x = Math.max(x0, bx - 1); x <= Math.min(x1, bx + 1); x++) {
      const s = punteggio(im, T, x, y);
      if (s > best.s) best = {s, x, y};
    }
  return best;
}

/** Per ogni riga del rettangolo, il punteggio massimo del modello lungo la riga. */
function massimiPerRiga(im, T, x0, y0, x1, y1) {
  x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(im.w, Math.round(x1)) - T.w; y1 = Math.min(im.h, Math.round(y1)) - T.h;
  const out = [];
  for (let y = y0; y <= y1; y++) {
    let m = -1;
    for (let x = x0; x <= x1; x += 2) { const s = punteggio(im, T, x, y); if (s > m) m = s; }
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------- immagini delle carte

function caricaImmagine(url) {
  return new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => no(new Error('immagine mancante: ' + url));
    im.src = url;
  });
}

async function caricaModelli(base = 'carte/') {
  const tutti = {};
  for (const scala of SCALE_LAVORO) tutti[scala] = await caricaModelliA(base, scala);
  return tutti;
}

async function caricaModelliA(base, scala) {
  const k = scala / 2;   // le immagini del sito sono a 2 pixel per punto
  const tela = document.createElement('canvas');
  const ctx = tela.getContext('2d', {willReadFrequently: true});
  async function img(nome) {
    const im = await caricaImmagine(base + nome);
    const w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
    tela.width = w; tela.height = h;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(im, 0, 0, w, h);
    return {g: grigio(ctx.getImageData(0, 0, w, h).data, w, h), w, h};
  }
  // ritaglio dato in pixel delle immagini originali (x0, y0, x1, y1)
  function ritaglia(a, x0, y0, x1, y1) {
    x0 = Math.round(x0 * k); y0 = Math.round(y0 * k); x1 = Math.round(x1 * k); y1 = Math.round(y1 * k);
    const w = x1 - x0, h = y1 - y0, g = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = a.g[(y0 + y) * a.w + x0 + x];
    return modello(g, w, h);
  }
  // la fotocamera sfoca: preparo i modelli a più livelli di sfocatura e all'aggancio scelgo quello giusto
  const carte = [];
  for (const s of 'hsdc') for (let r = 1; r <= 13; r++) carte.push({r, s, a: await img(`${s}${r}_faceup.png`)});
  const dorso = await img('card_facedown.png');
  const livelli = [];
  for (const sig0 of SFOCATURE) {
    const sig = sig0 * scala / 1.5;   // la stessa sfocatura in punti, a qualunque scala
    const sf = a => ({...a, g: sfoca(a.g, a.w, a.h, sig)});
    const M = {sig, id: [], valore: {}};
    for (const {r, s, a} of carte) {
      const b = sf(a);
      M.id.push({carta: [r, s], rosso: 'hd'.includes(s), T: ritaglia(b, 2, 4, 40, 82), intera: ritaglia(b, 0, 0, 138, 188)});
      if (s === 's') M.valore[r] = ritaglia(b, 2, 4, 40, 46);
    }
    const d = sf(dorso);
    M.dorso = ritaglia(d, 8, 8, 70, 90);
    livelli.push(M);
  }
  return livelli;
}

const SFOCATURE = [0, 0.9, 1.6, 2.4];   // in pixel dell'immagine di lavoro a scala 1,5

/** Sfocatura gaussiana (separabile) di un'immagine in grigio. */
function sfoca(g, w, h, sig) {
  if (!sig) return g;
  const r = Math.ceil(sig * 3), k = [];
  let somma = 0;
  for (let i = -r; i <= r; i++) { k.push(Math.exp(-i * i / (2 * sig * sig))); somma += k[k.length - 1]; }
  for (let i = 0; i < k.length; i++) k[i] /= somma;
  const t = new Float32Array(g.length), o = new Float32Array(g.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) a += k[i + r] * g[y * w + Math.min(w - 1, Math.max(0, x + i))];
    t[y * w + x] = a;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) a += k[i + r] * t[Math.min(h - 1, Math.max(0, y + i)) * w + x];
    o[y * w + x] = a;
  }
  return o;
}

// ---------------------------------------------------------------- aggancio del tavolo

/** Zone chiare, poco colorate, a forma di carta o di colonna di carte. ImageData piccola. */
function zoneCarte(px, W, H) {
  const N = W * H, L = new Float32Array(N), Sat = new Float32Array(N), isto = new Uint32Array(256);
  for (let i = 0; i < N; i++) {
    const r = px[4 * i], g = px[4 * i + 1], b = px[4 * i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    L[i] = 0.299 * r + 0.587 * g + 0.114 * b; Sat[i] = mx ? (mx - mn) / mx : 0; isto[L[i] | 0]++;
  }
  let acc = 0, p97 = 255;
  for (let v = 0; v < 256; v++) { acc += isto[v]; if (acc >= 0.97 * N) { p97 = v; break; } }
  const soglia = Math.max(95, p97 * 0.78);
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) mask[i] = L[i] > soglia && Sat[i] < 0.38 ? 1 : 0;
  const zone = componenti(mask, W, H);
  let carte = zone.filter(z => {
    const asp = z.h / z.w, pieno = z.n / (z.w * z.h);
    const tocca = z.x <= 1 || z.y <= 1 || z.x + z.w >= W - 1 || z.y + z.h >= H - 1;
    return z.w >= 5 && z.n >= N * 0.0004 && z.n <= N * 0.07 && asp >= 1.1 && asp <= 7 && pieno >= 0.35 && !tocca;
  });
  if (carte.length) {
    const larg = carte.map(z => z.w).sort((a, b) => a - b), med = larg[larg.length >> 1];
    carte = carte.filter(z => z.w >= med * 0.72 && z.w <= med * 1.35);
  }
  return {carte, mask};
}

/** Zone collegate (4 vicini) di una maschera 0/1: [{x,y,w,h,n,id}], e le etichette. */
function componenti(mask, W, H, conEtichette = false) {
  const N = W * H, lab = new Int32Array(N), pila = new Int32Array(N), zone = [];
  for (let s = 0; s < N; s++) {
    if (!mask[s] || lab[s]) continue;
    const id = zone.length + 1;
    let n = 0, top = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    pila[top++] = s; lab[s] = id;
    while (top) {
      const p = pila[--top]; n++;
      const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; pila[top++] = p - 1; }
      if (x < W - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; pila[top++] = p + 1; }
      if (y > 0 && mask[p - W] && !lab[p - W]) { lab[p - W] = id; pila[top++] = p - W; }
      if (y < H - 1 && mask[p + W] && !lab[p + W]) { lab[p + W] = id; pila[top++] = p + W; }
    }
    zone.push({x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n, id});
  }
  return conEtichette ? {zone, lab} : zone;
}

/** Omografia che porta i 4 punti src nei 4 punti dst: funzione (x,y) -> [x,y]. */
function omografia(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {   // eliminazione di Gauss
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return (x, y) => {
    const z = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / z, (h[3] * x + h[4] * y + h[5]) / z];
  };
}

const distanza = (px, j, f) => Math.max(Math.abs(px[j] - f[0]), Math.abs(px[j + 1] - f[1]), Math.abs(px[j + 2] - f[2]));

/**
 * Aggancia il tavolo in un fotogramma (ImageData a piena risoluzione).
 * Restituisce {css2img, alt, feltro, angoli} oppure {errore}.
 */
/** Angoli del tavolo trovati da soli: carte -> colore del tavolo -> zona di quel colore -> i suoi 4 angoli. */
function angoliAutomatici(frame) {
  const FW = frame.width, FH = frame.height;
  let angoli, tocca;
  // 1. carte e colore del tavolo, su una copia piccola
  const W = 480, H = Math.round(FH * W / FW), k = FW / W;
  const piccola = riduci(frame, W, H);
  const {carte, mask} = zoneCarte(piccola, W, H);
  if (carte.length < 3) return {errore: 'Non vedo le carte: inquadra tutto il tavolo, più vicino.'};
  let ux0 = W, uy0 = H, ux1 = 0, uy1 = 0;
  for (const z of carte) { ux0 = Math.min(ux0, z.x); uy0 = Math.min(uy0, z.y); ux1 = Math.max(ux1, z.x + z.w); uy1 = Math.max(uy1, z.y + z.h); }
  const cw = carte.map(z => z.w).sort((a, b) => a - b)[carte.length >> 1];
  ux0 = Math.max(0, ux0 - cw); uy0 = Math.max(0, uy0 - cw); ux1 = Math.min(W, ux1 + cw); uy1 = Math.min(H, uy1 + cw);
  const conta = new Map();
  for (let y = uy0 | 0; y < uy1; y++) for (let x = ux0 | 0; x < ux1; x++) {
    const i = y * W + x; if (mask[i]) continue;
    const j = 4 * i, q = (piccola[j] >> 4) << 8 | (piccola[j + 1] >> 4) << 4 | (piccola[j + 2] >> 4);
    conta.set(q, (conta.get(q) || 0) + 1);
  }
  let qmax = -1, nmax = 0;
  for (const [q, n] of conta) if (n > nmax) { nmax = n; qmax = q; }
  let fr = 0, fg = 0, fb = 0, fn = 0;
  for (let y = uy0 | 0; y < uy1; y++) for (let x = ux0 | 0; x < ux1; x++) {
    const j = 4 * (y * W + x), q = (piccola[j] >> 4) << 8 | (piccola[j + 1] >> 4) << 4 | (piccola[j + 2] >> 4);
    if (q === qmax) { fr += piccola[j]; fg += piccola[j + 1]; fb += piccola[j + 2]; fn++; }
  }
  const feltro = [fr / fn, fg / fn, fb / fn];
  // 2. la zona del tavolo: pixel del colore del tavolo collegati fra loro, la più grande vicino alle carte
  const fm = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) fm[i] = distanza(piccola, 4 * i, feltro) < DIFF_FELTRO ? 1 : 0;
  const {zone, lab} = componenti(fm, W, H, true);
  // la zona con più pixel attorno alle carte (non basta il rettangolo: la stanza buia lo contiene tutto)
  const vicini = new Map();
  for (let y = uy0 | 0; y < uy1; y++) for (let x = ux0 | 0; x < ux1; x++) {
    const id = lab[y * W + x];
    if (id) vicini.set(id, (vicini.get(id) || 0) + 1);
  }
  let tav = null, nv = 0;
  for (const [id, n] of vicini) if (n > nv) { nv = n; tav = zone[id - 1]; }
  if (!tav || tav.n < W * H * 0.05) return {errore: 'Non trovo il tavolo attorno alle carte.'};
  // angoli: i punti più estremi in diagonale
  let tl = [0, 0, Infinity], tr = [0, 0, -Infinity], br = [0, 0, -Infinity], bl = [0, 0, Infinity];
  for (let y = tav.y; y < tav.y + tav.h; y++) for (let x = tav.x; x < tav.x + tav.w; x++) {
    if (lab[y * W + x] !== tav.id) continue;
    const s = x + y, d = x - y;
    if (s < tl[2]) tl = [x, y, s]; if (s > br[2]) br = [x, y, s];
    if (d > tr[2]) tr = [x, y, d]; if (d < bl[2]) bl = [x, y, d];
  }
  tocca = tav.x <= 1 || tav.y <= 1 || tav.x + tav.w >= W - 1 || tav.y + tav.h >= H - 1;
  angoli = [tl, tr, br, bl].map(p => [p[0] * k + k / 2, p[1] * k + k / 2]);
  return {feltro, angoli, tocca};
}

/** Angoli indicati col dito (in alto a sinistra, alto destra, basso destra, basso sinistra): il colore del
 *  tavolo lo prendo appena dentro gli angoli e a metà dei lati, dove non ci sono carte. */
function daAngoliManuali(frame, angoli) {
  const [tl, tr, br, bl] = angoli;
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const centro = lerp(lerp(tl, br, 0.5), lerp(tr, bl, 0.5), 0.5);
  const punti = [];
  for (const p of [tl, tr, br, bl, lerp(tl, tr, 0.5), lerp(bl, br, 0.5), lerp(tl, bl, 0.5), lerp(tr, br, 0.5)])
    for (const t of [0.03, 0.05]) punti.push(lerp(p, centro, t));
  const canali = [[], [], []];
  for (const [x, y] of punti) {
    const j = 4 * (Math.round(y) * frame.width + Math.round(x));
    for (let c = 0; c < 3; c++) canali[c].push(frame.data[j + c]);
  }
  const feltro = canali.map(a => a.sort((p, q) => p - q)[a.length >> 1]);
  return {feltro, angoli};
}

function aggancia(frame, manuali = null) {
  const FW = frame.width, FH = frame.height;
  let feltro, angoli, tocca = false;
  if (manuali) ({feltro, angoli} = daAngoliManuali(frame, manuali));
  else {
    const r = angoliAutomatici(frame);
    if (r.errore) return r;
    ({feltro, angoli, tocca} = r);
  }
  // 3. tavolo raddrizzato (grandezza qualsiasi) e ricerca delle pile, come _da_pile
  const lungO = (Math.hypot(angoli[1][0] - angoli[0][0], angoli[1][1] - angoli[0][1]) + Math.hypot(angoli[2][0] - angoli[3][0], angoli[2][1] - angoli[3][1])) / 2;
  const lungV = (Math.hypot(angoli[3][0] - angoli[0][0], angoli[3][1] - angoli[0][1]) + Math.hypot(angoli[2][0] - angoli[1][0], angoli[2][1] - angoli[1][1])) / 2;
  const RW = 720, RH = Math.round(RW * lungV / lungO);
  const r2img = omografia([[0, 0], [RW, 0], [RW, RH], [0, RH]], angoli);
  const rett = deforma(frame, RW, RH, (x, y) => r2img(x, y));
  const nf = new Uint8Array(RW * RH);
  for (let i = 0; i < RW * RH; i++) nf[i] = distanza(rett, 4 * i, feltro) > 45 ? 1 : 0;
  let pile = componenti(nf, RW, RH).filter(p => p.w > RW * 0.025 && p.h >= 1.25 * p.w);
  const larghezze = pile.map(p => p.w).filter(w => w > RW * 0.05);
  if (pile.length < 3 || !larghezze.length) return {errore: 'Vedo il tavolo ma non le pile di carte: tienilo più dritto.', angoli};
  const larg = larghezze.reduce((best, l) => {
    const n = larghezze.filter(m => Math.abs(m - l) < 0.06 * l).length;
    return n > best[1] || (n === best[1] && l > best[0]) ? [l, n] : best;
  }, [0, -1])[0];
  pile = pile.filter(p => Math.abs(p.w - larg) < 0.12 * larg);
  if (pile.length < 3) return {errore: 'Vedo il tavolo ma non le pile di carte: tienilo più dritto.', angoli};
  // scala: dalla larghezza delle carte (69 punti), misurata a metà fra il bianco della carta e il
  // colore del tavolo: così la sfocatura allarga e restringe i bordi in modo uguale e non sposta la misura
  const misure = [];
  for (const p of pile) {
    const yc = Math.round(p.y + p.h - larg * 0.68), riga = [];
    if (yc < 3 || yc >= RH - 3) continue;
    for (let x = Math.max(0, p.x - 6); x < Math.min(RW, p.x + p.w + 6); x++) {
      let v = 0;
      for (let y = yc - 2; y <= yc + 2; y++) { const j = 4 * (y * RW + x); v += 0.299 * rett[j] + 0.587 * rett[j + 1] + 0.114 * rett[j + 2]; }
      riga.push(v / 5);
    }
    const F = 0.299 * feltro[0] + 0.587 * feltro[1] + 0.114 * feltro[2];
    const Wb = Math.max(...riga), soglia = (Wb + F) / 2;
    if (Wb - F < 30) continue;
    const su = riga.findIndex(v => v > soglia), giu = riga.length - 1 - [...riga].reverse().findIndex(v => v > soglia);
    if (su <= 0 || giu >= riga.length - 1) continue;
    const a = su - 1 + (soglia - riga[su - 1]) / (riga[su] - riga[su - 1]);
    const b = giu + (riga[giu] - soglia) / (riga[giu] - riga[giu + 1]);
    misure.push(b - a);
  }
  const largPrecisa = misure.length >= 2 ? misure.sort((a, b) => a - b)[misure.length >> 1] : larg;
  let kr = (Math.abs(largPrecisa / larg - 1) < 0.12 ? largPrecisa : larg) / CW;
  // distanza fra le colonne: quella che fa cadere meglio tutte le pile su una griglia regolare
  // (nel sito è 69 + uno spazio che dipende dalla larghezza della finestra)
  const xs = pile.map(p => p.x).sort((a, b) => a - b);
  let migliori = [];
  for (let P = larg * 1.04; P <= larg * 1.7; P += 0.2) {
    let punti = 0;
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
      const d = xs[j] - xs[i], n = Math.round(d / P);
      if (n >= 1) punti += Math.max(0, 1 - Math.abs(d - n * P) / 3);
    }
    migliori.push([P, punti]);
  }
  const massimo = Math.max(...migliori.map(m => m[1]));
  const Ppx = migliori.find(m => m[1] >= 0.92 * massimo)[0];   // la più piccola che va bene (non i multipli)
  let P = Ppx / kr;
  if (!(P > 71 && P < 125)) return {errore: 'Non capisco la distanza fra le colonne: inquadra tutto il tavolo.', angoli};
  // in verticale: fra la fila in alto (y=30) e le colonne (y=162) ci sono 132 punti
  const tops = pile.map(p => p.y).sort((a, b) => a - b);
  const sotto = tops.filter(t => t > tops[0] + 100 * kr), sopra = tops.filter(t => t <= tops[0] + 100 * kr);
  const med = a => a[a.length >> 1];
  let ky = kr;
  if (sotto.length && sopra.length) {
    const stima = (med(sotto) - med(sopra)) / 132;
    if (Math.abs(stima / kr - 1) < 0.06) ky = stima;
  }
  const sinistre = xs.map(x => x / kr);
  const fasi = sinistre.map(u => (((u - 61) % P) + P + P / 2) % P).sort((a, b) => a - b);
  const fase = fasi[fasi.length >> 1] - P / 2;
  let ox = Math.round((sinistre[0] - 61 - fase) / P) * P + fase;
  // quale colonna è quale: la pila più a sinistra non è sempre il mazzo (mazzo finito e colonna 1 vuota),
  // e sbagliare di una colonna manda le mosse nella colonna accanto. Due àncore:
  // 1) il sito centra le 7 colonne nel tavolo: il mazzo comincia a (larghezza - 6 passi - 69) / 2;
  if (!tocca) {
    const atteso = 5 + (RW / kr - 10 - 6 * P - CW) / 2 - 61;
    ox -= P * Math.round((ox - atteso) / P);
  }
  // 2) nella fila in alto il posto della terza colonna è sempre vuoto (mazzo, scarti, spazio, 4 basi).
  const indici = o => pile.filter(p => p.y < tops[0] + 100 * kr).map(p => Math.round((p.x / kr - o - 61) / P));
  const valida = o => indici(o).every(k => k >= 0 && k <= 6 && k !== 2);
  if (!valida(ox)) {
    const prova = [ox - P, ox + P, ox - 2 * P, ox + 2 * P].find(valida);
    if (prova !== undefined) ox = prova;
  }
  const oy = (sotto.length ? med(sotto) : med(tops)) / ky - TOPY;
  const geometria = scala(r2img, RH, {ox, oy, kr, ky, Ppx}, 1);
  const densita = kr * lungO / RW;   // pixel della fotocamera per punto del tavolo
  return {...geometria, feltro, angoli, tocca, densita, base: {r2img, RH, ox, oy, kr, ky, Ppx}};
}

/** La griglia con la scala moltiplicata per f, tenendo fermi il mazzo e l'inizio delle colonne
 *  (servono a provare scale un po' diverse e tenere quella con cui le carte combaciano meglio). */
function scala(r2img, RH, {ox, oy, kr, ky, Ppx}, f) {
  const kr2 = kr * f, ky2 = ky * f;
  const ox2 = (ox + 61) * kr / kr2 - 61, oy2 = (oy + TOPY) * ky / ky2 - TOPY;
  return {
    css2img: (x, y) => r2img((ox2 + x) * kr2, (oy2 + y) * ky2),
    alt: Math.min(ALT_MAX, Math.floor(RH / ky2 - oy2) - 2),
    passo: Ppx / kr2,
  };
}

function riduci(frame, W, H) {
  const t = document.createElement('canvas'); t.width = W; t.height = H;
  const c = t.getContext('2d', {willReadFrequently: true});
  c.drawImage(frame.sorgente, 0, 0, W, H);
  return c.getImageData(0, 0, W, H).data;
}

/** Immagine w x h presa dal fotogramma con la funzione f(x,y) -> punto del fotogramma (bilineare). */
function deforma(frame, w, h, f, mappa) {
  const src = frame.data, FW = frame.width, FH = frame.height;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    let sx, sy;
    if (mappa) { sx = mappa[2 * i]; sy = mappa[2 * i + 1]; } else [sx, sy] = f(x + 0.5, y + 0.5);
    sx -= 0.5; sy -= 0.5;
    const o = 4 * i;
    if (!(sx >= 0 && sy >= 0 && sx < FW - 1 && sy < FH - 1)) { out[o + 3] = 255; continue; }
    const x0 = sx | 0, y0 = sy | 0, ax = sx - x0, ay = sy - y0;
    const p = 4 * (y0 * FW + x0), q = p + 4 * FW;
    for (let c = 0; c < 3; c++)
      out[o + c] = (src[p + c] * (1 - ax) + src[p + 4 + c] * ax) * (1 - ay) + (src[q + c] * (1 - ax) + src[q + 4 + c] * ax) * ay;
    out[o + 3] = 255;
  }
  return out;
}

// ---------------------------------------------------------------- lettura del tavolo

class Occhio {
  constructor(tutti) { this.tutti = tutti; this.livelli = tutti[1.5]; this.m = this.livelli[1]; this.cal = null; this.cache = {}; }

  /** Prova ad agganciare il tavolo in questo fotogramma. */
  calibra(frame) {
    const c = aggancia(frame, this.angoliManuali || null);
    if (c.errore) { this.cal = null; return c; }
    this.letture = 0;
    // scala di lavoro: 2 se la fotocamera dà abbastanza pixel per punto, se no 1,5
    S = c.densita >= 1.8 ? 2 : 1.5;
    this.livelli = this.tutti[S]; this.m = this.livelli[1];
    // la scala misurata sulle carte sfocate può sbagliare dell'1-2%: provo scale vicine e tengo quella
    // con cui gli angoli delle carte in fondo alle colonne combaciano meglio con le immagini del sito
    let migliore = null;
    for (const f of [1, 0.985, 1.015, 0.97, 1.03]) {
      const g = f === 1 ? c : {...c, ...scala(c.base.r2img, c.base.RH, c.base, f)};
      this._usa(g, frame);
      const p = this._somiglianza(this.foto(frame));
      if (!migliore || p > migliore[0] + 0.005) migliore = [p, g];
    }
    this._usa(migliore[1], frame);
    this.scegliSfocatura(frame);
    // controllo che la griglia cada davvero sulle carte: se è spostata le mosse finirebbero nella colonna sbagliata
    const v = this.verificaGriglia(this.foto(frame));
    if (!v.ok) {
      this.cal = null;
      return {errore: 'Aggancio impreciso (' + v.motivo + '): tieni l’iPad più dritto e fermo.', angoli: c.angoli};
    }
    return c;
  }

  /**
   * Le carte in fondo alle colonne devono stare esattamente nei posti della griglia: misuro i bordi
   * sinistro e destro del bianco di ogni carta e li confronto con dove li aspetto.
   */
  verificaGriglia(B) {
    const scarti = [], larghezze = [];
    for (let i = 0; i < 7; i++) {
      const fondo = this._fondo(B, i), x0 = COLX[i] * S;
      if (fondo - TOPY * S < 30 * S || fondo >= B.h - 2) continue;
      const ya = Math.round(fondo - 40 * S), yb = Math.round(fondo - 12 * S);
      const colonnaBianca = x => {
        let n = 0, tot = 0;
        for (let y = ya; y < yb; y += 2) { tot++; if (this._bianco(B, x, y)) n++; }
        return n > 0.6 * tot;
      };
      // cerco i bordi senza arrivare alla colonna accanto (con finestre strette lo spazio fra colonne è piccolo)
      const r = Math.max(3, Math.min(10, PASSO_COL - CW - 2));
      let sx = -1, dx = -1;
      for (let x = Math.round(x0 - r * S); x < x0 + r * S; x++) if (x >= 0 && colonnaBianca(x)) { sx = x; break; }
      for (let x = Math.round(x0 + (CW + r) * S); x > x0 + (CW - r) * S; x--) if (x < B.w && colonnaBianca(x)) { dx = x; break; }
      if (sx < 0 || dx < 0) continue;
      scarti.push(Math.abs((sx - x0 + dx - (x0 + CW * S)) / 2) / S);
      larghezze.push(Math.abs((dx - sx) / S - CW));
    }
    if (scarti.length < 2) return {ok: true, n: scarti.length};
    const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
    const sp = med(scarti), lg = med(larghezze);
    if (sp > 6) return {ok: false, motivo: `colonne spostate di ${sp.toFixed(0)} punti`};
    if (lg > 10) return {ok: false, motivo: 'scala sbagliata'};
    return {ok: true, n: scarti.length, spostamento: sp};
  }

  /** Prepara la raddrizzatura per questa griglia: per ogni pixel del tavolo, da quale pixel del fotogramma
   *  prenderlo e con che pesi. */
  _usa(c, frame) {
    impostaPasso(c.passo);
    const w = Math.round(700 * S), h = Math.round(c.alt * S);
    const FW = frame.width, FH = frame.height;
    const indice = new Int32Array(w * h), ax = new Float32Array(w * h), ay = new Float32Array(w * h);
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
      let [sx, sy] = c.css2img((x + 0.5) / S, (y + 0.5) / S);
      sx -= 0.5; sy -= 0.5;
      if (!(sx >= 0 && sy >= 0 && sx < FW - 1 && sy < FH - 1)) { indice[i] = -1; continue; }
      const x0 = sx | 0, y0 = sy | 0;
      indice[i] = 4 * (y0 * FW + x0); ax[i] = sx - x0; ay[i] = sy - y0;
    }
    this.cal = {...c, w, h, indice, ax, ay, dimensione: [FW, FH]};
    this.cache = {};
  }

  /** Quanto somigliano alle immagini del sito gli angoli delle carte in fondo alle colonne (media). */
  _somiglianza(B) {
    let somma = 0, n = 0;
    for (let i = 6; i >= 0 && n < 4; i--) {
      const fondo = this._fondo(B, i);
      if (fondo - TOPY * S < 30 * S || fondo >= B.h - 2) continue;
      const alto = fondo - CH * S + 1, x0 = COLX[i] * S;
      let best = -1;
      for (const m of this.m.id) best = Math.max(best, cerca(B, m.T, x0 - 3 * S, alto - 3 * S, x0 + m.T.w + 4 * S, alto + m.T.h + 5 * S).s);
      somma += best; n++;
    }
    return n ? somma / n : 0;
  }

  /** Quanto sfoca questa fotocamera: il livello dei modelli che somiglia di più alle ultime carte delle colonne. */
  scegliSfocatura(frame) {
    const B = this.foto(frame);
    let migliore = null;
    for (const liv of this.livelli) {
      this.m = liv;
      let somma = 0, n = 0;
      for (let i = 0; i < 7 && n < 3; i++) {
        const fondo = this._fondo(B, i);
        if (fondo === null || fondo - TOPY * S < 30 * S) continue;
        const alto = fondo - CH * S + 1, x0 = COLX[i] * S;
        let best = -1;
        for (const m of liv.id) best = Math.max(best, cerca(B, m.T, x0 - 4 * S, alto - 4 * S, x0 + m.T.w + 5 * S, alto + m.T.h + 6 * S).s);
        somma += best; n++;
      }
      const media = n ? somma / n : 0;
      if (!migliore || media > migliore[0]) migliore = [media, liv];
    }
    this.m = migliore[1];
    this.cache = {};
  }

  /** Il tavolo raddrizzato a S pixel per punto CSS. */
  foto(frame) {
    const {w, h, indice, ax, ay} = this.cal;
    const src = frame.data, riga = 4 * frame.width, n = w * h;
    const rgba = new Uint8ClampedArray(n * 4), g = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = indice[i], o = 4 * i;
      rgba[o + 3] = 255;
      if (p < 0) continue;
      const a = ax[i], b = ay[i], q = p + riga;
      const w00 = (1 - a) * (1 - b), w01 = a * (1 - b), w10 = (1 - a) * b, w11 = a * b;
      const r = src[p] * w00 + src[p + 4] * w01 + src[q] * w10 + src[q + 4] * w11;
      const v = src[p + 1] * w00 + src[p + 5] * w01 + src[q + 1] * w10 + src[q + 5] * w11;
      const z = src[p + 2] * w00 + src[p + 6] * w01 + src[q + 2] * w10 + src[q + 6] * w11;
      rgba[o] = r; rgba[o + 1] = v; rgba[o + 2] = z;
      g[i] = 0.299 * r + 0.587 * v + 0.114 * z;
    }
    const B = conIntegrali(g, w, h);
    B.rgba = rgba;
    // colore del tavolo in questo fotogramma: la fascia fra la fila in alto e le colonne
    const y = Math.round(145 * S), cr = [], cg = [], cb = [];
    for (let x = 0; x < w; x += 3) { const j = 4 * (y * w + x); cr.push(rgba[j]); cg.push(rgba[j + 1]); cb.push(rgba[j + 2]); }
    const med = a => a.sort((p, q) => p - q)[a.length >> 1];
    B.feltro = [med(cr), med(cg), med(cb)];
    const campioni = [];
    for (let i = 0; i < B.g.length; i += 37) campioni.push(B.g[i]);
    campioni.sort((p, q) => p - q);
    B.bianco = campioni[Math.floor(campioni.length * 0.98)];
    // movimento: confronto a riquadri di 16 punti la media del grigio con il fotogramma prima. Le righe
    // fini dello schermo (moiré) e il rumore si annullano nella media; una carta che scorre cambia molti
    // riquadri. Tolgo prima il cambio di luce generale (la mediana delle differenze).
    const lato = Math.round(16 * S), bw = Math.floor(w / lato), bh = Math.floor(h / lato);
    const medie = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const x0 = bx * lato, y0 = by * lato, W1 = w + 1;
      const a = y0 * W1 + x0, b = a + lato, c = (y0 + lato) * W1 + x0, e = c + lato;
      medie[by * bw + bx] = (B.I[e] - B.I[b] - B.I[c] + B.I[a]) / (lato * lato);
    }
    let d = 0;
    if (this._medie && this._medie.length === medie.length) {
      const diff = medie.map((v, j) => v - this._medie[j]);
      const luce = Float32Array.from(diff).sort()[diff.length >> 1];
      let n = 0;
      for (let j = 0; j < diff.length; j++) if (Math.abs(diff[j] - luce) > 28) n++;
      d = 100 * n / diff.length;   // percento di riquadri cambiati
    }
    this._medie = medie;
    B.movimento = d;
    return B;
  }

  // Riusa il risultato se la zona non è cambiata (la fotocamera ha rumore: confronto con tolleranza)
  _inCache(chiave, B, x0, y0, x1, y1, f) {
    const firma = [];
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); x1 = Math.min(B.w, x1 | 0); y1 = Math.min(B.h, y1 | 0);
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) {
      const x = (x0 + (x1 - x0 - 1) * i / 8) | 0, y = (y0 + (y1 - y0 - 1) * j / 8) | 0;
      firma.push(B.g[y * B.w + x]);
    }
    const v = this.cache[chiave];
    if (v && v.firma.length === firma.length) {
      // tolgo il cambio di luce generale (media delle differenze), poi guardo quanto è cambiata la zona
      let media = 0;
      for (let i = 0; i < firma.length; i++) media += firma[i] - v.firma[i];
      media /= firma.length;
      let d = 0;
      for (let i = 0; i < firma.length; i++) d += Math.abs(firma[i] - v.firma[i] - media);
      if (d / firma.length < 6) return v.r;
    }
    const r = f();
    this.cache[chiave] = {firma, r};
    return r;
  }

  _feltro(B, x, y) { return distanza(B.rgba, 4 * (y * B.w + x), B.feltro) < 45; }

  /** Pixel del bianco di una carta scoperta (chiaro e poco colorato). */
  _bianco(B, x, y) {
    const j = 4 * (y * B.w + x), r = B.rgba[j], g = B.rgba[j + 1], b = B.rgba[j + 2], mx = Math.max(r, g, b);
    return B.g[y * B.w + x] > B.bianco * 0.6 && mx - Math.min(r, g, b) < 0.36 * mx;
  }

  /** C'è una carta scoperta in questo posto (x, y in punti CSS)? */
  _cartaNelPosto(B, x, y) {
    let n = 0, tot = 0;
    for (let yy = Math.round((y + 10) * S); yy < (y + CH - 10) * S; yy += 3)
      for (let xx = Math.round((x + 10) * S); xx < (x + CW - 10) * S; xx += 3) { tot++; if (this._bianco(B, xx, yy)) n++; }
    return n > 0.45 * tot;
  }

  /** Ultima colonna (in punti) fra xa e xb, partendo da destra, coperta per lo più da bianco di carta. */
  _bordoDestro(B, xa, xb, y) {
    for (let x = xb; x > xa; x--) {
      let n = 0, tot = 0;
      const xx = Math.round(x * S);
      for (let yy = Math.round((y + 25) * S); yy < (y + CH - 25) * S; yy += 3) { tot++; if (this._bianco(B, xx, yy)) n++; }
      if (n > 0.6 * tot) return x;
    }
    return xa + 8;
  }

  /** Deviazione standard del grigio in un rettangolo. */
  _contrasto(B, x0, y0, w, h) {
    let s = 0, s2 = 0, n = 0;
    for (let y = y0; y < y0 + h; y += 2) for (let x = x0; x < x0 + w; x += 2) { const v = B.g[y * B.w + x]; s += v; s2 += v * v; n++; }
    return n ? Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) : 0;
  }

  /** Rosso o nero, dall'inchiostro di un rettangolo. */
  _rosso(B, x0, y0, w, h) {
    let somma = 0, n = 0, bianco = 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) bianco = Math.max(bianco, B.g[y * B.w + x]);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const j = 4 * (y * B.w + x), rr = B.rgba[j], gg = B.rgba[j + 1], bb = B.rgba[j + 2];
      if (Math.min(rr, gg, bb) < bianco * 0.62) { somma += rr - (gg + bb) / 2; n++; }
    }
    return n > 3 && somma / n > bianco * 0.18;
  }

  /** La carta (angolo con valore e seme) che somiglia di più, cercando prima fra quelle del colore giusto. */
  _carta(B, x0, y0, x1, y1, semi = null, intera = false) {
    // confronto con tutte; il colore lo misuro dentro la carta, dove sta l'angolo trovato,
    // e tengo la migliore di quel colore (il seme piccolo da solo distingue poco)
    // per andare più veloce provo prima le carte del colore che vedo al centro della zona
    const T0 = this.m.id[0].T, cxm = Math.round((x0 + x1 - T0.w) / 2), cym = Math.round((y0 + y1 - T0.h) / 2);
    const atteso = this._rosso(B, cxm + Math.round(3 * S), cym + Math.round(2 * S), T0.w - Math.round(4 * S), T0.h - Math.round(4 * S));
    const tutte = [];
    const prova = filtro => {
      for (const m of this.m.id) {
        if (semi && !semi.includes(m.carta[1])) continue;
        if (!filtro(m)) continue;
        tutte.push({...cerca(B, m.T, x0, y0, x1, y1), carta: m.carta, rosso: m.rosso, T: m.T});
      }
      tutte.sort((a, b) => b.s - a.s);
    };
    prova(m => semi || m.rosso === atteso);
    if (!semi && (!tutte.length || tutte[0].s < SOGLIA_CARTA)) prova(m => m.rosso !== atteso);
    const top = tutte[0];
    if (top && this._contrasto(B, top.x, top.y, top.T.w, top.T.h) < 14) return {s: -1};   // niente inchiostro: riflesso
    if (!top || top.s < SOGLIA_CARTA * 0.85 || semi) return top || {s: -1};
    const rosso = this._rosso(B, top.x, top.y, top.T.w, top.T.h);
    const stesso = tutte.find(t => t.rosso === rosso);
    const sc0 = stesso && stesso.s > top.s - 0.15 ? stesso : top;
    // sicurezza: quanto stacca dalla migliore carta di un ALTRO valore (se è quasi pari, non mi fido)
    const altra = tutte.find(t => t.carta[0] !== sc0.carta[0]);
    const scelta = {...sc0, margine: altra ? sc0.s - altra.s : 1};
    if (!intera) return scelta;
    // il seme: confronto la carta intera (i simboli grandi al centro) fra i due semi di quel colore
    const r = scelta.carta[0], cx = scelta.x - 1 * S, cy = scelta.y - 2 * S;
    const due = this.m.id.filter(m => m.carta[0] === r && m.rosso === scelta.rosso);
    if (due.length !== 2) return scelta;
    // allineo la carta intera, poi guardo solo i punti dove le due carte sono diverse
    const [a, b] = due;
    const pa = cerca(B, a.intera, cx - 3, cy - 3, cx + a.intera.w + 3, cy + a.intera.h + 3);
    const pb = cerca(B, b.intera, cx - 3, cy - 3, cx + b.intera.w + 3, cy + b.intera.h + 3);
    const p = pa.s >= pb.s ? pa : pb;
    const chiave = a.carta.join('') + b.carta.join('');
    let D = this.m.diff && this.m.diff[chiave];
    if (!D) {
      D = new Float32Array(a.intera.d.length);
      for (let i = 0; i < D.length; i++) D[i] = a.intera.d[i] / a.intera.norma - b.intera.d[i] / b.intera.norma;
      (this.m.diff = this.m.diff || {})[chiave] = D;
    }
    const w = a.intera.w, h = a.intera.h;
    let somma = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) somma += D[y * w + x] * B.g[(p.y + y) * B.w + p.x + x];
    return {...scelta, carta: somma >= 0 ? a.carta : b.carta};
  }

  leggiColonna(B, i) {
    const x0 = Math.round(COLX[i] * S), y0 = Math.round(TOPY * S);
    const fondo = this._fondo(B, i);
    if (fondo - y0 < 30 * S) return new Colonna();
    if (fondo >= B.h - 2) return null;   // la colonna esce dall'immagine
    return this._inCache('col' + i, B, x0 - 4 * S, y0 - 3 * S, x0 + (CW + 4) * S, fondo + 4 * S, () => this._analizza(B, i, fondo));
  }

  /** Fondo della colonna: ultima riga bianca della carta in fondo (la colonna finisce sempre con
   *  una carta scoperta). Non usa il colore del tavolo, che può somigliare al dorso delle carte. */
  _fondo(B, i) {
    const x0 = Math.round(COLX[i] * S), y0 = Math.round(TOPY * S);
    const xa = x0 + Math.round(5 * S), xb = x0 + Math.round((CW - 5) * S);
    // il bordo chiaro dei dorsi non conta: una carta scoperta comincia con almeno 6 punti di bianco di fila
    let ultima = -1, vuote = 0, corsa = 0;
    for (let y = y0; y < B.h; y++) {
      let n = 0, tot = 0;
      for (let x = xa; x < xb; x += 3) { tot++; if (this._bianco(B, x, y)) n++; }
      if (n > 0.35 * tot) {
        corsa++;
        if (ultima >= 0 || corsa >= 6 * S) { ultima = y; vuote = 0; }
      } else {
        corsa = 0;
        if (ultima >= 0 && ++vuote > 20 * S) break;
        if (ultima < 0 && y - y0 > (i * PASSO + 40) * S) break;   // niente carta scoperta dove deve stare
      }
    }
    if (ultima < 0) return y0;
    return ultima >= B.h - 2 ? B.h - 1 : ultima;
  }

  _analizza(B, i, fondo) {
    const m = this.m, x0 = COLX[i] * S, y0 = TOPY * S;
    let altoUltima = fondo - CH * S + 1;
    // ultima carta: angolo con valore e seme
    const c = this._carta(B, x0 - 5 * S, altoUltima - 5 * S, x0 + 1 * S + m.id[0].T.w + 5 * S, altoUltima + 2 * S + m.id[0].T.h + 5 * S, null, true);
    if (c.s < SOGLIA_CARTA || c.margine < MARGINE_MIN) return null;   // carta in movimento, non chiara o incerta
    const ultima = c.carta;
    altoUltima = c.y - 2 * S;
    // carte coperte: le coperte stanno a passi di 24 punti dall'alto della colonna, quindi le conto
    // da dove comincia la prima carta bianca (il dorso è a disegni colorati)
    const coperte = this._contaCoperte(B, i, altoUltima);
    // prima carta scoperta: subito sotto l'ultima coperta
    const atteso = y0 + coperte * PASSO * S;
    let prima = ultima, altoPrima = altoUltima, trovato = null;
    if (altoUltima - atteso > 10 * S) {
      trovato = this._trovaValore(B, Math.max(0, atteso - 6 * S), Math.min(altoUltima + 6 * S, atteso + 31 * S), x0 - 3 * S, x0 + 24 * S);
      if (!trovato) trovato = this._trovaValore(B, Math.max(0, atteso - 6 * S), altoUltima + 6 * S, x0 - 3 * S, x0 + 24 * S);
    }
    if (trovato && altoUltima - trovato[2] > 10 * S) { prima = [trovato[0], trovato[1]]; altoPrima = trovato[2]; }
    // quante carte scoperte vedo (dalla posizione) e quante ne dicono i valori letti: devono coincidere,
    // se no una delle due letture è sbagliata e preferisco non dare consigli
    const nVisto = Math.round((altoUltima - (y0 + coperte * PASSO * S)) / (PASSO * S)) + 1;
    if (nVisto > 1 && !trovato) return null;
    const n = prima[0] - ultima[0] + 1;
    if (n !== nVisto || (colore(prima) === colore(ultima)) !== (n % 2 === 1)) return null;
    if (prima[0] > 13 || ultima[0] < 1) return null;
    const carte = [];
    for (let t = 0; t < n; t++) {
      const sopra = n - 1 - t;
      const col = sopra % 2 === 0 ? colore(ultima) : (colore(ultima) === 'R' ? 'B' : 'R');
      carte.push([ultima[0] + sopra, col]);
    }
    carte[carte.length - 1] = ultima;
    return new Colonna(coperte, carte);
  }

  /**
   * Carte coperte di una colonna: stanno a passi di 24 punti dall'alto. Una striscia di dorso è più rossa
   * del bianco di una carta; il riflesso dello schermo aggiunge luce a tutti i colori allo stesso modo,
   * quindi la differenza "rosso meno verde e blu" resta e il conto non si inganna.
   */
  _contaCoperte(B, i, altoUltima) {
    const x0 = COLX[i] * S, y0 = TOPY * S;
    const rossore = (ya, yb) => {
      let s = 0, n = 0;
      for (let y = Math.round(ya); y < yb; y += 2) for (let x = Math.round(x0 + 24 * S); x < x0 + 60 * S; x += 2) {
        const j = 4 * (y * B.w + x); s += B.rgba[j] - (B.rgba[j + 1] + B.rgba[j + 2]) / 2; n++;
      }
      return n ? s / n : 0;
    };
    const bianco = rossore(altoUltima + 4 * S, altoUltima + 14 * S);   // la cima della carta in fondo è bianca
    const massimo = Math.max(0, Math.min(i, Math.round((altoUltima - y0) / (PASSO * S))));
    let k = 0;
    while (k < massimo && rossore(y0 + (k * PASSO + 4) * S, y0 + (k * PASSO + 16) * S) > bianco + 18) k++;
    return k;
  }

  /** Prima riga (scendendo) da cui la fascia centrale della colonna resta bianca per almeno 8 punti. */
  _primaBianca(B, x0, ya, yb) {
    ya = Math.max(0, Math.round(ya)); yb = Math.min(B.h, Math.round(yb));
    const xa = Math.round(x0 + 24 * S), xc = Math.round(x0 + 60 * S);
    let bianco = 0;
    for (let y = ya; y < yb; y += 2) for (let x = xa; x < xc; x += 3) bianco = Math.max(bianco, B.g[y * B.w + x]);
    const serve = Math.round(8 * S);
    let corsa = 0;
    for (let y = ya; y < yb; y++) {
      let n = 0, tot = 0;
      for (let x = xa; x < xc; x += 2) {
        tot++;
        const j = 4 * (y * B.w + x), r = B.rgba[j], g = B.rgba[j + 1], b = B.rgba[j + 2];
        if (B.g[y * B.w + x] > bianco * 0.8 && Math.max(r, g, b) - Math.min(r, g, b) < 0.25 * Math.max(r, g, b)) n++;
      }
      corsa = n > 0.85 * tot ? corsa + 1 : 0;
      if (corsa >= serve) return y - serve + 1;
    }
    return yb;
  }

  /** Il numero di una carta coperta in parte, cercando dall'alto: [valore, colore, riga] o null. */
  _trovaValore(B, ya, yb, xa, xb) {
    ya = Math.round(ya); yb = Math.round(yb);
    const valori = Object.keys(this.m.valore).map(Number);
    const righe = valori.map(v => massimiPerRiga(B, this.m.valore[v], xa, ya, xb, yb));
    if (!righe[0].length) return null;
    const mx = righe[0].map((_, j) => Math.max(...righe.map(r => r[j])));
    const primo = mx.findIndex(v => v > SOGLIA_VALORE);
    if (primo < 0) return null;
    let p = primo;
    for (let t = primo; t < Math.min(mx.length, primo + 7 * S); t++) if (mx[t] > mx[p]) p = t;
    let vi = 0;
    for (let k = 1; k < valori.length; k++) if (righe[k][p] > righe[vi][p]) vi = k;
    const T = this.m.valore[valori[vi]];
    const pos = cerca(B, T, xa, ya + p, xb, ya + p + T.h);
    const rosso = this._rosso(B, pos.x, pos.y, T.w, T.h);
    return [valori[vi], rosso ? 'R' : 'B', ya + p - 2 * S];
  }

  // Mazzo, scarti e basi: il sito sposta la carta in cima di 1 punto a destra e 1 in alto ogni 4 carte
  // della pila (fino a 6 punti con un mazzo pieno), quindi qui cerco in una zona più larga.
  // Con "3 carte alla volta" il sito apre gli scarti a ventaglio: la carta giocabile è l'ultima a destra,
  // spostata di 20 o 40 punti. La trovo dal bordo destro del bianco e leggo solo quella.
  leggiScarto(B) {
    const x0 = (WASTE[0] - 5) * S, y0 = (WASTE[1] - 9) * S;
    return this._inCache('scarto', B, x0, y0, (WASTE[0] + CW + 55) * S, (WASTE[1] + CH + 6) * S, () => {
      if (!this._cartaNelPosto(B, ...WASTE)) return null;
      const sx = this._bordoDestro(B, WASTE[0] + CW - 8, WASTE[0] + CW + 52, WASTE[1]) - CW;
      const xa = Math.max(WASTE[0] - 5, sx - 5);
      const c = this._carta(B, xa * S, y0, (xa + 15) * S + this.m.id[0].T.w, (WASTE[1] + 6) * S + this.m.id[0].T.h + 2 * S, null, true);
      return c.s >= SOGLIA_CARTA && c.margine >= MARGINE_MIN ? c.carta : NON_CHIARA;
    });
  }

  leggiMazzo(B) {
    // il mazzo c'è se il suo posto è coperto da un dorso: né colore del tavolo né bianco di carta
    const [x, y] = STOCK;
    return this._inCache('mazzo', B, (x - 6) * S, (y - 6) * S, (x + CW + 6) * S, (y + CH + 6) * S, () => {
      let n = 0, tot = 0;
      for (let yy = Math.round((y + 12) * S); yy < (y + CH - 12) * S; yy += 3)
        for (let xx = Math.round((x + 12) * S); xx < (x + CW - 12) * S; xx += 3) {
          tot++;
          if (!this._feltro(B, xx, yy) && !this._bianco(B, xx, yy)) n++;
        }
      if (n > 0.5 * tot) return true;
      // sotto un riflesso il dorso schiarisce ma resta più rosso del tavolo e delle carte bianche
      const rossore = (xa, ya, xb, yb) => {
        let t = 0, m = 0;
        for (let yy = Math.round(ya * S); yy < yb * S; yy += 3) for (let xx = Math.round(xa * S); xx < xb * S; xx += 3) {
          const j = 4 * (yy * B.w + xx); t += B.rgba[j] - (B.rgba[j + 1] + B.rgba[j + 2]) / 2; m++;
        }
        return m ? t / m : 0;
      };
      const posto = rossore(x + 12, y + 12, x + CW - 12, y + CH - 12);
      const tavolo = rossore(x + CW + 2, y + 20, x + CW + 14, y + CH - 20);   // il tavolo fra mazzo e scarti
      return posto - tavolo > 25;
    });
  }

  leggiBase(B, s) {
    const x = FOUND_X[s], x0 = (x - 5) * S, y0 = (FY - 8) * S;
    return this._inCache('base' + s, B, x0, y0, (x + CW + 8) * S, (FY + CH + 6) * S, () => {
      if (!this._cartaNelPosto(B, x, FY)) return 0;
      const c = this._carta(B, x0, y0 + 2 * S, (x + 8) * S + this.m.id[0].T.w + 2 * S, (FY + 6) * S + this.m.id[0].T.h + 4 * S, [s]);
      return c.s >= SOGLIA_CARTA ? c.carta[0] : NON_CHIARA;
    });
  }

  /**
   * Legge ogni posto per conto suo (7 colonne, scarti, mazzo, 4 basi): un posto non chiaro dà null solo
   * per quel posto, gli altri restano buoni. È quello che usa il tracciamento dell'app.
   */
  leggiPosti(frame) {
    if (!this.cal) return null;
    const B = this.foto(frame);
    this.ultimaB = B;
    if (++this.letture % 20 === 0 && !this.verificaGriglia(B).ok) { this.cal = null; this.motivo = 'griglia spostata'; return null; }
    const posti = {movimento: B.movimento};
    for (let i = 0; i < 7; i++) posti['c' + i] = this.leggiColonna(B, i);
    const sc = this.leggiScarto(B);
    posti.scarto = sc === NON_CHIARA ? undefined : sc;
    posti.mazzo = this.leggiMazzo(B);
    for (const s of SEMI) { const b = this.leggiBase(B, s); posti['b' + s] = b === NON_CHIARA ? undefined : b; }
    return posti;
  }

  /** Legge tutto il tavolo da un fotogramma: Stato oppure null se qualcosa non è chiaro. */
  leggi(frame) {
    if (!this.cal) return null;
    const B = this.foto(frame);
    this.ultimaB = B;
    if (++this.letture % 20 === 0 && !this.verificaGriglia(B).ok) { this.cal = null; this.motivo = 'griglia spostata'; return null; }
    const st = new Stato();
    for (let i = 0; i < 7; i++) {
      const c = this.leggiColonna(B, i);
      if (!c) { this.motivo = `colonna ${i + 1}`; return null; }
      st.colonne.push(c);
    }
    st.scarto = this.leggiScarto(B);
    st.mazzo = this.leggiMazzo(B);
    for (const s of SEMI) st.basi[s] = this.leggiBase(B, s);
    if (st.scarto === NON_CHIARA) { this.motivo = 'scarti'; return null; }
    if (SEMI.split('').some(s => st.basi[s] === NON_CHIARA)) { this.motivo = 'basi in alto'; return null; }
    this.motivo = '';
    return st;
  }
}

/** Fotogramma dal video (o da un'immagine): {data, width, height, sorgente}. */
function fotogramma(sorgente, tela) {
  const w = sorgente.videoWidth || sorgente.naturalWidth || sorgente.width;
  const h = sorgente.videoHeight || sorgente.naturalHeight || sorgente.height;
  if (tela.width !== w || tela.height !== h) { tela.width = w; tela.height = h; }
  const c = tela.getContext('2d', {willReadFrequently: true});
  c.drawImage(sorgente, 0, 0, w, h);
  const im = c.getImageData(0, 0, w, h);
  return {data: im.data, width: w, height: h, sorgente: tela};
}
