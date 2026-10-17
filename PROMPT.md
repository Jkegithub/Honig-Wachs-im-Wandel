# Aufgabenbeschreibung — Prompt #24 „Bienenstock-Simulation (Version 2)“

| | |
|---|---|
| Quelle | Prompt-Sammlung `999_PROMPT_Tests`, Datei `24-bienenstock-simulation-version-2.md` (lokal versioniert, Commit `42210a5`, 17.10.2026) |
| Prüfsumme | sha256 des `text`-Blocks: `f3110a574846c7ed2aa1cc348b891497679ed8d6c8ae01a9ba9ab023263bb3c6` (104 Zeilen, 11.109 Bytes, UTF-8, LF) |
| Herkunft | Abgeleitet aus Prompt #1 und dem Bau [`bienenstock-simulation`](https://github.com/Jkegithub/bienenstock-simulation). Enthält #1 vollständig, ergänzt um die dort gemessenen Lücken |
| Verwendung | Diese Simulation (`index.html`) ist eine Lösung zu genau diesem Prompt. Abnahme und Befunde: [`ANALYSE.md`](ANALYSE.md) |

Der Prompt steht unten **unverändert**. Nur der Text zwischen den `text`-Zäunen ist die Eingabe.

```text
# ROLLE
Du baust interaktive Simulationen als Single-File-Web-Apps. Deine Stärke ist, dass die Systemlogik unter der Oberfläche wirklich stimmt — nicht nur die Optik. Du belegst das mit Messungen, nicht mit Behauptungen.

# AUFGABE
Erstelle eine interaktive Simulation eines Bienenstocks als **eine** eigenständige HTML-Datei (HTML + CSS + JS inline, keine Frameworks, keine Dateien außer dieser einen, muss per Doppelklick aus `file://` laufen). Oberfläche auf Deutsch.

# SCHRITT 0 — MODULPLAN (vor dem Code)
Schreibe als Kommentarblock am Dateikopf eine Modulliste (6–10 Module, je ein Satz Zweck + Datenbesitz), z. B. `hexGrid`, `resourcePool`, `broodCycle`, `beeAgents`, `environment`, `renderer`, `ui`, `selfCheck`. Jede Funktion im Code gehört genau einem Modul und trägt den Modulnamen im Kommentar. Grund: Ein Bienenstock hat viele gekoppelte Subsysteme — ohne vorher gezogene Grenzen vermischen sich Zustand und Rendering und die Ressourcenbilanz wird unhaltbar.

# TECHNISCHE ECKDATEN (nicht abweichen ohne Begründung im Design-Abschnitt)
- Rendering: **ein** `<canvas>` 2D für Waben, Bienen und Außengelände. HTML/CSS nur für UI-Panels. Grund: Bei mehreren hundert Agenten bricht DOM-Rendering ein.
- Simulationstakt: fixe Logik-Ticks mit **10 Ticks/s**, entkoppelt vom Render-Loop (`requestAnimationFrame`, Ziel 60 fps). Speed-Button verdoppelt nur die Ticks, nie die Framerate.
- Zeitskala: **1 Tick = 0,1 Simulationstag** → 1 Sim-Tag pro Sekunde bei Normalgeschwindigkeit.
- Größen: Wabengitter startet bei ~80 Zellen und wächst auf max. 1.200. Population 30–400 Bienen (Slider). Bei Erreichen der Obergrenze: kein Wachstum, Meldung im Stats-Panel.
- **Reproduzierbarkeit:** Aller Zufall kommt aus einem Generator mit Seed. Der Seed wird angezeigt; Reset wählt einen neuen. Gleicher Seed + gleiche Eingaben = gleicher Verlauf.
- **Testschnittstelle:** Die Simulation lässt sich ohne Rendering um n Ticks vorspulen und mit Seed und Parametern neu anlegen (z. B. über ein globales Objekt). Die Abnahme unten benutzt das.

# SYSTEMLOGIK
**Zellzustände:** leer | Ei | Larve | Puppe | Pollen | Nektar (mit Wassergehalt) | Honig (gedeckelt)

**Wabenordnung:** Brutnest in der Mitte, Pollenkranz darum, Honig außen. Diese Ordnung bleibt erkennbar, auch wenn die Wabe wächst. Das Brutnest ist groß genug für die eingestellte Koloniegröße.

**Ressourcen — drei getrennte Pools mit unterschiedlicher Verwendung:**
- **Nektar** → einzige Vorstufe von Honig; erwachsene Bienen ernähren sich davon
- **Pollen** → Proteinanteil im Larvenfutter, wird *nicht* zu Honig und ernährt keine erwachsenen Bienen
- **Wasser** → Stockkühlung ab ca. 36 °C und Verdünnung des Larvenfutters

Jede Einheit ist verbucht, auch Lasten von Bienen, die sterben oder abgegeben werden.

**Honig-Prozesskette (nur so darf Honig entstehen):**
1. Sammlerin fliegt zur Blütenquelle und lädt Nektar
2. Rückflug zum Eingang, Übergabe an eine Stockbiene
3. Einlagerung in eine Zelle als Nektar mit ~60 % Wassergehalt
4. Fächeln senkt den Wassergehalt der Zelle über mehrere Ticks
5. Erst unter 20 % Wassergehalt wird die Zelle zu Honig und gedeckelt

