# Horizon-rekenmotor → tabel-georiënteerd (grootboek) — plan

> Status: **v2 live achter per-user flag · per-asset · Route 2 · globale flip gated** · 13 jun 2026 · bron-input: `/beheer/grafiek-werking` (functionele referentie van de huidige werking) + referentieprototype `tf-horizon_4.html` (tabel-/bracketing-denkwerk) + de getraceerde huidige engine (`lib/unified-projection.ts`).

## Implementatiestatus (13 jun 2026)

**Fase 1 — gebouwd & geverifieerd.** De grootboek-engine staat in `lib/horizon-engine/` (`types` / `strategies` / `engine` / `views` / `adapter`), rekent reëel met forward V_op + backward V_nodig + snijpunt, en is gedekt door `test/horizon-engine.test.ts` (9 cases) + `test/horizon-persona.test.ts`. De **werkende grafiek** + tabellen A–G staan op **`/beheer/horizon-tabellen`** (interactief, op persona-data; FIRE ~56 jr, V_op stijgt €136k→€4,5M, V_nodig daalt €1,13M→€116k). `npx tsc --noEmit` schoon; 22 tests groen.

**Fase 2 — gebouwd.** De engine rekent **per individueel asset** (eigen verwacht rendement, reëel gemaakt) en per individuele schuld — de fundering voor latere interventies/volgordelijkheid op assetniveau. Box 3-drag per asset (forfait × 36%, na heffingsvrij — matcht productie), `aflossen-eerst` (surplus → duurste schuld, cap 10%/jr) en de verdeling-/onttrekkingsvolgorde-plug-ins sturen de berekening écht (de nu-dode pot-regels). Nog vereenvoudigd: productie-Box 1 (placeholder voor tabel D).

**Fase 3 — gebouwd.** `compareEngines` (`lib/horizon-engine/compare.ts`) draait oud↔nieuw op dezelfde input; `test/horizon-engine-compare.test.ts` rapporteert de diffs; de inspector heeft een tab **"Vergelijk v1↔v2"**. Bevinding: v2 wijkt bewust af — FIRE ~+2 jr, netto-pad −4…−37% (reëel vs nominaal + Box 3-drag).

**Afwijking t.o.v. het oorspronkelijke ontwerp (in de implementatie geëvolueerd):** FIRE wordt bepaald via een **forward doel-zoektocht** (`meetsStrategyTarget`: vroegste leeftijd waarop retire-at-FIRE + strategie-onttrekking het einddoel haalt — deplete→~€0, perpetual→koopkracht behouden, legacy→nalatenschap), **niet** via het V_op×V_nodig-snijpunt; dat bleek inconsistent omdat de getoonde lijn decumuleert terwijl de werkende V_op doorspaart. De V_nodig-lijn blijft als referentie. Canonieke architectuur + invarianten: `docs/architecture/horizon-engine-v2.md`; besluit: ADR 0013. Parity-cijfers verschillen per strategie/profiel — meet via `compareEngines`.

**Fase 4 — v2 live achter per-user flag; globale flip gated.** De flag `horizon_engine_v2` is **end-to-end gedraad**: `loadHorizonData` (`isHorizonV2Enabled`) → `/toekomst`-page → `useHorizonFireSim` → `runSelectedProjection`. Wanneer aan, draait v2 op de **echte** assets/schulden/profiel/life-events van de gebruiker en voedt de output (via adapter) de **echte** /toekomst-grafiek. Een **toggle** op `/beheer/horizon-tabellen` (+ `/api/horizon-engine` GET/PUT) zet 'm per gebruiker aan/uit; default uit (= byte-identiek aan v1, 16 integratietests groen). **Route 2** is geïmplementeerd: de adapter rekent reëel→nominaal terug zodat de /toekomst-getallen op schaal blijven; het resterende verschil is puur methode (FIRE +2 jr, netto −2…−14%). v2 staat AAN voor het owner-account voor live test. De ONOMKEERBARE stap — globale default voor iedereen + verwijderen van de legacy-engine (raakt fee-analyse/hypotheek/household) — blijft bewust gated tot de live test akkoord is.

## 0. Aanleiding & these

De huidige FIRE-grafiek draait op `runUnifiedProjection`: een **forward-only loop met per leeftijd een binary search** (`requiredAt`, 80 iteraties × een lichte decumulatie-subsim) om het benodigd vermogen te vinden. Dat is:

