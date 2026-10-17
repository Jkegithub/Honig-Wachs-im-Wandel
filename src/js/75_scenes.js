// [scenes3d] Kleine 3D-Projektion für kurze Vignetten im selben 2D-Canvas (keine Bibliothek, kein WebGL).
// Flächen werden transformiert, beleuchtet (Lambert + Umgebungslicht), nach Tiefe sortiert und als Polygone gefüllt.

// [scenes3d] Vektorhilfen
const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
// [scenes3d] Drehung eines Punktes: erst um z, dann x, dann y
function rot3(p, r) {
  let [x, y, z] = p;
  if (r[2]) { const c = Math.cos(r[2]), s = Math.sin(r[2]); [x, y] = [x * c - y * s, x * s + y * c]; }
  if (r[0]) { const c = Math.cos(r[0]), s = Math.sin(r[0]); [y, z] = [y * c - z * s, y * s + z * c]; }
  if (r[1]) { const c = Math.cos(r[1]), s = Math.sin(r[1]); [x, z] = [x * c + z * s, -x * s + z * c]; }
  return [x, y, z];
}
// [scenes3d] Netz: Ellipsoid mit Polen auf der x-Achse; Farbe je Fläche aus colorFn(θ-Anteil, φ-Anteil)
function meshEllipsoid(rx, ry, rz, seg, rings, colorFn, opt = {}) {
  const verts = [], faces = [];
  for (let i = 0; i <= rings; i++) { const th = Math.PI * i / rings; for (let j = 0; j < seg; j++) { const ph = 2 * Math.PI * j / seg; verts.push([rx * Math.cos(th), ry * Math.sin(th) * Math.cos(ph), rz * Math.sin(th) * Math.sin(ph)]); } }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + (j + 1) % seg, c = (i + 1) * seg + (j + 1) % seg, d = (i + 1) * seg + j;
    faces.push({ idx: [a, b, c, d], col: colorFn((i + 0.5) / rings, (j + 0.5) / seg) });
  }
  return { verts, faces, ...opt };
}
// [scenes3d] Netz: flache Ellipse (Flügel, Blütenblatt), beidseitig sichtbar
function meshDisc(rx, rz, seg, col, opt = {}) {
  const verts = [[0, 0, 0]], faces = [];
  for (let j = 0; j < seg; j++) { const a = 2 * Math.PI * j / seg; verts.push([rx * Math.cos(a), 0, rz * Math.sin(a)]); }
  for (let j = 0; j < seg; j++) faces.push({ idx: [0, 1 + j, 1 + (j + 1) % seg], col });
  return { verts, faces, double: true, ...opt };
}
// [scenes3d] Netz: Sechseckprisma (Wabenzelle), Höhe nach unten; Mantel und Boden
function meshHexPrism(r, h, col) {
  const verts = [], faces = [];
  for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; verts.push([r * Math.cos(a), 0, r * Math.sin(a)]); }
  for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; verts.push([r * Math.cos(a), -h, r * Math.sin(a)]); }
  for (let k = 0; k < 6; k++) faces.push({ idx: [k, (k + 1) % 6, 6 + (k + 1) % 6, 6 + k], col });
  faces.push({ idx: [11, 10, 9, 8, 7, 6], col: col.map(c => c * 0.7) });
  return { verts, faces, double: true };
}
// [scenes3d] Netz: Quader (Beute)
function meshBox(w, h, d, col) {
  const x = w / 2, y = h / 2, z = d / 2;
  const verts = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  const f = (idx, s = 1) => ({ idx, col: col.map(c => c * s) });
  return { verts, faces: [f([0, 3, 2, 1]), f([4, 5, 6, 7]), f([0, 4, 7, 3], 0.9), f([1, 2, 6, 5], 0.9), f([3, 7, 6, 2], 1.1), f([0, 1, 5, 4], 0.6)] };
}

