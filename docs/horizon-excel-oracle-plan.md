# Horizon-rekenmotor → Excel-rekenwijze (oracle-getest) — FASE 0: mapping, faseplan & gaps

> Status: FASE 0 (analyse & plan). Dit document is het mapping-document uit de missie-opdracht
> en groeit mee per fase. Gap-besluiten van de eigenaar worden hier vastgelegd (→ §7).
> Koersbesluit: **ADR 0032** (Excel-oracle, maandbasis, nominaal, parity ≤ €0,01, kernel naast
> v2 tijdens flag-periode — zie ook concern `horizon-kernel-flag-periode` op de plaat).
> Architect-fit-review uitgevoerd 2026-07-02: richting past (C5-patroon); flag-herbouw,
> convergentie-set-invariant en reëel/nominaal-omkering expliciet opgenomen.

## 1. Bron van waarheid (oracle)

| | |
|---|---|
| Bestand | `Core calc v5.xlsm` (map: `C:\Users\janpa\OneDrive\Prive\Archief\`) |
| Vastgesteld door eigenaar | 2026-07-02 — **v5 is definitief**; F+I+J compleet; v4-fixprompt verwerkt |
| Geanalyseerde staat | LastWriteTime 2026-07-02 12:24:53 · 13.024.370 bytes (bestand is ná het versiebesluit nogmaals opgeslagen; snapshot = deze staat) |
| SHA256 (snapshot) | `3E905809B5CC594C98CBC60DD898135E482B7A9D05D7BCD96E16A225D42BA80D` |
| Versielijn | Core calc.xlsx → .xlsm → v2 → v3 → v4 (gevalideerd juli 2026) → **v5** |

Het Excel is bewust "proof of working", niet feature-compleet. Volledigheid hoort in de
code-implementatie; parity geldt binnen het Excel-domein, daarbuiten gelden eigenschaps-tests
(behoud van totalen, geen negatieve potten, waterval sluit).

## 2. Huidige stand in de repo (juli 2026)

**Er bestaat nog géén Excel-oracle-werk in de repo** — geen extractor, geen fixtures, geen
parity-tests. De bouwblokken A–J zijn ín het Excel gebouwd (via Claude-in-Excel-prompts), niet
in code. FASE 1 en 2 zijn dus nieuwbouw.

De huidige engine is de **v2-grootboek-engine** (`lib/horizon-engine/`, v1 is fysiek verwijderd,
C5-traject). Kernverschillen met de Excel-rekenwijze:

| Aspect | v2-engine (huidig) | Excel-kern (doel) |
|---|---|---|
| Tijdsbasis | **jaarbasis** (leeftijd-loop) | **maandbasis**, index 0..~1200 |
| Volgorde binnen periode | binnen-jaar sequentieel (schok→rendement→Box3→schuld→cashflow→surplus/onttrekking) | **één-maand-lag exact**: belasting(m)=heffing over saldi(m−1); capaciteit/pot-share = saldo(m−1); rendement(m) = saldo(m−1)×rente/12 |
| Box 3 | drag op het vermogen per asset | **via de cashflow** (vóór FIRE minder sparen, ná FIRE extra onttrekking); netto = bruto |
| Verdeling toename/afname | allocatie-plug-ins (pro-rata/vast/alles-beleggen/aflossen-eerst) + sequentiële waterval op `withdrawalOrder` | **capaciteit-waterval**: prio-gewichten ½^(prio−1) genormaliseerd, cap op saldo(m−1), doorstroom-passes, reserve = prio 5, restant → tekort-lening |
| Tekort-dekking | liquide leegtrekken, collapse-guard | **tekort-lening** (rente instelbaar, prio 1 bij aflossen) |
| FIRE-bepaling | forward doel-zoektocht (`meetsStrategyTarget`, MIN_DECUM_YEARS=3, crossing-interpolatie) | **maand-bisectie** op gap (netto-liquide op eindleeftijd − doelbedrag → 0); "pensioen" kortsluit naar AOW |
| Solver-uitkomst | `fireReachable` boolean (+ enkele flags) | expliciete statussen: `reached_now` / `reached_at` / `unreachable` (+ €/mnd-extra-hint) / `pension_shortfall` |
| Reëel/nominaal | intern reëel; adapter → nominaal (×(1+infl)^jaar), ADR 0016 | volgt Excel (verificatie in §3); indexatie expliciet in de stromen |
| Onttrekking | static/guardrails/vpw/bucket (`WithdrawalStrategyType`) | **behoefte-gebaseerd** × onttrekkingsprofiel Vast/Afnemend/Oplopend (3-fasen-curve) /Guardrails |
| Granulariteit | per individueel asset + schuld | per-pot grootboek (Excel-slots; in code onbeperkt) |

Relevante bestaande modules: `engine.ts` (runHorizonLedger), `build-input.ts` (buildHorizonInput,
incl. downsize-trigger, opeethypotheek, generieke liquidaties), `adapter.ts` (reëel→nominaal),
`select.ts` (runSelectedProjection), `scalar-bridge.ts`, `views.ts`, `networth-projection.ts`.
Architectuurdoc: `docs/architecture/horizon-engine-v2.md` (invarianten INV-1..7). ADR's: 0012–0021,
0027–0031.

**Tweede rekenpad (los van de engine):** `computeFireProjection`/`computeFireRange` in
`lib/horizon-data.ts` — scalar-helper zonder life events, gebruikt door dashboard-fallback,
`lib/check/build-report.ts`, benchmark, `lib/cashflow-settings.ts`, `lib/freedom-milestones.ts`,
year-in-review en EventPane-baseline. Scope-besluit nodig (→ gap V10).

## 3. Excel v5 — structuur & verificatie (diepteanalyse 2026-07-02)

Volledige dumps in scratchpad `excel-v5/` (`structuur.md`, `inputs.json`, `named-ranges.txt`,
`rekenflow.md`, `verificatie.md`, `vba.txt`, raw-dumps + byte-identieke snapshot). Verhuist in
FASE 1 naar de repo (`docs/horizon-oracle/`).

**23 tabs:** P (invoer + solver-status) · Geb (gebeurtenissen: rij 4-13 handmatig, 14-30 auto,
32-37 werk-info) · Werk-strategie (J: reële ladder → nominale delta → FIRE-gegate → CF!D) ·
Auto-gebeurtenissen (AOW / multi-pot pensioen / kinderen-NIBUD / erfenis → Geb 14-30) · bens
(potten-invoer: 10 bezit-slots + 7 schuld-slots) · Toelichting model (16-secties zelfdocumentatie)
· Prognose (maandvermogen; I = netto, J = netto-liquide) · Rapport (dashboard + assertions;
perspectief-schakelaar F2 = weergave-only) · Controle (maand-reconciliatie: 5 identiteiten +
invarianten K8-K11) · ES (eindstrategie-spiegel) · TS (prio's / niet-liquide) · Bez
(bezittingen/maand + woningblok AY:BE) · S (schulden/maand; slot 4 = opeethypotheek, slot 7 =
tekort-lening) · CF (cashflow) · Bel (Box 3: forfaitair D-K, werkelijk L/M, canoniek N) · Af
(gebeurtenis-kosten) · Ont (onttrekkingsbehoefte + profielfactoren) · Toename en afname
(categorie-gewichten/€) · Verdeling (capaciteit-waterval, 3 onderwerpen, 219 kolommen) ·
MC / Hist / Sim (onzekerheid) · PT (partner-parameterlaag).

**Bevestigde principes:** maandbasis 0-1199 (tot leeftijd 100); volledig formule-gedreven; VBA
alleen `BepaalFIRE` / `RunScenarioBand` / `RunMonteCarlo` (Module1, geëxtraheerd naar `vba.txt`);
één-maand-lag structureel (o.a. CF!K2 = Bel!N(m−1); shares/caps/triggers op m−1); Box 3 via de
cashflow (vóór FIRE CF!I, ná FIRE Ont!D); netto = bruto (Prognose!I = H, Box 3 niet cumulatief
van vermogen afgetrokken); FIRE-grondslag Prognose!J = I − niet-liquide (TS!H5:H10/H16:H20);
waterval ½^(prio−1) genormaliseerd + reserve prio 5 + tekort-lening; **nominaal model** — reële
invoer wordt vooraf geïndexeerd met (1+P!B14)^(m/12) (incl. heffingsvrij vermogen en
schuldendrempel), niet-geïndexeerde posten vooraf gede-indexeerd, nergens deflatie. Nuance
t.o.v. het eerdere v2-beeld: Bel leest grondslagen rechtstreeks uit Bez/S (niet via CF!K).

**F/I/J aanwezig (v5-nieuw):**
- **F onttrekkingsprofiel**: P!B69-B82 → Ont!F/H/I; de profielfactor grijpt alleen op de
  uitgave-term (Ont!J1); guardrails toestandloos met m−1-anker (referentie P!B82); invariant
  Controle!K10.
- **I solver-statussen**: P!B93-B100 — `reached_now` / `reached_at` / `unreachable_within_horizon`
  (+ €/mnd-extra-hint B96) / `pension_shortfall`; stale-detector B95; VBA-status B100.
- **J werk-strategie**: eigen tab; lek-invariant Controle!K11 (delta's lekken niet buiten de
  werkfase).

**v4-fixes geverifieerd:** solver herdraait altijd vers over de volle range; slot-hardcoding is nu
een **bewaakt contract** (Controle!K8/K9: huis = bens rij 6, hypotheek = rij 17; opeethypotheek =
rij 20, tekort-lening = rij 23) — in code worden dit getypte rollen i.p.v. posities; AY-guard in
S!E én S!F + D-nulzetting + Rapport!D80-assert (cached: "OK — verkoop op leeftijd 64");
Box3-gate symmetrisch; P!B54 bedraad via ES!C13 → P!B37 en MC!B8. Cached foutcellen: 0.

**⚠ Vlaggen in de geanalyseerde save (2026-07-02 12:24):**
1. **Stale solver-staat**: P!B38 (gap) = +€23.276 bij B16 = 52,167; de eigen stale-detector
   P!B95 staat aan; Sim!B7 ("Verwacht", vastgelegd 2026-07-02) zegt FIRE = 55,583 — onder gelijke
   inputs onverenigbaar met 52,167. Vóór fixture-extractie MOETEN `BepaalFIRE` +
   `RunScenarioBand` (+ `RunMonteCarlo`) opnieuw draaien (→ gap V2).
2. **TS!A23 config-fout**: "FOUT: 2 gevulde categorieën zonder prioriteit" (→ gap V2).
3. **Hist-backtest zonder data** (Hist!B2 = 0) — de backtest-tak is leeg in het model (→ gap V11).
4. MC uit-stand: 200 bevroren runs (slaagkans 0,535), per-pot idiosyncratische ruis 0,3σ
   (MC!C12:L12) — deterministisch (sin-hash), oracle-veilig na herdraaien.

Controle!K1 (reconciliatie): "OK — alles sluit".

## 4. Consumenten-inventaris (alles wat straks op de nieuwe kern moet)

Centrale paden: `lib/hooks/use-horizon-fire-sim.ts` (client-hook), `lib/dashboard-data-loader.ts`
(server, één run → widget-props), `lib/fire-target-shared.ts` (canoniek FIRE-doel),
`lib/horizon-engine/build-input.ts` (enige input-assemblage, gedeeld client/server).

| Oppervlak | Consument | Neemt af |
|---|---|---|
| /toekomst grafiek | `horizon-client.tsx` → `sim-chart.tsx` (+widget, markers, grafiek-uitleg) | SimResult, unifiedRows, effectiveLifeEvents |
| /toekomst events | `event-pane{,-view,-edit}.tsx`, `whatif-beslishulp` | delta-FIRE-previews (scalar-bridge) |
| Strategie-modals | `strategie-modal.tsx` (eind), `withdrawal-modal.tsx`, 4 strategie-editors | previews (`lib/strategy-preview.ts`, `runScalarProjectionV2`, `runHousingScenarioProjectionV2`) |
| Dashboard | 14+ widgets via `DashboardData` (fire-prognose, vrijheidsvoortgang, mijlpalen, scenario's, pensioen-aow, swr-monitor, surplus-gap, sim-vermogenspad, backtesting, monte-carlo, gezondheid, jouw-pad, inflatie-impact, vrijheidsdagen) | freedomPct, fireAgeFractional, requiredFirePortfolio, simRows, … |
| Eigen engine-calls | `fee-analyzer-widget` (`lib/fee-analysis.ts`), `hypotheek-vs-beleggen-widget` (`lib/hypotheek-vs-beleggen.ts`) | eigen runs met varianten |
| /overzicht | hero + mini-timeline + vrijheid-strip via `core-data-loader.ts`/`fire-target-shared.ts`; `networth-projection.ts` (mini-grafiek totaal vermogen) | fireAge, freedomPct, netto-vermogen-pad |
| What-if | `whatif-page-client.tsx`, `whatif-beslishulp.model.ts` | meerdere runs met gewijzigde input |
| Huishouden | `lib/household-projection.ts`, `app/api/household/fire-projections/`, vergelijking-widget, retirement-pane | per-partner + gecombineerde runs |
| AI | `lib/ai/context/shared-context.ts` e.a. | loader-FIRE-velden (geen directe engine-call) |
| Rapportages | `lib/report-data.ts`, `lib/check/build-report.ts` (scalar), year-in-review | kerngetallen |
| Beheer | `/beheer/horizon-tabellen(-mij)` (`app/api/horizon-engine/ledger`), `/beheer/horizon-strategie` (regressiematrix), `/beheer/grafiek-werking` | ledger-tabellen A–H, matrix |
| Regressie | `lib/regression-tests/suites/{fire-simulatie, horizon-grafiek, horizon-parameters, onttrekkingsstrategie, huis-strategie-trigger, horizon-asset-liquidatie, horizon-whatif, whatif-scenarios, berekening-performance, inkomen-uitgaven-analyse}` + horizon-strategie-matrix | golden-uitkomsten |
| Toekomst-regels | `lib/future/regel-sim.ts` | scenario-runs |

## 5. Mapping app-input → kern-input (adapter, FASE 3)

| App-bron | Veld/mechanisme | → Kern-input |
|---|---|---|
| Inkomen | `profiles.net_monthly_income` / 6m-gemiddelde | maandinkomen in cashflow |
| Uitgaven nu | budget/cashflow-bronnen (`resolveSavingsSource`-familie) | maanduitgaven vóór FIRE |
| Uitgaven ná FIRE | `computeRetirementExpenses`: `essential_budgets` \| `custom_amount` \| `current_income` (`profiles.retirement_expense_method`) | onttrekkingsbehoefte-basis (geïndexeerd) |
| Sparen/inleg | `monthly_savings_override` → cashflow-spaarquote → `monthly_contribution`×12 | toename-capaciteit |
| Bezittingen | `assets`: `asset_type`→categorie, `current_value`, `expected_return`→pot-rente, `is_liquid`/`eigen_huis`→niet-liquide-vlag, `net_worth_inclusion_pct` (→gap V6), `sale_config`→liquidatie-event | potten in het grootboek |
| Schulden | `debts`: `current_balance`, `interest_rate`, `monthly_payment`, `repayment_type`, `include_aflossing_in_savings`, `linked_asset_id` | schuld-potten + aflossingsschema. **Adapter-aandachtspunt (CF-port-vondst):** Excel-CF!G laat bij payoff de **hele geplande maandlast** vrijvallen (gate `bens!H="Ja"` ≈ `include_aflossing_in_savings`), terwijl app-v2 per ADR 0020 alléén het rente-deel vrijgeeft (aflossing zat al in sparen). De adapter moet de sparen-invoer + H-vlag zó zetten dat er geen dubbeltelling ontstaat — expliciet testen in FASE 3. |
| Life events | `life_events` → `lifeEventsToCashflows` (met `skipEventIds`); dedicated expanders: `aow`, `pension` (annuitizePension), `werk` (`lib/werk-strategie.ts`), housing (virtueel, `housing-strategy:`-prefix) | generieke kasstromen/afnames + liquidatie-events |
| Eindstrategie | `profiles.fire_end_strategy` / `fire_end_age` (default 90) / `fire_legacy_amount` | eindstrategie + solver-doelbedrag |
| Onttrekking | `profiles.withdrawal_strategy` (`static\|guardrails\|vpw\|bucket`) + `guardrail_*` | onttrekkingsprofiel (migratie: vpw/bucket→Vast; →gap V4) |
| Woning | `profiles.housing_strategy_config` (4 modi, triggerAge/salePricePct/salesCostsPct/saleValuationBasis/depletionThresholdYears; reverse_mortgage: maxLoanPct/interestRate/monthlyPayout) | woning-strategie-parameters (→gap V8 voor "wanneer nodig"-fallback) |
| Pot-voorkeuren | `profiles.pot_rules` (3 orde-regels op 5 groepen) | waterval-prio's (→gap V5) |
| Parameters | `resolveFireParams`: `expected_return`, `inflation_rate` | pot-rentes-default + indexatie |
| Box 3 | `box3Method` forfaitair/werkelijk + `lib/box3-data.ts`-constanten | Box3-tak-selector + tarieven |
| AOW | `aow_leeftijd`-tabel (`lookupAowAge`) + `computeAowMonthly` | AOW-kasstroom + pensioen-kortsluiting |
| Partner | huishouden-data (`household-projection.ts`) | partner-stromen (→gap V3) |

## 6. Feature-classificatie: kern / wrapper / gap

**KERN (Excel-gedekt, parity-getest):** maandgrootboek per pot; cashflow; Box 3 forfaitair +
werkelijk via cashflow; capaciteit-waterval + tekort-lening; onttrekkingsbehoefte × profiel
(Vast/Afnemend/Oplopend/Guardrails); eindstrategieën deplete/legacy/perpetual/pensioen; woning
4 modi incl. opeethypotheek en "wanneer nodig"-trigger; solver + statussen; werk-stromen;
partner-stromen; auto-gebeurtenissen; scenarioband + deterministische MC + hist.

**WRAPPER (app-rijkdom → kern-input, of kern-uitvoer → oppervlak):** de 4 strategie-expanders;
event-catalogus → generieke stromen (children/NIBUD, inheritance, begrafenis, sabbatical, …);
`sale_config`-liquidaties; previews (strategy-preview); alle widgets/kerngetallen (freedomPct,
mijlpalen, countdown); what-if-varianten; household-runs; backtest op app-reeksen;
networth-projection (/overzicht); beheer-tabellen.

**GAP (vragen aan eigenaar):** zie §7.

## 7. Gap-besluitenregister

_Vragenlijst V1–V15 geleverd bij afronding FASE 0; alle antwoorden ontvangen 2026-07-02._

| # | Onderwerp | Besluit (eigenaar, 2026-07-02) |
|---|---|---|
| V1 | Regressie-goldens | **Optie 1** — dubbele goldens tijdens flag-periode; bij de flip v2-goldens vervangen mét verklaring per afwijking in het technisch rapport. |
| V2 | Fixtures & refresh | **Akkoord** — extractor via Excel-COM (kopie; inputs zetten → macro's draaien → tabellen naar JSON) + de voorgestelde scenario-set. TS!A23: de extractor zet de ontbrekende prioriteiten als gelogde override (interpretatie van "akkoord"; base-fixture krijgt de prio-fix expliciet in meta). |
| V3 | Huishouden/partner | **Optie 1** — kernel = huishouden-run (parity op PT-fixture); per-partner-weergaven = aparte kernel-runs met deel-invoer, eigenschaps-getest. |
| V4 | Onttrekkingsprofiel | **Optie 1** — enum-migratie `vast\|afnemend\|oplopend\|guardrails` (static→vast; vpw/bucket→vast), 3-fasen-curve in nieuwe JSONB-kolom met Excel-defaults; bestaande withdrawal-modal wordt de profiel-UI. |
| V5 | Waterval-prio's | **Optie 2** — UI uitbreiden naar échte prio's per categorie (Excel-gelijk, 1..5), mét de afwijkende reserve-semantiek: **prio 5 = reserve, pas aanspreken bij depletie van de overige opties** (Excel-reserve-pass). pot_rules-migratie hoort erbij. |
| V6 | `net_worth_inclusion_pct` | **Optie 1** — adapter schaalt de pot bij instap (waarde × pct); eigenschaps-getest (buiten Excel-domein). |
| V7 | Tekort-lening | **Volledig** — rente gebruikers-instelbaar (FIRE-instellingen, default uit Excel) én **zodra de projectie de lening aanspreekt wordt hij zichtbaar** (meelopen in curve/schulden op /toekomst + volledige rij in beheer-tabellen). |
| V8 | Wanneer-nodig-verkoop | **Optie 1** — Excel-semantiek: trigger op liquide(m−1) onder drempel + `fallbackAge` in de huis-strategie-config met Excel-default. |
| V9 | market_shock | **Optie 1** — kernel krijgt generiek pot-mutatie-event (%, maand) als gedocumenteerde uitbreiding buiten het Excel-domein; eigenschaps-getest. |
| V10 | Scalar-helpers | **Optie 1** — in FASE 5 óók op de kernel via een lichte scalar-modus in de adapter; heft de drie-engines-divergentie definitief op. |
| V11 | Band/MC/backtest | **Optie 1** — scenarioband + MC via de Excel-methode als kernel-wrapper (parity dankzij determinisme); backtest houdt de app-reeksen = bewuste, geaccordeerde afwijking (Excel-Hist is leeg). |
| V12 | Solver-statussen | **Optie 1** — vier statussen + €/mnd-hint in de bestaande status-regel bij de /toekomst-grafiek. |
| V13 | Flag-mechanisme | **Optie 1** — per-user pref in `profiles.feature_preferences`: één vlag voor de convergentie-set + aparte vlaggen voor what-if/household/scalar; beheer-toggle. |
| V14 | Reëel-weergave | **Optie 1** — kernel-adapter blijft de inflatiefactor per rij meegeven (deflatie-wrapper); contract intact. |
| V15 | Snapshot-trend | **Optie 1** — knik accepteren + annoteren ("rekenwijze gewijzigd op …") in de trend-weergave. |
| V16 | Erfenis-formule (FASE 2-vondst) | **Akkoord: bewuste modelkeuze** — Excel keert de vrijstelling zelf niet uit (netto = MAX(0, bruto − vrijstelling) × (1 − tarief)); kernel volgt het oracle exact (NB-comment in `tables/auto-gebeurtenissen.ts`). |
| V17 | Lege-surplus-doelpot (end-to-end-verificatie 2026-07-03: app FIRE 59,58 vs Excel 89,33 op identieke eigenaar-invoer; oorzaak: Excel laat maandspaar verdampen bij Σgewicht=0, kernel-degeneratie-fallback stort het in de lege pot) | **Besluit eigenaar: kernel-extensie blijft; borging = Excel v6 fixen + fixtures herextraheren** (eigenaar-actie; daarna is byte-parity weer totaal). Tot die tijd: surplus-/withdrawal-evaporation-tests = vangnet, concern `horizon-kernel-bekende-afwijkingen` documenteert de divergentie, en de divergentie mag níet "richting oracle" worden weggefixt zonder nieuw eigenaar-besluit. Herhaalbare check: `scripts/horizon-oracle/{dump,inject,compare}-eigenaar-live*` (opt-in `EIGENAAR_LIVE=1`; zie README §Re-run). |
| V18 | Handmatige AOW-event-invoer (eigenaar had €1.558/mnd vanaf 69 ingevoerd; adapter negeert dat en rekent formule-AOW €1.452/mnd vanaf 68,5 uit de AOW-tabel — kernel én Excel onderling consistent) | **Besluit eigenaar: formule blijft leidend** — de AOW-tabel (wettelijke leeftijd + formule) is de bron; handmatige event-waarden blijven alleen weergave/marker. Geen adapter-wijziging. |
| V19 | Verkoop-transitie-lag-piek / geen aflossingspad tekort-lening (F6-bugfix, 2026-07-04). Bij een "wanneer nodig"-huisverkoop ontstaat door de één-maand-capaciteitslag (verdeling capt op categoriesaldo m−1) een tekort van één maand (eigenaar: €6.758 op leeftijd 75) dat als tekort-lening wordt geboekt. Die lening kon NOOIT worden afgelost: `tekortAflossing` (S!AC) werd uitsluitend gevoed uit het Toename-aflos-budget (positief maandsurplus), in de onttrekkingsfase structureel 0 → 17 jaar 5%-rente-compounding (€7.074 → €16.521) terwijl er >€900k liquide náást stond. Oracle-getrouw (Excel doet het ook), maar een modelbeperking. | **Besluit eigenaar (2026-07-04): kernel-extensie, TRANSITIONEEL — ADR 0033.** Een maandelijkse tekort-aflos-stap in `computeVerdeling` lost een openstaand tekort (saldo m−1 + zijn rente) af uit de RESTERENDE liquide bezit-capaciteit (ná afname/onttrekking, m−1-lag), in de onttrekking-waterval-volgorde; Σruw=0 blijft gelden (wat uit bezit wordt getrokken = wat op de tekort-lening wordt afgelost), geen dubbele rente-boeking. Schakelbaar via `KernelInput.tekortAflossingUitLiquide`: **app-pad AAN** (adapter), **parity-/fixture-pad UIT** (`input-from-fixture` zet 'm níet → 735 fixtures byte-groen tegen Excel v5). Borging = Excel v6 fixen + fixtures herextraheren (eigenaar-actie; prompt geleverd bij de F6-bugfix); daarná kan parity mét de stap AAN draaien en vervalt de vlag. Vangnet tot die tijd: `lib/horizon-kernel/tekort-aflossing-liquide.test.ts` + concern `horizon-kernel-bekende-afwijkingen` (punt 4); de divergentie mag níet "richting oracle" worden weggefixt zonder nieuw eigenaar-besluit. |
| V20 | AOW-bedrag-divergentie kern vs. app (kaart [Arch F4], architectuurreview 3 jul 2026 bevinding #13). De kern rekende Auto-geb **B21** onvoorwaardelijk op de Excel-oracle-basis €1.452 (alleenstaand) / €993 (samenwonend, 2025-basis), terwijl de rest van de app de canonieke SVB-bedragen uit `lib/constants.ts` toont (€1.581,55 / €1.084,13 per 1-7-2026) — ~8% verschil, nergens als besluit vastgelegd. `adapter/defaults.ts` spiegelde de 993 bovendien voor de partner-AOW (PT!B9). | **Besluit eigenaar (2026-07-29): optie C — AOW-basis wordt kernel-INPUT, ADR 0064.** `KernelInput.autoGebeurtenissen.aowBasisPerMaand` (`{alleenstaand, samenwonend}`) is **optioneel en inert-by-default**: weggelaten → oracle-fallback 1452/993 (`tables/auto-gebeurtenissen.ts`), en `input-from-fixture` zet 'm níet → **736 parity-assertions byte-groen** tegen Excel v5 zónder fixture-herijking. De app-adapter zet 'm wél, via `APP_AOW_BASIS_PER_MAAND` (= `NL_AOW_MONTHLY`/`NL_AOW_MONTHLY_SAMENWONEND`) in `NEUTRAL_AUTO_GEBEURTENISSEN`, dus op élke app-run — ook zonder AOW-life-event. Partner-AOW volgt dezelfde grondslag (`AOW_SAMENWONEND_PP_PER_MAAND`, was `EXCEL_AOW_SAMENWONEND_PP_PER_MAAND` = 993). B21-formulevorm ongewijzigd; alleen de basis is invoer. Bewuste gedragswijziging op het app-pad: de FIRE-projectie rekent voortaan met de actuele SVB-AOW. Vangnet: `lib/horizon-kernel/aow-basis-injectie.test.ts` + concern `horizon-kernel-bekende-afwijkingen` (punt 5); de kernelwaarden/oracle-fallback mogen níet worden gewijzigd zonder fixture-herijking + nieuw eigenaar-besluit. |

## 8. Faseplan

- **FASE 0 — Analyse & plan** (dit document): mapping, faseplan, gap-vragen. ✔ na oplevering.
- **FASE 1 — Oracle-harnas — ✔ AFGEROND 2026-07-02**: extractor `scripts/horizon-oracle/
  extract_fixtures.py` (Excel-COM op een kopie, eigen onzichtbare instantie, MsgBox-watchdog,
  zombie-kill-fallback) + `scenarios.py` + refresh-README; **12 fixtures** in
  `test/fixtures/horizon-oracle/` (409–458 KB, alle `Controle!K1 = "OK — alles sluit"`, bron-hash
  identiek aan de analyse-snapshot); analyse-docs naar `docs/horizon-oracle/`; framework
  `lib/horizon-kernel/oracle/` (fixture-types, Node-loader, `compareGrid` ≤ €0,01,
  `summarizeComparisons`) + integriteitssuite; 131 tests groen, tsc schoon. **Nuances voor
  FASE 2:** (1) macro-protocol = `BepaalFIRE → RunScenarioBand → BepaalFIRE → RunMonteCarlo`
  (Band herstelt B16 uit Sim!B7); (2) stale-detector P!B95 geeft **vals alarm** op
  maand-granulariteits-restanten (5%-van-doel-drempel) — versheid = idempotentie-bewijs
  (herdraaien laat B16/B38 exact ongewijzigd), zo verankerd in integriteitscheck (d);
  (3) **B93 `reached_now`-quirk** bij doel = 0 (J(0)≥B36 degenereert) — de kern reproduceert dit
  Excel-gedrag (parity); de UI-status (V12) kan hier later bewust van afwijken → dan gap-besluit;
  (4) basis-scenario ís legacy €100k@90 + profiel Afnemend + huis wanneer-nodig + werk actief,
  dus `eind-legacy`/`profiel-afnemend`/`huis-verkoop-wanneer-nodig` zijn door basis gedekt en
  `profiel-vast`/`werk-strategie-uit` toegevoegd; (5) TS!A23-fix als gelogde override
  (TS!D41/D42 = 5, gewicht 0). **Nog toevoegen tijdens FASE 2** (via de refresh-procedure):
  ✔ fixtures woning-modi **Meerekenen**/**Uitsluiten** + **onhaalbaar** + **pensioen-tekort**
  (toegevoegd 2026-07-02 → 16 fixtures). **Nog open — fixture-ronde 3** (vóór FASE 3, want de
  expander-takken zijn nu onbeproefd doordat alle 16 fixtures dezelfde Auto-geb-invoer delen):
  een `gezin`-achtig scenario met partner-leefsituatie ≠ Alleenstaand (AOW-993-tak), actieve
  kinderen (NIBUD J-N-waarden), erfenis > 0 én gevulde **pensioen-multipot** (rij 26-31 —
  annuïtisering is bewust nog "" in de kernel tot een fixture dit exerceert); evt. gesplitst in
  2 scenario's als één combinatie het model-gedrag vertroebelt. Plus (Toename-en-afname-vondst):
  een scenario met een **schuld-categorie op toename-prio 1-4** (combined-noemer-tak nu alleen
  in 0-vorm bewezen; bewijst óók de S-extra-aflossing-kolommen F/J/N/… en de GT:GX/ER:EV-
  mapping die nu overal 0 zijn) en één waarin de **reserve (prio 5) daadwerkelijk wordt
  aangesproken** (depletie van de overige categorieën) + een periodiek negatief event
  (Af-multi-post) + **partner-pensioen > 0** (PT!B6/B8/B12-takken zijn in alle 16 fixtures
  onbeproefd).
- **FASE 2 — De kern**: nieuw pure-TS-pakket **`lib/horizon-kernel/`** (architect-besluit:
  "core" botst met De Kern-module; oracle-artefacten apart onder `docs/horizon-oracle/` +
  `test/fixtures/horizon-oracle/`), tabel-voor-tabel in Excel-volgorde, elk blok pas verder als
  parity groen: cashflow → Box 3 (beide takken) → onttrekkingsbehoefte+profiel →
  gebeurtenis-afnames → capaciteit-waterval → grootboek per pot → schulden+tekort-lening →
  prognose/netto-liquide → solver+statussen → wrappers (scenarioband, MC, hist). Geen Supabase,
  constanten op de canonieke plek. Excel-slot-rollen (huis=bens rij 6, hypotheek=17, opeet=20,
  tekort=23) worden getypte rollen, geen posities.
  **Voortgang (2026-07-02):** aanpak = teacher-forced parity per tabel (deps uit de fixture →
  tabellen parallel geport), daarna integrale forward-recursie. ✔ **Input-model compleet**
  (alle P/TS/bens/Geb/Auto-gebeurtenissen/PT/Werk/onzekerheid-blokken + getypte slot-rollen;
  P!B82-anker bewust DepView; bens kent géén maandinleg — inleg loopt via de waterval).
  ✔ **Alle 14 tabellen geport in één parallelle golf (10 agents): ~8,92 mln cellen over
  16 fixtures, 0 mismatches** — zie `lib/horizon-kernel/README.md` §Parity-stand voor de
  tabel-voor-tabel-cijfers én de lijst slapende paden die op fixture-ronde 3 wachten.
  Kern-vondsten van de golf: tax-lag zit bij de consument (CF!K(m)=Bel!N(m−1)); horizon-guard
  en kolom-thuisbasis zijn tabel-specifiek; PT bleek een echte maandtabel (naloper-port);
  verdeelgewichten op volle precisie herrekenen (fixture is 6-decimalen); reserve prio 5
  krijgt 0% gewicht en wordt alléén door de Verdeling-reserve-pass bediend; Verdeling-
  eindtoewijzing (niet de behoefte) voedt de Bez-inleg. ✔ **Integrale engine** (`engine.ts`:
  eigen-toestand-recursie, guardrails-anker self-capture, integrale parity 0 mismatches over
  alle tabellen × 16 fixtures; ving een echte conventie-bug: Periodiek-zonder-eind → horizon).
  ✔ **Solver** (`solver.ts`: VBA-BepaalFIRE-bisectie + statusblok; 16/16 solver-parity vanuit
  alleen de input — na spend-limiet-uitval van de agent in de hoofdthread afgebouwd; vondst:
  messcherpe drempels op afgeleide euro-waarden vereisen een halve-cent-ruisclamp, zie B99).
  ✔ **Wrappers** (`wrappers/band.ts`+`mc.ts`+`hist.ts`-stub): band = 3× bisectie — LET OP:
  RunScenarioBand doet géén pensioen-kortsluiting (oracle-bewezen, eind-pensioen
  Sim!B7=52,92≠67); Sim!C=Prognose!I@FIRE, Sim!D=Prognose!J@eindleeftijd; MC =
  deterministische sin-hash (u=0,0001+0,9998·MOD(SIN(arg)·43758,5453;1) → NORM.INV,
  gedeelde schok i·12,9898+π σ=0,15; per-pot i·78,233+(slot+1)·37,719 σ=0,3·0,15), n=10
  bevroren runs, slaagkans=MC!B4; hist inert (V11). Doelblok B35-B38 gedeeld in `gap.ts`.
  ✔ **Fixture-ronde 3 + alle slapende takken geïmplementeerd (2026-07-02): 19 fixtures,
  847 tests groen, tsc schoon — de rekenlaag is compleet.** Geactiveerd + bewezen:
  pensioen-multipot-annuïtisering (PMT; duur-SWITCH incl. verborgen ArrayFormula),
  kinderen-NIBUD-events, erfenis (⚠ Excel keert de vrijstelling zelf niet uit:
  netto = MAX(0,bruto−vrijstelling)×(1−tarief) — mogelijk model-eigenaardigheid,
  voorgelegd aan eigenaar; kernel volgt oracle), AOW-993/"Samen"-tak, partner-pensioen,
  capped-overerving afname→onttrekking in de waterval, combined-noemer in de schuld-pass,
  HC:HH-overloop, en tekort-lening-aflossing S!AC = MIN(ruwBudget, saldo(m−1)+rente)
  (correctie op eerste recept: same-month-voeding hoort NIET in de cap).
  ✔ **Calc-engine-specialist-review (2026-07-02): geen 🔴 — kern adapter-klaar.** Verwerkt:
  strikte gap-sign-toetsen gedocumenteerd (EPS zou Excel-semantiek veranderen; maand-sprongen ≫
  ruis), absolute-tolerantie-caveat in de comparator (relatieve vloer overwegen bij extreme
  horizon×inflatie), publieke barrel `lib/horizon-kernel/index.ts` (tabellen intern),
  clng-dedupe naar gap.ts, maandHint-guard, stale "16 fixtures"-docs → 19. **Geparkeerd naar
  FASE 5 (perf):** `skipOntDisplayRecompute`-optie (Ont!H/I-herrekening is display-only maar
  draait per engine-run) + dubbele computeBez per maand; advies: solveFire client-side met
  debounce haalbaar (~50-150 ms), band+MC naar worker/server + cache op input-hash.
  **FASE 2 AFGEROND — 847 tests, tsc schoon.**
- **FASE 3 — Adapter**: app-data → kern-input (§5); hergebruik bestaande expanders; dubbeltelling-
  guard op source-markers; eigenschaps-tests buiten het Excel-domein (N potten, totalen sluiten,
  geen negatieve potten).
  **Voortgang:** ✔ **Snede 1 — fundament** (2026-07-02, `lib/horizon-kernel/adapter/`:
  potten/params/prio-overgang/defaults; 868 tests): categorie- en rol-mapping compleet
  (crypto→Beleggingen, levensverzekering→Pensioen; classificatie via canonieke classifyAsset —
  geen tweede pad); V6-schaling; V4-profielmapping + Excel-curve-defaults (P!B71-75);
  V8-woning-defaults (P!B59-66); tekort-rente P!B25=5% (V7-default). **bens!H = INVERSE van
  `include_aflossing_in_savings`** (dubbeltel-preventie: kern-CF!G laat de hele maandlast
  vrijvallen; app-ADR-0020-rente-vrijval bestaat in de kern bewust niet — gedocumenteerde
  afwijking). ⚠ **Vondst: schulden zijn in de kern fysiek gecapt op 7 slots** (S_PHYSICAL_SLOTS;
  bezittingen wél onbeperkt) — kern-uitbreiding of categorie-aggregatie nodig; open punt samen
  met market_shock (V9), generieke `sale_config`-liquidaties en huur-€→%WOZ-conversie
  (→ snede 2b "kern-uitbreidingen buiten oracle-domein"). ✔ **Snede 2 — event-laag + guard**
  (893 tests): per-type-mapping (aow→auto-params; pension→multipot-slots mét PMT-in-kern, geen
  dubbele annuïtisering; children/inheritance→auto-params; werk→ladder-params; huis geblokkeerd
  via config-route; overige→Geb-rijen met postconventie; market_shock=skip+notice V9);
  `guard.ts` = uniform source-marker-filter (superset isStrategyManagedEvent) + partitionEvents;
  **missie-test bewezen: afgeleide stroom precies één keer + solveFire byte-identiek mét/zónder
  visuele events**; capaciteits-notices (pensioen>6, kind>3, Geb 10×3) via EventMappingNotice.
  ✔ **Snede 2b — kern-uitbreidingen buiten oracle-domein** (904 tests, byte-inertie-bewijs):
  `potMutaties` (V9: schok op saldo m−1 vóór rendement, eigen-huis uitgesloten; adapter mapt
  market_shock, skip-notice vervallen); schulden-slot-cap ontgrensd (`debtSlotCount` = vloer 7;
  tekort-lening via getypte rol i.p.v. hardcoded slot 6, ook in solver-B99); `potLiquidaties`
  (sale_config `vast_moment` → netto naar Spaargeld ná rendement; wanneer-nodig/datum/
  payoffDebtIds/prijs-fractie = notice, FASE 4/5). ✔ **Snede 3 — household/partner (V3)**
  (919 tests): `household.ts` (buildPartnerParams → PT!B2-B9 met notices voor onbekend
  partner-pensioen/opbouw; B9 = 993 spiegelt de kern-constante), koppelingen personen=2 +
  leefsituatie='Samenwonend' (kern verdubbelt heffingvrij zelf — niet gedupliceerd),
  `buildPerspectiefInputs` (per-partner solo-runs via eigenaar/splitsings-pct, Σ = huishouden,
  geen dubbeltelling; combined = de huishouden-run). Zonder partner byte-inert (diff-test).
  **FASE 3 (ADAPTER) COMPLEET — 919 tests, tsc schoon.** Open naar F4/F5: partner-pensioen-/
  opbouw-bronnen in het profiel, huishoud-uitgaven-methode, privacy-degrade, wanneer-nodig-
  liquidaties, UI voor shocks/liquidaties. De domein-expanders (AOW, pensioen-annuïtisering, kinderen-NIBUD,
  erfenis, werk) worden zélf parity-getest tegen de Geb/Auto-gebeurtenissen-tabel (fixture bevat
  Geb rij 14-30): reproduceert de expander uit P/PT-inputs exact de Geb-rijen? Bij afwijking wint
  het Excel (oracle), tenzij de eigenaar per geval anders besluit.
- **FASE 4 — Beheer-transparantie + strategie-impact**: beheerpagina met de 5 onderdelen
  (uitgangspunten TriFinity → resolved input → alle maandtabellen mét uitleg per stap → technisch
  rapport → parity/verificatie-status); previews in alle 4 strategie-modals gelijkgetrokken
  (strategy-preview-patroon); AOW- en Werk-afgeleide events zichtbaar op /toekomst/gebeurtenissen
  (bestaand ManagedStrategy-badge-patroon); onttrekkingsprofiel-UI in bestaande instellingen
  (V4). Extra UI-scope uit de gap-besluiten: **prio's per categorie** als echte instelling
  (V5-optie 2: 1..5 per onderwerp toename/afname/onttrekking, prio 5 = reserve "pas bij depletie";
  vervangt de drie pot_rules-orde-regels, incl. migratie) en **tekort-lening zichtbaar** zodra de
  projectie hem aanspreekt (V7: meelopen in curve/schulden op /toekomst; rente-veld in
  FIRE-instellingen).
- **FASE 5 — Cutover achter flag per oppervlak**: LET OP (architect): de flag-infrastructuur is
  in C5 fysiek verwijderd (`isHorizonV2Enabled` → altijd true; toggle-UI en API weg) — de
  per-oppervlak-selector moet **herbouwd** worden (mechanisme = gap V13). Harde invariant: de
  **convergentie-set** (/overzicht-hero, /toekomst-grafiek, dashboard-loader/freedomPct via
  `fire-target-shared`, AI-context) flipt als geheel — nooit gedeeltelijk (anti-divergentie).
  Overige oppervlakken (what-if, household, beheer, scalar-helpers gap V10) mogen apart.
  Vergelijk-weergave oud↔nieuw in beheer. Default-flip + verwijderen v2-paden ALLEEN na
  expliciet akkoord (C5-precedent).
- **EIGENAAR-GO (2026-07-03): default-flip + v2-verwijdering geaccordeerd.** Rationale eigenaar:
  alle flag-periode-bugs zaten in de naden tussen twee motoren; één motor elimineert de klasse.
  Volgorde: (1) lopende weergave-/datapad-fix landt eerst (laatste gezondheidscheck kernel-run
  op echte data), (2) default-flip (kernel aan; v2 achter tijdelijke legacy-noodklep),
  (3) FASE 6-verwijdering gefaseerd (eerst alle rest-consumenten een kernel-pad, dan C5-stijl-
  deletie). Bug-fixing van weergavepunten mag daarna (eigenaar-besluit "bugfixen later").
- **FASE 6 — verwijderplan (inventaris 2026-07-03, C5-stijl, 5 stappen):**
  **(1) ✔ KLAAR (`0c3abdc60` + nazending `206ad72b2` + type-fix `b76730d91`)** — kernel-pad voor
  de resterende pure-v2-previews: strategy-preview, regel-sim, fee-analysis,
  hypotheek-vs-beleggen, housing-trigger, whatif-beslishulp, EventPanes, housing-section-preview;
  benchmark-doorbedrading; build-report-besluit = bewust v2 tot stap 5 (publieke intake).
  **(2) ✔ KLAAR (`51a9bac5c`)** — beheer/API: /beheer/horizon-tabellen-mij vervangen-door-banner
  (route/views blijven tot stap 5, deletiepunten als doc-comment); grafiek-werking herijkt naar
  kernel; horizon-strategie-matrix op kernel-goldens (C/D op perpetual-baseline, v2 als
  vergelijkarm); AOW-stop-sim kernel-native (evaluateFireAt); strategie-modal-profielvergelijk;
  fase-analyse-hvb bedraad. Bewust-v2-tot-stap-5: ghost-overlays, schuld-modal-hvb,
  synthetische regressiesuites (kostenanalyse-ter, kern-hypotheek-vs-beleggen),
  build-report-grootboekdeel. **(3) ✔ KLAAR — DE DEFAULT-FLIP (2026-07-03)**: vlag-semantiek
  gespiegeld in `flag.ts` (default AAN; alleen letterlijke `false` = noodklep terug naar v2),
  PUT-route-hygiëne mee (aan = sleutel wissen, uit = `false` schrijven), beheer-kaart-copy
  bijgewerkt; routers blijven vangnet. Restpunt: de client-side mount-fetch-flits op
  /toekomst en /horizon/whatif toont nu voor íedereen kort v2 vóór de kernel-mount —
  echte fix = server-side context-preload (stap-5-lijst). **(4) ✔ KLAAR (remote `20260703115225` + lokaal spiegelbestand)** — DB bleek al schoon
  (0 vpw/bucket-rijen); migratie = idempotent normalisatie-vangnet + kolom-COMMENTs
  (withdrawal_strategy-contract 'static'|'guardrails' + withdrawal_profile_config-shape
  incl. profiel-voorrang — restpunt "COMMENT-update profiel-shape" hiermee afgevoerd).
  App-side enum-vernauwing ('vpw'|'bucket' uit de types) verhuist naar stap 5 — v2's
  eigen vpw/bucket-runtime + fire-withdrawal-integration-goldens bestaan tot dan.
  Vlag-lezingen blijven eveneens tot stap 5 (noodklep). En passant: drift
  net_worth_snapshots_engine_bron lokaal 20260703013500 → remote-versie 20260702233200
  hernoemd.
  **(5)** fysieke deletie lib/horizon-engine/ + routers ontvouwen + v2-tests/goldens +
  vergelijk-route weg + calculations.ts/concerns (flag-periode-concern + 3 v2-grondslag-
  concerns)/ADR's (0013/0016→vervangen)/docs + .claude-agents-verwijzingen (calc-engine-
  specialist, bug-reporter, requirement-specialist, senior-developer, refactor-skill:
  unified-projection-begrippen). Volledige werklijst in het inventaris-rapport (sessie
  2026-07-03); computeScalarFreedomMilestones nog nergens productie-bedraad (restpunt).
- **FASE 6 — Nazorg: ✔ 5B KLAAR (2026-07-03).** Berekeningen-view: `horizon-kernel`-entry
  (verving horizon-grootboek-v2), unified-projection = typecontract, huis-trigger/werk-strategie/
  vrijheidscheck herschreven op kernel-native mechanismen. Concerns: `horizon-kernel-flag-periode`
  weg; `downsize-display-eligibility-desync` + `downsize-fire-gate-eligibility-vs-besteedbaar`
  **opgelost door de kernel** (huis illiquide tot echte verkoop, matcht getFireEligibleNetWorth;
  geen spendable/saleManaged-splitsing meer); `deplete-doel-lijn-grondslag` geërfd (Prognose!J vs
  !I, geherformuleerd); nieuw concern `horizon-kernel-bekende-afwijkingen` (reached_now-quirk +
  wrappers-scalars). ADR's: 0013/0016 → vervangen; addenda 0014/0015 (geërfd), 0027 (geërfd,
  maand-precisie), 0028 (vervallen), 0030/0031 (moot); 0032-addendum registreert flip +
  verwijdering. horizon-engine-v2.md gearchiveerd met verwijsbanner. Team: calc-engine-specialist
  bezit lib/horizon-kernel/** met oracle-parity-poort + Σruw=0-invariant als Non-negotiables;
  bug-reporter/requirement-specialist/senior-developer gezuiverd; development-model ongewijzigd
  (grep .claude/** = 0 verouderde treffers). arch:diagram geregenereerd; 106 architectuur-tests
  groen. **⏳ Rest 5C (hygiëne):** opruim-migratie feature_preferences horizon_kernel_*-sleutels;
  horizon-tabellen-mij-stub + nav-entry definitief weg (wacht op widget-sessie-commit van
  beheer-sections); dode props (phase-modal kernelEnabled, applyHousingToComposition.isV2);
  test-only initBucketState/rebalanceBuckets; parity-and-schema-performance. Bugfix-lijst
  (ná F6, eigenaar-besluit): deplete-reached_now-benchmark; SimRow-breakdowns undefined
  (whatif-lagen); fireReachable-altijd-true; exponentiële-groei-anomalie late FIRE;
  float-precisie whatif-overrides; **verkoop-transitie-lag-piek ✔ GEFIXT (2026-07-04,
  gap-besluit V19 + ADR 0033)** — maandelijkse tekort-aflos-stap uit liquide bezit,
  schakelbaar via `KernelInput.tekortAflossingUitLiquide` (app-pad AAN, parity-pad UIT
  → 735 fixtures byte-groen). Eigenaar-acceptatie (`EIGENAAR_LIVE`): sale-maand-tekort
  €6.758 op leeftijd 75 → maand erna €0; jaarrij-endBalance 75 = €0 (UI-melding
  verdwijnt); terminale depletie ≥93 blijft (legitiem, stap inert). Nog transitioneel
  (Excel v6 + fixture-herextractie → vlag eruit); pre-FIRE-deficit-spiegel;
  server-side context-preload (mount-flits).

Elke fase sluit met `npx tsc --noEmit` + relevante vitest groen + korte statusmelding.

## 9. Dubbeltelling-guard (harde eis, FASE 3/4)

Eén uniform mechanisme voor alle vier strategieën: afgeleide events dragen een source-marker
(patroon: `housing-strategy:`-prefix + `metadata.source`); de adapter filtert visuele events die
al via de strategie/expander in de engine-input zitten (`skipEventIds`-mechanisme bestaat).
Verplichte test: met strategie actief bevat de kern-input de afgeleide stroom precies één keer,
en de uitkomst is identiek mét en zónder de visuele events in de weergavelijst.
