---
id: 0051-incrementele-wizard-consumptie-categorisatiemotor
title: Incrementele per-tegenpartij-wizard consumeert de categorisatiemotor — geen tweede motor
status: aanvaard
date: 2026-07-19
elements: [as-import, t-lokale-ai]
---

De "Vraag Will"-categoriseerflow wordt een per-tegenpartij-groep-wizard met adaptieve aanvoer (lokaal 2-3 representanten/ronde + prefetch-venster 1-2 via back-pressure; cloud 20/ronde, presentatie kaart-voor-kaart) — eigenaarsbesluit 19 juli 2026. `runCombinedCategorization` blijft de enige categorisatie-motor en wordt per sessie precies één keer aangeroepen; de wizard consumeert de voorstellenstroom via `onProposal`/`onProgress` en is pure presentatie. Scheduling-wensen van de wizard landen als additieve, default-behoudende opties ín de motor.

## Context

De huidige flow roept `runCombinedCategorization` (`lib/auto-categorize.ts:424`) eenmalig aan met `onProposal`/`onProgress`-callbacks; drie bestaande sheet-callsites doen dit al zo, en de import-flow gebruikt `batchSize: 20, minRuleConfidence: 0.8`. De motor groepeert intern per genormaliseerde tegenpartij en levert AI-voorstellen in ronden van maximaal `batchSize` groepen (cloud) resp. kleinere adaptieve rondes (lokaal, ADR 0043/0049-aanvulling — LiteRT-LM-runtime).

De nieuwe wizard-UX wil transacties presenteren als een reeks kaarten, gegroepeerd en geordend per tegenpartij (grootste groep eerst), met een korte look-ahead zodat de volgende kaart al klaarstaat vóór de gebruiker 'm nodig heeft. Dat is een schedulingsvraag (volgorde + begrensde vooruitblik), geen categorisatievraag. Twee risico's dienden zich aan bij de bouw: (a) de sheet zou de groepenlijst kunnen slicen en de motor per slice aanroepen — dat verliest de motor-interne answered-cache en veroorzaakt dubbele AI-calls voor dezelfde tegenpartij; (b) presentatie-groepering zou een eigen comparator kunnen krijgen die afwijkt van de motor-interne groepering, wat tot inconsistente volgorde tussen "wat de motor verwerkt" en "wat de gebruiker ziet" leidt.

## Besluit

**1. Eén motor, één aanroep per sessie.** `runCombinedCategorization` blijft de enige plek waar categorisatie gebeurt (regel/AI/propagatie/validatie). De wizard/sheet roept 'm exact zoals de bestaande callsites één keer aan voor de volledige set en abonneert zich op de voorstellenstroom — nooit een aanroep per groep of per slice.

**2. Sheet/wizard is pure presentatie.** `onProposal` vult de kaart-voor-kaart UI, `onProgress` drijft de voortgangsindicator. Geen eigen categorisatielogica, geen eigen validatie, geen eigen propagatie in de wizard-laag.

**3. Scheduling-behoeften landen additief in de motor.** De motor krijgt twee nieuwe, optionele opties naast de bestaande:
   - `groupOrder?: 'default' | 'largest-first'` — bepaalt in welke volgorde groepen aan bod komen (default = huidig gedrag, ongewijzigd).
   - `onBeforeRound?: (pending: PendingGroup[]) => void` — hook vóór elke AI-ronde, voor telemetrie/prefetch-signalering; wijzigt de ronde zelf niet.

   Beide zijn default-behoudend: zonder opgave gedraagt de motor zich exact als vandaag.

**4. Presentatie hergebruikt de motor-comparator, geen divergentie.** De volgorde/groepering die de wizard toont voor "grootste-groep-eerst" gebruikt de geëxporteerde motor-helpers `buildCombinedGroups`/`orderGroupsLargestFirst` — dezelfde comparator als de motor intern gebruikt voor `groupOrder: 'largest-first'`. Er komt geen tweede, losstaande sorteerfunctie in de sheet-laag.

**5. Verboden**:
   - Een tweede groepering/prompt/validatie/propagatie buiten de motor.
   - Een sheet die groepen slicet en de motor per slice aanroept (verliest de answered-cache → dubbele AI-calls, inconsistente propagatie).
   - Stille cloud-fallback wanneer de lokale resolver faalt (blijft ADR 0043 — fail-closed).

## Gevolgen

- **Bestaande callers ongewijzigd.** De import-flow (`batchSize: 20, minRuleConfidence: 0.8`) en de drie sheet-callsites gedragen zich bij ongewijzigde opties (geen `groupOrder`/`onBeforeRound` opgegeven) exact hetzelfde als vandaag — pariteit getest.
- **Persist-pad ongewijzigd.** Voorstellen blijven accumuleren in de sheet-state; er is één save via het bestaande sheet-pad, niet per kaart of per groep.
- **Wizard-voortgang is sessie-lokaal (v1).** Cross-device hervatten van een halverwege-gebroken wizard-sessie is bewust uitgesloten; bij herladen begint de flow opnieuw via een nieuwe motor-aanroep.
- **Geen nieuwe rekenmotor, geen nieuw ArchiMate-element.** De wizard is een interactievorm rondom een bestaande applicatieservice (`as-import`), geen nieuwe capability of dataobject — de Praatplaat/HLD en Berekeningen-view blijven ongewijzigd. `t-lokale-ai` blijft ongewijzigd van aard; de scheduling-hooks gelden voor beide resolver-paden (cloud én lokaal) identiek.
- **ADR 0043 lichte update.** De gevolgen-regel "`runCombinedCategorization` blijft ongewijzigd" is verfijnd naar "blijft de enige motor; additieve scheduling-hooks toegestaan mits gedrag voor bestaande callers ongewijzigd (zie ADR 0051)" — geen inhoudelijke koerswijziging van ADR 0043, alleen precisering nu de motor voor het eerst een optionele parameter bijkrijgt.

## Cross-ref

ADR 0043 (resolver = enige cloud/lokaal-omschakelpunt) — orthogonale as: 0043 beslist **welke resolver** (cloud/lokaal) categoriseert, deze ADR beslist **hoe de UI de motor-output consumeert en welke scheduling-opties additief in de motor landen**. Beide lenzen respecteren "runCombinedCategorization blijft de enige motor".
