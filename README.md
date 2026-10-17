# Honig & Wachs im Wandel

Interaktive Bienenstock-Simulation **„Wachs & Wandel“** als **eine einzige HTML-Datei**. HTML, CSS und JavaScript
sind inline, es gibt keine Frameworks und keine externen Dateien.

**Version 3** ist eine Symbiose aus zwei Vorgängern:
- **V1** [`bienenstock-simulation`](https://github.com/Jkegithub/bienenstock-simulation) bringt die Darstellung mit
  (Larven als wachsendes „C“, Wiese mit Blütenfeldern, Wetter, kontrastreiche Schrift) und den lesbaren, modularen Quelltext.
- **V2** „Wachs & Wandel“ Rev. 4 bringt Namen und Layout, das Modell als Klasse, die Testschnittstelle, 9 Invarianten
  und die eingebaute Abnahme.

![Wachs & Wandel, Version 3, an Tag 53](docs/screenshot.png)

## Starten

**Im Browser:** <https://jkegithub.github.io/Honig-Wachs-im-Wandel/>

**Offline:** [`index.html`](index.html) herunterladen (auf GitHub „Download raw file“) und per Doppelklick öffnen.
Es wird kein Server gebraucht.

- **Tempo:** drei Buttons **¼× Zeitlupe · 1× Normal · 2× Tempo**, von denen genau einer aktiv ist. Die erste Sekunde läuft
  bei 1× (Taktprüfung S5), danach schaltet die Simulation in die Zeitlupe.
- **Seed:** Jeder Lauf hat einen Seed (beim Laden `1729`). Er legt alle Zufallsereignisse fest: Alter und Lebensdauer der
  Bienen, Wetter und Krankheitsfälle. Gleicher Seed und gleiche Regler ergeben einen identischen Verlauf. Einen anderen
  Seed eintragen und auf **Start** klicken; **↻ Neuer Seed** würfelt einen zufälligen.
- **Zelle anklicken:** Der Inspektor zeigt Zustand, Füllgrad, Wassergehalt, Alter, Temperatur und die zuständige Biene.
- **3D-Szenen:** Kurze 3D-Vignetten im selben Bild, ausgelöst durch echte Ereignisse der Simulation:
  **Heimflug** einer Sammlerin mit Nektar oder Pollen (mit ihrer Nummer, Menge und Blütenfeld), **Schlupf** einer jungen
  Biene aus ihrer Zelle und **Regen-Rückzug** in den Stock. Die 3D-Darstellung ist selbst geschrieben (Projektion, Licht,
  Tiefensortierung), ohne Bibliothek. Schalter „3D-Szenen“, Button „▶ 3D-Szene“ zum Abspielen auf Wunsch; Klick auf die
  Szene schließt sie. Bei „Bewegung reduzieren“ im Betriebssystem sind sie aus.

## Was Version 3 auszeichnet

| | Messung (Chrome, gleiche Messreihe für alle drei Varianten) |
|---|---|
| Rechenzeit | **0,06 ms je Tick** bei Ziel 150, V2: 1,03 ms. Die Abnahme über 20 Seeds dauert **3,3 s**, V2: 66 s |
| Lebensfähigkeit | 20/20 Seeds überleben 150 Tage, Ø 142 Bienen, 0 Invariantenfehler |
| Stress-Test | unterscheidet: 11 überleben, 9 kollabieren (Start an Tag 5–25) |
| Ressourcen-Slider | wirkt monoton über 0–100 % |
| Prompt-Treue | Kollaps und Taktprüfung **wörtlich** nach Prompt #24, in V2 waren das zwei Abweichungen |

Details, Vergleichstabelle V1/V2/V3 und alle Messwerte: [`ANALYSE.md`](ANALYSE.md).

## Aufbau des Quelltexts

`index.html` wird gebaut, nicht direkt bearbeitet:

```powershell
./build.ps1
```

| Pfad | Inhalt |
|---|---|
| `src/template.html` | Seite, CSS, Modulplan |
| `src/js/10_core.js` | Konstanten, Zufall, Gitter, Zonen, **Design decisions und Mengengerüst** |
| `src/js/20_colony.js` … `60_check.js` | Modell (Klasse `Colony`): Vorräte, Brut, Bienen, Umwelt, Prüfung und Abnahme |
| `src/js/70_render.js`, `75_scenes.js`, `80_ui.js` | Darstellung (ein Canvas), 3D-Vignetten und Bedienung |
| `src/acceptance.json` | gespeicherte Abnahme, gebunden an die Modellkennung (jede Modelländerung macht sie ungültig) |
| `fonts/` | eingebettete Schriften mit Lizenztexten |
| `archive/rev4.html` | V2 Revision 4 zum Vergleich (auch als Git-Tag `v2-rev4`) |

Testschnittstelle im Browser: `window.BeeLab` mit `create`, `advance`, `selfCheck`, `inject`, `acceptance`, `fingerprint`.

## Aufgabe

[`PROMPT.md`](PROMPT.md) enthält Prompt #24 „Bienenstock-Simulation (Version 2)“ unverändert, mit sha256.

## Lizenz

Code: [MIT](LICENSE).
Schriften: **Fraunces** © 2020 The Fraunces Project Authors und **Source Code Pro** © 2010, 2012 Adobe Systems Incorporated
(Reserved Font Name „Source“), beide SIL Open Font License 1.1. Die Lizenztexte liegen in [`fonts/`](fonts/).
