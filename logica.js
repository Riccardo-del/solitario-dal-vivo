// Il "cervello" del programma Python solitario_bot.py, riscritto in JavaScript (uguale alla versione da foto).
// Una carta è [valore, seme]: valore 1-13, seme h d s c (o R / B se si vede solo il colore).
const SEMI = 'hsdc';
const ROSSI = 'hdR';
const NOMI_VAL = {1: 'A', 11: 'J', 12: 'Q', 13: 'K'};
const NOMI_LUNGHI = {1: 'Asso', 11: 'Fante', 12: 'Donna', 13: 'Re'};
const SIMBOLI = {h: '♥', d: '♦', s: '♠', c: '♣', R: ' rosso', B: ' nero'};

const colore = c => ROSSI.includes(c[1]) ? 'R' : 'B';
const chiave = c => c ? c[0] + c[1] : '-';
const uguali = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const K = x => JSON.stringify(x);

function nome(c) {
  if (!c) return '--';
  return (NOMI_VAL[c[0]] || String(c[0])) + SIMBOLI[c[1]];
}

function nomeLungo(c) {
  const v = NOMI_LUNGHI[c[0]] || String(c[0]);
  let art = (c[0] === 1 || c[0] === 8) ? "l'" : 'il ';
  if (c[0] === 12) art = 'la ';
  let seme = {h: 'di cuori', d: 'di quadri', s: 'di picche', c: 'di fiori', R: 'rosso', B: 'nero'}[c[1]];
  if (c[0] === 12 && 'RB'.includes(c[1])) seme = seme.slice(0, -1) + 'a';
  return `${art}${v} ${seme}`;
}

class Colonna {
  constructor(coperte = 0, carte = []) { this.coperte = coperte; this.carte = carte; }
  ultima() { return this.carte.length ? this.carte[this.carte.length - 1] : null; }
  firma() { return [this.coperte, this.carte.map(c => [c[0], colore(c)])]; }
}

class Stato {
  constructor() { this.colonne = []; this.scarto = null; this.mazzo = false; this.basi = {h: 0, s: 0, d: 0, c: 0}; }
  firma() { return K([this.colonne.map(c => c.firma()), chiave(this.scarto), this.mazzo, [...SEMI].map(s => this.basi[s])]); }
  vinto() { return [...SEMI].every(s => this.basi[s] === 13); }
  /** Scarta letture impossibili. Restituisce null se va bene, se no il motivo. */
  problema() {
    const esatte = this.colonne.filter(c => c.carte.length).map(c => c.ultima());
    if (this.scarto) esatte.push(this.scarto);
    const precise = esatte.filter(c => SEMI.includes(c[1]));
    if (new Set(precise.map(chiave)).size !== precise.length) return 'la stessa carta compare due volte';
    for (const c of precise) if (this.basi[c[1]] >= c[0]) return `${nome(c)} risulta sia in gioco sia sulla base`;
    const tutte = [];
    for (const col of this.colonne) for (const c of col.carte) if (SEMI.includes(c[1])) tutte.push(chiave(c));
    if (this.scarto) tutte.push(chiave(this.scarto));
    if (new Set(tutte).size !== tutte.length) return 'una carta compare due volte';
    const totale = this.colonne.reduce((a, c) => a + c.coperte + c.carte.length, 0) + [...SEMI].reduce((a, s) => a + this.basi[s], 0);
    if (totale > 52) return `conto ${totale} carte, più di 52`;
    // nel mazzo e negli scarti ci sono al massimo le 24 carte rimaste dopo aver distribuito le colonne
    if (totale < 28) return `conto solo ${totale} carte fra colonne e basi`;
    if (!this.mazzo && !this.scarto && totale !== 52) return `senza mazzo e scarti dovrei vedere 52 carte, ne conto ${totale}`;
    return null;
  }
}

const puoStareSopra = (carta, sotto) => sotto[0] === carta[0] + 1 && colore(sotto) !== colore(carta);

class Cervello {
  constructor() {
    this.memoria = Array.from({length: 7}, () => []);
    this.inArrivo = [];
    this.resetCiclo();
    this.provate = new Set();
    this.scelte = new Map();   // firma del tavolo -> mosse già fatte da lì
  }
  resetCiclo() { this.visti = new Set(); this.riciclato = false; this.bloccato = false; }

