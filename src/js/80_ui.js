// [ui] Zustand der Oberfläche
const UI = { M: null, selected: null, lastUi: 0, acc: 0, last: 0, vt: 0, frames: 0, win: null, userTempo: false, bound: new Set(), reportIdx: null, seenReports: 0, busy: false, saved: null };
// [ui] DOM-Kurzgriff
const $ = id => document.getElementById(id);
// [ui] Aktionen der Buttons und Layer (auch für die Wirkungsprüfung S6 auf Wegwerfmodellen)
const ACTIONS = {
  pause: m => { m.paused = !m.paused; }, slow: m => { m.speed = 0.25; }, normal: m => { m.speed = 1; }, speed: m => { m.speed = 2; },
  stress: m => { m.startStress(); }, paths: m => { m.layers.paths = !m.layers.paths; }, heat: m => { m.layers.heat = !m.layers.heat; m.dirty = true; }, flows: m => { m.layers.flows = !m.layers.flows; },
};

// [ui] neues Modell anlegen und anzeigen
function mountModel(seed, params) {
  const keepSpeed = UI.M ? UI.M.speed : 1, keepLayers = UI.M ? { ...UI.M.layers } : null;
  UI.M = new Colony(seed, params); UI.M.uiBound = true;
  UI.M.speed = keepSpeed; if (keepLayers) UI.M.layers = keepLayers;
  UI.selected = null; UI.acc = 0; UI.win = null; UI.seenReports = 0; UI.reportIdx = null; UI.vt = 0;
  UI.M.uiAudit = uiProbe();
  $('seed').value = UI.M.seed; $('seed').setCustomValidity('');
  updateUI(true);
}

// [ui] Wirkungsprüfung S6: jedes Bedienelement gebunden und mit messbarer Wirkung (auf Wegwerfmodellen)
function uiProbe() {
  const fail = [];
  for (const k of Object.keys(DEFAULTS)) {
    const m = new Colony(8), old = m.params[k]; m.setParam(k, old + (old >= (k === 'colony' ? 400 : 100) ? -1 : 1));
    if (m.params[k] === old || !UI.bound.has(k)) fail.push(k);
  }
  for (const k of Object.keys(ACTIONS)) {
    const m = new Colony(8); if (k === 'normal') m.speed = 0.25;
    const before = JSON.stringify([m.paused, m.speed, !!m.stress, m.layers]); ACTIONS[k](m);
    if (before === JSON.stringify([m.paused, m.speed, !!m.stress, m.layers]) || !UI.bound.has(k)) fail.push(k);
  }
  for (const k of ['reset', 'replay', 'reports', 'closeReport', 'acceptance']) if (!UI.bound.has(k)) fail.push(k);
  return { pass: !fail.length, detail: fail.length ? 'ohne Wirkung/Bindung: ' + fail.join(', ') : '4 Regler + ' + Object.keys(ACTIONS).length + ' Aktionen wirken messbar; Seed, Reset, Berichte, Abnahme gebunden' };
}

// [ui] Element binden und für S6 registrieren
function bind(id, ev, fn) { $(id).addEventListener(ev, fn); UI.bound.add(id); }

// [ui] Steuerelemente auf den Modellzustand ziehen
function syncControls() {
  const M = UI.M;
  for (const k of Object.keys(DEFAULTS)) { $(k).value = M.params[k]; $(k + 'Out').textContent = M.params[k] + (k === 'colony' ? '' : ' %'); $(k).disabled = !!M.stress && k !== 'colony'; }
  for (const k of ['paths', 'heat', 'flows']) $(k).checked = M.layers[k];
  $('pause').textContent = M.paused ? '▶ Weiter' : 'Ⅱ Pause'; $('pause').setAttribute('aria-pressed', String(M.paused)); $('pause').disabled = M.collapsed || UI.busy;
  for (const [id, v] of [['slow', 0.25], ['normal', 1], ['speed', 2]]) { $(id).setAttribute('aria-pressed', String(M.speed === v)); $(id).disabled = UI.busy; }
  $('stress').disabled = !!M.stress || M.collapsed || UI.busy; $('reports').disabled = !M.reports.length;
  $('stressInfo').textContent = M.stress ? 'Stress-Test läuft · noch ' + fmt((M.stress.end - M.tick) / 10, 1) + ' Tage. Regler werden danach zurückgestellt.' : 'Stress-Test: 30 Tage mit 10 % Ressourcen, 10 % Wetterstabilität und 80 % Krankheitsdruck.';
}