Eine Zelle darf niemals in den Zustand Honig springen, ohne Schritt 3 und 4 durchlaufen zu haben. Das ist die zentrale Korrektheitsanforderung des Modells.

**Brutzyklus (Ticks bei Normalgeschwindigkeit):** Ei 30 → Larve 60 → Puppe 120 → erwachsene Biene. Larven brauchen in jedem Tick Pollen und Nektar; bei Unterversorgung stirbt die Brut (kein stiller Stopp — im Log vermerken, mit Grund und betroffenen Zellen).

**Rollen:** Sammlerin (außen), Brutpflege (Brutbereich), Arbeiterin (Einlagern, Fächeln, Bauen). Rollenwechsel altersabhängig; die Altersgrenzen dürfen sich nach dem Bedarf des Volks verschieben. Jede Biene bewegt sich auf einem sichtbaren Pfad zwischen Eingang, Brutbereich, Honigspeicher und Nahrungsquelle.

**Umweltfaktoren:** Wetter (beeinflusst Sammelflüge), Blütenverfügbarkeit, Stocktemperatur (Ziel 35 °C im Brutbereich), Räuber-/Krankheitsdruck (erhöht Sterblichkeit).
**Wetterstabilität** heißt: Je höher, desto länger halten gute Wetterphasen und desto **kürzer** sind Regenphasen. Sie verlängert nicht jedes Wetter gleichermaßen.

**Mengengerüst:** Lasten, Futterbedarf, Nachwachsen der Blüten und Lebensdauer sind so bemessen, dass ein Volk mit Standardeinstellungen lebensfähig ist (siehe Abnahme). Die Zahlen und ihre Herleitung stehen im Design-Abschnitt.

**Stillstandsfreiheit:** Keine Biene wartet unbegrenzt. Sind Zellen voll, reagiert das Volk (Bauen, weniger Sammelflüge). Ein volles Lager darf das Brutnest nicht dauerhaft verstopfen.

**Fail-State:** Sinkt die Population unter 10 oder die Brut auf 0 bei leerem Honigvorrat, gilt die Kolonie als kollabiert: Simulation anhalten und einen Kollapsbericht zeigen mit
- der Ursachenkette der letzten 50 Ticks, zeitlich geordnet,
- der **Vorgeschichte der letzten 30 Sim-Tage** als Kurve (mindestens Bienen, Vorrat, Brut, Regenphasen) mit Kennzahlen (Höchststände, seit wann der Vorrat leer ist, Regentage und längste Regenserie, Zufluss und Verbrauch je Tag),
- den Slider-Einstellungen und ob sie im Zeitraum verändert wurden.
Grund: 50 Ticks zeigen nur das Ende. Ob ein Kollaps Modellfehler oder Pech ist, sieht man erst an der Vorgeschichte.

# STEUERUNG
- Slider: Koloniegröße (30–400), Ressourcenverfügbarkeit (0–100 %), Wetterstabilität (0–100 %), Krankheitsdruck (0–100 %) — alle wirken live ohne Reset
- Buttons: Pause, 2× Geschwindigkeit, Reset
- Button **Stress-Test** mit definiertem Effekt: Wetterstabilität 10 %, Blütenverfügbarkeit 10 %, Krankheitsdruck 80 % für 30 Sim-Tage, danach Ergebnisreport (überlebt / kollabiert, Honigverlust, Sterblichkeit). Während des Tests sind die betroffenen Slider sichtbar gesperrt, danach zurückgestellt.
- Layer-Toggles: Bienenpfade, Temperaturzonen, Ressourcenflüsse
- Stats-Panel: Population (nach Rolle), Brut (nach Phase), Honigvorrat, Sammel-Effizienz, Sterblichkeit
- Klick auf eine Zelle öffnet einen Inspektor: Zustand, Füllgrad, Wassergehalt, Alter des Inhalts, zuständige Biene. Die Angaben passen zum aktuellen Inhalt — eine geleerte Zelle nennt keine Biene des alten Inhalts.
- Vorräte der Nahrungsquellen sind im Außengelände sichtbar und **beschriftet** (welche Ressource, wie voll).
- **Berichte und Modals** schließen nur über einen Button, nicht durch einen Klick daneben oder einen Fensterwechsel. Ein geschlossener Kollaps- oder Stress-Bericht lässt sich wieder öffnen.

# AUSBAUSTUFEN (Priorisierung bei Konflikt)
1. **Kern:** wachsendes Hex-Gitter, Zellzustände, drei Ressourcen mit Bilanz, Honigkette, Brutzyklus, Rollen mit Pfaden, Tick-Loop mit Pause/2×/Reset, Stats, Zell-Inspektor, Seed + Testschnittstelle
2. **Aufbau:** Umweltfaktoren, Slider, Stress-Test, Fail-State mit Kollapsbericht, Lebensfähigkeit
3. **Zuletzt:** Layer-Toggles, visuelle Feinheiten