  /** Ricorda i semi delle carte di cui ora si vede solo il colore. */
  completaSemi(st) {
    const esatte = new Set();
    for (const c of st.colonne) if (c.carte.length) esatte.add(chiave(c.ultima()));
    if (st.scarto) esatte.add(chiave(st.scarto));
    st.colonne.forEach((col, i) => {
      const vecchia = this.memoria[i];
      const nuove = col.carte.map((carta, idx) => {
        if (SEMI.includes(carta[1])) return carta;
        let trovata = null;
        if (idx < vecchia.length && vecchia[0][0] === col.carte[0][0] && vecchia[idx][0] === carta[0]
            && colore(vecchia[idx]) === colore(carta) && SEMI.includes(vecchia[idx][1])) trovata = vecchia[idx];
        if (!trovata) for (const x of this.inArrivo)
          if (x[0] === carta[0] && colore(x) === colore(carta) && SEMI.includes(x[1])) trovata = x;
        if (!trovata) {
          const possibili = [...SEMI].filter(s => ROSSI.includes(s) === (carta[1] === 'R')
            && st.basi[s] < carta[0] && !esatte.has(carta[0] + s));
          if (possibili.length === 1) trovata = [carta[0], possibili[0]];
        }
        return trovata || carta;
      });
      col.carte = nuove;
      this.memoria[i] = nuove.slice();
    });
  }

  sicura(carta, st) {
    const r = carta[0];
    if (r <= 2) return true;
    const opposti = ROSSI.includes(carta[1]) ? ['s', 'c'] : ['h', 'd'];
    return opposti.every(s => st.basi[s] >= r - 1);
  }
  allaBase(carta, st) { return !!carta && SEMI.includes(carta[1]) && st.basi[carta[1]] === carta[0] - 1; }

  /** Tutte le mosse legali, con un punteggio di priorità (più alto = prima). */
  mosse(st) {
    const m = [];
    const cols = st.colonne;
    const vuote = cols.filter(c => !c.carte.length && c.coperte === 0).length;
    const reInAttesa = (st.scarto && st.scarto[0] === 13) || cols.some(c => c.coperte > 0 && c.carte.length && c.carte[0][0] === 13);
    cols.forEach((c, i) => {
      const u = c.ultima();
      if (this.allaBase(u, st)) {
        if (this.sicura(u, st)) m.push([100 + c.coperte, ['B', ['T', i]]]);
        else if (c.carte.length === 1 && c.coperte > 0) m.push([80 + c.coperte, ['B', ['T', i]]]);
        else m.push([5, ['B', ['T', i]]]);
      }
    });
    if (this.allaBase(st.scarto, st)) m.push([this.sicura(st.scarto, st) ? 95 : 40, ['B', ['S']]]);
    cols.forEach((c, i) => {
      c.carte.forEach((carta, j) => {
        cols.forEach((d, k) => {
          if (k === i) return;
          const u = d.ultima();
          const ok = u ? puoStareSopra(carta, u) : (d.coperte === 0 && carta[0] === 13);
          if (!ok) return;
          if (j === 0 && c.coperte > 0) m.push([90 + c.coperte, ['T', ['T', i], j, k]]);
          else if (j === 0 && c.coperte === 0 && u && reInAttesa && !vuote) m.push([60, ['T', ['T', i], j, k]]);
          else if (j > 0) {
            const sopra = c.carte[j - 1];
            if (this.allaBase(sopra, st) && (this.sicura(sopra, st) || (j === 1 && c.coperte > 0))) m.push([50, ['T', ['T', i], j, k]]);
          }
        });
      });
    });
    if (st.scarto) {
      cols.forEach((d, k) => {
        const u = d.ultima();
        if (u && puoStareSopra(st.scarto, u)) m.push([70, ['T', ['S'], 0, k]]);
        else if (!u && d.coperte === 0 && st.scarto[0] === 13) {
          const reColonna = cols.some(c => c.coperte > 0 && c.carte.length && c.carte[0][0] === 13);
          m.push([reColonna ? 45 : 65, ['T', ['S'], 0, k]]);
        }
      });
    }
    return m;
  }

  scegli(st, ricorda = true) {
    const firma = st.firma();
    const gia = this.scelte.get(firma) || new Set();
    const candidati = this.mosse(st).sort((a, b) => b[0] - a[0])
      .filter(([, mv]) => !this.provate.has(firma + K(mv)) && !gia.has(K(mv)));
    const normali = candidati.filter(([p]) => p >= 10);
    let mv;
    if (normali.length) mv = normali[0][1];
    else if ((st.mazzo || st.scarto) && !this.bloccato) return ['M'];
    else if (candidati.length) mv = candidati[0][1];
    else return null;
    if (ricorda) { if (!this.scelte.has(firma)) this.scelte.set(firma, new Set()); this.scelte.get(firma).add(K(mv)); }
    return mv;
  }
}