- **ondoorzichtig** — het "benodigd vermogen" bestaat alleen als scalar op FIRE, niet als inspecteerbare curve;
- **duur en moeilijk uit te breiden** — elke nieuwe strategie/impact moet ín de loop, en veel zaken (pot-regels, inkomensgroei, schuld-aflossen-uit-surplus, Box 1) zijn daardoor *niet* aangesloten (zie de 20 punten in het beperkingenregister);
- **niet single-source** — een tweede engine (`runSimulation`) leeft nog op andere oppervlakken en `/core` wijkt af.

**De voorkant is goed** (de gebruiker is tevreden met de app-weergave). **De achterkant moet anders.** These van dit plan:

> Vervang de imperatieve loop door een **grootboek-model**: één forward-pass die een volledig gedecomponeerde jaartabel (ledger) bouwt (V_op), één backward-pass die het benodigd vermogen per jaar afleidt (V_nodig), en het **snijpunt** als FIRE-moment. Elke weergave (lijn, bar, in/uit, kassabon) en elke beheer-tabel is een **pure view** op dezelfde jaarrijen. Strategieën zijn **pluggable pure functies**. Reëel rekenen is de interne eenheid.

Dit maakt de berekening per onderdeel inspecteerbaar (tabellen op `/beheer`), uitbreidbaar (een nieuwe impact = een kolom of een plug-in) en single-source (één engine voedt alle oppervlakken). De front-end blijft ongewijzigd via een **adapter** naar de bestaande rij-typen.

---

## 1. Functionele eisen

Vertaald uit `/beheer/grafiek-werking` (alle onderdelen + het beperkingenregister). Status-codes: **[B]** behouden zoals nu · **[+]** verbeterd/aangezet (nu een gat) · **[N]** nieuw mogelijk gemaakt door het model.

### 1.1 Grafiek & weergave (front-end blijft, motor moet voeden)
- **FE-W1 [B]** Vermogenspad-lijn (V_op) over leeftijd, gesplitst per fase (goud opbouw / bruin afbouw).
- **FE-W2 [B]** Vermogensopbouw-staaf: 5 vermogensgroepen omhoog + schuld omlaag, per jaar.
- **FE-W3 [B]** Inkomen & Uitgaven: lijnen (aanvulling vs onttrekking) + bronnen-breakdown (gestapeld per bron).
- **FE-W4 [+]** FIRE-snijpunt fractioneel gemarkeerd; **V_nodig wordt een zichtbare, dalende curve** (nu alleen een scalar) — sluit aan op onderwerp-1-feedback.
- **FE-W5 [B]** Fases visueel onderscheiden (opbouw / overbrugging / onttrekking).
- **FE-W6 [+]** Per-jaar kassabon/decompositie volledig (drijvers/drukkers) — uit het grootboek i.p.v. tooltip-only.
- **FE-W7 [B]** Scenario-, Monte-Carlo- en huishoud-overlays blijven mogelijk.

### 1.2 Fases & bijdrage
- **FE-F1 [B]** Drie fases met expliciete grenzen: FIRE-leeftijd en AOW-leeftijd.
- **FE-F2 [B]** Bijdrage-matrix gerespecteerd: sparen alléén in opbouw; rendement, inflatie, Box 3 en cashflows in alle fases; onttrekking vanaf FIRE.
- **FE-F3 [N]** Overbruggingsfase (FIRE→AOW) kan een **eigen uitgavenniveau/regel** hebben (nu rekenkundig identiek aan onttrekking).

### 1.3 Voorkeuren & instellingen
- **FE-V1 [B]** Bruto rendement, inflatie; effectief SWR afgeleid.
- **FE-V2 [B]** Rendement **per vermogensgroep** (dominant boven de globale fallback).
- **FE-V3 [B]** Eindstrategie: opmaken (deplete) / behouden (perpetual) / nalaten (legacy) / pensioen + eindleeftijd + nalatenschapsbedrag.
- **FE-V4 [+]** Onttrekkingsstrategie: static / guardrails / vpw / bucket — **guardrails en bucket volledig** geïmplementeerd (nu half/placeholder).
- **FE-V5 [+]** Onttrekkingsvolgorde per pot **stuurt de berekening** (nu opgeslagen maar genegeerd).
- **FE-V6 [+]** Verdeling bij toename: vast / alles-beleggen / pro-rata / **aflossen-eerst** / pot-doel — **stuurt de berekening** (incl. "schuld aflossen", nu niet gemodelleerd).
- **FE-V7 [+]** Verdeling bij afname: sequentieel (volgorde) / pro-rata — **stuurt de berekening**.
- **FE-V8 [N]** Inkomensgroei over de tijd (carrièregroei) instelbaar (nu hard 0).
- **FE-V9 [B]** Spaarbron-resolutie (maand-override → spaarquote × inkomen → asset-contributie) + aflossing-dubbeltel-guard.

