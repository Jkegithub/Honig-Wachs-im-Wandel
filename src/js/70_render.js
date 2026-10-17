// [renderer] Darstellungszustand (nur im Browser)
const VIEW = { cv: null, ctx: null, comb: null, cctx: null, w: 0, h: 0, dpr: 1, cam: { s: 0, cx: 0, cy: 0 }, key: '', lastTick: -1, revealT0: 0 };
const CELL_COL = { empty: '#3a2614', egg: '#d9dfe2', larva: '#f6e6bc', pupa: '#9a6431', pollen: '#ff5d1f', nectar: '#ffe189', honey: '#f6c45a' };
const RES_COL = { nectar: '#ffd86b', pollen: '#ff5d1f', water: '#4fb3d9' };
const ROLE_COL = { forager: '#ffb347', nurse: '#f7ead0', worker: '#c58a3c' };

// [renderer] Canvas einrichten
function initRenderer(canvas) {
  VIEW.cv = canvas; VIEW.ctx = canvas.getContext('2d');
  VIEW.comb = document.createElement('canvas'); VIEW.cctx = VIEW.comb.getContext('2d');
  VIEW.revealT0 = performance.now();
  new ResizeObserver(resizeView).observe(canvas);
  resizeView();
}
// [renderer] Größe an Container und Pixeldichte
function resizeView() {
  const r = VIEW.cv.getBoundingClientRect();
  VIEW.dpr = Math.min(2, window.devicePixelRatio || 1); VIEW.w = Math.max(200, r.width); VIEW.h = Math.max(200, r.height);
  for (const c of [VIEW.cv, VIEW.comb]) { c.width = Math.round(VIEW.w * VIEW.dpr); c.height = Math.round(VIEW.h * VIEW.dpr); }
  VIEW.vertical = VIEW.w < 640;                         // Hochformat: Wabe oben, Wiese darunter
  VIEW.key = '';
}
// [renderer] Rechteck der Wiese (rechts neben der Wabe bzw. im Hochformat darunter)
function meadowRect(M) {
  if (VIEW.vertical) { const y0 = Math.round(VIEW.h * 0.52); return { x0: 8, y0, w: VIEW.w - 16, h: VIEW.h - y0 - 30 }; }
  const ex = toScreen(M, 0, 0, 'out')[0]; return { x0: ex - 6, y0: 10, w: VIEW.w - ex - 4, h: VIEW.h - 44 };
}
// [renderer] Wabenkamera: Gitter + Flugloch in den linken Bereich, weich nachgeführt
function updateCamera(M) {
  const ext = M.cells.length + '|' + VIEW.w + '|' + VIEW.h;
  if ((M.paused || M.collapsed) && VIEW.cam.s && VIEW.key && VIEW.camExt === ext) return;   // Pause: Bild steht still, solange sich die Wabe nicht ändert
  const snap = (M.paused || M.collapsed) || VIEW.camExt === undefined; VIEW.camExt = ext;
  const e = M.extent, v = VIEW.vertical;
  const regionW = v ? VIEW.w : VIEW.w * 0.62, top = v ? 112 : 78, bottom = v ? VIEW.h * 0.48 + 6 : 34, avail = VIEW.h - top - bottom;
  const x0 = e.minX - 12, x1 = M.entrance.x + 16, y0 = e.minY - 12, y1 = e.maxY + 12;
  // Hochformat: Wabe um 90° gedreht dargestellt (Modell-x nach unten) — das Flugloch liegt unten mittig über der Wiese
  const target = v ? Math.min((regionW - 24) / (y1 - y0), avail / (x1 - x0), 4.2) : Math.min((regionW - 24) / (x1 - x0), avail / (y1 - y0), 4.2);
  const c = VIEW.cam; if (!c.s) c.s = target;
  c.s = snap || Math.abs(target - c.s) < 0.002 ? target : c.s + (target - c.s) * 0.08;   // einrasten; in der Pause sofort passend
  if (v) { c.cx = VIEW.w / 2 + (y0 + y1) / 2 * c.s; c.cy = top + (avail - (x1 - x0) * c.s) / 2 - x0 * c.s; }
  else { c.cx = 12 + (regionW - 24 - (x1 - x0) * c.s) / 2 - x0 * c.s; c.cy = top + avail / 2 - (y0 + y1) / 2 * c.s; }
  const key = c.s.toFixed(3) + '|' + VIEW.w + '|' + VIEW.h;
  if (key !== VIEW.key) { VIEW.key = key; M.dirty = true; }
}
// [renderer] Welt -> Bildschirm; außen ab dem Flugloch, skaliert auf die Restbreite
function toScreen(M, x, y, space) {
  const c = VIEW.cam;
  if (space === 'hive') return VIEW.vertical ? [c.cx - y * c.s, c.cy + x * c.s] : [c.cx + x * c.s, c.cy + y * c.s];
  if (VIEW.vertical) {                                  // Hochformat: Flugloch oben Mitte der Wiese, Entfernung nach unten
    const y0 = Math.round(VIEW.h * 0.52), hh = VIEW.h - y0 - 30;
    const sx = (VIEW.w - 90) / 560, sy = Math.max(0.12, (hh - 70) / 760);   // eigener Maßstab je Achse: Breite voll nutzen
    return [VIEW.w / 2 + y * sx, y0 + 12 + x * sy];
  }
  const E = toScreen(M, M.entrance.x, M.entrance.y, 'hive');
  const so = Math.max(0.12, Math.min((VIEW.w - E[0] - 24) / 860, (VIEW.h / 2 - 70) / 360));
  return [E[0] + 16 + x * so, E[1] + y * so];
}
// [renderer] Sechseck-Pfad
function hexPath(g, x, y, r) {
  g.beginPath();
  const off = VIEW.vertical ? 0 : -Math.PI / 6;        // gedrehte Wabe: Sechsecke mit flacher Oberkante
  for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + off, px = x + r * Math.cos(a), py = y + r * Math.sin(a); i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath();
}
// [renderer] Farbmischung
function mixCol(a, b, t) { return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')'; }
// [renderer] Temperatur -> Farbe (kühl blau, 35 °C bernstein, heiß rot)
function tempColor(t) { return t < 35 ? mixCol([79, 179, 217], [245, 166, 35], clamp((t - 26) / 9, 0, 1)) : mixCol([245, 166, 35], [255, 40, 30], clamp((t - 35) / 5, 0, 1)); }

