Object.assign(Colony.prototype, {
  // [broodCycle] Brutzelle mit Entwicklungsalter anlegen (Start und Eiablage)
  seedBrood(c, age) {
    const st = age < CFG.EGG ? 'egg' : age < CFG.EGG + CFG.LARVA ? 'larva' : 'pupa';
    this.setState(c, st);
    c.dev = st === 'egg' ? age : st === 'larva' ? age - CFG.EGG : age - CFG.EGG - CFG.LARVA;
    c.nursedAt = this.tick; c.bee = null; c.thermal = 0;
  },

  // [broodCycle] Brut stirbt mit Ursache
  killBrood(c, cause, failed) {
    this.broodDeaths[cause] = (this.broodDeaths[cause] || 0) + 1;
    failed.push('#' + c.id + ' (' + cause + ')');
    this.setState(c, 'empty');
  },

  // [broodCycle] ein Tick Brut: Temperatur, Pflege, Futter, Entwicklung, Schlupf, Eiablage
  broodStep() {
    const failed = [], d = this.params.disease / 100, broodRisk = d * d * 0.003;   // Brutkrankheit (bei 15 % vernachlässigbar)
    for (const st of ['egg', 'larva', 'pupa']) {
      for (const id of [...this.idx[st]]) {
        const c = this.cells[id];
        if (broodRisk && this.rng.next() < broodRisk) { this.killBrood(c, 'Krankheit', failed); continue; }
        c.thermal = (c.temp < CFG.T_LOW || c.temp > CFG.T_HIGH) ? c.thermal + 1 : Math.max(0, c.thermal - 1);
        if (c.thermal >= CFG.THERMAL_LIMIT) { this.killBrood(c, 'Temperatur', failed); continue; }
        if (st === 'larva') {
          if (this.tick - c.nursedAt > CFG.NURSE_GAP) { this.killBrood(c, 'keine Brutpflege', failed); continue; }
          const lack = [];
          if (this.food() < 2) lack.push('Nahrung');
          if (this.tot.pollen < 1) lack.push('Pollen');
          if (this.water < 1) lack.push('Wasser');
          if (lack.length) { this.killBrood(c, lack.join('/') + ' fehlte', failed); continue; }
          this.consume('food', 2, 'Larve'); this.consume('pollen', 1, 'Larve'); this.consume('water', 1, 'Larve');
        }
        c.dev += (c.temp >= CFG.T_OPT_LO && c.temp <= CFG.T_OPT_HI) ? 1 : 0.55;
        if (st === 'egg' && c.dev >= CFG.EGG) { this.setState(c, 'larva'); c.dev = 0; c.nursedAt = this.tick; }
        else if (st === 'larva' && c.dev >= CFG.LARVA) { this.setState(c, 'pupa'); c.dev = 0; }
        else if (st === 'pupa' && c.dev >= CFG.PUPA) {
          if (this.bees.length < CFG.POP_MAX) { const b = this.addBee(0); b.x = c.x; b.y = c.y; this.born++; this.setState(c, 'empty'); }
          else c.dev = CFG.PUPA;                      // wartet auf freien Platz unter der Obergrenze 400
        }
      }
    }
    if (failed.length) this.record('Brutausfall: ' + failed.slice(0, 6).join(', ') + (failed.length > 6 ? ' … (' + failed.length + ')' : ''));
    this.layEggs();
  },

  // [broodCycle] implizite Königin: Eierate aus Zielgröße, Sterblichkeit und Abweichung
  layEggs() {
    const target = this.params.colony, pop = this.bees.length, d = this.params.disease / 100;
    const brood = this.idx.egg.size + this.idx.larva.size + this.idx.pupa.size;
    const desired = Math.max(0, target * 0.48 + (target - pop) * 0.65);
    const rate = Math.max(0.02, target / 500 + pop * d * d * 0.001 + (target - pop) / 260);
    this.eggCredit = Math.min(2, this.eggCredit + rate);
    // Königin legt nur, solange die Ammen die Brut schaffen (je Amme bis zu 2 Eier + Larven)
    let nurses = 0; for (const b of this.bees) if (b.role === 'nurse') nurses++;
    if (this.idx.egg.size + this.idx.larva.size >= nurses * 2) return;
    if (brood >= desired || pop >= CFG.POP_MAX || pop < CFG.POP_MIN || this.food() <= pop * 3 || this.tot.pollen <= pop) return;
    let laid = brood;
    for (const id of this.idx.empty) {
      if (this.eggCredit < 1 || laid >= desired) break;
      if (this.reserved.has(id) || this.zone(id) !== 'brood') continue;
      this.seedBrood(this.cells[id], 0); this.eggCredit--; laid++;
    }
  },
});
