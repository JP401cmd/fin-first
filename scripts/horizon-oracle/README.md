# Horizon-oracle — fixture-extractor

Haalt deterministische golden-fixtures uit het Excel-oracle **`Core calc v5.xlsm`**
voor de parity-tests van de nieuwe horizon-kernel (FASE 1 van
`docs/horizon-excel-oracle-plan.md`). De fixtures landen als `<scenario>.json.gz`
in `test/fixtures/horizon-oracle/`.

## Wanneer verversen?

Zodra de eigenaar het Excel-model wijzigt (nieuwe save van
`C:\Users\janpa\OneDrive\Prive\Archief\Core calc v5.xlsm`). Elke fixture bevat in
`meta` de SHA256 + LastWriteTime van de bron waarmee hij gemaakt is; wijkt de bron
af van de geanalyseerde snapshot (2026-07-02 12:24), dan zet de extractor daarover
automatisch een warning in `meta.warnings`. Ook de structuurkennis in
`docs/horizon-oracle/` kan dan verouderd zijn.

## Hoe verversen?

Vanuit de repo-root, op een Windows-machine met geïnstalleerd Excel:

```
py scripts/horizon-oracle/extract_fixtures.py --all
```

Handige varianten:

```
py scripts/horizon-oracle/extract_fixtures.py --list              # toon de scenario-set
py scripts/horizon-oracle/extract_fixtures.py --scenario basis    # één scenario
py scripts/horizon-oracle/extract_fixtures.py --source "D:\pad\Core calc v6.xlsm"
py scripts/horizon-oracle/extract_fixtures.py --out test/fixtures/horizon-oracle
```

Vereisten: `py` (Python 3) met pywin32 (`py -m pip install --user pywin32`).
Reken op enkele minuten per scenario (de solver-bisectie herberekent het hele
werkboek tientallen keren).

## Wat doet het script per scenario?

1. **Kopie** — de bron wordt naar een tijdelijk werkbestand gekopieerd en de
   kopie wordt gehasht. **De bron-Excel wordt nooit geopend of gewijzigd.**
2. **Eigen Excel-instantie** — de kopie opent in een eigen onzichtbare
   Excel-instantie (`DispatchEx`), nooit in een eventueel openstaande sessie
   van de gebruiker. Aan het einde wordt de instantie altijd gesloten.
3. **Overrides** — eerst de vaste `TS!A23`-prioriteitenfix (Consumptief +
   Studie misten een toename-prioriteit onder 'gelijk verdelen over
   bezittingen'; de extractor zet die als input, gelogd met reason
   "TS!A23-fix"), daarna de scenario-specifieke cellen. Alle schrijfacties
   worden teruggelezen ter verificatie en staan in `meta.overrides`.
4. **Macro's** — `BepaalFIRE` → `RunScenarioBand` → `BepaalFIRE` →
   `RunMonteCarlo`. De save kan stale zijn, daarom draait de solver altijd
   opnieuw. De tweede `BepaalFIRE` is nodig omdat `RunScenarioBand` afsluit
   met `P!B16 := Sim!B7` — voor eindstrategie 'Pensioenleeftijd' (B16 hoort
   dan AOW te zijn) en bij een onhaalbaar "Verwacht"-scenario zou de
   solver-stand anders incorrect achterblijven. Een watchdog-thread sluit de
   MsgBox die `BepaalFIRE` toont (alleen dialogen van de eigen instantie,
   op proces-ID gematcht).
5. **Doorrekenen** — `CalculateFullRebuild` + `Calculate` tot de peilcellen
   stabiel zijn.
6. **Verificaties** — `Controle!K1` moet met "OK" beginnen; `TS!A23` mag geen
   FOUT meer melden; stale-detector `P!B95` moet vers zijn. Bij een "draai
   opnieuw"-hint draait `BepaalFIRE` nogmaals; laat herdraaien `P!B16`/`P!B38`
   exact ongewijzigd, dan is de solver aantoonbaar vers (idempotent) en is de
   aanhoudende hint een **vals alarm** van de 5%-van-doel-drempel (doel = 0 bij
   deplete/pensioen, of een maand-granulariteits-restant dat op een lange
   horizon boven 5% van het doel uitkomt) → warning in `meta.warnings`.
   Verandert de stand wél terwijl de hint aanhoudt → harde fout. `P!B38` (gap)
   mag een granulariteits-restant zijn: die wordt vastgelegd in
   `meta.solver.gap`, niet geblokkeerd.