### 1.4 Levensgebeurtenissen
- **FE-E1 [B]** Life-event-types met generieke + type-specifieke logica (kinderen/NIBUD, erfenis/erfbelasting, marktschok, uitvaart, eigen sub-cashflows).
- **FE-E2 [B]** Eenmalig vs recurring, start/eind, indexatie, `portfolioPct`-schok.
- **FE-E3 [N]** Event kan een **bestemmings-/herkomst-pot** kiezen (meevaller naar cash of naar schuldaflossing i.p.v. gedwongen beleggen).

### 1.5 De drie multi-step strategieën
- **FE-S1 [B]** AOW (ingangsleeftijd, leefsituatie, jaren buiten NL → opbouwkorting).
- **FE-S2 [B]** Pensioen: meerdere potten, annuïtisering (kapitaal→maand), uitkeringsduur, indexatie, partner-%.
- **FE-S3 [B]** Huis: 4 modi (include_full / exclude_from_fire / downsize / reverse_mortgage) × 2 triggers (fixed_age / on_depletion). ADR 0012-invariant blijft: **trigger == moment waarop liquide vermogen in de grafiek opraakt**.
- **FE-S4 [+]** Opeethypotheek-rente **drukt op de simulatie** (nu display-only → overschat de uitkomst).
- **FE-S5 [+]** AOW/Pensioen/Huis-previews draaien op **dezelfde engine** als de grafiek (nu AOW/Pensioen op de legacy-engine).

### 1.6 Uitgave na pensioen
- **FE-U1 [B]** Drie methodes: essential_budgets / custom_amount / current_income.
- **FE-U2 [+]** Eén consistente default over alle paden (nu onboarding ≠ lees-fallback).

### 1.7 Inflatie, rendement & schuld
- **FE-R1 [+]** **Reëel** als interne canonieke eenheid (koopkracht heden) + een **nominale presentatie-optie** (nu nominaal met losse inflationFactor).
- **FE-R2 [B]** Per-asset rendement; afschrijving (voertuig); eigen huis met eigen rendement, geen Box 3, laatst in de waterval.
- **FE-R3 [B]** Schuld-amortisatie (annuïteit / lineair / aflossingsvrij): rente + aflossing per jaar, gewogen in netto vermogen.
- **FE-R4 [+]** Vrijgekomen maandlasten na een afgeloste schuld **stromen terug in de cashflow** (nu `freedSurplus` berekend maar weggegooid).

### 1.8 Belasting
- **FE-B1 [+]** **Box 1 per jaar** op salaris/AOW/pensioen (nu volledig afwezig in de projectie).
- **FE-B2 [+]** Box 3 per jaar, **niet bevroren op 2026**, met heffingsvrij vermogen én schuld-offset (nu bevroren, schuld genegeerd).
- **FE-B3 [+]** Hypotheekrenteaftrek (HRA) als jaarlijks effect.

### 1.9 Motor & single source of truth
- **FE-M1 [+]** Eén engine voedt dashboard / `/core` / `/toekomst` / AI-context / briefing (geen tweede engine, geen /core-afwijking).
- **FE-M2 [N]** Het grootboek is **inspecteerbaar op `/beheer`** (tabellen A–G, read-only).
- **FE-M3 [B]** Adapter naar de bestaande rij-typen (`UnifiedProjectionRow` / `SimRow`) → geen front-end-breuk.
- **FE-M4 [N]** Parity-/diff-harness oud ↔ nieuw + regressiecases.

---

## 2. Technische opzet (tabel-georiënteerd)

### 2.1 Kernidee — twee passes, één bron

```
inputs  ──►  [forward pass]  ──►  Grootboek (LedgerRow[])      = V_op
                                       │
inputs  ──►  [backward pass] ──►  V_nodig[]  (vanaf eindleeftijd terug)
                                       │
                              snijpunt: eerste jaar  liquide ≥ V_nodig  = FIRE (t*)
                                       │
                              views A–G  +  adapter → front-end-rijen
```

- **V_op (forward)** — vermogensopbouw jaar voor jaar (sparen + rendement − belasting − uitgaven ± cashflows), per asset en per schuld expliciet.
- **V_nodig (backward)** — recursie vanaf de eindleeftijd D: `V_nodig[i] = (V_nodig[i+1] + nettoBehoefte[i]) / (1 + rOnttrek)`, met `V_nodig[D]` = einddoel (0 bij opmaken, beginvermogen bij behouden, nalatenschap bij nalaten); VPW-variant via annuïteitsfactor. **Dit vervangt de binary search volledig** en levert per constructie een **dalende** curve.
- **FIRE = snijpunt** van de stijgende V_op (liquide) en de dalende V_nodig, met fractionele interpolatie binnen het jaar (huidige finesse behouden). Pensioen-modus: FIRE forced op AOW.

