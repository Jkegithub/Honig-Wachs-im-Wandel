Object.assign(Colony.prototype, {
  // [beeAgents] neue Biene im Stock
  addBee(age) {
    const id = this.nextId++, c = this.cells[id % this.cells.length], reserve = this.rng.int(7, 19);
    const b = { id, age, life: this.rng.int(CFG.LIFE_MIN, CFG.LIFE_MAX), role: 'worker', task: 'idle', timer: 0, work: 0,
      x: c.x, y: c.y, space: 'hive', px: c.x, py: c.y, pspace: 'hive', path: [], target: { kind: 'cell', id: c.id },
      load: { kind: null, amount: 0 }, reserved: null, src: null, want: null, expected: 0,
      energy: reserve, energyMax: reserve, metab: this.rng.next(), wait: 0, dead: false, wob: this.rng.next() * 6.28 };
    this.bees.push(b); this.beeById.set(id, b);
    return b;
  },

  // [beeAgents] Rollen nach Altersrang, bedarfsabhängig 20..45 % Pflege, 30 % Arbeiterinnen, Rest Sammlerinnen
  assignRoles() {
    const sorted = [...this.bees].sort((a, b) => a.age - b.age || a.id - b.id), n = sorted.length;
    const nurses = Math.min(n * 0.45, Math.max(n * 0.20, this.idx.larva.size * 0.9));
    for (let i = 0; i < n; i++) {
      const b = sorted[i];
      if (b.task !== 'idle' && b.task !== 'rest') continue;      // laufende Aufträge bleiben
      b.role = i < nurses ? 'nurse' : i < nurses + n * 0.30 ? 'worker' : 'forager';
    }
  },

  // [beeAgents] Wegpunkt
  wp(x, y, space) { return { x, y, space }; },
  // [beeAgents] versetzter Zwischenpunkt (Pfade ohne A*: offene Wabe, keine Hindernisse)
  mid(a, b, space, k) { const dx = b.x - a.x, dy = b.y - a.y, s = (this.rng.next() - 0.5) * 2 * k; return this.wp((a.x + b.x) / 2 - dy * s, (a.y + b.y) / 2 + dx * s, space); },
  // [beeAgents] Pfad zur Zielkoordinate, Innen- und Außenraum am Flugloch verbunden
  pathTo(b, dest) {
    const Ein = this.wp(this.entrance.x, this.entrance.y, 'hive'), Eout = this.wp(0, 0, 'out'), here = this.wp(b.x, b.y, b.space);
    if (b.space === dest.space) b.path = [this.mid(here, dest, dest.space, 0.15), dest];
    else if (b.space === 'hive') b.path = [this.mid(here, Ein, 'hive', 0.15), Ein, Eout, this.mid(Eout, dest, 'out', 0.22), dest];
    else b.path = [this.mid(here, Eout, 'out', 0.22), Eout, Ein, this.mid(Ein, dest, 'hive', 0.15), dest];
  },
  // [beeAgents] Bewegung; true, wenn das Ziel erreicht ist
  moveBee(b) {
    b.px = b.x; b.py = b.y; b.pspace = b.space;
    let budget = b.space === 'out' ? CFG.SPEED_OUT : CFG.SPEED_IN;
    while (budget > 0 && b.path.length) {
      const w = b.path[0];
      if (w.space !== b.space) { b.space = w.space; b.x = w.x; b.y = w.y; b.path.shift(); budget = w.space === 'out' ? CFG.SPEED_OUT : CFG.SPEED_IN; continue; }
      const dx = w.x - b.x, dy = w.y - b.y, d = Math.hypot(dx, dy);
      if (d <= budget) { b.x = w.x; b.y = w.y; b.path.shift(); budget -= d; } else { b.x += dx / d * budget; b.y += dy / d * budget; budget = 0; }
    }
    return b.path.length === 0;
  },
  // [beeAgents] Auftrag setzen und loslaufen
  go(b, task, target, dest, work = 0) { b.task = task; b.target = target; b.work = work; b.timer = 0; b.wait = 0; this.pathTo(b, dest); },
  // [beeAgents] Zielkoordinate einer Zelle
  cellDest(c) { return this.wp(c.x, c.y, 'hive'); },

  // [beeAgents] Lagebild je Tick: zugesagte Lasten, geplante Feldmengen, belegte Ziele, Baubedarf
  prep() {
    const commit = { nectar: 0, pollen: 0, water: 0 }, planned = new Map();
    this.fanTargets = new Set(); this.nurseTargets = new Set(); this.builders = 0; this.coolers = 0;
    for (const b of this.bees) {
      if (b.load.amount) commit[b.load.kind] += b.load.amount;
      else if ((b.task === 'out' || b.task === 'gather') && b.want) { commit[b.want] += b.expected; const k = b.src + ':' + b.want; planned.set(k, (planned.get(k) || 0) + b.expected); }
      if (b.task === 'fan') this.fanTargets.add(b.target.id);
      if (b.task === 'nurse') this.nurseTargets.add(b.target.id);
      if (b.task === 'build') this.builders++;
      if (b.task === 'cool') this.coolers++;
    }
    this.commit = commit; this.planned = planned;
    this.freeLists();
    this.storageShortNow = this.storageShort();
    this.buildNeed = this.needsBuild();
  },

  // [beeAgents] Baubedarf: Brutnest ohne freie Zellen, kein Lagerplatz für Nektar oder Pollen
  needsBuild() {
    const pop = this.bees.length;
    if (this.cells.length >= CFG.MAX_CELLS || this.food() < pop * 4) return false;
    let freeBrood = 0;
    for (const id of this.idx.empty) if (!this.reserved.has(id) && this.zone(id) === 'brood' && ++freeBrood >= 4) break;
    const broodNeed = this.params.colony * 0.48 + (this.params.colony - pop) * 0.65;
    const brood = this.idx.egg.size + this.idx.larva.size + this.idx.pupa.size;
    return (brood < broodNeed && freeBrood < 4) || this.storageShort();
  },

  // [beeAgents] Lagerplatz knapp: weniger freie Lagerzellen als ein Drittel der Sammlerinnen (min. 6)
  storageShort() {
    let foragers = 0; for (const b of this.bees) if (b.role === 'forager') foragers++;
    const want = Math.max(6, Math.ceil(foragers / 3));
    let free = 0;
    if (this.free) free = this.free.store.length + this.free.pollen.length;
    else for (const id of this.idx.empty) if (!this.reserved.has(id) && this.zone(id) !== 'brood' && ++free >= want) break;
    return free < want;
  },

  // [beeAgents] welche Ressource fliegen? Nahrungsnot zuerst, dann Wasser- und Pollenpuffer, sonst Nektar
  chooseResource() {
    const pop = Math.max(10, this.bees.length), c = this.commit;
    if (this.food() + c.nectar < pop * 20) return 'nectar';
    if (this.water + c.water < pop * 10) return 'water';
    if (this.tot.pollen + c.pollen < pop * 12) return 'pollen';
    return 'nectar';
  },

  // [beeAgents] Nektarlast und Suchzeit aus der Blütendichte (Ressourcen-Slider)
  loadFor(kind) { const r = this.params.resource / 100; return kind === 'nectar' ? Math.round(CFG.CELL_CAP * (0.6 + 0.4 * r)) : kind === 'pollen' ? CFG.LOAD_POLLEN : CFG.LOAD_WATER; },
  // [beeAgents]
  searchTicks() { return 1 + Math.min(12, Math.round((100 - this.params.resource) * 0.2)) + (this.weather.cloudy ? 2 : 0); },

  // [beeAgents] Sammlerin: Ressource wählen, Lagerplatz reservieren, Feld wählen, losfliegen
  planFlight(b) {
    if (this.weather.rain) return false;
    const first = this.chooseResource();
    for (const kind of [first, ...['nectar', 'pollen', 'water'].filter(k => k !== first)]) if (this.tryFlight(b, kind)) return true;
    return false;
  },

  // [beeAgents] Flug für eine Ressource versuchen: Lagerplatz und Feld mit verfügbarer Menge nötig
  tryFlight(b, kind) {
    const slot = this.storageCell(kind);
    if (slot === null) { this.preventedFlights++; return false; }
    let patch = null, avail = 0;
    if (kind === 'water') { patch = this.pond; avail = patch.water - (this.planned.get(patch.id + ':water') || 0); }
    else {
      let tot = 0; const opts = [];
      for (const p of this.patches) { const a = p[kind] - (this.planned.get(p.id + ':' + kind) || 0); if (a > 0) { opts.push([p, a]); tot += a; } }
      let x = this.rng.next() * tot;
      for (const [p, a] of opts) { x -= a; if (x <= 0) { patch = p; avail = a; break; } }
    }
    if (!patch || avail <= 0) return false;
    const expected = Math.min(this.loadFor(kind), Math.floor(avail));
    if (expected <= 0) return false;
    b.reserved = slot; if (slot >= 0) this.reserved.set(slot, b.id);
    b.want = kind; b.src = patch.id; b.expected = expected;
    this.commit[kind] += expected; this.planned.set(patch.id + ':' + kind, (this.planned.get(patch.id + ':' + kind) || 0) + expected);
    this.trips++;
    this.go(b, 'out', { kind: 'patch', id: patch.id }, this.wp(patch.u + this.rng.range(-35, 35), patch.v + this.rng.range(-25, 25), 'out'));
    return true;
  },

  // [beeAgents] Reservierung freigeben
  release(b) { if (b.reserved !== null && b.reserved >= 0) this.reserved.delete(b.reserved); b.reserved = null; b.want = null; b.src = null; b.expected = 0; },

  // [beeAgents] zur Einlagerung gehen (eigene Last, reservierte Zelle oder Tank am Flugloch)
  goStore(b) {
    const dest = b.reserved === -1 ? this.wp(this.entrance.x - 8, this.entrance.y + 14, 'hive') : this.cellDest(this.cells[b.reserved]);
    this.go(b, 'store', b.reserved === -1 ? { kind: 'tank' } : { kind: 'cell', id: b.reserved }, dest);
  },

  // [beeAgents] Ruhen: zufällige Zelle der eigenen Zone (Ammen im Brutnest, sonst außerhalb)
  rest(b, nearEntrance) {
    let c = null;
    for (let i = 0; i < 8 && !c; i++) {
      const id = this.rng.int(0, this.cells.length - 1), z = this.zone(id);
      if (nearEntrance ? this.cells[id].x > this.entrance.x * 0.55 : (b.role === 'nurse') === (z === 'brood')) c = this.cells[id];
    }
    c = c || this.cells[this.rng.int(0, this.cells.length - 1)];
    this.go(b, 'rest', { kind: 'cell', id: c.id }, this.cellDest(c), this.rng.int(2, 5));
  },

  // [beeAgents] Entscheidung einer untätigen Biene
  decide(b) {
    if (b.load.amount) { this.goStore(b); return; }
    if (b.role === 'forager') { if (!this.planFlight(b)) this.rest(b, true); return; }
    if (b.role === 'nurse') {
      let best = null, bs = -Infinity;
      for (const id of this.idx.larva) {
        if (this.nurseTargets.has(id)) continue;
        const c = this.cells[id], s = (this.tick - c.nursedAt) * 40 - Math.hypot(c.x - b.x, c.y - b.y);
        if (s > bs) { bs = s; best = c; }
      }
      if (best) { this.nurseTargets.add(best.id); this.go(b, 'nurse', { kind: 'cell', id: best.id }, this.cellDest(best), 2); return; }
      this.rest(b, false); return;
    }
    // Arbeiterin: (Bauen, wenn Lagerplatz fehlt) > Übergabe annehmen > Kühlen > Bauen > Fächeln > Ruhen
    const noStore = this.storageShortNow;
    const maxBuilders = Math.max(1, Math.ceil(this.bees.length / (noStore ? 10 : 45)));
    const startBuild = () => { this.builders++; const g = GRID.list[Math.min(this.cells.length, CFG.MAX_CELLS - 1)]; this.go(b, 'build', { kind: 'site', id: g.id }, this.wp(g.x, g.y, 'hive'), 2); };
    if (noStore && this.buildNeed && this.builders < maxBuilders) { startBuild(); return; }
    for (const fid of this.handoff) {
      if (this.claims.has(fid)) continue;
      const f = this.beeById.get(fid); if (!f || f.task !== 'handoff') continue;
      this.claims.set(fid, b.id);
      this.go(b, 'receive', { kind: 'bee', id: fid }, this.wp(this.entrance.x - 6, this.entrance.y + this.rng.range(-5, 5), 'hive'));
      return;
    }
    if (this.temperature > 35.8 && this.water > 0 && this.coolers < Math.ceil(this.bees.length * 0.08)) {
      this.coolers++; const c = this.cells[0];
      this.go(b, 'cool', { kind: 'cell', id: 0 }, this.cellDest(c), 3); return;
    }
    if (this.buildNeed && this.builders < maxBuilders) { startBuild(); return; }
    let best = null, bs = -Infinity;
    for (const id of this.idx.nectar) {
      if (this.fanTargets.has(id)) continue;
      const c = this.cells[id], s = c.fan * 10 + (this.tick - c.nectarAt) - Math.hypot(c.x - b.x, c.y - b.y) / 20;
      if (s > bs) { bs = s; best = c; }
    }
    if (best) { this.fanTargets.add(best.id); this.go(b, 'fan', { kind: 'cell', id: best.id }, this.cellDest(best), 3); return; }
    this.rest(b, false);
  },

  // [beeAgents] Arbeit vor Ort, ein Tick
  work(b) {
    const c = b.target.kind === 'cell' ? this.cells[b.target.id] : null;
    if (b.task === 'nurse' && c) {                     // Amme versorgt Zielzelle und angrenzende Larven
      for (const id of [c.id, ...c.nb]) { const l = this.cells[id]; if (l && l.state === 'larva') { l.nursedAt = this.tick; l.bee = b.id; this.nurseActions++; } }
    }
    else if (b.task === 'fan' && c) { this.fanCell(c, b.id); for (const id of c.nb) if (id < this.cells.length) this.fanCell(this.cells[id], b.id); this.fanActions++; }
    else if (b.task === 'cool') {
      if (this.consume('water', 2, 'Kühlung')) { this.temperature -= 0.025; for (const id of this.idx.egg) this.cells[id].temp -= 0.012; for (const id of this.idx.larva) this.cells[id].temp -= 0.012; for (const id of this.idx.pupa) this.cells[id].temp -= 0.012; }
    }
  },

  // [beeAgents] Ankunft am Pfadende
  arrive(b) {
    switch (b.task) {
      case 'out': b.task = 'gather'; b.timer = this.searchTicks(); return;
      case 'home':
        if (!b.load.amount) { this.release(b); b.task = 'idle'; return; }
        if (b.load.kind === 'nectar') { b.task = 'handoff'; b.wait = 0; b.target = { kind: 'entrance' }; this.handoff.push(b.id); }
        else this.goStore(b);
        return;
      case 'receive': {
        const fid = b.target.id, f = this.beeById.get(fid);
        this.claims.delete(fid);
        if (!f || f.dead || f.task !== 'handoff' || !f.load.amount) { b.task = 'idle'; return; }
        b.load = f.load; b.reserved = f.reserved; b.want = f.want; b.expected = f.expected;
        if (b.reserved !== null && b.reserved >= 0) this.reserved.set(b.reserved, b.id);   // Reservierung geht mit der Last über
        f.load = { kind: null, amount: 0 }; f.reserved = null; f.want = null; f.src = null; f.expected = 0; f.task = 'idle';
        this.handoff = this.handoff.filter(id => id !== fid);
        this.goStore(b); return;
      }
      case 'store': {
        if (b.load.amount) {
          this.deposit(b.reserved, b.load.kind, b.load.amount, b.id);
          this.flows.push({ kind: b.load.kind, from: this.wp(this.entrance.x, this.entrance.y, 'hive'), to: b.reserved >= 0 ? this.cellDest(this.cells[b.reserved]) : this.wp(this.entrance.x - 8, this.entrance.y + 14, 'hive'), born: this.tick });
        }
        b.load = { kind: null, amount: 0 }; this.release(b); b.task = 'idle'; return;
      }
      case 'build': b.timer = b.work; return;
      default: if (b.work) b.timer = b.work; else b.task = 'idle';
    }
  },

  // [beeAgents] Timer abgelaufen
  finish(b) {
    if (b.task === 'gather') {
      const p = b.want === 'water' ? this.pond : this.patches[b.src];
      const n = Math.min(b.expected, Math.floor(p[b.want]));
      p[b.want] -= n; this.ledger[b.want].collected += n;
      if (n) { this.success++; this.tripUnits += n; this.flows.push({ kind: b.want, from: this.wp(p.u, p.v, 'out'), to: this.wp(0, 0, 'out'), born: this.tick }); }
      b.load = { kind: n ? b.want : null, amount: n };
      this.go(b, 'home', { kind: 'entrance' }, this.wp(this.entrance.x - 6, this.entrance.y + this.rng.range(-6, 6), 'hive'));
      return;
    }
    if (b.task === 'build' && this.needsBuild()) { if (this.grow(6)) this.buildActions++; }
    b.task = 'idle';
  },

  // [beeAgents] Tod mit Verlustbeleg (S8) und Freigabe aller Bezüge
  die(b, cause) {
    if (b.dead) return;
    b.dead = true; this.dead++;
    this.deaths[cause] = (this.deaths[cause] || 0) + 1;
    if (b.load.amount) { this.ledger[b.load.kind].lost += b.load.amount; this.lossBook[b.load.kind] += b.load.amount; }
    this.release(b);
    this.handoff = this.handoff.filter(id => id !== b.id);
    for (const [fid, rid] of this.claims) {
      if (fid === b.id) { const r = this.beeById.get(rid); if (r && !r.dead && r.task === 'receive') { r.task = 'idle'; r.path = []; r.target = { kind: 'cell', id: 0 }; } this.claims.delete(fid); }
      else if (rid === b.id) this.claims.delete(fid);
    }
    this.beeById.delete(b.id);
    this.tickDeaths[cause] = (this.tickDeaths[cause] || 0) + 1;     // je Tick zusammengefasst ins Log
  },

  // [beeAgents] Energiehaushalt: Bedarf nach Tätigkeit, angesparte Reserve.
  // Gegessen wird aus dem Tick-Budget this.meal; gebucht wird gesammelt am Tickende (gleiches Ergebnis, 1 statt n Entnahmen).
  feed(b) {
    const flying = b.task === 'out' || b.task === 'gather' || b.task === 'home';
    const scarce = this.meal.avail < this.meal.pop * 5;
    let demand = flying ? 2.1 : b.task === 'fan' ? 1.35 : (b.task === 'rest' || b.task === 'idle' || b.task === 'handoff') ? 0.72 : 1.0;
    if (!flying && scarce) demand *= 0.72;
    b.metab += demand; let eat = Math.floor(b.metab); b.metab -= eat;
    const hungry = b.energy < b.energyMax;
    if (b.task === 'gather' && b.want !== 'water') {   // an der Blüte trinkt die Sammlerin selbst Nektar (gesammelt + verbraucht)
      const p = this.patches[b.src], take = Math.min(eat + (hungry ? 1 : 0), Math.floor(p.nectar));
      if (take > 0) { p.nectar -= take; this.ledger.nectar.collected += take; this.ledger.nectar.spent += take; }
      if (take >= eat) { if (hungry && take > eat) b.energy++; return; }
      eat -= take;
    }
    if (hungry && !scarce) eat++;
    if (eat <= this.meal.avail) { this.meal.avail -= eat; this.meal.eaten += eat; b.energy = Math.min(b.energyMax, b.energy + (hungry ? 1 : 0)); }
    else b.energy -= eat;
  },

  // [beeAgents] ein Tick für alle Bienen (rotierende Reihenfolge für Fairness)
  agentsStep() {
    this.assignRoles(); this.prep();
    const n = this.bees.length, off = n ? this.tick % n : 0, order = this.bees.slice(off).concat(this.bees.slice(0, off));
    const dRisk = Math.pow(this.params.disease / 100, 2) * 0.008;
    this.meal = { avail: this.food(), pop: this.bees.length, eaten: 0 };
    this.tickDeaths = {};
    for (const b of order) {
      if (b.dead) continue;
      b.age++;
      this.feed(b);
      if (b.energy <= 0) { this.die(b, 'Hunger'); continue; }
      if (this.rng.next() < dRisk) { this.die(b, b.space === 'out' ? 'Räuber/Krankheit' : 'Krankheit'); continue; }
      if (b.age >= b.life && (!b.load.amount || b.age >= b.life + 40)) { this.die(b, 'Alter'); continue; }
      if (b.task === 'handoff') {
        b.px = b.x; b.py = b.y; b.pspace = b.space;
        if (++b.wait >= CFG.HANDOFF) {                  // niemand kam: selbst einlagern, Abholerin freigeben
          this.handoff = this.handoff.filter(id => id !== b.id);
          const rid = this.claims.get(b.id), r = rid !== undefined && this.beeById.get(rid);
          if (r && r.task === 'receive') { r.task = 'idle'; r.path = []; r.target = { kind: 'cell', id: 0 }; }
          this.claims.delete(b.id); this.goStore(b);
        }
        continue;
      }
      const arrived = this.moveBee(b);
      if (b.timer > 0) { if (arrived) { this.work(b); if (--b.timer <= 0) this.finish(b); } continue; }
      if (arrived && b.task !== 'idle') this.arrive(b);
      if (b.task === 'idle') this.decide(b);
    }
    this.free = null;                                  // Listen gelten nur innerhalb dieses Ticks
    if (this.meal.eaten) this.consume('food', this.meal.eaten, 'Erwachsene');
    this.meal = null;
    const td = Object.entries(this.tickDeaths).filter(([c]) => c !== 'Alter');
    if (td.length) this.record('Gestorben: ' + td.map(([c, n]) => n + '× ' + c).join(', ') + '.');
    if (this.bees.some(b => b.dead)) this.bees = this.bees.filter(b => !b.dead);
    if (this.flows.length > 240) this.flows.splice(0, this.flows.length - 240);
  },
});