// [ui] Panels aktualisieren (5×/s); S3 liest die angezeigten Brutzahlen zurück
function updateUI(force) {
  const M = UI.M, s = M.stats();
  $('day').textContent = 'Tag ' + fmt(M.tick / 10, 1);
  $('weather').textContent = M.weather.rain ? 'Regen · Flüge ruhen' : M.weather.cloudy ? 'Bewölkt · lange Suche' : 'Sonne · Sammelflug';
  $('temperature').textContent = fmt(M.temperature, 1) + ' °C im Brutnest · außen ' + fmt(M.ambient, 1) + ' °C';
  $('capacity').textContent = fmt(M.cells.length) + ' / 1.200 Zellen' + (M.cells.length >= CFG.MAX_CELLS ? ' · Baugrenze erreicht' : '');
  $('pop').textContent = fmt(s.pop); $('targetView').textContent = M.params.colony; $('brood').textContent = fmt(s.broodTotal);
  $('honey').textContent = fmt(s.honey); $('efficiency').textContent = s.efficiency + ' %';
  const cell = (v, l, attr = '') => '<span><b' + attr + '>' + v + '</b>' + l + '</span>';
  $('roles').innerHTML = cell(fmt(s.roles.forager), 'Sammlerinnen') + cell(fmt(s.roles.nurse), 'Brutpflege') + cell(fmt(s.roles.worker), 'Arbeiterinnen');
  $('broodStats').innerHTML = cell(s.brood.egg, 'Eier', ' data-brood="egg"') + cell(s.brood.larva, 'Larven', ' data-brood="larva"') + cell(s.brood.pupa, 'Puppen', ' data-brood="pupa"');
  M.uiSnapshot = {}; for (const el of $('broodStats').querySelectorAll('[data-brood]')) M.uiSnapshot[el.dataset.brood] = Number(el.textContent);
  $('resources').innerHTML = cell(fmt(s.nectar), 'Nektar reifend') + cell(fmt(s.pollen), 'Pollen') + cell(fmt(s.water), 'Wasser');
  $('mortality').innerHTML = cell(fmt(M.dead), 'Gestorben') + cell(fmt(M.born), 'Geschlüpft') + cell(fmt(M.deaths.Hunger || 0), 'davon Hunger');
  $('liveState').textContent = M.collapsed ? '· kollabiert' : M.paused ? '· pausiert' : M.stress ? '· Stress-Test' : '· aktiv';
  syncControls(); renderInspector();
  if (M.logDirty || force) { M.logDirty = false; $('log').innerHTML = M.events.slice(-40).reverse().map(e => '<p><span class="t">T' + fmt(e.tick / 10, 1) + ' · </span>' + e.text + '</p>').join(''); }
  if (M.tick % 20 === 0 || force || M.collapsed) { M.selfCheck(); renderChecks(); }
  if (M.reports.length > UI.seenReports) { UI.seenReports = M.reports.length; showReport(M.reports.length - 1); }
  $('runtime').textContent = fmt(M.tick) + ' Ticks · ' + fmt(UI.frames) + ' Frames · ' + String(M.speed).replace('.', ',') + '× · Seed ' + M.seed;
}

