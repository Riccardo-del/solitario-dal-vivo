// Piantina del tavolo letto, con la carta da prendere (giallo) e dove metterla (azzurro).
// Presa dalla versione da foto; usa el.piantina.
let lampeggio = true, ultimoDisegno = null;
function disegnaPiantina(st, mossa) {
  ultimoDisegno = [st, mossa];
  const cv = el.piantina, dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 600;
  const gap = W * 0.022, cw = (W - 8 * gap) / 7, ch = cw * 1.32;
  const fs = Math.max(10, cw / 3.6);
  const strCop = Math.max(5, ch * 0.10), strSco = fs * 1.35;
  const X = i => gap + i * (cw + gap);
  const yAlto = gap, yCol = yAlto + ch + gap * 2;
  let fondo = yCol + ch;
  for (const c of st.colonne) fondo = Math.max(fondo, yCol + c.coperte * strCop + Math.max(0, c.carte.length - 1) * strSco + ch);
  const H = fondo + gap;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px';
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const tok = n => css.getPropertyValue(n).trim();
  g.fillStyle = tok('--felt'); g.fillRect(0, 0, W, H);

  const rett = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  function carta(x, y, c, {coperta = false, vuota = false, segno = ''} = {}) {
    if (vuota) {
      rett(x, y, cw, ch, 5); g.strokeStyle = tok('--felt-line'); g.lineWidth = 2; g.stroke();
      if (segno) { g.fillStyle = tok('--felt-line'); g.font = `700 ${fs * 1.4}px ${tok('--display')}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(segno, x + cw / 2, y + ch / 2); }
    } else if (coperta) {
      rett(x, y, cw, ch, 5); g.fillStyle = '#9b2c33'; g.fill(); g.strokeStyle = '#f1e9d2'; g.lineWidth = 1.5; g.stroke();
    } else {
      rett(x, y, cw, ch, 5); g.fillStyle = '#fbfbf8'; g.fill(); g.strokeStyle = '#8a949e'; g.lineWidth = 1; g.stroke();
      g.fillStyle = colore(c) === 'R' ? '#c8323c' : '#151a20';
      g.font = `700 ${fs}px ${tok('--display')}`; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText((NOMI_VAL[c[0]] || String(c[0])) + ({h: '♥', d: '♦', s: '♠', c: '♣', R: '•', B: '•'}[c[1]]), x + 4, y + 3);
    }
    return [x, y, x + cw, y + ch];
  }
  const posti = {};
  posti.mazzo = carta(X(0), yAlto, null, {coperta: st.mazzo, vuota: !st.mazzo, segno: '↺'});
  posti.scarti = st.scarto ? carta(X(1), yAlto, st.scarto) : carta(X(1), yAlto, null, {vuota: true});
  [...SEMI].forEach((s, n) => {
    const r = st.basi[s];
    posti['base' + s] = r ? carta(X(3 + n), yAlto, [r, s]) : carta(X(3 + n), yAlto, null, {vuota: true, segno: SIMBOLI[s]});
  });
  st.colonne.forEach((col, i) => {
    let y = yCol;
    if (!col.carte.length && !col.coperte) { posti[`c${i}v`] = carta(X(i), y, null, {vuota: true}); return; }
    for (let k = 0; k < col.coperte; k++) { carta(X(i), y, null, {coperta: true}); y += strCop; }
    col.carte.forEach((c, j) => { posti[`c${i}_${j}`] = carta(X(i), y, c); if (j < col.carte.length - 1) y += strSco; });
  });
  if (!mossa || !lampeggio) return;
  let da, a = null;
  if (mossa[0] === 'M') da = posti.mazzo;
  else {
    const sorg = mossa[1];
    if (sorg[0] === 'S') da = posti.scarti;
    else {
      const i = sorg[1], n = st.colonne[i].carte.length;
      const j = mossa[0] === 'T' ? mossa[2] : n - 1;
      const p = posti[`c${i}_${j}`], u = posti[`c${i}_${n - 1}`];
      da = [p[0], p[1], u[2], u[3]];
    }
    if (mossa[0] === 'B') {
      const cm = sorg[0] === 'S' ? st.scarto : st.colonne[sorg[1]].ultima();
      a = posti['base' + cm[1]];
    } else {
      const k = mossa[3], d = st.colonne[k];
      a = d.carte.length ? posti[`c${k}_${d.carte.length - 1}`] : posti[`c${k}v`];
    }
  }
  const sp = Math.max(3, cw / 14);
  g.lineWidth = sp;
  g.strokeStyle = tok('--from'); rett(da[0] - 3, da[1] - 3, da[2] - da[0] + 6, da[3] - da[1] + 6, 6); g.stroke();
  if (a) {
    g.strokeStyle = tok('--to'); rett(a[0] - 3, a[1] - 3, a[2] - a[0] + 6, a[3] - a[1] + 6, 6); g.stroke();
    const x1 = (da[0] + da[2]) / 2, y1 = da[1] + (da[3] - da[1]) * 0.6, x2 = (a[0] + a[2]) / 2, y2 = (a[1] + a[3]) / 2;
    g.strokeStyle = tok('--from'); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1), t = sp * 4;
    g.fillStyle = tok('--from'); g.beginPath(); g.moveTo(x2, y2);
    g.lineTo(x2 - t * Math.cos(ang - 0.45), y2 - t * Math.sin(ang - 0.45));
    g.lineTo(x2 - t * Math.cos(ang + 0.45), y2 - t * Math.sin(ang + 0.45)); g.fill();
  }
}
setInterval(() => { lampeggio = !lampeggio; if (ultimoDisegno && ultimoDisegno[1]) disegnaPiantina(...ultimoDisegno); }, 420);
window.addEventListener('resize', () => ultimoDisegno && disegnaPiantina(...ultimoDisegno));