// [renderer] Wabe in den Offscreen-Cache (nur bei Änderung, neuem Tick oder während des Aufbaus)
function drawComb(M, reveal, selected) {
  const g = VIEW.cctx, s = VIEW.cam.s, cells = M.cells;
  g.setTransform(VIEW.dpr, 0, 0, VIEW.dpr, 0, 0); g.clearRect(0, 0, VIEW.w, VIEW.h);
  const e = M.extent, pa = toScreen(M, e.minX - 10, e.minY - 10, 'hive'), pb = toScreen(M, M.entrance.x + 4, e.maxY + 10, 'hive');
  const x0 = Math.min(pa[0], pb[0]), x1 = Math.max(pa[0], pb[0]), y0 = Math.min(pa[1], pb[1]), y1 = Math.max(pa[1], pb[1]);   // Rahmen in beiden Ausrichtungen
  g.fillStyle = 'rgba(10,6,3,.6)'; g.strokeStyle = '#5a3a1c'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, 10); g.fill(); g.stroke();
  const r = CFG.HEX * s * 0.93, small = r < 4.5, n = Math.floor(cells.length * reveal);
  for (let i = 0; i < n; i++) {
    const c = cells[i], [x, y] = toScreen(M, c.x, c.y, 'hive');
    const rr = r * (reveal < 1 ? clamp((reveal * cells.length - i) / 6, 0, 1) : 1);
    hexPath(g, x, y, rr);
    g.fillStyle = c.state === 'nectar' || c.state === 'pollen' ? '#3f2812' : c.state === 'honey' ? '#e8961c' : (c.state === 'egg' || c.state === 'larva') && !small ? '#2b1b0d' : CELL_COL[c.state];
    g.fill();
    if (!small) { g.strokeStyle = 'rgba(233,201,139,.22)'; g.lineWidth = 1; g.stroke(); }
    if (c.state === 'nectar') {
      hexPath(g, x, y, rr * (0.35 + 0.6 * Math.sqrt(c.amount / CFG.CELL_CAP)));
      g.fillStyle = mixCol([255, 246, 205], [255, 188, 48], clamp((CFG.MOIST_IN - c.moist) / (CFG.MOIST_IN - CFG.MOIST_HONEY), 0, 1)); g.fill();
    } else if (c.state === 'pollen') {
      hexPath(g, x, y, rr * (0.35 + 0.6 * Math.sqrt(c.amount / CFG.CELL_CAP))); g.fillStyle = CELL_COL.pollen; g.fill();
    } else if (c.state === 'honey' && !small) {
      hexPath(g, x, y, rr * 0.72); g.fillStyle = '#f6c45a'; g.fill();
      g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(x - rr * 0.25, y - rr * 0.25, rr * 0.18, 0, 7); g.fill();
    } else if (c.state === 'pupa' && !small) {
      hexPath(g, x, y, rr * 0.7); g.fillStyle = '#b9824a'; g.fill();
    } else if (c.state === 'egg' && !small) {
      g.fillStyle = '#f4f1e8'; g.beginPath(); g.ellipse(x, y, rr * 0.16, rr * 0.36, 0.5, 0, 7); g.fill();
    } else if (c.state === 'larva' && !small) {
      const k = 0.3 + 0.35 * clamp(c.dev / CFG.LARVA, 0, 1);
      g.strokeStyle = M.tick - c.nursedAt > 2 ? '#ff9a6c' : '#fbefcf'; g.lineWidth = Math.max(1, rr * 0.28); g.lineCap = 'round';
      g.beginPath(); g.arc(x, y, rr * k, 0.4, 5.2); g.stroke();
    }
    if (M.layers.heat) { hexPath(g, x, y, rr); g.globalAlpha = 0.55; g.fillStyle = tempColor(c.temp); g.fill(); g.globalAlpha = 1; }
  }
  const [ex, ey] = toScreen(M, M.entrance.x, M.entrance.y, 'hive');
  const v = VIEW.vertical, sw = v ? 20 : 12, sh = v ? 12 : 20;            // Hochformat: waagerechter Schlitz unten mittig
  g.fillStyle = '#0b0603'; g.fillRect(ex - sw / 2, ey - sh / 2, sw, sh); g.strokeStyle = '#e9c98b'; g.lineWidth = 1.5; g.strokeRect(ex - sw / 2, ey - sh / 2, sw, sh);
  const lx = v ? ex + 18 : ex + 1, ly = v ? ey - 6 : ey + 26;              // Beschriftung neben (Hochformat) bzw. unter dem Flugloch
  g.font = '10px SourceCode, monospace'; g.fillStyle = '#c6b38b'; g.textAlign = v ? 'left' : 'center'; g.fillText('Einflug', lx, ly);
  const tw = 28, tf = clamp(M.water / Math.max(1, M.bees.length * 10), 0, 1), bx = v ? lx : ex - tw / 2;   // Balken gegen den Wasserpuffer (10 je Biene)
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(bx, ly + 6, tw, 5); g.fillStyle = RES_COL.water; g.fillRect(bx, ly + 6, tw * tf, 5);
  g.fillStyle = '#9fd3ea'; g.fillText('Wasser ' + fmt(M.water), lx, ly + 22); g.textAlign = 'left';
  M.dirty = false;
}