// [scenes3d] Teile eines Objekts in Weltflächen umrechnen: Kette von Transformationen {pos, rot, s}
function emitMesh(out, mesh, chain, alpha = 1) {
  const pts = mesh.verts.map(v => { let p = v; for (const t of chain) { if (t.s) p = V3.mul(p, t.s); if (t.rot) p = rot3(p, t.rot); if (t.pos) p = V3.add(p, t.pos); } return p; });
  for (const f of mesh.faces) out.push({ pts: f.idx.map(i => pts[i]), col: f.col, double: !!mesh.double, alpha: (mesh.alpha ?? 1) * alpha, glow: mesh.glow });
}

// [scenes3d] Szene zeichnen: Kamera, Licht, Rückseiten weg, Tiefensortierung, Polygone füllen
function draw3D(g, faces, cam, rect) {
  const f = V3.norm(V3.sub(cam.target, cam.pos)), r = V3.norm(V3.cross(f, [0, 1, 0])), u = V3.cross(r, f);
  const fl = rect.h / (2 * Math.tan(cam.fov / 2)), cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const L = V3.norm([-0.45, 0.85, -0.35]), list = [];
  for (const fc of faces) {
    const p = fc.pts, n = V3.norm(V3.cross(V3.sub(p[1], p[0]), V3.sub(p[2], p[0])));
    const ctr = p.reduce((s, q) => V3.add(s, q), [0, 0, 0]).map(v => v / p.length);
    const toCam = V3.sub(cam.pos, ctr);
    let nd = V3.dot(n, toCam);
    if (nd < 0 && !fc.double) continue;
    const nn = nd < 0 ? V3.mul(n, -1) : n;
    const cs = p.map(q => { const d = V3.sub(q, cam.pos); return [V3.dot(d, r), V3.dot(d, u), V3.dot(d, f)]; });
    if (cs.some(c => c[2] < 0.1)) continue;
    const light = fc.glow ? 1 : 0.38 + 0.62 * Math.max(0, V3.dot(nn, L));
    const spec = fc.glow ? 0 : Math.pow(Math.max(0, V3.dot(V3.norm(V3.add(L, V3.norm(toCam))), nn)), 24) * 0.35;
    list.push({ z: cs.reduce((s, c) => s + c[2], 0) / cs.length, pts: cs.map(c => [cx + c[0] * fl / c[2], cy - c[1] * fl / c[2]]),
      col: fc.col.map(c => Math.min(255, Math.round(c * light + 255 * spec))), alpha: fc.alpha });
  }
  list.sort((a, b) => b.z - a.z);
  for (const it of list) {
    g.beginPath(); it.pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath();
    g.fillStyle = 'rgba(' + it.col[0] + ',' + it.col[1] + ',' + it.col[2] + ',' + it.alpha + ')'; g.fill();
    if (it.alpha > 0.9) { g.strokeStyle = g.fillStyle; g.lineWidth = 0.6; g.stroke(); }   // schließt Haarrisse zwischen Flächen
  }
  return { project: q => { const d = V3.sub(q, cam.pos), z = V3.dot(d, f); return z > 0.1 ? [cx + V3.dot(d, r) * fl / z, cy - V3.dot(d, u) * fl / z] : null; } };
}

// [scenes3d] Bienenmodell (einmal gebaut): Hinterleib mit Streifen, Brust, Kopf, Augen, Flügel, Pollenhöschen, Nektartropfen
const BEE3D = (() => {
  const stripe = th => (Math.floor(th * 7) % 2 ? [40, 26, 12] : [242, 178, 31]);
  return {
    abdomen: meshEllipsoid(0.62, 0.42, 0.42, 14, 10, th => stripe(th)),
    abdomenYoung: meshEllipsoid(0.62, 0.42, 0.42, 14, 10, th => (Math.floor(th * 7) % 2 ? [120, 104, 86] : [226, 205, 160])),
    thorax: meshEllipsoid(0.34, 0.32, 0.32, 12, 8, () => [122, 74, 26]),
    thoraxYoung: meshEllipsoid(0.34, 0.32, 0.32, 12, 8, () => [214, 196, 160]),
    head: meshEllipsoid(0.2, 0.24, 0.24, 12, 8, () => [44, 30, 18]),
    eye: meshEllipsoid(0.09, 0.13, 0.07, 8, 6, () => [12, 10, 10]),
    wing: meshDisc(0.62, 0.22, 14, [235, 240, 255], { alpha: 0.42 }),
    pollen: meshEllipsoid(0.13, 0.13, 0.13, 8, 6, () => [255, 93, 31]),
    nectar: meshEllipsoid(0.12, 0.12, 0.12, 10, 8, () => [255, 196, 60], { alpha: 0.85, glow: true }),
    water: meshEllipsoid(0.12, 0.12, 0.12, 10, 8, () => [150, 215, 245], { alpha: 0.8, glow: true }),
    tongue: meshEllipsoid(0.2, 0.035, 0.035, 6, 4, () => [70, 40, 20]),
  };
})();