function carteSpostate(mossa, st) {
  if (mossa[0] === 'B') return [mossa[1][0] === 'S' ? st.scarto : st.colonne[mossa[1][1]].ultima()];
  if (mossa[0] === 'T') return mossa[1][0] === 'S' ? [st.scarto] : st.colonne[mossa[1][1]].carte.slice(mossa[2]);
  return [];
}

/** Frase da mostrare: [titolo corto, frase intera]. */
function consiglio(mossa, st) {
  if (!mossa) return ['Nessuna mossa utile', 'Non ci sono più mosse che servano: la partita è persa. Inizia una nuova partita.'];
  if (mossa[0] === 'M') return st.mazzo
    ? ['Pesca dal mazzo', 'Clicca il mazzo in alto a sinistra per girare le carte.']
    : ['Rigira il mazzo', 'Clicca il posto vuoto del mazzo per rimettere sotto gli scarti.'];
  const carte = carteSpostate(mossa, st);
  const c = carte[0];
  const da = mossa[1][0] === 'S' ? 'dagli scarti' : `dalla colonna ${mossa[1][1] + 1}`;
  if (mossa[0] === 'B') return [`${nome(c)}  →  base`, `Metti ${nomeLungo(c)} ${da} sulla sua base in alto.`];
  const k = mossa[3];
  const dove = `colonna ${k + 1}` + (st.colonne[k].carte.length ? '' : ' (vuota)');
  let insieme = '';
  if (carte.length > 1) insieme = carte.length > 2 ? ` insieme alle ${carte.length - 1} carte sotto` : ' insieme alla carta sotto';
  return [`${nome(c)}  →  ${dove}`, `Sposta ${nomeLungo(c)} ${da}${insieme} alla ${dove}.`];
}

/** Il passaggio dal tavolo a al tavolo b è proprio la mossa consigliata? */
function coerente(mossa, a, b) {
  if (!mossa) return false;
  if (mossa[0] === 'M') return chiave(a.scarto) !== chiave(b.scarto) || a.mazzo !== b.mazzo;
  if (mossa[0] === 'B') {
    const carta = mossa[1][0] === 'S' ? a.scarto : a.colonne[mossa[1][1]].ultima();
    return !!carta && SEMI.includes(carta[1]) && b.basi[carta[1]] === carta[0];
  }
  const k = mossa[3];
  const attese = K(a.colonne[k].carte.concat(carteSpostate(mossa, a)).map(c => [c[0], colore(c)]));
  return K(b.colonne[k].carte.map(c => [c[0], colore(c)])) === attese;
}

/** Segue la partita che giochi tu e tiene pronta la mossa migliore. */
class Consigliere {
  constructor() { this.c = new Cervello(); this.ultimo = null; this.mossa = null; }
  nuovoStato(st) {
    let prima = this.ultimo;
    if (prima) {
      const copPrima = prima.colonne.reduce((a, c) => a + c.coperte, 0);
      const copOra = st.colonne.reduce((a, c) => a + c.coperte, 0);
      if (copOra > copPrima || [...SEMI].some(s => st.basi[s] < prima.basi[s])) { this.c = new Cervello(); prima = null; }
    }
    this.c.completaSemi(st);
    if (prima) {
      if (this.mossa && this.mossa[0] !== 'M' && coerente(this.mossa, prima, st)) {
        const f = prima.firma();
        if (!this.c.scelte.has(f)) this.c.scelte.set(f, new Set());
        this.c.scelte.get(f).add(K(this.mossa));
      }
      const stessoTavolo = K(st.colonne.map(c => c.firma())) === K(prima.colonne.map(c => c.firma()))
        && K(st.basi) === K(prima.basi);
      if (stessoTavolo) {   // hai pescato (o rigirato il mazzo)
        if (!prima.mazzo) this.c.riciclato = true;
        if (this.c.riciclato && this.c.visti.has(chiave(st.scarto))) this.c.bloccato = true;
        this.c.visti.add(chiave(st.scarto));
      } else this.c.resetCiclo();
    }
    this.ultimo = st;
    this.mossa = this.c.scegli(st, false);
    this.c.inArrivo = this.mossa ? carteSpostate(this.mossa, st) : [];
    return this.mossa;
  }
}