// [ui] Prüftabelle, Badge, Alarm
function renderChecks() {
  const rows = UI.M.checks;
  $('checks').innerHTML = rows.map(c => '<tr title="' + c.detail.replace(/"/g, '&quot;') + '"><td>S' + c.id + ' ' + c.name + '</td><td class="' + (c.pass === null ? 'pending">offen' : c.pass ? 'pass">PASS' : 'fail">FAIL') + '</td></tr>').join('');
  const fails = rows.filter(c => c.pass === false), open = rows.filter(c => c.pass === null).length, pass = rows.filter(c => c.pass).length;
  $('alert').textContent = fails.map(c => 'Invariante verletzt: S' + c.id + ' ' + c.name + ' — ' + c.detail).join('\n');
  const b = $('checkBadge'); b.className = 'badge ' + (fails.length ? 'fail' : 'ok');
  b.textContent = fails.length ? 'FAIL: ' + fails.map(c => 'S' + c.id).join(', ') : pass + '/' + rows.length + ' PASS' + (open ? ' · ' + open + ' offen' : '');
}

// [ui] Zell-Inspektor (live)
function renderInspector() {
  const M = UI.M, c = UI.selected !== null ? M.cells[UI.selected] : null, box = $('inspector');
  if (!c) { box.innerHTML = '<span class="hint">Zelle im Wabenbild anklicken. Auch in der Pause bleiben alle Inhalte prüfbar.</span>'; return; }
  const brood = BROOD.has(c.state), dur = { egg: CFG.EGG, larva: CFG.LARVA, pupa: CFG.PUPA }[c.state];
  const b = c.bee !== null ? M.beeById.get(c.bee) : null;
  const who = c.state === 'empty' ? '—' : c.bee === null ? (c.state === 'egg' ? '— (Königin)' : '— (Startbestand)') : b ? '#' + b.id + ' · ' + ROLES[b.role] + ' · ' + fmt(b.age / 10, 1) + ' Tage' : '#' + c.bee + ' (lebt nicht mehr)';
  const row = (k, v) => '<tr><th>' + k + '</th><td>' + v + '</td></tr>';
  box.innerHTML = '<table>' + row('Zelle', '#' + c.id + ' · Ring ' + c.ring + ' · ' + ({ brood: 'Brutnest', pollen: 'Pollenkranz', store: 'Lager' })[M.zone(c.id)])
    + row('Zustand', LABELS[c.state]) + row('Füllgrad', brood ? 'Entwicklung ' + Math.min(100, Math.round(c.dev / dur * 100)) + ' %' : c.state === 'empty' ? '—' : c.amount + ' / ' + CFG.CELL_CAP + ' (' + Math.round(c.amount / CFG.CELL_CAP * 100) + ' %)')
    + row('Wassergehalt', c.state === 'nectar' || c.state === 'honey' ? fmt(c.moist, 0) + ' %' : '—')
    + row('Alter des Inhalts', c.state === 'empty' ? '—' : fmt((M.tick - c.since) / 10, 1) + ' Tage') + row('Zuständige Biene', who)
    + row('Temperatur', fmt(c.temp, 1) + ' °C')
    + (c.state === 'nectar' ? row('Fächeln', c.fan + ' / ' + CFG.FAN_MIN + ' Ticks · seit Einlagerung ' + (M.tick - c.nectarAt) + ' Ticks') : '')
    + (c.state === 'larva' ? row('Letzter Ammenbesuch', 'vor ' + (M.tick - c.nursedAt) + ' Ticks (Grenze ' + CFG.NURSE_GAP + ')') : '') + '</table>';
}

// [ui] Vorgeschichte als Inline-SVG: Bienen, Nahrung, Brut (je eigenes Maximum), Regen als Bänder
function trendSvg(H) {
  if (H.length < 2) return '';
  const W = 720, Ht = 170, pl = 6, pr = 6, pt = 8, pb = 22, x = i => pl + i * (W - pl - pr) / (H.length - 1), bw = (W - pl - pr) / (H.length - 1);
  let s = '<svg viewBox="0 0 ' + W + ' ' + Ht + '" width="100%" style="display:block;background:rgba(0,0,0,.25);border:1px solid rgba(233,201,139,.17);border-radius:4px">';
  H.forEach((h, i) => { if (h.rain) s += '<rect x="' + (x(i) - bw / 2).toFixed(1) + '" y="' + pt + '" width="' + (bw + 0.5).toFixed(1) + '" height="' + (Ht - pt - pb) + '" fill="rgba(79,179,217,.28)"/>'; });
  const leg = [];
  for (const [k, label, col] of [['pop', 'Bienen', '#f7ead0'], ['food', 'Nahrung', '#f5a623'], ['brood', 'Brut', '#4fb3d9']]) {
    const max = Math.max(1, ...H.map(h => h[k]));
    s += '<polyline fill="none" stroke="' + col + '" stroke-width="2" points="' + H.map((h, i) => x(i).toFixed(1) + ',' + (pt + (1 - h[k] / max) * (Ht - pt - pb)).toFixed(1)).join(' ') + '"/>';
    leg.push('<tspan fill="' + col + '">● ' + label + ' (max ' + fmt(max) + ')</tspan>');
  }
  s += '<text x="' + pl + '" y="' + (Ht - 6) + '" font-size="11" fill="#b19773">Tag ' + fmt(H[0].tick / 10, 1) + '</text><text x="' + (W - pr) + '" y="' + (Ht - 6) + '" font-size="11" fill="#b19773" text-anchor="end">Tag ' + fmt(H.at(-1).tick / 10, 1) + '</text>';
  s += '<text x="' + W / 2 + '" y="' + (Ht - 6) + '" font-size="11" text-anchor="middle">' + leg.join('  ') + ' <tspan fill="#4fb3d9">▮ Regen</tspan></text></svg>';
  return s;
}

// [ui] Kennzahlen der Vorgeschichte
function trendFacts(r) {
  const H = r.history; if (!H.length) return '';
  let rain = 0, run = 0, best = 0; for (const h of H) { if (h.rain) { rain++; run++; best = Math.max(best, run); } else run = 0; }
  const max = k => H.reduce((m, h) => h[k] > m[k] ? h : m, H[0]);
  const pk = max('pop'), fk = max('food'), inflow = H.at(-1).inflow - H[0].inflow, outflow = H.at(-1).outflow - H[0].outflow, days = Math.max(0.1, (H.at(-1).tick - H[0].tick) / 10);
  let z = H.length; while (z > 0 && H[z - 1].food === 0) z--;
  return '<ul><li>Bienen: Höchststand ' + pk.pop + ' an Tag ' + fmt(pk.tick / 10, 1) + ' → ' + H.at(-1).pop + '.</li>'
    + '<li>Nahrung: Höchststand ' + fmt(fk.food) + ' an Tag ' + fmt(fk.tick / 10, 1) + (z < H.length ? '; leer seit Tag ' + fmt(H[z].tick / 10, 1) : '; zuletzt ' + fmt(H.at(-1).food)) + '. Honig leer seit: ' + (r.emptySince == null ? '—' : 'Tag ' + fmt(r.emptySince / 10, 1)) + '.</li>'
    + '<li>Nektarbilanz: +' + fmt(inflow / days) + ' gesammelt / −' + fmt(outflow / days) + ' verbraucht oder verloren je Tag.</li>'
    + '<li>Regen an ' + fmt(rain / 10, 1) + ' von ' + fmt(days, 1) + ' Tagen; längste Serie ' + fmt(best / 10, 1) + ' Tage.</li>'
    + '<li>Einstellungen: Ziel ' + r.params.colony + ' · Ressourcen ' + r.params.resource + ' % · Wetter ' + r.params.stability + ' % · Krankheit ' + r.params.disease + ' %.</li></ul>';
}

// [ui] Bericht (Kollaps oder Stress) im Dialog; schließt nur über den Button
function showReport(i) {
  const M = UI.M, r = M.reports[i]; if (!r) return; UI.reportIdx = i;
  const top = (o, n = 4) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => k + ' ' + v).join(', ') || '—';
  let h;
  if (r.kind === 'collapse') {
    $('reportTitle').textContent = 'Der Stock ist kollabiert.';
    h = '<p class="warn">' + r.reason + ' — Tag ' + fmt(r.tick / 10, 1) + '. Simulation angehalten.</p><h3>Vorgeschichte (letzte ' + fmt((r.history.at(-1).tick - r.history[0].tick) / 10, 0) + ' Tage)</h3>'
      + trendSvg(r.history) + trendFacts(r)
      + '<p class="hint">Todesursachen gesamt: ' + top(r.deaths) + ' · Brutverluste: ' + top(r.broodDeaths) + '</p>'
      + '<p class="hint">Regleränderungen im Zeitraum: ' + (r.changes.length ? r.changes.map(c => 'T' + fmt(c.tick / 10, 1) + ' ' + c.key + '=' + c.value).join('; ') : 'keine') + '</p>'
      + '<h3>Ursachenkette · letzte 50 Ticks</h3><ol>' + (r.events.length ? r.events.map(e => '<li><span class="hint">T' + fmt(e.tick / 10, 1) + '</span> ' + e.text + '</li>').join('') : '<li>Keine Ereignisse im Fenster.</li>') + '</ol>';
  } else {
    $('reportTitle').textContent = 'Stress-Test · ' + (r.survived ? 'überlebt' : 'kollabiert');
    h = '<table><tr><th>Dauer</th><td>' + fmt(r.elapsed, 1) + ' Tage</td></tr><tr><th>Honigverlust</th><td>' + fmt(r.honeyLoss) + ' Einheiten</td></tr><tr><th>Nahrungsverlust</th><td>' + fmt(r.foodLoss) + ' Einheiten</td></tr>'
      + '<tr><th>Sterblichkeit</th><td>' + fmt(r.mortality, 1) + ' % (' + r.dead + ' Tote / ' + r.pop0 + ' + ' + r.born + ' geschlüpft)</td></tr><tr><th>Population</th><td>' + r.pop0 + ' → ' + r.pop1 + '</td></tr></table>'
      + '<h3>Verlauf</h3>' + trendSvg(r.history) + trendFacts(r)
      + '<p class="hint">Zurückgestellt auf Ressourcen ' + r.restore.resource + ' %, Wetter ' + r.restore.stability + ' %, Krankheit ' + r.restore.disease + ' %.</p>';
  }
  if (M.reports.length > 1) h += '<p>' + M.reports.map((x, j) => '<button data-report="' + j + '"' + (j === i ? ' aria-pressed="true"' : '') + '>' + (x.kind === 'collapse' ? 'Kollaps' : 'Stress') + ' · T' + fmt(x.tick / 10, 1) + '</button>').join(' ') + '</p>';
  $('reportBody').innerHTML = h;
  for (const b of $('reportBody').querySelectorAll('[data-report]')) b.addEventListener('click', () => showReport(Number(b.dataset.report)));
  if (!$('report').open) $('report').showModal();
  $('report').scrollTop = 0; $('reportTitle').scrollIntoView({ block: 'start' });   // oben beginnen, nicht beim Button
}

// [ui] Abnahmebericht als Text
function acceptanceText(r) {
  const inj = r.injection.filter(x => x.pass && x.reset).length;
  return (r.pass ? 'PASS' : 'FAIL') + ' · Modellkennung ' + r.fingerprint + ' · ' + fmt(r.seconds, 1) + ' s Rechenzeit\n'
    + 'Standard 20 Seeds × 150 Tage: ' + r.standard.survivors + '/20 überleben, Ø ' + fmt(r.standard.meanPopulation, 1) + ' Bienen (max ' + r.standard.maxPopulation + '), ' + r.standard.fails + ' Invariantenfehler, Quellenbilanz ' + (r.standard.sourceBalanceFails ? 'FEHLER' : 'exakt') + '\n'
    + 'Ressourcen 0 %: ' + r.zero.collapses + '/20 kollabiert · Wetter 10 %: ' + r.unstable.collapses + '/20 kollabiert\n'
    + 'Stress (Start gestaffelt Tag 5–25): ' + r.stress.survivors + ' überleben / ' + r.stress.collapses + ' kollabieren\n'
    + 'Ressourcenantwort: ' + r.resource.map(x => x.resource + ' %→' + fmt(x.meanFood)).join(' · ') + (r.resourceMonotonic ? ' (monoton)' : ' (NICHT monoton)') + '\n'
    + 'Fehlerinjektion ' + inj + '/' + r.injection.length + ' · reproduzierbar ' + (r.reproducible ? 'ja' : 'NEIN') + ' · Lesbarkeit ' + r.readability.occupied + ' belegte Zellen (echter Lauf)\n'
    + 'Eingriffe: ohne Ammen ' + r.causal.nursing.withoutNurses + ' Pflegeverluste (normal ' + r.causal.nursing.normalLoss + ') · ohne Fächeln ' + r.causal.fanning.withoutFanning + ' Honig (normal ' + r.causal.fanning.newHoney + ') · 43 °C: ' + r.causal.temperature.at43 + ' Brutverluste';
}

// [ui] Abnahme im Browser neu rechnen (Simulation ruht währenddessen)
async function runAcceptance() {
  if (UI.busy) return; UI.busy = true; syncControls(); $('acceptance').disabled = true;
  try {
    const r = await acceptance(seed => { $('acceptResult').textContent = 'Messe Seed ' + seed + ' / 20 …'; }, () => new Promise(res => setTimeout(res, 0)));
    UI.saved = r; $('acceptResult').textContent = 'Soeben gemessen.\n' + acceptanceText(r);
  } catch (e) { $('acceptResult').textContent = 'Abnahmefehler: ' + e.message; }
  finally { UI.busy = false; $('acceptance').disabled = false; syncControls(); }
}

// [ui] Tick-Schleife: feste 10 Ticks/s × Tempo, entkoppelt vom requestAnimationFrame. S5 misst die erste sichtbare Sekunde bei 1×.
function frame(time) {
  const M = UI.M, dt = UI.last ? Math.min(0.25, (time - UI.last) / 1000) : 0; UI.last = time;
  if (!document.hidden && !M.paused && !M.collapsed && !UI.busy) {
    UI.vt += dt * M.speed * 1000; UI.acc += dt * CFG.TPS * M.speed;
    let n = 0; while (UI.acc >= 1 && n++ < 8) { M.step(); UI.acc -= 1; if (M.tick % 20 === 0) updateUI(true); }
    if (n >= 8) UI.acc = 0;
    if (!M.cadence && M.speed === 1) {
      if (!UI.win) UI.win = { time, tick: M.tick, frames: UI.frames };
      else if (time - UI.win.time >= 1000) {
        const ticks = M.tick - UI.win.tick, frames = UI.frames - UI.win.frames;
        M.cadence = { pass: ticks > 5 && frames > 20, detail: 'erste sichtbare Sekunde bei 1×: ' + ticks + ' Ticks (> 5), ' + frames + ' Frames (> 20)' };
        updateUI(true);                                 // Anzeige auffrischen, dann prüfen (S3 liest die Anzeige)
        if (!UI.userTempo) { M.speed = 0.25; $('sceneNote').textContent = 'Zeitlupe aktiv (Taktprüfung lief 1 s bei 1×). Zelle anklicken, um hineinzusehen.'; syncControls(); }
      }
    } else if (M.speed !== 1) UI.win = null;
  }
  renderFrame(M, clamp(UI.acc, 0, 1), UI.vt, UI.selected); UI.frames++;
  if (time - UI.lastUi > 200) { UI.lastUi = time; updateUI(); }
  requestAnimationFrame(frame);
}

// [ui] Start: Bindungen, Legende, Modell, gespeicherte Abnahme, Schleife
function bootUI() {
  for (const k of Object.keys(DEFAULTS)) bind(k, 'input', () => { UI.M.setParam(k, Number($(k).value)); updateUI(); });
  for (const k of Object.keys(ACTIONS)) bind(k, ['paths', 'heat', 'flows'].includes(k) ? 'change' : 'click', () => {
    ACTIONS[k](UI.M); if (['slow', 'normal', 'speed'].includes(k)) { UI.userTempo = true; UI.win = null; } updateUI();
  });
  bind('reset', 'click', () => { const a = new Uint32Array(1); crypto.getRandomValues(a); mountModel(a[0], { ...UI.M.params, ...(UI.M.stress ? UI.M.stress.restore : {}) }); });
  bind('replay', 'click', () => {
    const v = $('seed').value.trim();
    if (!/^\d{1,10}$/.test(v) || Number(v) > 4294967295) { $('seed').setCustomValidity('Seed: ganze Zahl von 0 bis 4.294.967.295'); $('seed').reportValidity(); return; }
    mountModel(Number(v), { ...UI.M.params, ...(UI.M.stress ? UI.M.stress.restore : {}) });
  });
  bind('reports', 'click', () => showReport(UI.reportIdx ?? UI.M.reports.length - 1));
  bind('closeReport', 'click', () => $('report').close());
  bind('acceptance', 'click', runAcceptance);
  $('report').addEventListener('cancel', e => e.preventDefault());      // Escape schließt nicht
  $('world').addEventListener('click', e => { const r = $('world').getBoundingClientRect(); const id = cellAtScreen(UI.M, e.clientX - r.left, e.clientY - r.top); if (id !== null) { UI.selected = id; renderInspector(); } });
  const chip = (col, l) => '<span><i style="background:' + col + '"></i>' + l + '</span>';
  $('legend').innerHTML = Object.keys(LABELS).map(k => chip(CELL_COL[k], LABELS[k])).join('')
    + Object.keys(ROLE_COL).map(k => '<span><b style="color:' + ROLE_COL[k] + '">●</b>' + ROLES[k] + '</span>').join('')
    + Object.keys(RES_COL).map(k => '<span><b style="color:' + RES_COL[k] + '">•</b>Last ' + ({ nectar: 'Nektar', pollen: 'Pollen', water: 'Wasser' })[k] + '</span>').join('');
  $('stages').textContent = 'Stufe 1 Kern, Stufe 2 Aufbau und Stufe 3 Layer/Visuelles vollständig. Weggelassen: nichts. Abweichungen, offen ausgewiesen: Königin implizit, Wasser im Tank statt in Zellen, Amme versorgt Ziel- und Nachbarlarven, Taktprüfung in der ersten Sekunde bei 1× (danach Zeitlupe), Stress-Abnahme mit gestaffeltem Start.';
  initRenderer($('world'));
  mountModel(1729, {});
  try { UI.saved = JSON.parse($('savedAcceptance').textContent); } catch { UI.saved = null; }
  $('acceptResult').textContent = UI.saved && UI.saved.fingerprint === modelFingerprint()
    ? 'Gespeicherte Messung (passt zur Modellkennung ' + UI.saved.fingerprint + '; neu messbar über den Button).\n' + acceptanceText(UI.saved)
    : 'Keine zur aktuellen Modellkennung ' + modelFingerprint() + ' passende gespeicherte Messung. Bitte neu messen.';
  document.addEventListener('visibilitychange', () => { UI.last = 0; UI.win = null; });
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') bootUI();