### 2.2 De canonieke bron — `LedgerRow`

Eén rij per projectiejaar; alle tabellen zijn views hierop. Indicatieve vorm (productie-types verfijnen):

```ts
interface LedgerRow {
  jaar: number; leeftijd: number; fase: 'opbouw' | 'overbrugging' | 'onttrekking'
  werkt: boolean
  // inkomen
  inkomen: { salarisBruto: number; aow: number; pensioen: number; overig: number }
  // belasting  (tabel D)
  belasting: { box1Grondslag; box1; box3Grondslag; box3; hra; netto }
  // wonen
  wonen: { hypotheekBetaling; rente; aflossing; onderhoud; ozb; huur; totaal }
  // uitgaven & cashflow (tabel A)
  leefuitgaven: number; events: number; cashflowNetto: number
  // per asset  (tabel B/C):  begin → rendement → instroom → uitstroom → box3 → eind
  assets: Record<AssetType, { begin; rendement; instroom; uitstroom; box3; eind }>
  // per schuld:  begin → rente → aflossing(+extra) → hra → eind
  schulden: Record<string, { begin; rente; aflossing; extraAflossing; hra; eind }>
  // totalen + bracketing
  totaalAssets; totaalSchuld; nettoVermogen; liquideVermogen
  vNodig: number; dekking: number   // dekking = liquide − vNodig
  // herkomst events dit jaar
  eventsDitJaar: ResolvedEvent[]
}
```

### 2.3 De tabellen (views) — wat op `/beheer` zichtbaar wordt

| Tabel | Naam | Inhoud | Bron-view op |
|---|---|---|---|
| **A** | Master-cashflow | inkomen → belasting → woonkosten → leefuitgaven → events → cashflow-netto | `LedgerRow.inkomen/belasting/wonen/...` |
| **B** | Balans + bracketing | per asset eindwaarde, schuld, netto, **V_op liquide / V_nodig / Δ** | `assets/totalen/vNodig` |
| **C** | Asset-bewegingen | per asset: begin → rendement → instroom → uitstroom → box3 → eind (audit) | `assets[type]` |
| **C2**| Schuld-bewegingen | per schuld: begin → rente → aflossing(+extra) → HRA → eind | `schulden[id]` |
| **D** | Belasting | Box 1 grondslag/belasting, Box 3 grondslag/belasting, HRA, netto | `belasting` |
| **E** | V_nodig backward | uitgaven, AOW+pensioen, netto behoefte, V_nodig(t), V_op, dekking ✓/— | backward-pass |
| **F** | Levensgebeurtenissen | opgeloste events incl. strategie-events (AOW/pensioen/huis) | `eventsDitJaar` + resolver |
| **G** | Onttrekking-breakdown | vanaf t*: behoefte, inkomen, onttrekking per pot, onbedekt | `assets[*].uitstroom` |

"Toon elk jaar"-toggle vs mijlpaal-jaren (nu / FIRE / AOW / events / elke 5 jr), met rij-accenten voor FIRE-/AOW-/event-jaren — overgenomen uit het referentieprototype.

### 2.4 Strategieën als pure plug-ins

Elke strategie is een pure functie met een vaste signatuur, geregistreerd en testbaar los van de loop:

- **`surplusAllocatie(toename, surplus, state) → bewegingen`** — vast / alles-beleggen / pro-rata / **aflossen-eerst** / pot-doel. (Sluit FE-V6 + FE-E3 + FE-R4.)
- **`tekortOnttrekking(afname, volgorde, behoefte, state) → bewegingen`** — sequentieel volgens pot-volgorde / pro-rata. (Sluit FE-V5 + FE-V7.)
- **`onttrekkingsstrategie(type, ctx) → bedrag`** — static / guardrails / vpw / bucket (volledig). (Sluit FE-V4.)
- **`eindstrategie(type) → V_nodig[D]`** — opmaken / behouden / nalaten / pensioen. (Sluit FE-V3.)
- **`resolveEvents(...) → ResolvedEvent[]`** — life-events + AOW + pensioen-potten + huis-strategie (downsize/reverse) als cashflows/asset-mutaties. (Sluit FE-E*, FE-S*.)

De huis-`on_depletion`-trigger (ADR 0012) wordt in dit model **triviaal**: het trigger-jaar is gewoon "eerste rij waar `liquideVermogen < buffer + marge`" — direct afleesbaar uit het grootboek i.p.v. een aparte vaste-punt-iteratie. De ADR-invariant (trigger == grafiek-uitputting) blijft per constructie behouden; de capped iteratie kan vervallen.

