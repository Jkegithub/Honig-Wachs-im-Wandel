// [resourcePool] Gesamtzustand einer unabhängigen Simulation
class Colony {
  // [resourcePool] Anlage: Gitter, Bienen, Brut, Startvorräte (Vorlauf ausgewiesen), Wiese
  constructor(seed = 1729, params = {}) {
    this.seed = Number(seed) >>> 0; this.rng = new Random(this.seed);
    this.params = { ...DEFAULTS, ...params };
    this.tick = 0; this.nextId = 1; this.booting = true;
    this.cells = []; this.idx = { empty: new Set(), egg: new Set(), larva: new Set(), pupa: new Set(), pollen: new Set(), nectar: new Set(), honey: new Set() };
    this.tot = { nectar: 0, honey: 0, pollen: 0 };
    this.water = 0;
    this.ledger = {}; this.lossBook = {};
    for (const k of KEYS) { this.ledger[k] = { collected: 0, spent: 0, lost: 0 }; this.lossBook[k] = 0; }
    this.bees = []; this.beeById = new Map(); this.reserved = new Map(); this.handoff = []; this.claims = new Map();
    this.commit = { nectar: 0, pollen: 0, water: 0 };
    this.extent = { minX: 0, maxX: 0, minY: 0, maxY: 0 }; this.entrance = { x: 0, y: 0 };
    this.events = []; this.history = []; this.changes = []; this.reports = []; this.flows = [];
    this.stats0();
    this.collapsed = false; this.paused = false; this.speed = 1; this.stress = null; this.emptySince = null;
    this.checks = []; this.checkFailures = []; this.uiSnapshot = null; this.uiAudit = null; this.cadence = null;
    this.layers = { paths: true, heat: false, flows: true };
    this.temperature = 35; this.ambient = 28; this.eggCredit = 0; this.guardHits = 0; this.dirty = true; this.tickDeaths = {};
    this.initEnvironment();
    this.grow(CFG.START_CELLS, false);
    const target = this.params.colony;
    for (let i = 0; i < target; i++) this.addBee(this.rng.int(0, 430));
    this.initialPopulation = this.bees.length;
    const broodCells = [...this.idx.empty].filter(id => this.zone(id) === 'brood');
    const nBrood = Math.min(broodCells.length, Math.round(target * 0.4));
    for (let i = 0; i < nBrood; i++) this.seedBrood(this.cells[broodCells[i]], Math.floor(i * 210 / nBrood));
    this.bootstrap('nectar', target * 28); this.bootstrap('pollen', target * 8); this.bootstrap('water', target * 8);
    for (let j = 0; j < CFG.FAN_MIN; j++) for (const id of [...this.idx.nectar]) this.fanCell(this.cells[id], null);
    this.booting = false;
    this.assignRoles();
    this.record('Stock gegründet: 80 Zellen, Startvorräte im Vorlauf gereift (ausgewiesen).');
    this.sample(); this.refreshSnapshot(); this.selfCheck();
  }

  // [resourcePool] Zähler der Statistik
  stats0() {
    this.born = 0; this.dead = 0; this.deaths = {}; this.broodDeaths = {}; this.trips = 0; this.success = 0;
    this.tripUnits = 0; this.preventedFlights = 0; this.nurseActions = 0; this.fanActions = 0; this.buildActions = 0;
    this.ripened = 0;
  }

  // [hexGrid] Zone einer Zelle im aktuellen Gitter
  zone(id) { return zoneOf(id, this.cells.length, this.params.colony); }

