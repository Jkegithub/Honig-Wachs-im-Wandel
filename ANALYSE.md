# Analyse und Abnahme — Lösung zu Prompt #24

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