// [scenes3d] Biene als Flächenliste; pose {pos, rot, s}; flap = Flügelwinkel; young = frisch geschlüpft
function emitBee(out, pose, flap, opt = {}) {
  const P = [{ pos: pose.pos, rot: pose.rot, s: pose.s }], at = (pos, rot) => [{ pos, rot }, ...P];
  emitMesh(out, opt.young ? BEE3D.abdomenYoung : BEE3D.abdomen, at([-0.62, -0.02, 0], [0, 0, 0.08]));
  emitMesh(out, opt.young ? BEE3D.thoraxYoung : BEE3D.thorax, at([0.12, 0.02, 0], [0, 0, 0]));
  emitMesh(out, BEE3D.head, at([0.52, 0.02, 0], [0, 0, 0]));
  for (const sd of [1, -1]) {
    emitMesh(out, BEE3D.eye, at([0.58, 0.08, 0.17 * sd], [0, 0.3 * sd, 0]));
    emitMesh(out, BEE3D.wing, [{ pos: [-0.5, 0, 0.62 * sd] }, { rot: [flap * sd, 0, 0] }, ...at([0.08, 0.3, 0.06 * sd], [0, 0, 0])], opt.wings ?? 1);
    if (opt.pollen) emitMesh(out, BEE3D.pollen, at([-0.12, -0.36, 0.22 * sd], [0, 0, 0]));
  }
  if (opt.nectar) emitMesh(out, BEE3D.nectar, at([0.78, -0.12, 0], [0, 0, 0]));
  if (opt.water) emitMesh(out, BEE3D.water, at([0.78, -0.14, 0], [0, 0, 0]));
  if (opt.tongue) emitMesh(out, BEE3D.tongue, at([0.86, -0.16, 0], [0, 0, -0.5]));   // Rüssel beim Saugen
}
// [scenes3d] Blüte: Blütenblätter im Kranz, Mitte, Stiel; Farbton aus dem Blütenfeld
function emitFlower(out, pos, hue, s, sway) {
  const rgb = hslRgb(hue, hue === 0 ? 0 : 0.75, hue === 0 ? 0.93 : 0.62), base = [{ pos, rot: [0, 0, sway * 0.1], s }];
  const petal = meshDisc(0.55, 0.24, 12, rgb);
  for (let k = 0; k < 8; k++) { const a = Math.PI * 2 * k / 8; emitMesh(out, petal, [{ pos: [0.42, 0, 0] }, { rot: [0, a, 0.25] }, ...base]); }
  emitMesh(out, meshEllipsoid(0.3, 0.16, 0.3, 10, 6, () => [255, 176, 0]), [{ pos: [0, 0.06, 0] }, ...base]);
  emitMesh(out, meshEllipsoid(1.4, 0.05, 0.05, 6, 6, () => [74, 128, 48]), [{ pos: [0, -1.45, 0], rot: [0, 0, Math.PI / 2] }, ...base]);
}
// [scenes3d] HSL -> RGB (0..255)
function hslRgb(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// [scenes3d] Bildschirmrechteck der Wabe (Rahmen, in beiden Ausrichtungen)
function combRect(M) {
  const e = M.extent, a = toScreen(M, e.minX - 10, e.minY - 10, 'hive'), b = toScreen(M, M.entrance.x + 4, e.maxY + 10, 'hive');
  const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]); return { x0, y0, w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}
