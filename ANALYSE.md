# Analyse und Abnahme — Lösungen zu Prompt #24

## Version 3 (17.10.2026) — Symbiose aus V1 und V2

Neu gebaut aus lesbaren Quellmodulen (`src/`). Das Modell folgt den Regeln von V2 Rev. 4, mit Indexstrukturen statt
Vollsuchen, Wiese und Darstellung aus V1. Alle Werte sind gemessen (Chrome headless, `file://`).

### Eingebaute Abnahme (Modellkennung `cb3cb106`, Rechenzeit 3,3 s)

| Kriterium aus #24 | Ergebnis |
|---|---|
| Lebensfähigkeit: ≥ 18/20 Seeds über 150 Tage, Ø ±30 % um das Ziel | 20/20, Ø 141,7 (Ziel 150), max 185; 0 Invariantenfehler |
| Ressourcen 0 % → Kollaps | 20/20 kollabiert |
| Wetterstabilität 10 % → Mehrheit kollabiert | 20/20 kollabiert |
| Stress-Test unterscheidet | 11 überleben, 9 kollabieren (Start gestaffelt an Tag 5/10/15/20/25, siehe unten) |
| Fehlerinjektion S1, S2, S3, S4, S7, S8 (zweifach) | 7/7 genau erkannt, nach Reset sauber |
| Reproduzierbarkeit | gleicher Seed → identischer Verlauf |
| Lesbarkeit ≥ 1.000 belegte Zellen, echter Lauf | 1.130 (Ziel 400, Ressourcen 100 %) |
| Ressourcenantwort | 20 % → 0 · 40 % → 5.805 · 60 % → 86.525 · 80 % → 145.989 · 100 % → 164.781 (monoton) |
| Eingriffstests | ohne Ammen 16 Pflegeverluste (normal 0); ohne Fächeln 0 Honig (normal 77); 43 °C → 41 Brutverluste |
| Quellenbilanz | gesammelt = Abnahme an Blüten + Tränke + Startbestand, exakt |
| S5 Takt (Browser) | erste sichtbare Sekunde bei 1×: 10 Ticks, 61 Frames |
| Pause | Canvas steht pixelgenau still (1 Bild über 1,2 s) |
| Layout | 16/16 Anzeigen größenstabil bei 1600 und 390 px, kein horizontaler Überlauf |

### Vergleich V1 · V2 · V3 (identische Messreihe)

| | V1 | V2 Rev. 4 | V3 |
|---|---|---|---|
| ms/Tick, Ziel 150 | 0,076 | 1,033 | **0,061** |
| ms/Tick, Ziel 400 | **0,084** (erreicht ~157 Bienen) | 2,572 | 0,105 (erreicht ~320 Bienen) |
| Standard 20 Seeds | 20/20, Ø 163 | 20/20, Ø 147 | 20/20, Ø 142 |
| Ressourcen 20/40/70/100 % (3 Seeds) | 3 · 3 · 3 · 3 | 0 · 3 · 3 · 3 | 0 · 3 · 3 · 3 |
| Stress, Start Tag 5–25 | 4 ü / 16 K | 5 ü / 15 K | 11 ü / 9 K |
| 12 Zufallsläufe | 0 Exceptions, 0 Fehler | 0 / 0 | 0 / 0 |
| Kollaps / S5 nach Wortlaut #24 | ja / ja | nein / nein | **ja / ja** |

V3 ist nicht in jeder Zeile vorn: Bei Ziel 400 rechnet V1 pro Tick schneller, simuliert aber nur rund halb so viele
Bienen, weil seine Wiese das Volk begrenzt. Das großzügigere Überleben von V1 bei 20 % Ressourcen ist eine Modellwahl.

### Während des Baus gefundene Fehler (alle durch Invarianten oder Messung, behoben)

- S8: Bei der Übergabe ging die Last, aber nicht die Reservierung auf die Stockbiene über.
- S4 (zweimal): Eine Abholerin behielt ein Ziel auf eine verstorbene Sammlerin.
- S2-Fehlalarm: Die Honig-Wache zählte verfrühte Versuche als Verstoß.
- S3-Fehlalarm: Die Prüfung lief vor dem Auffrischen der Anzeige.
- Baubedarf wurde nie erkannt („keine freie Zelle“ trat praktisch nie ein) → Sammlerinnen warteten 45 % der Zeit.
- Startverhungern bei 40 %: Flugkosten aus dem Stock während langer Suche → Sammlerinnen trinken an der Blüte.
- Pause: Kamera driftete subpixelweise → in der Pause eingefroren.

