// Occhio per le carte vere: un mazzo di carte francesi (tipo Modiano) su un tavolo vero, ripreso dall'alto.
// Qui non c'è una disposizione fissa come sul sito: all'aggancio trovo le carte come zone diverse dal
// tavolo, misuro quanto è grande una carta e dove stanno la fila in alto (mazzo, scarti, basi) e le 7
// colonne. Valore e seme li leggo dall'indice in alto a sinistra di ogni carta, confrontandolo con
// lettere, numeri e semi disegnati al volo con più caratteri (le carte vere non hanno immagini da copiare).
// Usa logica.js (Colonna, SEMI) e componenti() di occhio.js.

const LAVORO_W = 800;              // larghezza dell'immagine ridotta su cui cerco le carte
const GW = 16, GH = 24;            // griglia su cui confronto i glifi dell'indice
let SOGLIA_GLIFO = 0.5;          // somiglianza minima di un valore o di un seme
let STACCO_GLIFO = 0.03;         // stacco minimo dalla seconda ipotesi
const VALORE_MIN = 0.05;           // altezza minima del valore (in altezze di carta): i semi piccoli possono essere più bassi
const BANDA_DESTRA = [0.84, 0.94]; // striscia verticale vicino al bordo destro: bianca sulle carte scoperte
const VALORI_GLIFI = {A: 1, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, F: 11, D: 12, R: 13};
const FONT_GLIFI = ['Georgia', 'Times New Roman', 'Baskerville', 'Didot', 'Helvetica', 'Arial', 'Avenir Next Condensed', 'Futura', 'Gill Sans'];

const mediana = a => { const b = [...a].sort((p, q) => p - q); return b.length ? b[b.length >> 1] : 0; };

/** Maschera 0/1 di un glifo (dentro x0..x1, y0..y1) -> vettore GW x GH a media zero e lunghezza uno. */
function vettoreGlifo(pieno, x0, y0, x1, y1) {
  const v = new Float32Array(GW * GH), bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  for (let ty = 0; ty < GH; ty++) for (let tx = 0; tx < GW; tx++) {
    let s = 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      const x = x0 + Math.min(bw - 1, Math.floor((tx + (b + 0.5) / 3) * bw / GW));
      const y = y0 + Math.min(bh - 1, Math.floor((ty + (a + 0.5) / 3) * bh / GH));
      s += pieno(x, y);
    }
    v[ty * GW + tx] = s / 9;
  }
  let m = 0;
  for (const x of v) m += x;
  m /= v.length;
  let n = 0;
  for (let i = 0; i < v.length; i++) { v[i] -= m; n += v[i] * v[i]; }
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/** Disegna su una tela bianca con fn(g) e restituisce il modello del glifo nero: {v, asp}. */
function glifoDisegnato(fn, lato = 160) {
  const c = document.createElement('canvas'); c.width = c.height = lato;
  const g = c.getContext('2d', {willReadFrequently: true});
  g.fillStyle = '#fff'; g.fillRect(0, 0, lato, lato); g.fillStyle = '#000';
  fn(g);
  const d = g.getImageData(0, 0, lato, lato).data;
  const nero = (x, y) => d[4 * (y * lato + x)] < 128 ? 1 : 0;
  let x0 = lato, y0 = lato, x1 = -1, y1 = -1;
  for (let y = 0; y < lato; y++) for (let x = 0; x < lato; x++) if (nero(x, y)) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  return {v: vettoreGlifo(nero, x0, y0, x1, y1), asp: (y1 - y0 + 1) / (x1 - x0 + 1)};
}

// i quattro semi disegnati a mano (su 100 x 100), oltre a quelli dei caratteri
const FORME_SEMI = {
  h: g => { g.beginPath(); g.arc(28, 30, 24, 0, 7); g.arc(72, 30, 24, 0, 7); g.fill(); g.beginPath(); g.moveTo(5, 38); g.lineTo(95, 38); g.lineTo(50, 98); g.fill(); },
  d: g => { g.beginPath(); g.moveTo(50, 0); g.quadraticCurveTo(70, 35, 88, 50); g.quadraticCurveTo(70, 65, 50, 100); g.quadraticCurveTo(30, 65, 12, 50); g.quadraticCurveTo(30, 35, 50, 0); g.fill(); },
  s: g => { g.beginPath(); g.arc(28, 58, 22, 0, 7); g.arc(72, 58, 22, 0, 7); g.fill(); g.beginPath(); g.moveTo(7, 52); g.lineTo(93, 52); g.lineTo(50, 2); g.fill(); g.beginPath(); g.moveTo(50, 60); g.lineTo(34, 99); g.lineTo(66, 99); g.fill(); },
  c: g => { g.beginPath(); g.arc(50, 26, 22, 0, 7); g.fill(); g.beginPath(); g.arc(25, 60, 22, 0, 7); g.fill(); g.beginPath(); g.arc(75, 60, 22, 0, 7); g.fill(); g.fillRect(40, 30, 20, 30); g.beginPath(); g.moveTo(50, 50); g.lineTo(34, 99); g.lineTo(66, 99); g.fill(); },
};
const SIMBOLI_SEMI = {h: '♥︎', d: '♦︎', s: '♠︎', c: '♣︎'};

/** Modelli di valori e semi: {valori: [{classe, v, asp}], semi: [...]} */
function modelliGlifi() {
  const valori = [], semi = [];
  for (const f of FONT_GLIFI) for (const peso of ['bold', 'normal']) for (const t of Object.keys(VALORI_GLIFI)) {
    const m = glifoDisegnato(g => { g.font = `${peso} 96px "${f}"`; g.textBaseline = 'middle'; g.fillText(t, 8, 80); });
    if (m) valori.push({classe: VALORI_GLIFI[t], ...m});
  }
  for (const s of SEMI) {
    semi.push({classe: s, ...glifoDisegnato(g => { g.translate(20, 20); g.scale(1.1, 1.1); FORME_SEMI[s](g); })});
    for (const f of ['Apple Symbols', 'Arial Unicode MS', 'Helvetica', 'Times New Roman']) {
      const m = glifoDisegnato(g => { g.font = `100px "${f}"`; g.textBaseline = 'middle'; g.fillText(SIMBOLI_SEMI[s], 20, 80); });
      if (m) semi.push({classe: s, ...m});
    }
  }
  return {valori, semi};
}