// [scenes3d] Bild-im-Bild-Fläche (2/3 der früheren Größe), am Ort des Geschehens verankert:
// Schlupf über der Wabe neben seiner Zelle, Heimflug am Blütenfeld, Regen am Flugloch im Freifeld
function sceneRect(M, sc) {
  const mr = meadowRect(M), w = Math.round(VIEW.vertical ? Math.min(200, VIEW.w - 24) : Math.max(150, Math.min(227, mr.w * 0.45))), h = Math.round(w * 0.62);
  let region = mr, anchor = toScreen(M, 0, 0, 'out');                  // Standard: Flugloch im Freifeld
  if (sc && sc.type === 'hatch' && Number.isInteger(sc.data.cellId) && M.cells[sc.data.cellId]) {
    const c = M.cells[sc.data.cellId]; anchor = toScreen(M, c.x, c.y, 'hive'); region = combRect(M);
    if (region.w < w + 12 || region.h < h + 12) region = { x0: 0, y0: 0, w: VIEW.w, h: VIEW.h };
  } else if (sc && sc.type === 'flight') { const p = M.patches.find(q => q.name === sc.data.patch); if (p) anchor = toScreen(M, p.u, p.v, 'out'); }
  else if (sc && sc.type === 'drink') anchor = toScreen(M, M.pond.u, M.pond.v, 'out');
  else if (sc && sc.type === 'rain') anchor = [anchor[0] + (VIEW.vertical ? 0 : 60), anchor[1] + (VIEW.vertical ? 30 : 0)];
  const x = clamp(anchor[0] - w / 2, region.x0 + 6, region.x0 + region.w - w - 6);
  let y = anchor[1] - h - 18;                                            // über dem Anker, damit er sichtbar bleibt
  if (y < region.y0 + 6) y = anchor[1] + 18;
  y = clamp(y, region.y0 + 6, region.y0 + region.h - h - 6);
  return { x: Math.round(x), y: Math.round(y), w, h };
}
// [scenes3d] Text in die Breite einpassen (Schrift schrumpft bis 7 px)
function fitText(g, text, maxW, size, family) {
  let s = size; g.font = family.replace('{s}', s);
  while (s > 7 && g.measureText(text).width > maxW) { s -= 0.5; g.font = family.replace('{s}', s); }
}