// [renderer] Wiese: Himmel nach Wetter, Blütenfelder mit beschrifteten Vorratsbalken, Tränke, Regen/Sonne
function drawMeadow(g, M, now) {
  const o = toScreen(M, 0, 0, 'out'), o1 = toScreen(M, 1, 0, 'out'), so = Math.hypot(o1[0] - o[0], o1[1] - o[1]);
  const { x0, y0, w, h } = meadowRect(M);               // unten Platz für die Fußzeile der Szene
  if (w < 60 || h < 60) return;
  const W = M.weather, sky = W.rain ? ['#141c24', '#25303a'] : W.cloudy ? ['#2b2621', '#45392b'] : ['#3b2a12', '#5c4316'];
  const gr = g.createLinearGradient(0, y0, 0, y0 + h); gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]);
  g.fillStyle = gr; g.beginPath(); g.roundRect(x0, y0, w, h, 10); g.fill(); g.strokeStyle = 'rgba(233,201,139,.18)'; g.lineWidth = 1; g.stroke();
  g.save(); g.beginPath(); g.roundRect(x0, y0, w, h, 10); g.clip();
  g.strokeStyle = 'rgba(120,140,50,.10)';
  for (let y = y0 + 20; y < y0 + h; y += 14) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y + 6); g.stroke(); }
  if (W.rain) {
    g.strokeStyle = 'rgba(160,200,230,.35)'; const t = now / 1000;
    for (let i = 0; i < 70; i++) { const rx = x0 + ((i * 97 + t * 40) % w), ry = y0 + ((i * 53 + t * 420) % h); g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - 3, ry + 10); g.stroke(); }
  } else if (!W.cloudy) {
    const sg = g.createRadialGradient(x0 + w - 50, y0 + 50, 4, x0 + w - 50, y0 + 50, 74);
    sg.addColorStop(0, 'rgba(255,200,80,.55)'); sg.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = sg; g.fillRect(x0 + w - 130, y0, 130, 130);
  }
  g.restore();
  const narrow = w < 330 || VIEW.vertical, bw = narrow ? 44 : 56;
  for (const p of M.patches) {
    const [px, py] = toScreen(M, p.u, p.v, 'out'), rad = Math.max(16, 46 * so), fillN = p.nectar / Math.max(1, p.capN), fillP = p.pollen / Math.max(1, p.capP);
    const nFl = 6 + Math.round(fillN * 26);
    for (let i = 0; i < nFl; i++) {
      const a = i * 2.399, d = rad * Math.sqrt((i + 0.5) / 32), fx = px + Math.cos(a) * d, fy = py + Math.sin(a) * d * 0.7;
      g.fillStyle = 'hsl(' + p.hue + ',' + (p.hue === 0 ? 0 : 75) + '%,' + (p.hue === 0 ? 92 : 62) + '%)'; g.beginPath(); g.arc(fx, fy, 2.6, 0, 7); g.fill();
      g.fillStyle = '#ffb000'; g.beginPath(); g.arc(fx, fy, 1, 0, 7); g.fill();
    }
    const ty = py + rad * 0.8 + 14, bx = clamp(px - bw / 2, x0 + 6, x0 + w - bw - 6), labelLeft = bx + bw + (narrow ? 44 : 78) > x0 + w;
    g.font = '600 12px Fraunces, serif'; g.fillStyle = '#f2e3c6'; g.textAlign = 'center'; g.fillText(p.name, px, ty);
    g.font = '10px SourceCode, monospace'; g.textAlign = labelLeft ? 'right' : 'left';
    [['Nektar', fillN, RES_COL.nectar], ['Pollen', fillP, RES_COL.pollen]].forEach(([lab, f, col], i) => {
      const y = ty + 6 + i * 13;
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(bx, y, bw, 7); g.fillStyle = col; g.fillRect(bx, y, bw * clamp(f, 0, 1), 7);
      g.fillStyle = 'rgba(242,227,198,.85)'; g.fillText((narrow ? lab[0] : lab) + ' ' + Math.round(f * 100) + ' %', labelLeft ? bx - 5 : bx + bw + 5, y + 7);
    });
  }
  const P = M.pond, [qx, qy] = toScreen(M, P.u, P.v, 'out'), qr = Math.max(14, 44 * so);
  g.fillStyle = 'rgba(79,179,217,.55)'; g.beginPath(); g.ellipse(qx, qy, qr * 1.1, qr * 0.55, 0, 0, 7); g.fill();
  g.font = '600 12px Fraunces, serif'; g.textAlign = 'center'; g.fillStyle = '#cfe9f3'; g.fillText(P.name + ' ' + Math.round(P.water / Math.max(1, P.cap) * 100) + ' %', qx, qy + qr * 0.55 + 15);
  g.textAlign = 'left';
}