Regel: Eine niedrigere Stufe geht immer vor. Wenn du eine Anforderung nicht sauber fertigstellen kannst, lass sie weg und schreib das in den Status-Bereich — halb implementierte Features sind schlechter als fehlende, weil sie korrekte Logik vorspiegeln.

<visuelle_richtung>
Verlass dich nicht auf Default-Ästhetik — sie erzeugt erkennbar generische Ergebnisse. Konkret:
- Typografie: charaktervolle Schrift, keine System-Fonts, kein Inter/Roboto/Arial. Da keine externen Dateien erlaubt sind, wird die Schrift eingebettet (z. B. base64); nur Schriften mit freier Lizenz, Lizenz und Urheber im Dateikopf genannt.
- Farbe: eine dominante Stimmung mit scharfen Akzenten über CSS-Variablen (der Kontext gibt warme Wachs-, Honig- und Dunkelholztöne her); keine Pastellpalette, keine Purple-Gradients auf Weiß
- Hintergrund: Tiefe durch geschichtete Gradients oder geometrische Struktur statt Volltonfläche
- Motion: ein orchestrierter Aufbau beim Start mit gestaffelten Reveals, statt vieler verstreuter Micro-Animationen
- Die Wabenzellen sind das visuelle Zentrum — Farbcodierung der Zustände muss auch bei 1.000 Zellen auf einen Blick lesbar bleiben
</visuelle_richtung>

# DESIGN DECISIONS
Füge im Code einen Abschnitt `/* Design decisions */` ein, der die **fünf** nicht offensichtlichen Entscheidungen begründet (z. B. warum diese Datenstruktur fürs Hex-Gitter, wie der Wassergehalt modelliert ist, wie Pfadfindung ohne A* gelöst wurde). Keine Feature-Aufzählung — nur Entscheidungen mit Alternative und Grund. Das Mengengerüst (Zahlen und Herleitung) steht zusätzlich darunter.

# SELBSTPRÜFUNG
Baue eine Funktion `selfCheck()`, die beim Start läuft und danach regelmäßig während des Laufs (mindestens alle 20 Ticks), und die **Invarianten** prüft, nicht die Existenz von Objekten. Mindestens:
1. **Ressourcenbilanz:** eingesammelt == eingelagert + verbraucht + in Transit (Toleranz 0), je Ressource. „Eingelagert“ und „in Transit“ werden dabei aus Zellen und Bienen neu gezählt, nicht aus mitgeführten Summen übernommen.
2. **Honig-Herkunft:** Zähler „Honigzellen ohne durchlaufene Nektarphase“ ist 0
3. **Brut-Konsistenz:** die im Stats-Panel **angezeigten** Brutzahlen == Anzahl Zellen in Brutzuständen
4. **Agenten-Integrität:** jede Biene hat genau eine Rolle und ein gültiges Ziel innerhalb des Gitters bzw. des Außengeländes
5. **Takt:** in der ersten Sekunde nach dem ersten gezeichneten Frame sind Tickzähler > 5 und gezeichnete Frames > 20 (ein im Hintergrund geöffneter Tab darf kein falsches Fail erzeugen)
6. **UI:** jeder Slider und Button ist gebunden und verändert messbar den Zustand
7. **Stillstand:** keine Biene länger als 100 Ticks in derselben Warteaufgabe

Ergebnis als kleine Tabelle mit Pass/Fail pro Punkt in einem Status-Bereich der Seite. Bei einem Fail: deutlich sichtbarer Hinweis mit dem Namen der verletzten Invariante und den beteiligten Zahlen. Ein `selfCheck`, der nur die Existenz von Canvas oder Buttons prüft, erfüllt die Anforderung nicht.

# ABNAHME (mit der Testschnittstelle messbar)
- **Fehlerinjektion:** Für jede der Invarianten 1–4 und 7 gibt es einen Weg, gezielt einen Fehler in den Zustand zu bringen (z. B. 5 Einheiten Nektar ohne Herkunft, eine Honigzelle ohne Nektarphase). `selfCheck` meldet dann genau diese Invariante als Fail und nach einem Reset wieder Pass.
- **Lebensfähigkeit:** Mit Standardeinstellungen (Kolonie 150, Ressourcen 70 %, Wetter 70 %, Krankheit 15 %) überleben mindestens 18 von 20 Seeds 150 Sim-Tage, und die Population bleibt im Mittel innerhalb von ±30 % der Zielgröße.
- **Gegenproben:** Ressourcen 0 % führt zum Kollaps. Wetterstabilität 10 % führt in der Mehrheit der Seeds zum Kollaps. Der Stress-Test unterscheidet: bei mindestens 3 Seeds nicht immer dasselbe Ergebnis.
- **Dauerlauf:** 20 Seeds × 1.500 Ticks mit selfCheck alle 20 Ticks — 0 Fails.
- **Lesbarkeit:** Ein Zustand mit ≥ 1.000 belegten Zellen ist auf einen Blick lesbar; Brutnest, Pollenkranz und Honigzone sind zu erkennen.

Berichte das Ergebnis dieser Abnahme mit Zahlen im Status-Bereich oder in deiner Antwort.
```