### 2.5 Reëel vs nominaal

- **Intern reëel** (koopkracht heden): `rReëel = (1+rNom)/(1+inflatie) − 1`; uitgaven blijven vlak in reële termen (of groeien met een expliciete reële drift); inkomensgroei reëel. Dit verwijdert tientallen losse `× (1+inflatie)^t`-indexeringen en maakt de tabellen leesbaar in euro's van nu.
- **Nominale presentatie-adapter** als optie (toggle), zodat niets verloren gaat t.o.v. de huidige nominale weergave.
- De vrijheids-%/FIRE-doel-primitives (`computeFreedomProgress`, `computeFireTarget`, `core-metrics`) consumeren het **nieuwe** V_nodig op t* als doel — één bron.

### 2.6 Pipeline & bestanden (indicatief)

```
lib/horizon-engine/
  inputs.ts        // resolve params, savings-source, retirement-expenses, assets/debts, events
  forward.ts       // forward pass → LedgerRow[]  (V_op)
  backward.ts      // backward pass → vNodig[]
  crossing.ts      // snijpunt + fractionele FIRE + pensioen-forced + stop-work/huis-trigger
  strategies/      // surplus-allocatie, tekort-onttrekking, onttrekking, eind, events
  tax.ts           // Box 1 / Box 3 / HRA per jaar (productie via box1-tax.ts/box3-data.ts)
  views.ts         // A–G selectors/formatters
  adapter.ts       // LedgerRow[] → UnifiedProjectionRow[]/SimRow[] (front-end ongewijzigd)
  index.ts         // runHorizonProjection(input): { ledger, vNodig, fireAge, views }
```

### 2.7 Inspectie op `/beheer` (FE-M2)

Uitbreiding van de bestaande tijdelijke pagina: een tab/`?view=tabellen` op `/beheer/grafiek-werking` (of een nieuwe `/beheer/horizon-tabellen`) die `runHorizonProjection` draait op (a) de persona-testdata en (b) optioneel de ingelogde gebruiker, en de tabellen A–G read-only rendert met dezelfde instellingen-sidebar als het prototype. Dit is **Fase 1** (zie §5) en levert direct een tastbaar, controleerbaar artefact.

### 2.8 Consolidatie (FE-M1)

`runHorizonProjection` wordt dé engine. De legacy `runSimulation`-oppervlakken (fee-analyse, hypotheek-vs-beleggen, deel household-projection, AOW/Pensioen-preview) en het afwijkende `/core`-pad (`fire-target-shared.ts`) migreren ernaartoe. De gecureerde Berekeningen-view + relevante ADR's worden bijgewerkt; een nieuwe ADR legt de grootboek-keuze + reëel-eenheid vast.

---

## 3. Aandachtspunten

1. **Parity & vertrouwen.** De cijfers gaan verschuiven — vooral door (a) reëel i.p.v. nominaal en (b) Box 1 die nu wél wordt toegepast. Verplicht: een **diff-harness** die oud vs nieuw per persona vergelijkt, plus regressiecases die de gewenste richting vastleggen. Vooraf communiceren welke verschuivingen verwacht én gewenst zijn.
2. **Reëel/nominaal-migratie.** Eén canonieke eenheid kiezen (reëel) en overal consequent doorvoeren incl. de vrijheids-%/FIRE-doel-keten; nominale weergave als expliciete adapter, niet als tweede rekenpad.
3. **Belastingnauwkeurigheid.** Het prototype gebruikt indicatieve tarieven ("één effectief Box 1-tarief", vlak Box 3 1,8%). Productie moet `box1-tax.ts`/`box3-data.ts` per jaar gebruiken, inclusief de Box 3-regimewissel richting 2028 — als **parameter per belastingjaar**, niet bevroren.
4. **Strategie-interactiematrix.** Expliciet definiëren welke combinaties geldig zijn (bv. VPW × eindstrategie) en wat de UI toont bij een ongeldige combinatie — geen stille lege grafiek meer.
5. **Front-end-adapter dekt álle huidige features.** Fase-kleuring, fractionele FIRE, scenario/Monte-Carlo/household-overlays, de bronnen-breakdown en de kassabon moeten 1-op-1 uit het grootboek te genereren zijn vóór de oude engine eruit mag.
6. **Performance.** Forward+backward in één pass is goedkoper dan de binary search; maar what-if/scenario/household vermenigvuldigen de runs. Pure functies + memoizatie; geen Supabase in de engine.
7. **Huishoud-/partnerperspectief & privacy** blijven gerespecteerd (perspectief-aggregatie alleen op de FIRE-totalen, zoals nu).
8. **Migratie achter een vlag.** Oud en nieuw parallel laten lopen, vergelijken, dan pas omschakelen en de legacy-engine verwijderen.
9. **Scope.** De visuele voorkant blijft; dit is een achterkant-herbouw. Geen nieuwe schermen behalve de beheer-tabelinspectie.
10. **`tf-horizon_4.html` is denkwerk, geen blauwdruk.** De tabelindeling en de bracketing nemen we over; de vereenvoudigingen (indicatieve belasting, drie assets, hardcoded persona) niet.