// [renderer] interpolierte Position einer Biene
function beePos(M, b, a) { return b.pspace !== b.space ? toScreen(M, b.x, b.y, b.space) : toScreen(M, b.px + (b.x - b.px) * a, b.py + (b.y - b.py) * a, b.space); }

// [renderer] Pfade (Layer)
function drawPaths(g, M, a) {
  g.lineWidth = 1;
  for (const b of M.bees) {
    if (!b.path.length) continue;
    g.strokeStyle = b.load.amount ? 'rgba(255,216,107,.24)' : 'rgba(242,227,198,.10)';
    g.beginPath(); const [x, y] = beePos(M, b, a); g.moveTo(x, y);
    for (const w of b.path) { const [wx, wy] = toScreen(M, w.x, w.y, w.space); g.lineTo(wx, wy); }
    g.stroke();
  }
}
// [renderer] Ressourcenflüsse (Layer): wandernde Punkte
function drawFlows(g, M, a) {
  const life = 18;
  for (const f of M.flows) {
    const t = (M.tick - f.born + a) / life; if (t < 0 || t > 1) continue;
    const [x0, y0] = toScreen(M, f.from.x, f.from.y, f.from.space), [x1, y1] = toScreen(M, f.to.x, f.to.y, f.to.space);
    g.strokeStyle = RES_COL[f.kind]; g.globalAlpha = 0.28 * (1 - t); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.globalAlpha = 1 - t * 0.6; g.fillStyle = RES_COL[f.kind]; g.beginPath(); g.arc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 2.4, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}
// [renderer] Bienen: Körper mit Streifen, Flügelschlag (steht in der Pause), Rollenfarbe, Last
function drawBees(g, M, a, vt, reveal) {
  const k = clamp(VIEW.cam.s * 0.3, 1.5, 3.2);
  g.globalAlpha = clamp((reveal - 0.7) / 0.3, 0, 1);
  for (const b of M.bees) {
    const [x, y] = beePos(M, b, a), sz = b.space === 'out' ? 2.4 : k;
    const p0 = b.pspace === b.space ? toScreen(M, b.px, b.py, b.space) : [x, y], p1 = toScreen(M, b.x, b.y, b.space);
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) || b.wob;      // Flugrichtung aus Bildschirmkoordinaten (stimmt auch gedreht)
    g.save(); g.translate(x, y); g.rotate(ang);
    const flap = Math.sin(vt / 40 + b.wob) * 0.5 + 0.5;
    g.fillStyle = 'rgba(240,240,255,.45)'; g.beginPath(); g.ellipse(-sz * 0.2, -sz * 0.9, sz * 0.9, sz * (0.35 + 0.25 * flap), -0.4, 0, 7); g.fill();
    g.fillStyle = '#f2b31f'; g.beginPath(); g.ellipse(0, 0, sz * 1.5, sz * 0.85, 0, 0, 7); g.fill();
    g.fillStyle = '#24160a'; g.fillRect(-sz * 0.5, -sz * 0.8, sz * 0.35, sz * 1.6); g.fillRect(sz * 0.15, -sz * 0.8, sz * 0.3, sz * 1.6);
    g.fillStyle = ROLE_COL[b.role]; g.beginPath(); g.arc(sz * 1.4, 0, sz * 0.5, 0, 7); g.fill();
    if (b.load.amount) { g.fillStyle = RES_COL[b.load.kind]; g.beginPath(); g.arc(-sz * 0.2, sz * 0.9, sz * 0.55, 0, 7); g.fill(); }
    g.restore();
  }
  g.globalAlpha = 1;
}