/**
 * I glifi dell'indice in una zona w x h che comincia sul bordo sinistro di una carta larga Wf e alta Hf:
 * gb = media di verde e blu (l'inchiostro, rosso o nero, è scuro lì), rosso = rosso meno gb.
 * Restituisce i glifi dall'alto: [{v, asp, rosso, y0, y1}]. Serve sia a leggere le carte sia a
 * imparare dagli angoli dei mazzi, così i modelli passano per gli stessi passaggi della lettura.
 */
function glifiIndice(gb, rosso, w, h, Wf, Hf) {
  const rif = Float32Array.from(gb).sort()[Math.floor(0.9 * gb.length)];
  const ink = new Uint8Array(w * h);
  // solo la striscia dell'indice: a destra cominciano i semi grandi e i disegni delle figure, che con la
  // sfocatura si attaccano al seme piccolo; li taglio invece di scartare quello che li tocca
  const xMax = Math.min(w, Math.round(0.19 * Wf));
  for (let y = 0; y < h; y++) for (let x = 0; x < xMax; x++) ink[y * w + x] = gb[y * w + x] < 0.55 * rif ? 1 : 0;
  // via le righe e le colonne lunghe: bordi delle carte e ombre, che si attaccano alle lettere
  const righe = [], colonne = [];
  for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) n += ink[y * w + x]; if (n > 0.9 * xMax) righe.push(y); }   // la sbarra di un 7 non attraversa tutta la striscia
  for (let x = 0; x < w; x++) { let n = 0; for (let y = 0; y < h; y++) n += ink[y * w + x]; if (n > 0.6 * h) colonne.push(x); }
  for (const y of righe) ink.fill(0, y * w, y * w + w);
  // il bordo di una carta (riga lunga) nella parte alta: quello che sta sopra è della carta di prima
  const bordo = righe.filter(y => y < 0.25 * Hf).pop();
  if (bordo !== undefined) ink.fill(0, 0, bordo * w);
  for (const x of colonne) for (let y = 0; y < h; y++) ink[y * w + x] = 0;
  // anche i tratti verticali più lunghi di un valore: il bordo di una carta un po' spostata o storta
  for (let x = 0; x < xMax; x++) {
    for (let y = 0; y < h; ) {
      if (!ink[y * w + x]) { y++; continue; }
      let f = y;
      while (f < h && ink[f * w + x]) f++;
      if (f - y > 0.2 * Hf) for (let t = y; t < f; t++) ink[t * w + x] = 0;
      y = f;
    }
  }
  const {zone, lab} = componenti(ink, w, h, true);
  // via il bordo della carta (tocca il lato sinistro) e i disegni grandi (toccano il lato destro)
  const buone = zone.filter(z => z.h >= 0.02 * Hf && z.h <= 0.17 * Hf && z.w <= 0.2 * Wf && z.n >= 6
    && z.x > 0 && z.x < 0.7 * xMax && z.y > 0);   // i ritagli dei disegni a destra non contano
  buone.sort((a, b) => a.y - b.y);
  // un glifo = zone che si sovrappongono in altezza (il "10", lettere spezzate)
  const gruppi = [];
  for (const z of buone) {
    const g = gruppi[gruppi.length - 1];
    if (g && z.y < g.y1 - 0.3 * Math.min(z.h, g.y1 - g.y0)) {
      g.ids.add(z.id); g.x0 = Math.min(g.x0, z.x); g.x1 = Math.max(g.x1, z.x + z.w - 1); g.y1 = Math.max(g.y1, z.y + z.h - 1);
    } else gruppi.push({ids: new Set([z.id]), x0: z.x, x1: z.x + z.w - 1, y0: z.y, y1: z.y + z.h - 1});
  }
  // con la sfocatura valore e seme si toccano: un glifo troppo alto si divide nella riga più stretta,
  // se lì è proprio un filo (la gamba della J è stretta, ma non così tanto)
  const divisi = [];
  for (const g of gruppi) {
    const alto = g.y1 - g.y0 + 1;
    if (alto > 1.5 * (g.x1 - g.x0 + 1) && alto > 0.13 * Hf) {
      const largo = [];
      for (let y = g.y0; y <= g.y1; y++) { let n = 0; for (let x = g.x0; x <= g.x1; x++) n += g.ids.has(lab[y * w + x]) ? 1 : 0; largo.push(n); }
      const mx = Math.max(...largo);
      let t = -1;
      for (let i = Math.round(0.3 * alto); i < 0.8 * alto; i++) if (t < 0 || largo[i] < largo[t]) t = i;
      // un collo vero è corto e ha parti larghe sopra e sotto (l'asta del 4 o della J è lunga)
      let collo = 0;
      for (let i = t; i >= 0 && largo[i] <= 0.3 * mx; i--) collo++;
      for (let i = t + 1; i < alto && largo[i] <= 0.3 * mx; i++) collo++;
      const sopra = Math.max(...largo.slice(0, t)), sotto = Math.max(...largo.slice(t + 1));
      if (t > 0 && largo[t] <= 0.2 * mx && collo <= Math.max(3, 0.06 * alto) && sopra >= 0.5 * mx && sotto >= 0.5 * mx) {
        divisi.push({...g, y1: g.y0 + t - 1}, {...g, y0: g.y0 + t + 1});
        continue;
      }
    }
    divisi.push(g);
  }
  // i pezzetti (la coda della carta sopra, granelli) non sono né valori né semi
  return divisi.filter(g => g.y1 - g.y0 + 1 >= 0.025 * Hf).map(g => {
    let x0 = g.x1, x1 = g.x0;   // dopo la divisione i bordi a destra e a sinistra vanno ricalcolati
    for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x1; x++) if (g.ids.has(lab[y * w + x])) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    g = {...g, x0, x1};
    const pieno = (x, y) => y >= g.y0 && y <= g.y1 && g.ids.has(lab[y * w + x]) ? 1 : 0;
    let r = 0, n = 0;
    for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x1; x++) if (pieno(x, y)) { r += rosso[y * w + x]; n++; }
    return {v: vettoreGlifo(pieno, g.x0, g.y0, g.x1, g.y1), asp: (g.y1 - g.y0 + 1) / (g.x1 - g.x0 + 1), rosso: r / n, y0: g.y0, y1: g.y1};
  });
}