  // [hexGrid] n Zellen an den nächsten Spiralpositionen anbauen; bezahlt kostet Nahrung
  grow(n, paid = true) {
    let added = 0;
    while (n-- > 0 && this.cells.length < CFG.MAX_CELLS) {
      if (paid) {                                       // Baukosten teilen sich das Tick-Budget mit dem Essen der Bienen
        if (this.meal && this.meal.avail < CFG.BUILD_COST) break;
        if (!this.consume('food', CFG.BUILD_COST, 'Wachsbau')) break;
        if (this.meal) this.meal.avail -= CFG.BUILD_COST;
      }
      const g = GRID.list[this.cells.length];
      const c = { id: g.id, q: g.q, r: g.r, ring: g.ring, x: g.x, y: g.y, nb: g.nb, state: 'empty', amount: 0, moist: 0, fan: 0,
        lastFan: -1, nectarAt: -1, dev: 0, bee: null, nursedAt: this.tick, temp: this.temperature, thermal: 0, since: this.tick };
      this.cells.push(c); this.idx.empty.add(c.id); added++;
      const e = this.extent, h = CFG.HEX;
      e.minX = Math.min(e.minX, c.x - h); e.maxX = Math.max(e.maxX, c.x + h); e.minY = Math.min(e.minY, c.y - h); e.maxY = Math.max(e.maxY, c.y + h);
    }
    if (added) { this.entrance = { x: this.extent.maxX + 18, y: 0 }; this.dirty = true; }
    if (this.cells.length >= CFG.MAX_CELLS && !this.capLogged) { this.capLogged = true; this.record('Wabe hat die Obergrenze von 1.200 Zellen erreicht.'); }
    return added;
  }

  // [hexGrid] einzige Stelle, die Zellzustände ändert: Indizes, Vorratssummen, Honig-Wache
  setState(c, s) {
    if (c.state === s) return true;
    if (s === 'honey' && !(c.state === 'nectar' && c.fan >= CFG.FAN_MIN && c.moist < CFG.MOIST_HONEY && (this.booting || this.tick - c.nectarAt >= CFG.FAN_MIN))) {
      this.guardHits++; return false;
    }
    if (c.state in this.tot) this.tot[c.state] -= c.amount;
    this.idx[c.state].delete(c.id);
    c.state = s; c.since = this.tick;
    this.idx[s].add(c.id);
    if (s in this.tot) this.tot[s] += c.amount;
    if (s === 'empty') { c.amount = 0; c.moist = 0; c.fan = 0; c.lastFan = -1; c.nectarAt = -1; c.dev = 0; c.bee = null; c.thermal = 0; }
    this.dirty = true;
    return true;
  }

  // [resourcePool] Menge einer Vorratszelle ändern; leer -> Zustand leer
  addAmount(c, n) {
    c.amount += n;
    if (c.state in this.tot) this.tot[c.state] += n;
    if (c.amount <= 0 && (c.state === 'nectar' || c.state === 'honey' || c.state === 'pollen')) this.setState(c, 'empty');
    this.dirty = true;
  }

  // [resourcePool] Bestände für Entscheidungen (Summen aus setState/addAmount)
  food() { return this.tot.nectar + this.tot.honey; }
  // [resourcePool]
  honey() { return this.tot.honey; }
  // [resourcePool]
  stored(k) { return k === 'water' ? this.water : k === 'pollen' ? this.tot.pollen : this.food(); }

  // [resourcePool] Verbrauch: Nahrung zuerst aus Nektar (älteste zuerst), dann Honig; alles oder nichts
  consume(kind, n, reason) {
    if (!n) return true;
    if (kind === 'water') { if (this.water < n) return false; this.water -= n; this.ledger.water.spent += n; return true; }
    const sets = kind === 'pollen' ? [this.idx.pollen] : [this.idx.nectar, this.idx.honey];
    const avail = kind === 'pollen' ? this.tot.pollen : this.food();
    if (avail < n) return false;
    let left = n;
    for (const set of sets) {
      while (left > 0 && set.size) {
        const c = this.cells[set.values().next().value];
        const take = Math.min(left, c.amount);
        left -= take; this.addAmount(c, -take);
      }
      if (!left) break;
    }
    this.ledger[kind === 'pollen' ? 'pollen' : 'nectar'].spent += n;
    return true;
  }

  // [resourcePool] freie Lagerzellen einmal je Tick vorberechnen (statt Vollsuche je Sammlerin)
  freeLists() {
    const store = [], pollen = [];
    for (const id of this.idx.empty) {
      if (this.reserved.has(id)) continue;
      const z = this.zone(id);
      if (z === 'store') store.push(id); else if (z === 'pollen') pollen.push(id);
    }
    this.free = { store, pollen };
  }

