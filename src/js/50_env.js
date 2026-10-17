Object.assign(Colony.prototype, {
  // [environment] Wiese: vier Blütenfelder (Nektar + Pollen) und eine Tränke; Koordinaten ab Flugloch
  initEnvironment() {
    this.weather = { rain: false, cloudy: false, left: this.rng.int(45, 100) };
    const defs = [
      { name: 'Linde', u: 380, v: -250, w: 0.32, pw: 0.20, phase: 0.00, hue: 48 },
      { name: 'Weißklee', u: 640, v: -60, w: 0.20, pw: 0.30, phase: 0.30, hue: 0 },
      { name: 'Raps', u: 440, v: 190, w: 0.33, pw: 0.25, phase: 0.55, hue: 55 },
      { name: 'Wildblumen', u: 760, v: 250, w: 0.15, pw: 0.25, phase: 0.80, hue: 300 },
    ];
    this.patches = defs.map((d, id) => ({ id, ...d, nectar: 0, pollen: 0, capN: 0, capP: 0 }));
    this.pond = { id: 'pond', name: 'Tränke', u: 220, v: 270, water: 0, cap: 0 };
    this.updateSourceCaps();
    const r = this.params.resource / 100;
    for (const p of this.patches) { p.nectar = Math.round(p.capN * r); p.pollen = Math.round(p.capP * r); }
    this.pond.water = this.pond.cap;
  },

  // [environment] Kapazitäten der Quellen folgen der Zielpopulation (Nektar 60, Pollen 24, Wasser 24 je Ziel-Biene)
  updateSourceCaps() {
    const t = this.params.colony;
    for (const p of this.patches) { p.capN = Math.round(t * 60 * p.w); p.capP = Math.round(t * 24 * p.pw); }
    this.pond.cap = Math.round(t * 24);
  },

  // [environment] Blühfaktor eines Feldes (0,6..1,4, Mittel 1)
  bloom(p) { return 1 + 0.4 * Math.sin(2 * Math.PI * (this.tick * CFG.DAY / 40 + p.phase)); },

  // [environment] ein Tick Umwelt: Wetterphasen, Nachwachsen, Temperatur
  envStep() {
    const st = this.params.stability, r = this.params.resource / 100, t = this.params.colony, W = this.weather;
    if (--W.left <= 0) {
      W.rain = !W.rain;
      W.left = W.rain ? Math.round(5 + Math.pow(100 - st, 2) * 0.008) + this.rng.int(0, 10) : Math.round(18 + st * 1.4) + this.rng.int(0, 30);
      W.cloudy = !W.rain && this.rng.next() < 0.45 - 0.25 * st / 100;
      this.record(W.rain ? 'Regen beginnt — Sammelflüge ruhen.' : W.cloudy ? 'Bewölkt — längere Suchzeiten.' : 'Sonne — Sammelwetter.');
    }
    this.updateSourceCaps();
    const rf = Math.pow(r, 0.75), regenN = t * rf * 3, regenP = t * rf * 0.55;     // r^0,75: Knappheit wirkt stärker als bei √r
    const bl = this.patches.map(p => this.bloom(p));
    let wsum = 0, psum = 0;
    this.patches.forEach((p, i) => { wsum += p.w * bl[i]; psum += p.pw * bl[i]; });
    this.patches.forEach((p, i) => {
      p.nectar = Math.min(p.capN, p.nectar + regenN * p.w * bl[i] / wsum);
      p.pollen = Math.min(p.capP, p.pollen + regenP * p.pw * bl[i] / psum);
    });
    this.pond.water = Math.min(this.pond.cap, this.pond.water + t * 0.5);
    // Temperatur: Außenluft, Angleichung, bezahltes Heizen, Zelltemperaturen
    this.ambient = 28 + 12 * Math.sin(this.tick / 100) + (W.rain ? -5 : 0);
    this.temperature += (this.ambient - this.temperature) * 0.012;
    const pop = this.bees.length;
    if (this.temperature < CFG.T_TARGET && pop >= CFG.POP_MIN && this.consume('food', Math.max(1, Math.round((CFG.T_TARGET - this.temperature) * pop * 0.02)), 'Heizen'))
      this.temperature += Math.min(0.4 * Math.min(1, pop / Math.max(10, t)), (CFG.T_TARGET - this.temperature) * 0.25);
    const inner = Math.min(Math.max(37, Math.round(t * 0.68)), Math.floor(this.cells.length * 0.47));   // Brutzone wie zoneOf()
    const tIn = this.temperature, tOut = this.temperature + (this.ambient - this.temperature) * 0.25;
    for (const c of this.cells) c.temp += ((c.id < inner ? tIn : tOut) - c.temp) * 0.18;
  },
});