/** Modelli presi dagli angoli dei mazzi veri (angoli/mazzi.json): si aggiungono a quelli dei caratteri. */
async function modelliDaAngoli(base = 'angoli/', escludi = [], sfocature = [0, 1.5, 3]) {
  const valori = [], semi = [];
  const indice = await (await fetch(base + 'mazzi.json')).json();
  for (const m of indice) {
    if (escludi.includes(m.nome)) continue;
    const img = await caricaImmagine(base + m.file);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', {willReadFrequently: true});
    const CX = 90, CY = 190;
    // ogni angolo anche sfocato: la fotocamera vede l'indice più morbido delle immagini dei mazzi
    for (const sig of sfocature) {
    g.filter = sig ? `blur(${sig}px)` : 'none';
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0);
    for (const k of m.carte) {
      const v = parseInt(k, 10), s = k.slice(-1), x0 = (v - 1) * CX, y0 = 'hsdc'.indexOf(s) * CY;
      const d = g.getImageData(x0, y0, CX, CY).data, gb = new Float32Array(CX * CY), rosso = new Float32Array(CX * CY);
      for (let i = 0; i < CX * CY; i++) { gb[i] = (d[4 * i + 1] + d[4 * i + 2]) / 2; rosso[i] = d[4 * i] - gb[i]; }
      const gl = glifiIndice(gb, rosso, CX, CY, 340, m.alt);
      const gv = gl.find(q => q.y1 - q.y0 + 1 >= VALORE_MIN * m.alt);
      if (!gv || gv.y0 > 0.12 * m.alt) continue;   // valore non trovato al suo posto: meglio nessun modello che uno sbagliato
      valori.push({classe: v, v: gv.v, asp: gv.asp, mazzo: m.nome});
      const gs = gl.find(q => q.y0 > gv.y1 && q.y0 < gv.y1 + 0.12 * m.alt);
      if (gs) semi.push({classe: s, v: gs.v, asp: gs.asp, mazzo: m.nome});
    }
    }
  }
  return {valori, semi};
}

/** La classe che somiglia di più: {classe, s, margine}. Conta anche la forma (alto/largo) del glifo. */
function classifica(v, asp, modelli) {
  const migliore = {};
  for (const m of modelli) {
    let c = 0;
    for (let i = 0; i < v.length; i++) c += v[i] * m.v[i];
    c -= 0.5 * Math.abs(Math.log(asp / m.asp));
    if (!(m.classe in migliore) || c > migliore[m.classe]) migliore[m.classe] = c;
  }
  const ord = Object.entries(migliore).sort((a, b) => b[1] - a[1]);
  if (!ord.length) return {classe: null, s: -1, margine: 0};
  return {classe: ord[0][0], s: ord[0][1], margine: ord.length > 1 ? ord[0][1] - ord[1][1] : 1};
}

/** Allarga (o restringe) una maschera 0/1 di r pixel, con un quadrato. */
function allarga(m, W, H, r, restringi = false) {
  const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
  const pieno = n => restringi ? n === 2 * r + 1 : n > 0;
  for (let y = 0; y < H; y++) {
    const b = y * W;
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; n += xx < 0 || xx >= W ? (restringi ? 1 : 0) : m[b + xx]; }
      t[b + x] = pieno(n) ? 1 : 0;
    }
  }
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    let n = 0;
    for (let k = -r; k <= r; k++) { const yy = y + k; n += yy < 0 || yy >= H ? (restringi ? 1 : 0) : t[yy * W + x]; }
    o[y * W + x] = pieno(n) ? 1 : 0;
  }
  return o;
}

class OcchioVero {
  /** veri: modelli presi dagli angoli dei mazzi (modelliDaAngoli), aggiunti a quelli dei caratteri. */
  constructor(veri = null) {
    this.vero = true;
    this.cal = null;
    this.m = {sig: 0};
    this.motivo = '';
    this.letture = 0;
    this.glifi = modelliGlifi();
    if (veri) { this.glifi.valori.push(...veri.valori); this.glifi.semi.push(...veri.semi); }
    this.tela = document.createElement('canvas');
    this.prima = null;   // luminosità ridotta del fotogramma precedente (per il movimento)
  }