7. **Dump** — per sheet wordt de volledige used range in één bulk-call gelezen
   (alle 22 sheets behalve 'Toelichting model') en weggeschreven als gzip-JSON
   volgens het fixture-schema (zie hieronder).

## Scenario-set

Gedefinieerd in `scenarios.py` (basis = de situatie van de eigenaar + TS-fix;
per scenario één wijziging tenzij daar expliciet van afgeweken is — zie de
`reason` per override). Drie scenario's uit de opdracht-set vervallen bewust
omdat ze identiek zouden zijn aan `basis`: `eind-legacy` (basis ís Nalatenschap),
`profiel-afnemend` (basisprofiel ís Afnemend; daarom is `profiel-vast`
toegevoegd) en `huis-verkoop-wanneer-nodig` (basis ís Verkopen + Wanneer nodig).
`werk-strategie-uit` vervangt "werk-strategie-aan" omdat de basis de
werk-strategie al actief heeft (2% reële groei).

Uitbreiding naar 16: `huis-meerekenen` en `huis-uitsluiten` completeren het
P!B57-kwadrant; `onhaalbaar` (status `unreachable_within_horizon`, fireAge null,
P!B16 geparkeerd op 100, €/mnd-hint in P!B96) en `pensioen-tekort` (eindstrategie
'Pensioenleeftijd' + uitgave na pensioen 200k → tekort-lening → status
`pension_shortfall`) dekken de twee solver-statussen die de eerste 12 fixtures
niet raakten. Let op: een pre-FIRE-tekortdraai (uitgaven > inkomen, bv.
P!B11 fors omhoog) is **niet extraheerbaar** — een negatief toename-budget
(CF!I < 0) drukt potten door de MAX(0;..)-vloer en breekt Controle!K1 (de
tekort-lening voedt alleen uit afname/onttrekking-onbenut). Daarom draait
`onhaalbaar` aan het doel (P!B53) mét woning-strategie 'Uitsluiten' (onder
'Verkopen' maakt de Box 3-heffing op het naar ~13,5M doorgroeiende vermogen
CF!I alsnog negatief in de laatste ~20 maanden vóór de horizon). De
stale-detector P!B95 blijft bij beide statussen leeg (gebonden aan de
reached_at-toestand).

## Fixture-schema (per `<scenario>.json.gz`)

```json
{
  "meta": {
    "fixtureVersion": 1,
    "scenario": "...", "description": "...",
    "sourceFile": "Core calc v5.xlsm",
    "sourceLastWriteTime": "<ISO>", "sourceSha256": "<hex>", "extractedAt": "<ISO>",
    "overrides": [ { "cell": "TS!D41", "value": 6, "reason": "..." } ],
    "macros": ["BepaalFIRE", "RunScenarioBand", "BepaalFIRE", "RunMonteCarlo"],
    "solver": { "fireAge": 55.583333, "gap": 123.45, "statusText": "...", "staleText": "..." },
    "controleK1": "OK — alles sluit",
    "warnings": []
  },
  "sheets": {
    "P": { "range": "A1:T100", "values": [["...", null, 1990.5]] }
  }
}
```

Regels: `values` row-major vanaf A1 t/m het einde van de used range; getallen
afgerond op 1e-6; lege cel = `null`; datums = ISO-string; cached foutwaarden
(bv. `#N/A` in Sim bij een onhaalbaar band-scenario) = string. `fireAge` is
`null` bij status `unreachable_within_horizon` (P!B16 staat dan geparkeerd op
de horizon).

## Structuurkennis

De volledige model-analyse (tabbladen, rekenflow, invoercellen, VBA) staat in
`docs/horizon-oracle/` — nodig om scenario-overrides en verificaties te kunnen
beoordelen.