// [renderer] ein Frame
function renderFrame(M, alpha, visualTime, selected) {
  const g = VIEW.ctx, now = performance.now();
  updateCamera(M);
  const reveal = clamp((now - VIEW.revealT0 - 250) / 1500, 0, 1), eased = 1 - Math.pow(1 - reveal, 3);
  if (M.dirty || eased < 1 || VIEW.lastTick !== M.tick) { drawComb(M, eased, selected); VIEW.lastTick = M.tick; }
  g.setTransform(VIEW.dpr, 0, 0, VIEW.dpr, 0, 0); g.clearRect(0, 0, VIEW.w, VIEW.h);
  g.globalAlpha = clamp((reveal - 0.45) / 0.4, 0, 1); drawMeadow(g, M, visualTime); g.globalAlpha = 1;
  g.drawImage(VIEW.comb, 0, 0, VIEW.w, VIEW.h);
  if (selected !== null && M.cells[selected]) { const c = M.cells[selected], [x, y] = toScreen(M, c.x, c.y, 'hive'); hexPath(g, x, y, CFG.HEX * VIEW.cam.s * 1.08); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
  if (M.layers.paths) drawPaths(g, M, alpha);
  if (M.layers.flows) drawFlows(g, M, alpha);
  drawBees(g, M, alpha, visualTime, reveal);
}

// [renderer] Klick -> Zelle (Bildschirm -> Wabenkoordinate -> axial)
function cellAtScreen(M, px, py) {
  const c = VIEW.cam, x = VIEW.vertical ? (py - c.cy) / c.s : (px - c.cx) / c.s, y = VIEW.vertical ? -(px - c.cx) / c.s : (py - c.cy) / c.s;   // Umkehr der Drehung
  const qf = (Math.sqrt(3) / 3 * x - y / 3) / CFG.HEX, rf = (2 / 3 * y) / CFG.HEX, sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf); const s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  const id = GRID.index.get(q + ',' + r);
  return id !== undefined && id < M.cells.length ? id : null;
}
