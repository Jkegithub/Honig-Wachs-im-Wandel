Object.assign(Colony.prototype, {
  // [diagnostics] ein Logik-Tick in fester Reihenfolge; Rendern ist nie Teil davon
  step() {
    if (this.collapsed) return false;
    this.tick++;
    this.envStep();
    this.agentsStep();
    this.broodStep();
    this.sample();
    const brood = this.idx.egg.size + this.idx.larva.size + this.idx.pupa.size;
    if (this.bees.length < CFG.POP_MIN || (brood === 0 && this.tot.honey === 0)) this.collapse();
    if (this.stress && this.tick >= this.stress.end) this.endStress();
    this.refreshSnapshot();
    if (this.tick % 20 === 0 && !this.uiBound) this.selfCheck();   // im Browser prüft die UI direkt nach dem Auffrischen der Anzeige (S3)
    return true;
  },
  // [diagnostics] n Ticks vorspulen (Testschnittstelle)
  advance(n) {
    if (!Number.isSafeInteger(n) || n < 0 || n > 1e6) throw Error('Ticks: Ganzzahl 0..1.000.000');
    for (let i = 0; i < n && !this.collapsed; i++) this.step();
    return this.stats();
  },

  // [diagnostics] Verlauf je Tick (300 Ticks = 30 Tage) und Kennzahlen für die Abnahme
  sample() {
    const s = this.stats();
    if (s.honey === 0 && this.emptySince === null) this.emptySince = this.tick;
    if (s.honey > 0) this.emptySince = null;
    this.maxPopulation = Math.max(this.maxPopulation || 0, s.pop);
    this.maxOccupied = Math.max(this.maxOccupied || 0, this.cells.length - this.idx.empty.size);
    this.history.push({ tick: this.tick, pop: s.pop, brood: s.broodTotal, honey: s.honey, food: s.food, pollen: s.pollen, water: s.water,
      rain: this.weather.rain, temperature: this.temperature, inflow: this.ledger.nectar.collected, outflow: this.ledger.nectar.spent + this.ledger.nectar.lost, params: { ...this.params } });
    if (this.history.length > CFG.HISTORY + 1) this.history.shift();
  },

  // [diagnostics] Kollaps: anhalten, Bericht mit Ursachenkette (50 Ticks) und Vorgeschichte (30 Tage)
  collapse() {
    this.collapsed = true; this.paused = true;
    const pop = this.bees.length;
    this.reports.push({ kind: 'collapse', tick: this.tick,
      reason: pop < CFG.POP_MIN ? 'Population ' + pop + ' unter 10' : 'Brut 0 bei leerem Honigvorrat',
      history: this.history.map(h => ({ ...h, params: { ...h.params } })), events: this.events.filter(e => e.tick >= this.tick - CFG.CHAIN).map(e => ({ ...e })),
      params: { ...this.params }, changes: this.changes.filter(c => c.tick >= this.tick - CFG.HISTORY).map(c => ({ ...c })), emptySince: this.emptySince,
      deaths: { ...this.deaths }, broodDeaths: { ...this.broodDeaths } });
    this.record('KOLLAPS: ' + this.reports.at(-1).reason);
    if (this.stress) this.endStress();
  },

  // [environment] Parameter live setzen; Zielgröße steuert nur den Nachwuchs
  setParam(k, value) {
    if (!(k in DEFAULTS)) throw Error('Unbekannter Parameter ' + k);
    if (this.stress && k !== 'colony') return false;
    value = Math.round(Number(value));
    if (!Number.isFinite(value)) throw Error('Parameter muss endlich sein');
    value = clamp(value, k === 'colony' ? 30 : 0, k === 'colony' ? 400 : 100);
    if (this.params[k] === value) return true;
    this.params[k] = value; this.changes.push({ tick: this.tick, key: k, value });
    this.record('Regler ' + ({ colony: 'Zielpopulation', resource: 'Ressourcen', stability: 'Wetterstabilität', disease: 'Krankheitsdruck' })[k] + ' → ' + value);
    return true;
  },
  // [environment] Stress-Test: 30 Tage Wetter 10 %, Ressourcen 10 %, Krankheit 80 %
  startStress() {
    if (this.stress || this.collapsed) return false;
    this.stress = { start: this.tick, end: this.tick + CFG.STRESS, restore: { resource: this.params.resource, stability: this.params.stability, disease: this.params.disease },
      honey: this.tot.honey, food: this.food(), dead: this.dead, born: this.born, pop: this.bees.length };
    Object.assign(this.params, { resource: 10, stability: 10, disease: 80 });
    this.changes.push({ tick: this.tick, key: 'stress', value: 'Start' });
    this.record('Stress-Test gestartet: 30 Tage mit 10 % / 10 % / 80 %.');
    return true;
  },
  // [environment] Stress-Test beenden, Report, Regler zurück
  endStress() {
    const s = this.stress; if (!s) return;
    const dead = this.dead - s.dead, born = this.born - s.born;
    this.reports.push({ kind: 'stress', tick: this.tick, survived: !this.collapsed, elapsed: (this.tick - s.start) / 10, honeyLoss: s.honey - this.tot.honey,
      foodLoss: s.food - this.food(), dead, born, mortality: 100 * dead / Math.max(1, s.pop + born), pop0: s.pop, pop1: this.bees.length,
      history: this.history.map(h => ({ ...h })), params: { ...this.params }, restore: { ...s.restore } });
    Object.assign(this.params, s.restore); this.stress = null;
    this.changes.push({ tick: this.tick, key: 'stress', value: 'Ende' });
    this.record('Stress-Test beendet: ' + (this.collapsed ? 'kollabiert.' : 'überlebt.'));
  },

  // [diagnostics] Headless-Anzeigewert; im Browser überschreibt die UI ihn mit den angezeigten Zahlen
  refreshSnapshot() { if (!this.uiBound) this.uiSnapshot = { egg: this.idx.egg.size, larva: this.idx.larva.size, pupa: this.idx.pupa.size }; },

  // [diagnostics] Invarianten S1–S9; zählt unabhängig aus Zellen und Bienen, nie aus den Indizes
  selfCheck() {
    const a = [];
    const scan = { nectar: 0, pollen: 0, water: this.water }, transit = { nectar: 0, pollen: 0, water: 0 }, brood = { egg: 0, larva: 0, pupa: 0 };
    let badHoney = 0;
    for (const c of this.cells) {
      if (c.state === 'nectar' || c.state === 'honey') scan.nectar += c.amount; else if (c.state === 'pollen') scan.pollen += c.amount;
      if (c.state in brood) brood[c.state]++;
      if (c.state === 'honey' && !(c.fan >= CFG.FAN_MIN && c.moist < CFG.MOIST_HONEY && c.nectarAt >= 0)) badHoney++;
    }
    for (const b of this.bees) if (b.load.amount) transit[b.load.kind] += b.load.amount;
    const d1 = [];
    for (const k of KEYS) { const L = this.ledger[k], rhs = scan[k] + transit[k] + L.spent + L.lost; if (L.collected !== rhs) d1.push(k + ': ' + L.collected + ' ≠ ' + scan[k] + ' Lager + ' + transit[k] + ' Transit + ' + L.spent + ' verbraucht + ' + L.lost + ' verloren'); }
    a.push({ id: 1, name: 'Ressourcenbilanz', pass: !d1.length, detail: d1.length ? d1.join('; ') : 'gesammelt = Lager + Transit + verbraucht + verloren (3 Ressourcen, Toleranz 0)' });
    a.push({ id: 2, name: 'Honig-Herkunft', pass: badHoney === 0 && this.guardHits === 0, detail: badHoney + ' Honigzellen ohne Nektarphase, ' + this.guardHits + ' blockierte Sprünge' });
    const shown = this.uiSnapshot || {};
    a.push({ id: 3, name: 'Brut-Konsistenz', pass: ['egg', 'larva', 'pupa'].every(k => brood[k] === shown[k]), detail: 'Zellen E/L/P ' + brood.egg + '/' + brood.larva + '/' + brood.pupa + ' · angezeigt ' + shown.egg + '/' + shown.larva + '/' + shown.pupa });
    const n = this.cells.length, e = this.extent, ent = this.entrance;
    const invalid = this.bees.filter(b => {
      if (!Object.hasOwn(ROLES, b.role) || !b.target || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return true;
      const t = b.target;
      const okT = t.kind === 'cell' ? t.id >= 0 && t.id < n : t.kind === 'site' ? t.id < CFG.MAX_CELLS : t.kind === 'patch' ? !!this.patches[t.id] || t.id === 'pond'
        : t.kind === 'bee' ? this.beeById.has(t.id) : t.kind === 'entrance' || t.kind === 'tank';
      const okP = b.space === 'hive' ? b.x >= e.minX - 80 && b.x <= ent.x + 80 && b.y >= e.minY - 80 && b.y <= e.maxY + 80 : b.x >= -60 && b.x <= 1100 && b.y >= -480 && b.y <= 480;
      return !okT || !okP;
    });
    a.push({ id: 4, name: 'Agenten-Integrität', pass: !invalid.length, detail: invalid.length ? 'ungültig: #' + invalid.slice(0, 5).map(b => b.id + ' ' + b.task).join(', #') : this.bees.length + ' Bienen mit genau einer Rolle und gültigem Ziel' });
    a.push({ id: 5, name: 'Takt', pass: this.cadence ? this.cadence.pass : null, detail: this.cadence ? this.cadence.detail : 'wartet auf die erste sichtbare Sekunde (bei 1×)' });
    a.push({ id: 6, name: 'UI-Wirkung', pass: this.uiAudit ? this.uiAudit.pass : null, detail: this.uiAudit ? this.uiAudit.detail : 'nur im Browser' });
    const waiting = this.bees.filter(b => b.wait > CFG.WAIT_LIMIT);
    a.push({ id: 7, name: 'Stillstandsfreiheit', pass: !waiting.length, detail: waiting.length ? 'wartend: ' + waiting.map(b => '#' + b.id + ' ' + b.wait + ' Ticks').join(', ') : 'keine Biene länger als 100 Ticks in einer Warteaufgabe' });
    let resBad = 0; const seen = new Set();
    for (const b of this.bees) if (b.reserved !== null && b.reserved >= 0) { const c = this.cells[b.reserved]; if (seen.has(b.reserved) || !c || c.state !== 'empty') resBad++; seen.add(b.reserved); }
    for (const [id, bid] of this.reserved) { const b = this.beeById.get(bid); if (!b || (b.reserved !== id)) resBad++; }
    const lossBad = KEYS.filter(k => this.lossBook[k] !== this.ledger[k].lost);
    a.push({ id: 8, name: 'Reservierungen / Verlustbelege', pass: !resBad && !lossBad.length, detail: resBad + ' Reservierungskonflikte; Verluste ohne Todesbeleg: ' + (lossBad.join(', ') || 'keine') });
    const pc = this.initialPopulation + this.born - this.dead;
    a.push({ id: 9, name: 'Populationserhaltung', pass: pc === this.bees.length, detail: this.initialPopulation + ' Start + ' + this.born + ' geschlüpft − ' + this.dead + ' gestorben = ' + pc + ' / lebend ' + this.bees.length });
    this.checks = a;
    const fails = a.filter(c => c.pass === false);
    if (fails.length) { this.checkFailures.push({ tick: this.tick, fails: fails.map(c => ({ ...c })) }); if (this.checkFailures.length > 100) this.checkFailures.shift(); }
    return a;
  },

  // [diagnostics] gezielte Fehlerinjektion je Invariante (ohne automatische Reparatur)
  inject(id, mode) {
    if (id === 1) { const c = this.cells[[...this.idx.honey, ...this.idx.nectar][0]]; c.amount += 5; }
    else if (id === 2) { const c = this.cells[[...this.idx.honey][0]]; c.fan = 0; }
    else if (id === 3) this.uiSnapshot.egg++;
    else if (id === 4) this.bees[0].role = 'falsch';
    else if (id === 7) this.bees[0].wait = CFG.WAIT_LIMIT + 1;
    else if (id === 8 && mode === 'reservation') { const ids = [...this.idx.empty].slice(0, 1); this.bees[0].reserved = ids[0]; this.bees[1].reserved = ids[0]; this.reserved.set(ids[0], this.bees[0].id); }
    else if (id === 8) { const c = this.cells[[...this.idx.honey][0]]; this.addAmount(c, -5); this.ledger.nectar.lost += 5; }
    else throw Error('Fehler-ID 1, 2, 3, 4, 7 oder 8');
    return this.selfCheck();
  },
});

// [diagnostics] Eingriffstests: wirken Ammen, Fächeln und Temperatur tatsächlich?
function causalCheck() {
  const normal = new Colony(23), off = new Colony(23), ar = off.assignRoles;
  off.assignRoles = function () { ar.call(this); for (const b of this.bees) if (b.role === 'nurse') b.role = 'worker'; };
  normal.advance(80); off.advance(80);
  const fan = new Colony(24), noFan = new Colony(24);
  noFan.fanCell = function () {};
  const h0 = fan.ripened; fan.advance(200); noFan.advance(200);
  const hot = new Colony(25), control = new Colony(25), env = hot.envStep;
  hot.envStep = function () { env.call(this); this.temperature = 43; for (const c of this.cells) c.temp = 43; };
  hot.advance(30); control.advance(30);
  const sum = o => Object.entries(o).filter(([k]) => k.startsWith('Temperatur')).reduce((s, [, v]) => s + v, 0);
  const r = { nursing: { normalLoss: normal.broodDeaths['keine Brutpflege'] || 0, withoutNurses: off.broodDeaths['keine Brutpflege'] || 0 },
    fanning: { newHoney: fan.ripened - h0, withoutFanning: noFan.ripened }, temperature: { normalLoss: sum(control.broodDeaths), at43: sum(hot.broodDeaths) } };
  r.pass = r.nursing.withoutNurses > r.nursing.normalLoss && r.fanning.newHoney > 0 && r.fanning.withoutFanning === 0 && r.temperature.at43 > r.temperature.normalLoss;
  return r;
}

// [diagnostics] Abnahme nach Prompt #24 mit identischen Modellfunktionen (kein Sondermodus)
async function acceptance(progress = () => {}, pause = async () => {}) {
  const out = { version: 3, fingerprint: modelFingerprint(), standard: { seeds: 20, ticks: 1500, survivors: 0, meanPopulation: 0, maxPopulation: 0, fails: 0, sourceBalanceFails: 0, rows: [] },
    zero: { collapses: 0, seeds: 20 }, unstable: { collapses: 0, seeds: 20 }, stress: { survivors: 0, collapses: 0, seeds: 20 }, injection: [], reproducible: false, readability: null, resource: [], causal: null, pass: false };
  let popSum = 0, popN = 0;
  const t0 = Date.now();
  for (let seed = 1; seed <= 20; seed++) {
    const m = new Colony(seed);
    const start = { n: m.patches.reduce((s, p) => s + p.nectar, 0), p: m.patches.reduce((s, p) => s + p.pollen, 0), w: m.pond.water };
    const boot = { n: m.ledger.nectar.collected, p: m.ledger.pollen.collected, w: m.ledger.water.collected };
    let regen = { n: 0, p: 0, w: 0 }; const env = m.envStep;
    m.envStep = function () { const b = { n: this.patches.reduce((s, p) => s + p.nectar, 0), p: this.patches.reduce((s, p) => s + p.pollen, 0), w: this.pond.water }; env.call(this);
      regen.n += this.patches.reduce((s, p) => s + p.nectar, 0) - b.n; regen.p += this.patches.reduce((s, p) => s + p.pollen, 0) - b.p; regen.w += this.pond.water - b.w; };
    let sum = 0, n = 0;
    for (let t = 0; t < 1500 && !m.collapsed; t++) { m.step(); sum += m.bees.length; n++; }
    const end = { n: m.patches.reduce((s, p) => s + p.nectar, 0), p: m.patches.reduce((s, p) => s + p.pollen, 0), w: m.pond.water };
    const near = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
    if (!near(start.n + regen.n - end.n + boot.n, m.ledger.nectar.collected) || !near(start.p + regen.p - end.p + boot.p, m.ledger.pollen.collected) || !near(start.w + regen.w - end.w + boot.w, m.ledger.water.collected)) out.standard.sourceBalanceFails++;
    out.standard.survivors += !m.collapsed; out.standard.fails += m.checkFailures.length; out.standard.maxPopulation = Math.max(out.standard.maxPopulation, m.maxPopulation);
    popSum += sum; popN += n;
    out.standard.rows.push({ seed, survived: !m.collapsed, pop: m.bees.length, mean: Math.round(sum / Math.max(1, n) * 10) / 10, max: m.maxPopulation, cells: m.cells.length, fails: m.checkFailures.length });
    const z = new Colony(seed, { resource: 0 }); z.advance(1500); out.zero.collapses += z.collapsed;
    const w = new Colony(seed, { stability: 10 }); w.advance(1500); out.unstable.collapses += w.collapsed;
    // Stress gestaffelt an Tag 5/10/15/20/25: Das Ergebnis hängt vom Zustand des Volkes ab (junge Völker mit kleinen Reserven sind verwundbar)
    const sStart = 50 * (1 + (seed - 1) % 5);
    const s = new Colony(seed); s.advance(sStart); s.startStress(); s.advance(300);
    const r = s.reports.find(x => x.kind === 'stress'); if (r) { out.stress.survivors += r.survived; out.stress.collapses += !r.survived; (out.stress.rows = out.stress.rows || []).push({ seed, startDay: sStart / 10, survived: r.survived }); }
    progress(seed, out); await pause();
  }
  out.standard.meanPopulation = Math.round(popSum / popN * 10) / 10;
  for (const [id, mode] of [[1], [2], [3], [4], [7], [8], [8, 'reservation']]) {
    const m = new Colony(101); m.advance(60);
    const failed = m.inject(id, mode).filter(c => c.pass === false).map(c => c.id);
    const fresh = new Colony(101); fresh.advance(60);
    out.injection.push({ id, mode: mode || '', failed, pass: failed.length === 1 && failed[0] === id, reset: fresh.selfCheck().filter(c => c.pass === false).length === 0 });
  }
  const a = new Colony(77), b = new Colony(77); a.advance(500); b.advance(500);
  out.reproducible = JSON.stringify(a.history) === JSON.stringify(b.history) && a.bees.length === b.bees.length && a.ledger.nectar.collected === b.ledger.nectar.collected;
  const v = new Colony(17, { colony: 400, resource: 100 }); v.advance(1500);
  out.readability = { occupied: v.maxOccupied, cells: v.cells.length, mode: 'echter Lauf ohne Eingriff', fails: v.checkFailures.length };
  for (const res of [20, 40, 60, 80, 100]) {
    let food = 0, surv = 0;
    // Vorrat überlebender Völker; ein kollabiertes zählt 0 (sein unverbrauchter Nektar ist kein Erfolg)
    for (const seed of [1, 2, 3]) { const m = new Colony(seed, { resource: res }); m.advance(1500); food += m.collapsed ? 0 : m.food(); surv += !m.collapsed; }
    out.resource.push({ resource: res, survived: surv, meanFood: Math.round(food / 3) });
  }
  out.causal = causalCheck();
  const mono = out.resource.every((r, i) => i === 0 || r.meanFood >= out.resource[i - 1].meanFood);
  out.resourceMonotonic = mono;
  out.seconds = Math.round((Date.now() - t0) / 100) / 10;
  out.pass = out.standard.survivors >= 18 && out.standard.meanPopulation >= 105 && out.standard.meanPopulation <= 195 && out.standard.fails === 0
    && out.standard.maxPopulation > 150 && out.standard.sourceBalanceFails === 0 && out.zero.collapses === 20 && out.unstable.collapses > 10
    && out.stress.survivors > 0 && out.stress.collapses > 0 && out.injection.every(x => x.pass && x.reset) && out.reproducible
    && out.readability.occupied >= 1000 && out.readability.fails === 0 && mono && out.causal.pass;
  return out;
}

// [diagnostics] Modellkennung: Hash über den gesamten Modellquelltext (ändert sich bei jeder Modelländerung)
function modelFingerprint() {
  let code = JSON.stringify(CFG) + JSON.stringify(DEFAULTS) + Random.toString() + buildGrid.toString() + zoneOf.toString() + Colony.toString()
    + causalCheck.toString() + acceptance.toString();
  for (const k of Object.getOwnPropertyNames(Colony.prototype).sort()) code += k + String(Colony.prototype[k]);
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) { h ^= code.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// [diagnostics] Testschnittstelle
const BeeLab = { create: (seed, params) => new Colony(seed, params), advance: (m, n) => m.advance(n), selfCheck: m => m.selfCheck(),
  inject: (m, id, mode) => m.inject(id, mode), acceptance, causalCheck, fingerprint: modelFingerprint, defaults: DEFAULTS, cfg: CFG };
if (typeof globalThis !== 'undefined') globalThis.BeeLab = BeeLab;