### Bewusste Abweichungen (in der App unter „Ausbaustufen“ ausgewiesen)

- Königin implizit, Wasser in einem Tank statt in Zellen.
- Eine Amme versorgt bei ihrem Besuch auch die Larven der Nachbarzellen.
- Krankheitswirkung stärker als in V2 (Bienen Druck²·0,008, Brut Druck²·0,003 je Tick); bei 15 % Druck vernachlässigbar.
- Stress-Abnahme mit gestaffeltem Start: Bei einheitlichem Start an Tag 20 überleben alle 20 Völker, weil die effizientere Ernte
  ähnliche Reserven aufbaut; bei Start an Tag 5–15 kollabiert die Mehrheit. Der Test unterscheidet nach dem Zustand des Volkes.
- Erste sichtbare Sekunde bei 1× (Taktprüfung S5 wörtlich), danach Zeitlupe.

---

# Analyse V2 (Fremdlösung, Revisionen 2–4)

Geprüft wurde `index.html` in drei Ständen, jeweils in Headless-Chrome über die eingebaute
Testschnittstelle `window.BeeLab` und mit **eigenen** Zählern. Die eingebaute Abnahme der Seite allein
gilt nicht als Beleg. An der Datei selbst wurde bei der Analyse nichts verändert.

| Stand | Zeit (17.10.2026) | Größe | sha256 (Anfang) |
|---|---|---|---|
| Revision 2 | 04:44 | 549.432 B | `0F3B57C2…` |
| Revision 3 | 11:18 | 141.835 B | `7CCF1532…` |
| **Revision 4 (dieser Stand)** | 13:32 | 155.794 B | `B7075A09…` |

## Ergebnis Revision 4

**Technisch auf sehr hohem Niveau, Abnahme bestanden.** Zwei bewusste Abweichungen vom Wortlaut des
Prompts sind offen ausgewiesen (siehe unten).

### Gemessen

| Prüfung | Ergebnis |
|---|---|
| Startcheck | 9/9 Invarianten PASS, 0 Konsolenfehler |
| Eingebaute Abnahme, frisch gerechnet | PASS; **in allen Feldern identisch** mit dem in der Datei gespeicherten Bericht (der Bericht ist ehrlich, nicht bloß behauptet) |
| Standard (20 Seeds × 150 Tage) | 20/20 überleben, Ø Population 147, max. 183, 0 Invariantenfehler |
| Gegenprobe S1 Bilanz | gesammelt = Abnahme aus den Quellen + Startbestand, einheitengenau (3 Seeds) |
| Gegenprobe S2 Honigherkunft | ca. 3.170 Übergänge zu Honig verfolgt, 0 ohne Nektarphase ≥ 14 Ticks |
| Robustheit | 24 Zufallsläufe mit Sliderwechseln und Stress-Test im Lauf: 0 Exceptions, 0 Invariantenfehler |
| Eingriffstests | ohne Ammen 29 tote Larven; ohne Fächeln 0 neuer Honig; bei 43 °C 38 Brutverluste |
| Tempo | Start ¼× = 2,5 Ticks/s; 1× = 10/s; 2× = 20/s |
| Pause | Tick steht, Canvas ändert sich um kein Pixel |
| Layout | 13/13 Anzeigen bleiben bei 1600 px und 390 px über Zahlen- und Sliderwechsel exakt gleich groß |

### Ressourcen-Slider (5 Seeds je Stufe, 150 Tage)

| Ressourcen | 0 % | 10 % | 20 % | 30 % | 40 % | 50 % | 70 % | 100 % |
|---|---|---|---|---|---|---|---|---|
| überleben | 0/5 | 0/5 | 0/5 | 3/5 | 4/5 | 5/5 | 5/5 | 5/5 |
| Ø Endhonig | 0 | 0 | 0 | 8.639 | 32.682 | 72.852 | 128.841 | 159.470 |