// [scenes3d] Szene 1: Sammlerin fliegt mit Nektar (oder Pollen) von der Blüte heim
function sceneFlight(g, rect, t, d, dur) {
  const sky = g.createLinearGradient(0, rect.y, 0, rect.y + rect.h); sky.addColorStop(0, '#5a3f14'); sky.addColorStop(0.62, '#8a6a22'); sky.addColorStop(1, '#3d4a1c');
  g.fillStyle = sky; g.fillRect(rect.x, rect.y, rect.w, rect.h);
  const faces = [], k = t / dur;
  emitFlower(faces, [-2.3, -0.6, 0.6], d.hue, 0.9, Math.sin(t * 2));
  emitFlower(faces, [-3.4, -0.9, -1.2], d.hue, 0.7, Math.sin(t * 2 + 1));
  const p = [-1.9 + k * 5.6, -0.1 + 0.9 * Math.sin(k * Math.PI) + 0.08 * Math.sin(t * 9), 0.3 - k * 0.4];
  const heading = Math.atan2(0.9 * Math.PI * Math.cos(k * Math.PI) / 5.6, 1) * 0.6;
  emitBee(faces, { pos: p, rot: [0.12 * Math.sin(t * 5), -0.25, heading], s: 0.95 }, 0.35 + 0.75 * Math.sin(t * 42), { nectar: d.kind === 'nectar', pollen: d.kind === 'pollen' });
  draw3D(g, faces, { pos: [0.4 + k * 0.8, 1.1, 6.2], target: [0.2 + k * 1.2, 0, 0], fov: 0.85 }, rect);
  return ['Heimflug mit ' + (d.kind === 'pollen' ? 'Pollen' : 'Nektar'), (d.example ? 'Beispiel · ' : 'Sammlerin #' + d.beeId + ' · ') + fmt(d.amount) + ' Einh. von ' + d.patch];
}
// [scenes3d] Szene 2: Zelldeckel öffnet sich, junge Biene arbeitet sich heraus
function sceneHatch(g, rect, t, d, dur) {
  const bg = g.createRadialGradient(rect.x + rect.w / 2, rect.y + rect.h * 0.4, 10, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w * 0.7);
  bg.addColorStop(0, '#4a3115'); bg.addColorStop(1, '#170d05'); g.fillStyle = bg; g.fillRect(rect.x, rect.y, rect.w, rect.h);
  const faces = [], k = clamp(t / dur, 0, 1), wax = [214, 170, 92];
  for (const [dx, dz] of [[0, 0], [1.56, 0.9], [-1.56, 0.9], [0, 1.8], [1.56, -0.9], [-1.56, -0.9], [0, -1.8]]) {
    const prism = meshHexPrism(0.86, 1.5, dx || dz ? wax.map(c => c * 0.8) : wax);
    emitMesh(faces, prism, [{ pos: [dx, 0, dz] }]);
    if (dx || dz) emitMesh(faces, meshDisc(0.8, 0.8, 6, [150, 96, 48]), [{ pos: [dx, -0.08, dz] }]);   // Nachbarzellen: gedeckelte Puppen, an den Wänden ausgerichtet
  }
  const open = clamp((k - 0.12) / 0.3, 0, 1);                        // Deckel klappt um die Kante auf
  const cap = meshDisc(0.8, 0.8, 6, [196, 140, 76]);
  emitMesh(faces, cap, [{ pos: [-0.8, 0, 0] }, { rot: [0, 0, open * 1.9] }, { pos: [0.8, 0.01, 0] }]);
  const rise = clamp((k - 0.3) / 0.6, 0, 1), y = -1.3 + rise * 1.75;
  emitBee(faces, { pos: [0, y, 0], rot: [0, 0.4 + rise * 0.6, Math.PI / 2 - rise * 1.1], s: 0.95 }, rise > 0.8 ? 0.5 + 0.5 * Math.sin(t * 30) : 0.15, { young: true, wings: 0.3 + rise * 0.7 });
  draw3D(g, faces, { pos: [0.5, 4.4, 4.2], target: [0, -0.1, 0], fov: 0.8 }, rect);
  return d.preview ? ['Schlupf · Vorschau', 'Zelle #' + d.cellId + ' · ' + d.stage + ' · schlüpft in ~' + fmt(d.days, 1) + ' Tagen']
    : ['Schlupf', 'Zelle #' + d.cellId + ' · junge Biene #' + d.beeId + ' nach 21 Tagen'];
}
// [scenes3d] Szene 3: Regen setzt ein, Sammlerinnen kehren zum Flugloch zurück
function sceneRain(g, rect, t, d, dur) {
  const sky = g.createLinearGradient(0, rect.y, 0, rect.y + rect.h); sky.addColorStop(0, '#141c24'); sky.addColorStop(1, '#2c3a2a');
  g.fillStyle = sky; g.fillRect(rect.x, rect.y, rect.w, rect.h);
  const faces = [], k = clamp(t / dur, 0, 1);
  emitMesh(faces, meshBox(3.2, 2.2, 2.2, [138, 92, 46]), [{ pos: [0, 0, 0] }]);
  emitMesh(faces, meshBox(3.6, 0.25, 2.6, [96, 62, 30]), [{ pos: [0, 1.22, 0] }]);
  emitMesh(faces, meshBox(1.1, 0.24, 0.14, [10, 6, 3]), [{ pos: [0, -0.74, 1.16] }]);   // Flugloch, ragt leicht vor die Front
  emitMesh(faces, meshBox(1.5, 0.08, 0.5, [176, 124, 66]), [{ pos: [0, -0.95, 1.36] }]);   // Anflugbrett
  const n = Math.min(7, Math.max(3, d.returning)), ent = [0, -0.8, 1.15];
  for (let i = 0; i < n; i++) {
    const start = [Math.cos(i * 2.1) * 4.2, 0.6 + (i % 3) * 0.7, 3.2 + Math.sin(i * 1.7) * 1.4], local = clamp(k * 1.25 - i * 0.07, 0, 1);
    if (local >= 1) continue;                                          // im Stock angekommen
    const ctrl = [start[0] * 0.4, start[1] + 0.8, start[2] + 0.6], a = V3.lerp(start, ctrl, local), b = V3.lerp(ctrl, ent, local), p = V3.lerp(a, b, local);
    const dir = V3.sub(ent, p);
    emitBee(faces, { pos: p, rot: [0, -Math.atan2(dir[2], dir[0]), 0.15], s: 0.42 }, 0.4 + 0.6 * Math.sin(t * 40 + i), {});
  }
  const pr = draw3D(g, faces, { pos: [1.8, 1.6, 7.6], target: [0, -0.3, 0.8], fov: 0.8 }, rect);
  g.strokeStyle = 'rgba(170,205,235,.5)'; g.lineWidth = 1;
  for (let i = 0; i < 90; i++) {                                     // Regen als 3D-Striche
    const x = ((i * 0.77) % 8) - 4, z = ((i * 1.31) % 6) - 1, y = 3.2 - ((t * 5.5 + i * 0.37) % 5.6);
    const a = pr.project([x, y, z]), b = pr.project([x - 0.05, y - 0.35, z]);
    if (a && b) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  }
  return ['Regen — Rückzug in den Stock', d.returning + ' Sammlerinnen kehren heim · Ausflüge ruhen'];
}