  /** Il fotogramma ridotto a LAVORO_W, con le maschere "bianco di carta" e "carta" (tutto ciò che non è tavolo). */
  _analizza(frame) {
    const W = LAVORO_W, k = frame.width / W, H = Math.round(frame.height / k), N = W * H;
    if (this.tela.width !== W || this.tela.height !== H) { this.tela.width = W; this.tela.height = H; }
    const c = this.tela.getContext('2d', {willReadFrequently: true});
    c.drawImage(frame.sorgente, 0, 0, W, H);
    const d = c.getImageData(0, 0, W, H).data;
    const V = new Uint8Array(N), sat = new Float32Array(N), isto = new Uint32Array(256);
    for (let i = 0; i < N; i++) {
      const r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      V[i] = mx; sat[i] = mx ? (mx - mn) / mx : 0;
      if (sat[i] < 0.25) isto[mx]++;
    }
    // il bianco delle carte: il 98° percentile della luce fra i pixel grigi
    let tot = 0;
    for (const n of isto) tot += n;
    let liv = 255;
    for (let acc = 0; liv > 0; liv--) { acc += isto[liv]; if (acc > 0.02 * tot) break; }
    const bianco = new Uint8Array(N);
    for (let i = 0; i < N; i++) bianco[i] = sat[i] < 0.22 && V[i] > 0.72 * liv ? 1 : 0;
    // colore del tavolo: mediana dei pixel non bianchi (il tavolo è la parte più grande)
    const cr = [], cg = [], cb = [];
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
      const i = y * W + x;
      if (!bianco[i]) { cr.push(d[4 * i]); cg.push(d[4 * i + 1]); cb.push(d[4 * i + 2]); }
    }
    const tav = [mediana(cr), mediana(cg), mediana(cb)];
    const dist = i => Math.abs(d[4 * i] - tav[0]) + Math.abs(d[4 * i + 1] - tav[1]) + Math.abs(d[4 * i + 2] - tav[2]);
    const ds = [];
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) if (!bianco[y * W + x]) ds.push(dist(y * W + x));
    const soglia = Math.max(60, 2.2 * mediana(ds));   // le venature del legno non devono sembrare carte
    let carta = new Uint8Array(N);
    for (let i = 0; i < N; i++) carta[i] = bianco[i] || dist(i) > soglia ? 1 : 0;
    carta = allarga(allarga(carta, W, H, 1, true), W, H, 1);   // via i puntini
    carta = allarga(allarga(carta, W, H, 2), W, H, 2, true);   // chiude le fessure fra le carte di una colonna
    // quello che è chiuso dentro un bordo bianco è carta, anche se ha il colore del tavolo (un dorso verde
    // su un panno verde): riempio tutto ciò che non si raggiunge dai bordi dell'immagine senza passare da carta
    const fuori = new Uint8Array(N), pila = new Int32Array(N);
    let top = 0;
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const i = y * W + x; if (!carta[i] && !fuori[i]) { fuori[i] = 1; pila[top++] = i; } }
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const i = y * W + x; if (!carta[i] && !fuori[i]) { fuori[i] = 1; pila[top++] = i; } }
    while (top) {
      const p = pila[--top], x = p % W;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (q >= 0 && q < N && !carta[q] && !fuori[q]) { fuori[q] = 1; pila[top++] = q; }
      }
    }
    for (let i = 0; i < N; i++) if (!fuori[i]) carta[i] = 1;
    // movimento: riquadri di 16 pixel che cambiano di molto rispetto al fotogramma prima
    const L = new Uint8Array(N);
    for (let i = 0; i < N; i++) L[i] = (d[4 * i] * 77 + d[4 * i + 1] * 150 + d[4 * i + 2] * 29) >> 8;
    let movimento = 0;
    if (this.prima && this.prima.length === N) {
      let cambiati = 0, riquadri = 0;
      for (let by = 0; by + 16 <= H; by += 16) for (let bx = 0; bx + 16 <= W; bx += 16) {
        let s = 0;
        for (let y = by; y < by + 16; y += 2) for (let x = bx; x < bx + 16; x += 2) s += Math.abs(L[y * W + x] - this.prima[y * W + x]);
        riquadri++;
        if (s / 64 > 14) cambiati++;
      }
      movimento = 100 * cambiati / riquadri;
    }
    this.prima = L;
    return {W, H, k, d, bianco, carta, movimento, tav, soglia, dist};
  }

  /** Aggancio: misura le carte e trova la fila in alto e le 7 colonne. {errore} se non ci riesce. */
  calibra(frame) {
    this.cal = null;
    const A = this._analizza(frame);
    const N = A.W * A.H;
    const ogg = componenti(A.carta, A.W, A.H).filter(o => o.n > 0.0008 * N && o.w > 8 && o.h > 8 && o.w < 0.3 * A.W);
    if (ogg.length < 5) return {errore: 'Non vedo le carte: inquadra tutto il tavolo dall\'alto, con mazzo e 7 colonne.'};
    // ogni pila è larga una carta (le carte stanno dritte); l'altezza la danno le pile di una carta sola
    const Wc = mediana(ogg.map(o => o.w));
    const buoni = ogg.filter(o => o.w > 0.75 * Wc && o.w < 1.3 * Wc);
    let Hc = 1.42 * Wc;   // per ora; la proporzione vera la danno le carte della fila in alto
    buoni.sort((a, b) => a.y - b.y);
    const y0 = buoni[0].y;
    const alto = buoni.filter(o => o.y < y0 + 0.5 * Hc), sotto = buoni.filter(o => o.y >= y0 + 0.5 * Hc);
    let fila = [], colonne = alto;
    if (sotto.length >= 3) {
      const ys = Math.min(...sotto.map(o => o.y));
      fila = alto; colonne = sotto.filter(o => o.y < ys + 0.6 * Hc);
    }
    // nella fila in alto ogni pila è una carta sola; nelle colonne due carte sovrapposte sembrano
    // una carta più lunga, quindi lì prendo le più corte
    const singole = buoni.filter(o => o.h / o.w > 1.2 && o.h / o.w < 1.7);
    const inFila = singole.filter(o => fila.includes(o));
    const rapporti = (inFila.length ? inFila : singole).map(o => o.h / o.w).sort((a, b) => a - b);
    const asp = rapporti.length ? (inFila.length ? mediana(rapporti) : rapporti[Math.floor(rapporti.length / 4)]) : 1.42;
    Hc = asp * Wc;
    if (colonne.length < 4) return {errore: `Vedo solo ${colonne.length} colonne: inquadra tutte e 7 le colonne, dall'alto.`};
    const cx = o => o.x + o.w / 2;
    const xs = colonne.map(cx).sort((a, b) => a - b);
    const salti = xs.slice(1).map((x, i) => x - xs[i]);
    const minimo = Math.min(...salti);
    const passo = mediana(salti.filter(s => s < 1.5 * minimo));
    let x0 = xs[0];
    // la prima colonna sta sotto il mazzo: se il mazzo c'è, mi allineo a lui
    const mazzo = fila.slice().sort((a, b) => a.x - b.x)[0];
    if (mazzo) { const k = Math.round((x0 - cx(mazzo)) / passo); if (k > 0 && k < 7) x0 -= k * passo; }
    if (Math.round((xs[xs.length - 1] - x0) / passo) > 6) return {errore: 'Vedo più di 7 colonne: controlla che il tavolo sia disposto come un solitario.'};
    const topCol = mediana(colonne.map(o => o.y));
    this.cal = {
      Wc, Hc, asp, passo, topCol, k: A.k,
      filaY: fila.length ? mediana(fila.map(o => o.y)) : topCol - 1.3 * Hc,
      colX: [0, 1, 2, 3, 4, 5, 6].map(i => x0 + i * passo),
      dimensione: [frame.width, frame.height], angoli: null,
    };
    this._imparaDorso(A, fila.slice().sort((a, b) => a.x - b.x)[0]);
    this.cache = {};
    return {};
  }

  /**
   * Il colore del dorso: dal mazzo (la prima pila in alto a sinistra) e dalla cima delle colonne, dove
   * all'inizio stanno le coperte. Serve a non scambiare le figure (colorate) per carte coperte.
   */
  _imparaDorso(A, mazzo) {
    const {Wc, Hc, colX, topCol} = this.cal, px = [];
    // solo pixel che non sono né tavolo né bianco di carta; una zona conta se è quasi tutta così
    // (il mazzo, la cima di una colonna con le coperte), non se è una carta scoperta con qualche seme
    const prendi = (xa, xb, ya, yb) => {
      const qui = [];
      let tot = 0;
      for (let y = Math.max(0, Math.round(ya)); y < Math.min(A.H, yb); y += 2) for (let x = Math.max(0, Math.round(xa)); x < Math.min(A.W, xb); x += 2) {
        const i = y * A.W + x;
        tot++;
        if (A.carta[i] && !A.bianco[i]) qui.push(i);   // dentro una carta e non bianco: anche se somiglia al tavolo
      }
      if (qui.length > 0.6 * tot) px.push(...qui);
    };
    if (mazzo) prendi(mazzo.x + 0.2 * mazzo.w, mazzo.x + 0.8 * mazzo.w, mazzo.y + 0.2 * mazzo.h, mazzo.y + 0.8 * mazzo.h);
    if (px.length < 30) for (const x of colX.slice(1)) prendi(x - 0.3 * Wc, x + 0.3 * Wc, topCol + 0.03 * Hc, topCol + 0.08 * Hc);
    if (px.length < 30) { this.cal.dorso = null; return; }
    const c = [0, 1, 2].map(k => mediana(px.map(i => A.d[4 * i + k])));
    const dist = px.map(i => Math.abs(A.d[4 * i] - c[0]) + Math.abs(A.d[4 * i + 1] - c[1]) + Math.abs(A.d[4 * i + 2] - c[2]));
    this.cal.dorso = c;
    this.cal.sogliaDorso = Math.min(130, Math.max(60, 2 * mediana(dist)));
  }

  /** Frazione di pixel color dorso nella riga y fra xa e xb. */
  _rigaDorso(A, y, xa, xb) {
    const c = this.cal.dorso, s = this.cal.sogliaDorso;
    if (!c) return 0;
    xa = Math.max(0, Math.round(xa)); xb = Math.min(A.W - 1, Math.round(xb));
    let n = 0;
    for (let x = xa; x <= xb; x++) {
      const i = 4 * (y * A.W + x);
      if (!A.carta[y * A.W + x]) continue;   // un dorso verde su un panno verde: conta solo dentro le carte
      if (Math.abs(A.d[i] - c[0]) + Math.abs(A.d[i + 1] - c[1]) + Math.abs(A.d[i + 2] - c[2]) < s) n++;
    }
    return xb >= xa ? n / (xb - xa + 1) : 0;
  }

  /** Frazione di pixel "carta" (o "bianco") nella riga y fra xa e xb. */
  _riga(M, A, y, xa, xb) {
    xa = Math.max(0, Math.round(xa)); xb = Math.min(A.W - 1, Math.round(xb));
    let n = 0;
    for (let x = xa; x <= xb; x++) n += M[y * A.W + x];
    return xb >= xa ? n / (xb - xa + 1) : 0;
  }

  /** Larghezza della carta intorno al centro cx fra le righe ya e yb (mediana delle corse di "carta"). */
  _larghezza(A, cx, ya, yb) {
    const ws = [];
    for (let y = Math.max(0, Math.round(ya)); y < Math.min(A.H, yb); y += 2) {
      let l = Math.round(cx), r = Math.round(cx);
      if (!A.carta[y * A.W + l]) continue;
      while (l > 0 && A.carta[y * A.W + l - 1]) l--;
      while (r < A.W - 1 && A.carta[y * A.W + r + 1]) r++;
      if (r - l < 1.4 * this.cal.Wc) ws.push(r - l + 1);
    }
    return ws.length ? mediana(ws) : this.cal.Wc;
  }

  /**
   * L'alto vero di una carta stimato a "stima" (immagine ridotta): la riga scura sottile del suo bordo
   * (contorno o ombra sulla carta sotto), cercata nella metà destra dove non ci sono indici. Se non la
   * trovo resta la stima.
   */
  _bordoAlto(frame, A, cx, Wl, stima, minimo) {
    const k = A.k, Hl = Wl * this.cal.asp, FW = frame.width, src = frame.data;
    const xa = Math.round((cx + 0.05 * Wl) * k), xb = Math.round((cx + 0.42 * Wl) * k);
    const ya = Math.max(Math.round(minimo * k) + 3, Math.round((stima - 0.15 * Hl) * k)), yb = Math.min(frame.height - 4, Math.round((stima + 0.1 * Hl) * k));
    if (yb - ya < 6 || xb - xa < 4) return stima;
    const luce = [];
    for (let y = ya - 3; y <= yb + 3; y++) {
      let s = 0;
      for (let x = xa; x < xb; x++) { const j = 4 * (y * FW + x); s += Math.min(src[j], src[j + 1], src[j + 2]); }
      luce.push(s / (xb - xa));
    }
    // una riga sottile scura con carta bianca sopra e sotto (una striscia di dorso è scura e spessa);
    // fra più candidate vince la più vicina alla stima
    const chiaro = 0.75 * Math.max(...luce), centro = Math.round((stima * k) - ya + 3);
    let meglio = -1, voto = -Infinity;
    for (let i = 3; i < luce.length - 3; i++) {
      if (luce[i - 3] < chiaro || luce[i + 3] < chiaro) continue;
      const d = Math.min(luce[i - 3], luce[i - 2]) / 2 + Math.min(luce[i + 2], luce[i + 3]) / 2 - luce[i];
      if (d < 12) continue;   // almeno 12 livelli più scura delle righe vicine
      const v = d - 0.5 * Math.abs(i - centro);
      if (v > voto) { voto = v; meglio = i; }
    }
    return meglio < 0 ? stima : (ya - 3 + meglio + 1) / k;
  }

  /** Bordo sinistro della carta che comincia alla riga yTop vicino alla colonna di centro cx. */
  _sinistra(A, cx, yTop, Wc = this.cal.Wc) {
    const Hc = Wc * this.cal.asp, xs = [];
    // dal centro della colonna verso sinistra, finché c'è carta (partendo da fuori si finisce sulla colonna accanto)
    for (let y = Math.round(yTop + 0.08 * Hc); y < yTop + 0.25 * Hc && y < A.H; y += 2) {
      let x = Math.round(cx);
      if (!A.carta[y * A.W + x]) continue;
      while (x > 0 && x > cx - 0.8 * Wc && A.carta[y * A.W + x - 1]) x--;
      xs.push(x);
    }
    return xs.length ? mediana(xs) : cx - Wc / 2;
  }

  /**
   * Legge l'indice in alto a sinistra della carta che comincia alla riga yTop (immagine ridotta):
   * {v, col, seme, y} o null. Il valore è il primo glifo dall'alto, il seme quello subito sotto.
   */
  _indice(frame, A, cx, yTop, conSeme, Wc = this.cal.Wc, dalFondo = false) {
    const Hc = Wc * this.cal.asp, k = A.k, Wf = Wc * k, Hf = Hc * k;
    const xl = this._sinistra(A, cx, yTop, Wc) * k;
    const X0 = Math.max(0, Math.round(xl + 0.015 * Wf)), X1 = Math.min(frame.width - 1, Math.round(xl + 0.26 * Wf));
    // dalFondo: l'alto della carta è solo stimato (ultima carta di una colonna); allargo la zona e
    // prendo l'ultima coppia valore-seme, perché sotto l'indice dell'ultima carta non c'è altro
    const Y0 = Math.max(0, Math.round((yTop - (dalFondo ? 0.15 : 0.05) * Hc) * k));
    const Y1 = Math.min(frame.height - 1, Math.round((yTop + (dalFondo ? 0.33 : 0.36) * Hc) * k));
    const w = X1 - X0 + 1, h = Y1 - Y0 + 1;
    if (w < 6 || h < 10) return this._no('zona indice fuori immagine');
    const src = frame.data, FW = frame.width;
    const gb = new Float32Array(w * h), rosso = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const j = 4 * ((Y0 + y) * FW + X0 + x);
      gb[y * w + x] = (src[j + 1] + src[j + 2]) / 2;
      rosso[y * w + x] = src[j] - gb[y * w + x];
    }
    const glifi = glifiIndice(gb, rosso, w, h, Wf, Hf);
    this.ultimoIndice = {X0, Y0, w, h, glifi};   // per guardare cosa ha visto (banco di prova)
    let gv, gs;
    if (dalFondo) {
      for (let j = glifi.length - 1; j >= 1 && !gv; j--) {
        const a = glifi[j - 1], b = glifi[j];
        if (a.y1 - a.y0 + 1 >= VALORE_MIN * Hf && b.y0 - a.y1 < 0.12 * Hf) { gv = a; gs = b; }
      }
      if (!gv) return this._no('nessuna coppia valore-seme');
      const dove = Y0 + gv.y0 - yTop * k;   // il valore deve stare vicino all'alto stimato
      if (dove < -0.13 * Hf || dove > 0.17 * Hf) return this._no('valore lontano dall\'alto della carta');
    } else {
      // il primo glifo alto abbastanza, ma non un seme: in cima alla zona può spuntare il seme della carta sopra
      gv = glifi.find(g => g.y1 - g.y0 + 1 >= VALORE_MIN * Hf
        && classifica(g.v, g.asp, this.glifi.semi).s < classifica(g.v, g.asp, this.glifi.valori).s + 0.05);
      if (!gv) return this._no('nessun glifo');
      if (gv.y0 > 0.2 * Hf) return this._no('valore troppo in basso');   // il valore sta subito sotto il bordo della carta
    }
    const val = classifica(gv.v, gv.asp, this.glifi.valori);
    if (val.s < SOGLIA_GLIFO || val.margine < STACCO_GLIFO) return this._no(`valore incerto ${val.classe} ${val.s.toFixed(2)}/${val.margine.toFixed(3)}`);
    const col = gv.rosso > 35 ? 'R' : 'B';
    const out = {v: +val.classe, col, seme: null, y: Y0 / k + gv.y0 / k};
    if (!conSeme) return out;
    gs = gs || glifi.find(g => g.y0 > gv.y1 && g.y0 < gv.y1 + 0.12 * Hf);
    if (!gs) return this._no('seme non trovato');
    const semi = this.glifi.semi.filter(m => (ROSSI.includes(m.classe) ? 'R' : 'B') === col);
    const s = classifica(gs.v, gs.asp, semi);
    if (s.s < SOGLIA_GLIFO || s.margine < STACCO_GLIFO) return this._no(`seme incerto ${s.classe} ${s.s.toFixed(2)}/${s.margine.toFixed(3)}`);
    out.seme = s.classe;
    return out;
  }

  /** Annota perché una lettura non riesce (per il banco di prova e per le segnalazioni) e dà null. */
  _no(motivo) { this.perche = motivo; return null; }

  /** Righe bianche nella striscia vicino al bordo destro delle carte di una colonna. */
  _bandaBianca(A, cx, y) {
    const {Wc} = this.cal, l = cx - Wc / 2;
    return this._riga(A.bianco, A, y, l + BANDA_DESTRA[0] * Wc, l + BANDA_DESTRA[1] * Wc) > 0.75;
  }

  /** Una colonna: Colonna, Colonna() se è vuota, null se non si legge. */
  _colonna(frame, A, i) {
    const {Wc, Hc, colX, topCol} = this.cal, cx = colX[i];
    const xa = cx - 0.3 * Wc, xb = cx + 0.3 * Wc;
    let inizio = -1, fine = -1, vuote = 0;
    for (let y = Math.max(0, Math.round(topCol - 0.25 * Hc)); y < A.H; y++) {
      if (this._riga(A.carta, A, y, xa, xb) > 0.6) { if (inizio < 0) inizio = y; fine = y; vuote = 0; }
      else if (inizio >= 0 && ++vuote > 0.06 * Hc) {
        if (fine - inizio > 0.3 * Hc) break;
        inizio = -1; vuote = 0;   // era la coda di una carta della fila in alto: cerco ancora
      }
      else if (inizio < 0 && y > topCol + 0.5 * Hc) break;
    }
    if (inizio < 0) return new Colonna();
    if (fine >= A.H - 2) return this._no('esce dall\'immagine');
    if (fine - inizio < 0.85 * Hc) return this._no('colonna troppo corta');   // una mano, o una carta mossa
    const Wl = this._larghezza(A, cx, fine - 0.4 * Hc, fine - 0.1 * Hc), Hl = Wl * this.cal.asp;
    const altoUltima = this._bordoAlto(frame, A, cx, Wl, Math.max(inizio, fine - Hl + 1), inizio);
    this.ultimaColonna = {altoUltima, Wl, inizio, fine};   // per il banco di prova
    // le coperte: dall'alto, righe col colore del dorso (le figure sono colorate, ma non di quel colore).
    // Ogni dorso spunta come una fascia color dorso, separata dalla successiva dal bordo chiaro
    const dorso = y => this._rigaDorso(A, y, cx - 0.3 * Wl, cx + 0.3 * Wl) > 0.6;
    const fasce = [];
    let su = inizio;
    for (let y = inizio, dentro = false; y < altoUltima + 0.03 * Hl; y++) {
      if (dorso(y)) {
        if (!dentro) fasce.push([y, y]);
        fasce[fasce.length - 1][1] = y; dentro = true; su = y + 1;
      } else dentro = false;
    }
    // fasce troppo corte sono rumore; due dorsi col bordo sfocato si fondono in una fascia lunga il doppio
    const buone = fasce.filter(f => f[1] - f[0] >= 0.02 * Hl);
    if (buone.length) su = buone[buone.length - 1][1] + 1; else su = inizio;
    let coperte = 0;
    if (buone.length) {
      const passi = buone.slice(1).map((f, j) => f[0] - buone[j][0]).filter(d => d > 0.05 * Hl && d < 0.4 * Hl);
      if (passi.length) this.passoCoperte = mediana(passi);
      const passo = this.passoCoperte || 0.13 * Hl;
      coperte = Math.max(buone.length, Math.round((su - buone[0][0]) / passo));
    }
    if (!this.cal.dorso) {
      // dorso dello stesso colore del tavolo (o mai visto): la prima scoperta comincia con una fascia
      // bianca alta al centro, i dorsi mostrano al massimo un filo bianco in cima
      const bianca = y => this._riga(A.bianco, A, y, cx - 0.25 * Wl, cx + 0.25 * Wl);
      su = Math.round(altoUltima);
      for (let y = inizio, corsa = 0; y < altoUltima + 0.05 * Hl; y++) {
        corsa = bianca(y) > 0.8 ? corsa + 1 : 0;
        if (corsa >= 0.045 * Hl) { su = Math.min(su, y - corsa + 1); break; }
      }
      coperte = su - inizio > 0.04 * Hl ? Math.max(1, Math.round((su - inizio) / (this.passoCoperte || 0.13 * Hl))) : 0;
    }
    su = Math.min(su, Math.round(altoUltima));
    const u = this._indice(frame, A, cx, altoUltima, true, Wl) || this._indice(frame, A, cx, altoUltima, true, Wl, true);
    if (!u) return this._no('ultima: ' + this.perche);
    const ultima = [u.v, u.seme];
    if (altoUltima - su < 0.1 * Hc) return new Colonna(coperte, [ultima]);
    const p = this._indice(frame, A, cx, su, false, Wl);
    if (!p) return this._no('prima: ' + this.perche);
    const n = p.v - u.v + 1;
    if (n < 2 || (p.col === u.col) !== (n % 2 === 1)) return this._no(`sequenza impossibile ${p.v}${p.col}..${u.v}${u.col}`);
    const carte = [];
    for (let t = n - 1; t >= 1; t--) carte.push([u.v + t, t % 2 === 0 ? u.col : (u.col === 'R' ? 'B' : 'R')]);
    carte.push(ultima);
    return new Colonna(coperte, carte);
  }

  /** Zona della fila in alto sopra la colonna i (allargata a destra fino a "fino" passi). */
  _fila(A, i, fino = 0) {
    const {Wc, Hc, colX, filaY, topCol} = this.cal;
    const ya = Math.max(0, Math.round(filaY - 0.3 * Hc)), yb = Math.min(A.H - 1, Math.round(Math.min(filaY + 1.25 * Hc, topCol - 0.1 * Hc)));
    const xa = Math.max(0, Math.round(colX[i] - 0.6 * Wc)), xb = Math.min(A.W - 1, Math.round(colX[i + fino] + 0.6 * Wc));
    return {ya, yb, xa, xb};
  }

  /** La carta scoperta più a destra nella zona: {cx, top} o null. */
  _cartaInFila(A, z) {
    const {Wc, Hc} = this.cal;
    let destra = -1;
    for (let x = z.xb; x >= z.xa && destra < 0; x--) {
      let n = 0;
      for (let y = z.ya; y <= z.yb; y++) n += A.bianco[y * A.W + x];
      if (n > 0.5 * Hc) destra = x;
    }
    if (destra < 0) return null;
    const cx = destra - Wc / 2;
    for (let y = z.ya; y <= z.yb; y++) if (this._riga(A.bianco, A, y, cx - 0.3 * Wc, cx + 0.3 * Wc) > 0.5) return {cx, top: y};
    return null;
  }

  leggiPosti(frame) {
    if (!this.cal) return null;
    const A = this._analizza(frame);
    this.ultimaA = A;
    const posti = {movimento: A.movimento};
    this.motivi = {};
    for (let i = 0; i < 7; i++) { this.perche = ''; posti['c' + i] = this._colonna(frame, A, i); if (!posti['c' + i]) this.motivi['c' + i] = this.perche; }
    // mazzo: un dorso (carta che non è bianca) sopra la prima colonna
    const zm = this._fila(A, 0);
    let carta = 0, bianco = 0, tot = 0;
    for (let y = zm.ya; y <= zm.yb; y += 2) for (let x = Math.round(this.cal.colX[0] - 0.3 * this.cal.Wc); x < this.cal.colX[0] + 0.3 * this.cal.Wc; x += 2) {
      const j = y * A.W + x; tot++; carta += A.carta[j]; bianco += A.bianco[j];
    }
    posti.mazzo = carta > 0.3 * tot && bianco < 0.5 * carta;
    if (this.cal.dorso) {   // col colore del dorso è più sicuro
      let d = 0, n = 0;
      for (let y = Math.round(zm.ya + 0.1 * this.cal.Hc); y <= zm.yb - 0.1 * this.cal.Hc; y += 2) { d += this._rigaDorso(A, y, this.cal.colX[0] - 0.3 * this.cal.Wc, this.cal.colX[0] + 0.3 * this.cal.Wc); n++; }
      posti.mazzo = n > 0 && d / n > 0.3;
    }
    // scarti: anche a ventaglio (3 alla volta), la carta giocabile è quella più a destra
    const cs = this._cartaInFila(A, this._fila(A, 1, 1));
    if (!cs) posti.scarto = null;
    else { const c = this._indice(frame, A, cs.cx, cs.top, true) || this._indice(frame, A, cs.cx, cs.top, true, undefined, true); posti.scarto = c ? [c.v, c.seme] : undefined; if (!c) this.motivi.scarto = this.perche; }
    // basi: le carte scoperte sopra le colonne 4-7, con il loro seme
    const basi = {h: 0, s: 0, d: 0, c: 0};
    let incerte = false;
    for (let i = 3; i < 7; i++) {
      const z = this._fila(A, i);
      z.xa = Math.round(this.cal.colX[i] - 0.45 * this.cal.Wc); z.xb = Math.round(this.cal.colX[i] + 0.55 * this.cal.Wc);
      const b = this._cartaInFila(A, z);
      if (!b) continue;
      const c = this._indice(frame, A, b.cx, b.top, true) || this._indice(frame, A, b.cx, b.top, true, undefined, true);
      if (!c || basi[c.seme]) { incerte = true; this.motivi['base' + i] = c ? 'seme doppio' : this.perche; } else basi[c.seme] = c.v;
    }
    for (const s of SEMI) posti['b' + s] = incerte ? undefined : basi[s];
    if (++this.letture % 30 === 0 && [0, 1, 2, 3, 4, 5, 6].every(i => posti['c' + i] && !posti['c' + i].carte.length) && !posti.mazzo) {
      this.cal = null; this.motivo = 'tavolo perso';
    }
    return posti;
  }

  /** Disegna sul video i posti trovati e, sopra, le carte lette. P: punto dell'immagine ridotta -> schermo. */
  disegna(g, P, dpr, st) {
    const {Wc, Hc, colX, topCol, filaY} = this.cal;
    const rett = (cx, y) => { const [a, b] = P(cx - Wc / 2, y), [c, d] = P(cx + Wc / 2, y + Hc); g.strokeRect(a, b, c - a, d - b); };
    g.lineWidth = 2 * dpr; g.strokeStyle = 'rgba(92,192,127,.9)';
    colX.forEach(x => rett(x, topCol));
    [0, 1, 3, 4, 5, 6].forEach(i => rett(colX[i], filaY));
    if (!st) return;
    const etichetta = (testo, cx, y, rosso) => {
      const [a, b] = P(cx - Wc / 2, y);
      g.font = `700 ${Math.round(15 * dpr)}px -apple-system, sans-serif`;
      const w = g.measureText(testo).width + 8 * dpr, h = 20 * dpr;
      g.fillStyle = 'rgba(0,0,0,.72)'; g.fillRect(a, b - h, w, h);
      g.fillStyle = rosso ? '#ff7b82' : '#fff'; g.fillText(testo, a + 4 * dpr, b - 5 * dpr);
    };
    st.colonne.forEach((c, i) => {
      const u = c.ultima();
      etichetta(u ? nome(u) + (c.coperte ? ` (${c.coperte})` : '') : 'vuota', colX[i], topCol, u && colore(u) === 'R');
    });
    etichetta(st.mazzo ? 'mazzo' : 'vuoto', colX[0], filaY, false);
    if (st.scarto) etichetta(nome(st.scarto), colX[1], filaY, colore(st.scarto) === 'R');
    SEMI.split('').filter(s => st.basi[s]).forEach((s, j) => etichetta(nome([st.basi[s], s]), colX[3 + j], filaY, 'hd'.includes(s)));
  }
}
