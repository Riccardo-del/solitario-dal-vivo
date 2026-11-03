// Tracciamento: ogni posto del tavolo (7 colonne, scarti, mazzo, 4 basi) tiene le sue ultime letture
// e "vota". Un posto è stabile quando l'ha letto uguale almeno `serve` volte di fila (le letture
// mancate non interrompono la fila). Così un riflesso o una carta in movimento su una colonna
// toglie solo i voti di quella colonna, non butta via la lettura di tutto il tavolo.

const POSTI = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'scarto', 'mazzo', 'bh', 'bs', 'bd', 'bc'];
const FINESTRA = 7;

/** Lettura di un posto -> testo confrontabile; undefined = posto non letto (non vota). */
function votoDi(posto, v) {
  if (v === undefined) return undefined;
  if (posto[0] === 'c') return v ? JSON.stringify([v.coperte, v.carte]) : undefined;
  if (posto === 'scarto') return v ? v[0] + v[1] : '-';
  if (posto === 'mazzo') return v ? '1' : '0';
  return String(v);
}

class Tracciatore {
  constructor() { this.storia = {}; }
  svuota() { this.storia = {}; }

  aggiungi(posti) {
    for (const p of POSTI) {
      const h = this.storia[p] || (this.storia[p] = []);
      h.push(votoDi(p, posti[p]));
      if (h.length > FINESTRA) h.shift();
    }
  }

  /** Valore stabile di un posto (letto uguale almeno `serve` volte di fila, saltando le letture
   *  mancate), o undefined. */
  valore(p, serve) {
    const h = (this.storia[p] || []).filter(v => v !== undefined);
    if (!h.length) return undefined;
    const ultimo = h[h.length - 1];
    let fila = 0;
    for (let i = h.length - 1; i >= 0 && h[i] === ultimo; i--) fila++;
    return fila >= serve ? ultimo : undefined;
  }

  /** Posti non ancora stabili (per dire all'utente dove l'app esita). */
  incerti(serve) { return POSTI.filter(p => this.valore(p, serve) === undefined); }

  /** Il tavolo con tutti i posti stabili, o null. */
  stato(serve) {
    const v = {};
    for (const p of POSTI) { v[p] = this.valore(p, serve); if (v[p] === undefined) return null; }
    const st = new Stato();
    for (let i = 0; i < 7; i++) { const [coperte, carte] = JSON.parse(v['c' + i]); st.colonne.push(new Colonna(coperte, carte)); }
    st.scarto = v.scarto === '-' ? null : [parseInt(v.scarto, 10), v.scarto.replace(/^\d+/, '')];
    st.mazzo = v.mazzo === '1';
    for (const s of SEMI) st.basi[s] = parseInt(v['b' + s], 10);
    return st;
  }
}