// [scenes3d] Szene 4: An der Tränke saugen zwei Bienen am Uferstein, eine dritte erhebt sich mit dem Wassertropfen
function sceneDrink(g, rect, t, d, dur) {
  const sky = g.createLinearGradient(0, rect.y, 0, rect.y + rect.h); sky.addColorStop(0, '#6a5420'); sky.addColorStop(0.5, '#4d5a22'); sky.addColorStop(1, '#2c3a18');
  g.fillStyle = sky; g.fillRect(rect.x, rect.y, rect.w, rect.h);
  const faces = [], k = clamp(t / dur, 0, 1), R = 1.9, rim = a => [Math.cos(a) * R, 0.18, Math.sin(a) * R];
  const cam = { pos: [0.3, 3.1, 5.4], target: [0, 0.3, 0.2], fov: 0.8 }, flat = [];
  emitMesh(flat, meshDisc(4.6, 4.6, 24, [86, 120, 48], { glow: true }), [{ pos: [0, -0.06, 0] }]); draw3D(g, flat, cam, rect);   // Wiese, eigene Ebene
  flat.length = 0; emitMesh(flat, meshDisc(R, R, 28, [70, 150, 196], { glow: true }), [{ pos: [0, 0, 0] }]); draw3D(g, flat, cam, rect);   // Wasser darüber
  const stone = meshEllipsoid(0.42, 0.2, 0.3, 8, 5, () => [128, 120, 104]);
  for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2 + 0.2; emitMesh(faces, stone, [{ pos: [Math.cos(a) * (R + 0.12), 0, Math.sin(a) * (R + 0.12)], rot: [0, -a, 0] }]); }
  const drinkers = [0.45, -0.75];
  drinkers.forEach((a, i) => {                                         // Kopf zur Wasserfläche, Hinterleib pumpt leicht
    const pump = 0.03 * Math.sin(t * 7 + i * 2);
    emitBee(faces, { pos: V3.add(rim(a), [0, 0.12 + pump, 0]), rot: [0, Math.PI - a, -0.38], s: 0.55 }, 0.12, { tongue: true });
  });
  const a3 = 2.75, rise = clamp((k - 0.18) / 0.72, 0, 1), e = rise * rise * (3 - 2 * rise);   // Abflug: erst Flügelschwirren, dann schräg nach hinten links steigen
  const out = V3.norm([-1, 0, -0.8]), p3 = V3.add(V3.add(rim(a3), [0, 0.12 + e * 1.6, 0]), V3.mul(out, e * 1.4));
  emitBee(faces, { pos: p3, rot: [0.1 * Math.sin(t * 6), Math.atan2(-out[2], out[0]), 0.05 + 0.3 * e], s: 0.55 }, k > 0.08 ? 0.35 + 0.75 * Math.sin(t * 46) : 0.15, { water: true });
  const pr = draw3D(g, faces, cam, rect);
  g.lineWidth = 1;
  drinkers.forEach((a, i) => {                                         // Wellenringe am Rüssel
    const c = [Math.cos(a) * (R - 0.55), 0.01, Math.sin(a) * (R - 0.55)];
    for (let r = 0; r < 2; r++) {
      const ph = ((t * 0.7 + r * 0.5 + i * 0.3) % 1), rad = 0.1 + ph * 0.6; g.strokeStyle = 'rgba(210,240,255,' + (0.55 * (1 - ph)).toFixed(2) + ')'; g.beginPath();
      for (let s = 0; s <= 20; s++) { const q = pr.project([c[0] + Math.cos(s / 20 * 6.283) * rad, 0.01, c[2] + Math.sin(s / 20 * 6.283) * rad]); if (q) s ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }
      g.stroke();
    }
  });
  return ['An der Tränke', (d.example ? 'Beispiel · ' : d.drinking + ' saugen gerade · ') + 'Füllstand ' + d.level + ' %'];
}