---

## 4. Controle op functionele borging — dekkingsmatrix

Elke functionele eis ↔ het mechanisme dat 'm dekt in het nieuwe model. Dit is de borging dat **niets van de huidige pagina verloren gaat** en welke gaten het model sluit.

| FE | Functionaliteit | Gedekt door | Status |
|---|---|---|---|
| W1 | Vermogenspad-lijn | adapter → SimChart; `liquideVermogen`/`nettoVermogen` per rij | gedekt |
| W2 | Vermogensopbouw-bar | adapter → WealthComposition; `assets[*].eind` + `schulden` | gedekt |
| W3 | Inkomen/Uitgaven (lijn+bronnen) | tabel A + `belasting`/`assets`-bronnen | gedekt |
| W4 | FIRE-snijpunt + V_nodig-curve | backward-pass + crossing | **verbeterd** |
| W5 | Fases visueel | `fase`-veld per rij | gedekt |
| W6 | Kassabon/decompositie | volledige `LedgerRow` | **verbeterd** |
| W7 | Scenario/MC/household-overlays | meerdere engine-runs + adapter | gedekt |
| F1 | 3 fases + grenzen | `fase` + FIRE/AOW | gedekt |
| F2 | Bijdrage-matrix | forward-pass volgorde | gedekt |
| F3 | Eigen overbruggings-uitgave | per-jaar uitgavenregel | **nieuw** |
| V1 | Rendement/inflatie/SWR | `inputs` + reële conversie | gedekt |
| V2 | Per-asset rendement | `assets[*].rendement` | gedekt |
| V3 | Eindstrategie + eindlft + nalaten | `eindstrategie()` → V_nodig[D] | gedekt |
| V4 | Onttrekkingsstrategie (4, volledig) | `onttrekkingsstrategie()` | **verbeterd** |
| V5 | Onttrekkingsvolgorde stuurt sim | `tekortOnttrekking(volgorde)` | **gat gesloten** |
| V6 | Verdeling toename (incl. aflossen) | `surplusAllocatie()` | **gat gesloten** |
| V7 | Verdeling afname | `tekortOnttrekking(pro-rata/seq)` | **gat gesloten** |
| V8 | Inkomensgroei | `inkomen`-kolom + groeivoet | **gat gesloten** |
| V9 | Spaarbron + aflossing-guard | `inputs` (resolveSavingsSource) | gedekt |
| E1 | Event-types (gen+specifiek) | `resolveEvents()` | gedekt |
| E2 | Eenmalig/recurring/index/schok | `ResolvedEvent` | gedekt |
| E3 | Event bestemmings-/herkomst-pot | `resolveEvents` + `surplusAllocatie` | **nieuw** |
| S1 | AOW | `resolveEvents` (aow) | gedekt |
| S2 | Pensioen (potten/annuïteit) | `resolveEvents` (pension) | gedekt |
| S3 | Huis (4×2, ADR 0012) | `resolveEvents` + crossing-trigger | gedekt (vereenvoudigd) |
| S4 | Opeethypotheek-rente drukt op sim | `schulden`-rij voor reverse | **gat gesloten** |
| S5 | Previews = grafiek-engine | één `runHorizonProjection` | **gat gesloten** |
| U1 | 3 uitgave-methodes | `inputs` (computeRetirementExpenses) | gedekt |
| U2 | Consistente default | `inputs` (één resolver) | **gat gesloten** |
| R1 | Reëel + nominale optie | interne reële eenheid + adapter | **verbeterd** |
| R2 | Per-asset rendement/afschr./huis | `assets` + classificatie | gedekt |
| R3 | Schuld-amortisatie | `schulden` + amortisatieschema | gedekt |
| R4 | Vrijgekomen lasten terug in cashflow | cashflow herberekend per jaar | **gat gesloten** |
| B1 | Box 1 per jaar | tabel D (`tax.ts`) | **gat gesloten** |
| B2 | Box 3 niet bevroren + schuld-offset | tabel D, belastingjaar-parameter | **gat gesloten** |
| B3 | HRA | tabel D | **gat gesloten** |
| M1 | Eén engine alle oppervlakken | consolidatie | **gat gesloten** |
| M2 | Tabellen op /beheer | views A–G | **nieuw** |
| M3 | Adapter geen UI-breuk | `adapter.ts` | gedekt |
| M4 | Parity-harness | diff oud↔nieuw | **nieuw** |

