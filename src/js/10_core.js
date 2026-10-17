'use strict';
/* Design decisions — Version 3 (Symbiose aus V1 „bienenstock-simulation“ und V2 „Wachs & Wandel“ Rev. 4)
1. Modell als Klasse statt globalem Zustand: Jede Colony ist eine unabhängige, seedgebundene
   Simulation. Abnahme, Eingriffstests und Fehlerinjektion laufen auf Wegwerf-Instanzen,
   ohne die sichtbare Simulation zu berühren. Alternative: ein globales S (V1) — nicht parallel prüfbar.
2. Zustandsindizes statt Vollsuchen: Jede Zelle wechselt ihren Zustand nur über setState(),
   das Mengen je Zustand (Set) und Vorratssummen mitführt. Agenten fragen „älteste Larve“,
   „Nektarzelle zum Fächeln“ oder „freie Lagerzelle“ in O(Treffer) statt O(1.200).
   Die Invarianten zählen trotzdem unabhängig aus den Zellen nach, nie aus diesen Summen.
3. Lagerplatz wird vor dem Abflug reserviert (aus V2): Jede Last hat bis zur Einlagerung eine
   feste Zielzelle. Ohne Platz wird gebaut oder nicht geflogen; nichts wird entsorgt.
4. Wiese mit mehreren Blütenfeldern (aus V1) statt drei abstrakter Quellen: Jedes Feld hat
   eigenen Nektar- und Pollenvorrat mit Blühphase. Die Summe des Nachwachsens folgt der
   Ressourcenformel aus V2, sodass der Ressourcen-Slider über den ganzen Bereich wirkt.
5. Zwei Koordinatenräume, am Flugloch verbunden (aus V1): Innen bewegen sich Bienen über die
   Wabe, außen über die Wiese. Die Wabenkamera darf zoomen, ohne Flugbahnen zu verzerren.

Mengengerüst (didaktische Modellannahmen, keine biologischen Messwerte; Grundlage V2 Rev. 4):
1 Tick = 0,1 Tage, 10 Ticks/s. Zelle max. 180 Einheiten. Nektarlast round(180*(0,6+0,4*r)),
Pollen- und Wasserlast 85, Suchzeit 2 + min(12, round((100-r%)*0,2)) Ticks (+2 bei Bewölkung).
Nachwachsen gesamt = Ziel*r^0,75*(3 Nektar; 0,55 Pollen); Tränke Ziel*0,5 Wasser je Tick.
Sammlerinnen trinken während der Suche an der Blüte Nektar (als gesammelt und verbraucht gebucht).
Erwachsene je Tick: 0,72 ruhend, 1,0 arbeitend, 1,35 fächelnd, 2,1 fliegend; Reserve 7..19.
Larve je Tick: 2 Nahrung, 1 Pollen, 1 Wasser und ein Ammenbesuch höchstens 4 Ticks zurück.
Entwicklung 30/60/120 Ticks bei 33..36 °C, sonst 55 % Tempo; 12 Ticks außerhalb 31..38 °C töten.
Fächeln: Zelle + 6 Nachbarn, 3 Feuchtepunkte je Tick, 60 -> 18 %, Honig erst nach >= 14
Fächelticks UND >= 14 Ticks seit Einlagerung UND unter 20 %. Lebensdauer 460..580 Ticks.
Krankheit Druck²*0,008/Tick für Bienen und Druck²*0,003/Tick je Brutzelle (V2: 0,0015 nur Bienen —
angehoben, damit der Stress-Test unterscheidet; bei 15 % Druck bleiben beide vernachlässigbar). Eierate = Ziel/500 + Pop*Druck²*0,001 + (Ziel-Pop)/260 (min. 0,02),
Zielbrut = Ziel*0,48 + (Ziel-Pop)*0,65. Start je Biene 28 Nahrung (im Vorlauf zu Honig gereift),
8 Pollen, 8 Wasser; 80 Startzellen. Sonnenphase 18+Stab*1,4+0..30 Ticks, Regen 5+(100-Stab)²*0,008+0..10.
*/

// [core] Konstanten
const CFG = Object.freeze({
  TPS: 10, DAY: 0.1, MAX_CELLS: 1200, START_CELLS: 80, CELL_CAP: 180, HEX: 10,
  EGG: 30, LARVA: 60, PUPA: 120, NURSE_GAP: 4,
  T_LOW: 31, T_HIGH: 38, T_OPT_LO: 33, T_OPT_HI: 36, THERMAL_LIMIT: 12, T_TARGET: 35,
  MOIST_IN: 60, MOIST_HONEY: 20, MOIST_MIN: 18, FAN_STEP: 3, FAN_MIN: 14,
  LIFE_MIN: 460, LIFE_MAX: 580, POP_MAX: 400, POP_MIN: 10,
  LOAD_POLLEN: 85, LOAD_WATER: 85, TANK: 12000, BUILD_COST: 3, HANDOFF: 6,
  WAIT_LIMIT: 100, HISTORY: 300, CHAIN: 50, STRESS: 300,
  SPEED_IN: 60, SPEED_OUT: 200,
});
const DEFAULTS = Object.freeze({ colony: 150, resource: 70, stability: 70, disease: 15 });
const KEYS = ['nectar', 'pollen', 'water'];
const ROLES = { forager: 'Sammlerin', nurse: 'Brutpflege', worker: 'Arbeiterin' };
const LABELS = { empty: 'Leer', egg: 'Ei', larva: 'Larve', pupa: 'Puppe', pollen: 'Pollen', nectar: 'Nektar', honey: 'Honig' };
const BROOD = new Set(['egg', 'larva', 'pupa']);

// [core] deterministischer Zufall (mulberry32); identisch in Browser und Node
class Random {
  // [core]
  constructor(seed) { this.state = Number(seed) >>> 0; }
  // [core]
  next() {
    let t = this.state = (this.state + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // [core]
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  // [core]
  range(a, b) { return a + (b - a) * this.next(); }
}

// [core]
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
// [core] Zahlformat deutsch
function fmt(v, d = 0) { return Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); }

// [hexGrid] Spiralreihenfolge axialer Koordinaten, Ring für Ring; Index = Wachstumsreihenfolge
function buildGrid() {
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const cells = [[0, 0, 0]];
  for (let k = 1; cells.length < CFG.MAX_CELLS; k++) {
    let q = -k, r = k;                          // Start bei Richtung 4 × k
    for (let d = 0; d < 6; d++) for (let i = 0; i < k; i++) { cells.push([q, r, k]); q += dirs[d][0]; r += dirs[d][1]; }
  }
  const list = cells.slice(0, CFG.MAX_CELLS).map(([q, r, ring], id) => ({
    id, q, r, ring, x: CFG.HEX * Math.sqrt(3) * (q + r / 2), y: CFG.HEX * 1.5 * r }));
  const index = new Map(list.map(c => [c.q + ',' + c.r, c.id]));
  for (const c of list) c.nb = dirs.map(([dq, dr]) => index.get((c.q + dq) + ',' + (c.r + dr))).filter(id => id !== undefined);
  return { list, index };
}
const GRID = buildGrid();

// [hexGrid] Zone einer Zelle aus Index, Gittergröße und Zielpopulation (Brutnest innen, Pollenkranz, Lager)
function zoneOf(id, nCells, target) {
  const inner = Math.min(Math.max(37, Math.round(target * 0.68)), Math.floor(nCells * 0.47));
  const ring = Math.max(12, Math.min(Math.round(target * 0.18), Math.floor(nCells * 0.20)));
  return id < inner ? 'brood' : id < inner + ring ? 'pollen' : 'store';
}