// [scenes3d] Bild-im-Bild zeichnen: Rahmen, Szene, Titel, Zeitleiste; Ein-/Ausblenden
function drawScene3D(g, M, sc) {
  if (!sc) return;
  const rect = sceneRect(M, sc), fade = clamp(Math.min(sc.t / 0.35, (sc.dur - sc.t) / 0.35), 0, 1);
  g.save(); g.globalAlpha = fade;
  g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.roundRect(rect.x + 3, rect.y + 4, rect.w, rect.h, 8); g.fill();
  g.beginPath(); g.roundRect(rect.x, rect.y, rect.w, rect.h, 8); g.save(); g.clip();
  const fn = { flight: sceneFlight, hatch: sceneHatch, rain: sceneRain, drink: sceneDrink }[sc.type];
  const [title, info] = fn(g, rect, sc.t, sc.data, sc.dur);
  const band = 38, grad = g.createLinearGradient(0, rect.y + rect.h - band, 0, rect.y + rect.h); grad.addColorStop(0, 'rgba(10,6,3,0)'); grad.addColorStop(1, 'rgba(10,6,3,.88)');
  g.fillStyle = grad; g.fillRect(rect.x, rect.y + rect.h - band, rect.w, band);
  g.fillStyle = '#f5a623'; fitText(g, title, rect.w - 16, 12, '600 {s}px Fraunces, serif'); g.fillText(title, rect.x + 8, rect.y + rect.h - 18);
  g.fillStyle = '#f2e3c6'; fitText(g, info, rect.w - 16, 9, '{s}px SourceCode, monospace'); g.fillText(info, rect.x + 8, rect.y + rect.h - 7);
  g.fillStyle = 'rgba(242,227,198,.65)'; g.font = '10px SourceCode, monospace'; g.textAlign = 'right'; g.fillText('3D ✕', rect.x + rect.w - 7, rect.y + 13); g.textAlign = 'left';
  g.fillStyle = '#f5a623'; g.fillRect(rect.x, rect.y + rect.h - 2, rect.w * clamp(sc.t / sc.dur, 0, 1), 2);
  g.restore();
  g.strokeStyle = 'rgba(245,166,35,.75)'; g.lineWidth = 1.2; g.beginPath(); g.roundRect(rect.x, rect.y, rect.w, rect.h, 8); g.stroke();
  g.restore();
}

// [scenes3d] Wabenkoordinate -> Zellindex (für das Schlupf-Ereignis)
function modelCellAt(M, x, y) {
  const qf = (Math.sqrt(3) / 3 * x - y / 3) / CFG.HEX, rf = (2 / 3 * y) / CFG.HEX, sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf); const s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  const id = GRID.index.get(q + ',' + r); return id !== undefined && id < M.cells.length ? id : null;
}