  // [resourcePool] freie, unreservierte Lagerzelle (Nektar: Lagerzone; Pollen: Kranz, sonst Lager) bzw. Tank
  storageCell(kind) {
    if (kind === 'water') return this.water + this.commit.water + CFG.LOAD_WATER <= CFG.TANK ? -1 : null;
    if (this.free) {
      const pick = list => { while (list.length) { const id = list[0]; const c = this.cells[id]; if (c.state === 'empty' && !this.reserved.has(id)) return id; list.shift(); } return null; };
      const id = kind === 'pollen' ? pick(this.free.pollen) : null;
      return id !== null ? id : pick(this.free.store);
    }
    let fallback = null;
    for (const id of this.idx.empty) {
      if (this.reserved.has(id)) continue;
      const z = this.zone(id);
      if (kind === 'pollen' && z === 'pollen') return id;
      if (z === 'store') { if (kind === 'nectar') return id; if (fallback === null) fallback = id; }
    }
    return kind === 'pollen' ? fallback : null;
  }

  // [resourcePool] Einlagerung in die reservierte Zelle (Nektar mit 60 % Wasser) bzw. in den Tank
  deposit(target, kind, n, beeId) {
    if (!n) return;
    if (kind === 'water') { this.water += n; return; }
    const c = this.cells[target];
    if (c.state !== 'empty') throw Error('Reservierte Zelle nicht leer: #' + c.id);
    this.setState(c, kind);
    this.addAmount(c, n);
    c.bee = beeId;
    if (kind === 'nectar') { c.moist = CFG.MOIST_IN; c.fan = 0; c.lastFan = -1; c.nectarAt = this.tick; }
  }

  // [resourcePool] Startbestand mit derselben Einlagerung wie Sammellasten
  bootstrap(kind, n) {
    if (kind === 'water') { this.water += n; this.ledger.water.collected += n; return; }
    let left = n;
    while (left > 0) {
      const id = this.storageCell(kind);
      if (id === null) { if (this.cells.length >= CFG.MAX_CELLS) throw Error('Startlager voll'); this.grow(4, false); continue; }
      const take = Math.min(left, CFG.CELL_CAP);
      this.deposit(id, kind, take, null);
      this.ledger[kind].collected += take; left -= take;
    }
  }

  // [resourcePool] Fächeln einer Nektarzelle: höchstens ein Fortschritt je Zelle und Tick
  fanCell(c, beeId) {
    if (c.state !== 'nectar' || (!this.booting && c.lastFan === this.tick)) return;
    c.moist = Math.max(CFG.MOIST_MIN, c.moist - CFG.FAN_STEP); c.fan++; c.lastFan = this.tick;
    if (beeId !== null) c.bee = beeId;
    const ripe = c.moist < CFG.MOIST_HONEY && c.fan >= CFG.FAN_MIN && (this.booting || this.tick - c.nectarAt >= CFG.FAN_MIN);
    if (ripe && this.setState(c, 'honey')) { if (!this.booting) this.ripened++; }
    this.dirty = true;
  }

  // [resourcePool] Ereignis ins Log (300 Ticks)
  record(text) {
    this.events.push({ tick: this.tick, text });
    while (this.events.length && this.events[0].tick < this.tick - CFG.HISTORY) this.events.shift();
    this.logDirty = true;
  }

  // [resourcePool] Kennzahlen (Population nach Rolle, Brut nach Phase, Vorräte)
  stats() {
    const roles = { nurse: 0, worker: 0, forager: 0 };
    for (const b of this.bees) roles[b.role]++;
    const brood = { egg: this.idx.egg.size, larva: this.idx.larva.size, pupa: this.idx.pupa.size };
    return { pop: this.bees.length, roles, brood, broodTotal: brood.egg + brood.larva + brood.pupa, honey: this.tot.honey,
      nectar: this.tot.nectar, food: this.food(), pollen: this.tot.pollen, water: this.water,
      efficiency: this.trips ? Math.round(100 * this.success / this.trips) : 0 };
  }
}