Wirkt über den ganzen Bereich monoton (in Revision 2 eine Kippkante bei 42 %, in Revision 3 ab 40 % ohne Wirkung).

### Koloniegrößen (3 Seeds je Stufe)

| Ziel | 30 | 80 | 250 | 400 |
|---|---|---|---|---|
| überleben | 3/3 | 3/3 | 3/3 | 3/3 |
| Ø Population | 31 | 82 | 239 | 316 |

### Offene Punkte und Abweichungen vom Prompt

1. **S5 Takt umdefiniert.** Der Prompt verlangt „> 5 Ticks in der ersten Sekunde“. Die Lösung prüft
   „10 × Tempo ± 40 %“ und startet in ¼×-Zeitlupe: Sie misst 2 Ticks und meldet trotzdem PASS.
   Nach dem Wortlaut von #24 ist das ein Fail. Empfehlung: S5 einmal bei 1× messen oder die Abweichung im Status-Bereich ausweisen.
2. **Kollaps-Bedingung geändert:** „Brut 0 und **keine Nahrung** (Nektar oder Honig)“ statt „Brut 0 bei
   leerem **Honig**vorrat“. Sachlich sinnvoll und im Design-Abschnitt begründet, aber eine Abweichung von einer ausdrücklichen Vorgabe.
3. **Stress-Test fast immer tödlich:** 2 von 20 Seeds überleben (Revision 3: 18 von 20). Er unterscheidet
   damit noch, wie es der Prompt verlangt, liegt aber am Rand.
4. Bei hohen Ressourcen besteht die Wabe zu ~86 % aus Honigzellen (1.200 Zellen, Kapazität 180 je Zelle).
5. Kleinigkeiten:
   - Der Zähler `discarded` wird nie erhöht; der Teil „kein Wegwerfen“ von S8 ist damit leer, der Reservierungsteil von S8 prüft echt.
   - Der Freitext „Browserabnahme 1440/390 px“ ist eingetragen, nicht gemessen; Takt und 390 px wurden hier separat gemessen.
   - Start mit 94 statt ~80 Zellen, begründet.

## Änderung nach der Abnahme (17.10.2026)

Tempo-Bedienung getrennt: drei Buttons **¼× · 1× · 2×**, die ihr Tempo setzen statt umzuschalten,
genau einer aktiv, auf schmalen Bildschirmen in einer Zeile. Reine UI-Änderung (`actions`, `uiProbe`,
`syncControls`, Toolbar, CSS). Die Modellkennung bleibt `ece34155`, der gespeicherte Abnahmebericht gilt weiter.
Nachgemessen bei 1600 und 390 px: 9/9 Invarianten, S6 mit 8 Aktionen, 2,5 / 10 / 20 Ticks/s,
bei 1× misst S5 10 Ticks, kein horizontaler Überlauf.

## Verlauf der Befunde

| Befund | Rev. 2 | Rev. 3 | Rev. 4 |
|---|---|---|---|
| Nektar weggeworfen | ~30 % („Lagerüberlauf“) | 0 | 0 |
| Population hart bei Zielgröße gedeckelt | ja (max. 150) | nein (max. 180) | nein (max. 183) |
| Ressourcen-Slider | Kippkante 40/45 % | ab 40 % wirkungslos | monoton 0–100 % |
| Wabenwachstum im echten Lauf | nein (~296 Zellen) | ja (800–990) | ja (bis 1.200) |
| Temperatur wirkt auf Brut / Layer echt | nein / Attrappe | ja / ja | ja / ja |
| Ammen und Fächeln vor Ort | nein | ja | ja |
| Honig-Anzeige zeigt anfangs 0 | — | ja | behoben (Nahrung gesamt) |
| S5 nach Wortlaut des Prompts | ja | ja | **nein** (Zeitlupe) |
| Kollaps-Bedingung nach Wortlaut | ja | ja | **nein** (Nahrung statt Honig) |

Hinweis zum Ablauf: Zu Revision 4 waren drei Änderungen angekündigt, die Datei enthielt deutlich mehr
Modelländerungen (Kollaps-Bedingung, S5, Zellkapazität 90 → 180, Ressourcenantwort, Startzellen).