**Conclusie borging:** alle 39 functionele eisen uit de pagina zijn toegewezen. Behouden: 17 · verbeterd: 7 · nieuw mogelijk gemaakt: 6 · **expliciet gesloten beperkingen (uit het register): 12** (V5, V6, V7, V8, S4, S5, U2, R4, B1, B2, B3, M1). Niets uit de huidige werking valt weg; resterende registerpunten (sequence-of-returns op de hoofdlijn, intra-jaar-granulariteit) staan als *could* op de roadmap, niet als verlies.

---

## 5. Fasering

1. **Fase 0 — Akkoord & ADR.** Dit plan reviewen; ADR voor grootboek-model + reële eenheid; diff-harness-opzet.
2. **Fase 1 — Tabel-inspectie op /beheer (tastbaar bewijs).** Port van het grootboek-model (forward+backward) als geïsoleerde, pure `lib/horizon-engine/`-module; tabellen A–G read-only op `/beheer` op persona-data, met de instellingen-sidebar. Nog niet aangesloten op de echte app.
3. **Fase 2 — Strategie-plug-ins + belasting.** De vijf plug-ins en `tax.ts` (productie Box 1/3/HRA) volledig; sluit V4–V8, E3, R4, B1–B3, S4.
4. **Fase 3 — Adapter + parallel-run.** `adapter.ts` naar de bestaande rij-typen; achter een vlag naast `runUnifiedProjection`; diff-harness groen op alle persona's; gewenste verschuivingen vastgelegd in regressiecases.
5. **Fase 4 — Omschakelen + consolideren.** `/toekomst`, dashboard, `/core`, AI-context, briefing op de nieuwe engine; legacy `runSimulation` + `fire-target-shared`-afwijking opruimen; Berekeningen-view + ADR's bijwerken; de tijdelijke `/beheer/grafiek-werking` vervangen door de blijvende tabelinspectie.

---

## 6. Volledige implementatie van v2 — stappenplan (cutover)

Detaillering van Fase 2–4 nu v2 achter de flag werkt + de architectuur is vastgelegd. Per stap de eigenaar/skill en de gate. **De cutover (C3/C5) is onomkeerbaar en raakt ieders cijfers — niet starten vóór Fase B groen is.**

### Fase A — Functionele volledigheid (`extend-feature` · tester) — ✅ GEÏMPLEMENTEERD (13 jun 2026)
A1 pot-regels doorgedraad via de gedeelde `buildHorizonInput` → `runHorizonLedger(input, options)` (loader laadt `pot_rules`; `surplusTargetTypes` + aparte `deficitOrder` in de engine; getest). A2 `ONDERHOUD_PCT` → `constants.ts` (`NL_HOME_MAINTENANCE_PCT`); Box 1/HRA volledig uit de engine (belasting = Box 3). A3 onttrekkingsstrategie zit nu in de lijn (deplete→€0, perpetual behoud, legacy, guardrails/vpw/bucket via `applyWithdrawalStrategy`). tsc schoon; 30 engine/integratietests groen.

- **A1. Pot-regels doordraden.** `profiles.pot_rules` in de loader laden → mappen naar `HorizonStrategyOptions` (incl. `expandGroupsToAssetTypes`, surplusGroup → `aflossen-eerst`/pot) → via `buildHorizonInput` + `runSelectedProjection(input, v2, options)` → `runHorizonLedger(input, options)`. Test elke regel (volgorde/toename/afname).
- **A2. Box 1 + losse constanten.** Box 1 blijft **buiten de lijn** (educatief inzicht apart — beslist), dus geen engine-werk; wél `ONDERHOUD_PCT`/`BOX3_YEAR`-placeholders uit `engine.ts` naar `lib/constants.ts`/`box3-data` halen (architect-flag opruimen).
- **A3. Dekkingscheck.** Elke instelling uit `/toekomst/voorkeuren` + `/toekomst/gebeurtenissen` aantoonbaar gehonoreerd in v2; dekkingsmatrix (§4) actualiseren.

### Fase B — Validatie & vertrouwen (tester · calc-engine-specialist) — ✅ AFGEROND (13 jun 2026)
De parity-sweep ving drie echte v2-bugs, alle gefixt: legacy-need-only (ADR 0014), eigen-huis-downsize = asset-liquidatie (ADR 0015), recurring-×12-eenheid (`horizon-engine-v2.md` §4.8). Acceptatiecriteria + reëel-vs-nominaal-keuze vastgelegd in **ADR 0016**.
- **B1. Acceptatiecriteria.** ✅ Vastgelegd in ADR 0016 (7 criteria; 1/2/3/5/6 groen, 4 [afgeleide metrics] + 7 [surfaces convergeren] zijn af te vinken in Fase C).
- **B2. Parity-review.** ✅ `compareEngines` over de persona-set + owner: persona deplete +7 jr / legacy +6 / perpetual +1 / pensioen 0 (reëel-vs-nominaal, by design); owner legacy €200k v1-onbereikbaar → v2 ~74 haalbaar. Inspecteerbaar op `/beheer/horizon-tabellen-mij`.
- **B3. Reëel-vs-nominaal.** ✅ Route 2 bevestigd (ADR 0016): intern reëel, adapter = enig nominaal-conversiepunt; v2 bewust conservatiever.
- **B4. Regressiesuites.** ✅ deplete→~€0, perpetual behoud, legacy ≥ doel, recurring ×12, housing netto-continuïteit (`test/horizon-engine*.test.ts`, `test/horizon-housing-liquidation.test.ts`).

### Fase C — Oppervlakken & cutover (senior-developer · supabase-db-specialist) — C1+C2+C3 ✅ (13 jun 2026); C4/C5 = aparte migratie
Gekozen aanpak: converge achter de flag → verifieer → flip; deletie apart. Blast-radius gemeten (99 bestanden, 7 niet-FIRE-motoren op v1) → C5 bewust uitgesteld.
- **C1. FIRE-consumenten op v2** — ✅ `dashboard-data-loader` (/overzicht) draait de projectie via `runSelectedProjection(flag)`. `/core` (`core-landing` `computeFireSnapshot`), AI-context en briefing hebben géén eigen engine-aanroep → consumeren de bundel (`fireTargetFromHorizon` = `fire_portfolio_required`, geschreven door de flag-bewuste hook) en liften mee. De snapshot-`fire_age` (trend/fallback) houdt bewust zijn eigen closed-form definitie (zoals `freedomPercentage`, ADR 0009-uitzondering).
- **C2. Afgeleide metrics borgen** — ✅ `computeFreedomProgress`/freedomPct gebruikt `simRequiredPortfolio` (nu v2); gezondheidsscore/sovereignty draaien daarop door. Volledige suite groen (3658), owner draaide al op v2.
- **C3. Default flippen** — ✅ `isHorizonV2Enabled` default AAN (een expliciete `false` is de opt-out); `/api/horizon-engine` GET default-aware. Omkeerbaar (één boolean terug).
- **C4. Legacy-oppervlakken.** ⏳ `runSimulation`-consumenten (fee-analyse, hypotheek-vs-beleggen, household-projection, what-if, strategy-preview) migreren naar v2 of expliciet buiten scope — aparte migratie.
- **C5. Legacy verwijderen.** ⏳ `runUnifiedProjection`/`runSimulation` weg zodra niets ze meer gebruikt (99-bestanden-migratie); ADR 0013-status bijwerken, concern `horizon-engine-v2-duaal` opheffen, catalogus-entry `unified-projection` actualiseren/verwijderen. Bewust apart.

### Fase D — Gates & release (procedure)
- **D1.** Tests groen (unit + regressie + integratie). **D2.** `/code-review` op de volledige diff. **D3.** Security-review (de `/api/horizon-engine*`-routes, data-exposure) + UX-review (de oppervlakken). **D4.** Architectuur-docs sync (`arch:diagram`, concern opheffen, Berekeningen-view, ADR-status). **D5.** `release`-gate vóór deploy.

### Opruimen
- `/beheer/grafiek-werking` (tijdelijke functionele referentie) verwijderen of als naslag markeren.
- `/beheer/horizon-tabellen` (persona-sandbox) + `/beheer/horizon-tabellen-mij` (echte data) blijven als blijvende inspectie/transparantie.

---

## Bijlage — relatie tot onderwerp 1 (de dalende V_nodig-lijn)

Het referentiemodel berekent V_nodig **backward vanaf de eindleeftijd** (`backwardVnodig`): hoe dichter bij D, hoe korter de te financieren periode, dus hoe lager V_nodig. De lijn **daalt** per constructie. Dat bevestigt de diagram-correctie op `/beheer/grafiek-werking` (1a) en is in het nieuwe model niet langer een aparte tekening maar de werkelijke, afleesbare curve in tabel E.
