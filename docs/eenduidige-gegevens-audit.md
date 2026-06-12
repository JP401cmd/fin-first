# Audit: eenduidige gegevens in TriFinity

**Ronde 1:** 2026-06-10 (loaders/engines; fixronde diezelfde dag afgerond — zie §4)
**Ronde 2:** 2026-06-12 (volledig: app-pagina's, widgets, AI/briefing, periferie/snapshots — zie hieronder)
**Vraag:** Welke kerngetallen worden op meerdere plekken berekend/getoond, is er per getal een canonieke bron, en zijn afwijkende getallen gerechtvaardigd?

Alle regelnummers zijn handmatig geverifieerd in de werkboom van de betreffende ronde. Elke claim heeft een bronlink zodat je hem zelf kunt controleren.

---

# RONDE 2 — 2026-06-12: app, widgets en AI

**Scope:** vier parallelle deelaudits (AI/briefing, widgets, rekenmotoren/loaders, periferie/snapshots) tegen de canonieke bronnen en de verse ADR's 0008 (gezondheidsgetal) en 0009 (vrijheidsvoortgang). Alle 🔴-bevindingen zijn daarna handmatig in de bron geverifieerd.

> **STATUS FIXRONDE — golf 1 uitgevoerd 2026-06-12 (zelfde dag):** alle dertien 🔴-bevindingen uit §R2.1 zijn gefixt via vier werkpakketten (snapshots-familie incl. nieuwe gedeelde `app/api/snapshots/snapshot-math.ts`; sovereignty/widgets/hero + `DashboardData.healthScore`+`fireEligibleNetWorth` via `computeHealthScoreWithTrend`; AI-randen report/whatif/briefing/freedom-card/next-steps; maandgrenzen + ESLint-vangrail). Bewijs: tsc schoon, **3352 vitest groen**, lint 0 errors, **security-gate PASS**, **code-review SHIP** (review-opvolging M1/m1/m2/n2 doorgevoerd: JSDoc-eerlijkheid compute-*-access, noemer-comments horizon-client, freedom-card-teller óók op FIRE-eligible + over-fetch getrimd; m3/n1 geaccepteerd als bewuste benadering/cosmetisch). Uit §R2.2 zijn meegenomen: **S4 ✅** (snapshot-net_worth identiek over 3 routes), **S6 ✅** (report-vensters), **S9 ✅** (vangrail, als `warn` — legde 45 bestaande TZ-sites buiten scope bloot; promotie naar `error` na migratie) en de briefing-/checkin-/notifications-dagbasis uit S1.
> **STATUS GOLF 2 — uitgevoerd 2026-06-12 (zelfde dag, 3 werkpakketten):**
> - **S1 ✅** — één gedeelde `dailyExpenseRate` in `lib/format.ts` (×12/365, test-first); ~25 sites gemigreerd (loader-velden, 14 widgets, check-in-pagina's, household box2/box3-routes, horizon-client); AI 30/360-terugconversies (`tax-context`, `aandachtspunten-context`, `freedom-calc`-tool) op `calculateFreedomTime`. Bewust overgeslagen: `/30.44`-kalenderwiskunde (inflatie-koopkracht), `freedom-time-label.tsx` (al /365, eigen output-formaat — consolidatie-kandidaat).
> - **S2 ✅** — schaduw-`NL_SWR=0.04` in `portfolio-summary` weg (passief inkomen was ~39% te hoog; "4%"-displaytekst nu dynamisch); `computeEffectiveSwr` als enige formule-home in `lib/fire-params.ts` (swr-monitor-widget hergebruikt 'm); `HOUSEHOLD_SWR` 0.035→`NL_SWR` (comment was feitelijk onjuist); 0.04-hardcodes in phase-analysis/scenarios-modal → effectiveSwr/NL_SWR; `pensioen-aow-widget` kapitaliseert op SWR i.p.v. grossReturn (was ~2,4× te laag); catalogus-label gecorrigeerd.
> - **S3 ✅** — drie inline spaarquote-kopieën → `savingsRateFromAggregates` + `computeDebtAflossingMonthly`, equivalentie bewezen in `lib/savings-source.test.ts`.
> - **S5 ✅** — `freedom-calc` op `calculateFreedomTime` (+ must-vs-totaal in tool-description); `lookup` budget-aggregatie via nieuwe gedeelde `lib/budget-spending.ts` (is_income/transfers uit, parent-rollup — spiegelt budgets-loader).
> - **S7-deels ✅** — pensioen-aow/swr-monitor/box3-drag (magic 0.0643/0.0212 → constants) /belasting-box3 (vrijstelling uit `BOX3_PARAMS`, kassabon eerlijk gelabeld "enkel forfait") /nibud (geen nep-per-categorie-signaal meer, eerlijk totaal-signaal). Rest van S7 (horizon-context `projectPortfolio`, shared-context `expectedFireDate`-loop, subscriptions 3m-proxy) bewust open — illustratief gelabelde tweede paden.
> - **S9 ✅ afgerond** — alle 45 vangrail-sites gemigreerd (echte query-bounds naar `localMonthBounds`/`localMonthStartMonthsAgo`/nieuwe `localMonthEnd`; één gedocumenteerde disable voor een gedragsneutrale demo-fixture); regel gepromoveerd naar **`error`** (+ `files`-scoping die een latente flat-config-crash op niet-Next-extensies dicht). `eslint .` = 0 errors.
> - Bijvangst: `snapshots/balances` gecheckt — ongewogen is daar semantisch juist (per-entiteit saldolijn, geen aggregaat); `next-steps`-select bleek al minimaal.
> - **Nog open (bewust):** S7-rest en S8 (briefing-guard-verstrakking, dode FIRE-directive, box3 `year:2025`-hardcode), S10 (module-gating-tak horizon-loader, budgeting-active-defaults-doc, `freedom-milestones` dode code), `eurToFreedomTime`-consolidatie, what-if `downsize`/`reverse_mortgage` virtuele housing-events (groter ontwerpwerk), `fireBasis`-bedrading in layout (productbesluit: hot-path-query vs motivatie-only getal).
> - ⚠️ Verificatie-context: tijdens golf 2 draaide een **parallelle sessie** (gezondheidsscore v2-herontwerp) die `lib/financial-health.ts`/`lib/health-score-input.ts` ombouwt; de workspace-brede tsc was daardoor tijdelijk rood op vijf v2-callers. Alle golf 2-bestanden zijn per pakket tsc-schoon geverifieerd; de v2-sessie trekt haar eigen callers bij.

## R2.0 Kernbeeld

De **engine-laag en de hoofd-loaders zijn gezond**: `freedomPct` loopt op dashboard, horizon én AI shared-context via `computeFreedomProgress` op de FIRE-eligible grondslag; het gezondheidsgetal loopt in loader, client-recompute en de auto/cron-snapshots via `buildHealthScoreInput`; de check-in is en blijft geünificeerd. De drift zit in de **randen**: widgets die bundel-waarden negeren en zelf herrekenen, AI-/rapport-/share-routes met eigen FIRE-formules, één snapshot-route die ADR 0008 heeft gemist, en een systemische tweedeling in de €→tijd-dagbasis (/30 vs /365).

Belangrijke correctie op de eigen documentatie: **ADR 0009 regel 23 is verouderd** — `lib/ai/context/shared-context.ts` gebruikt `computeFreedomProgress` al (commit `b088ebb2b`, 2026-06-12, geverifieerd op regel 83-103). En **ADR 0008 overclaimt**: niet "alle drie" snapshot-schrijfpaden zijn gemigreerd — de handmatige POST niet (R2.1).

## R2.1 🔴 Geverifieerde drift (gebruiker ziet/krijgt een ander getal dan canoniek)

### Gezondheidsgetal (ADR 0008-gaten)

1. **`app/api/snapshots/route.ts` (POST) is NIET gemigreerd naar `buildHealthScoreInput`** — [`route.ts:214-227`](../app/api/snapshots/route.ts#L214): noodfonds-proxy `totalAssets × 0.3` (`:217`), `budgetCategories: []` (`:226`), geen `taxData`, spaarquote = periode-cijfer zonder 6m/spaarbudget/aflossing (`:214-216`). Import op `:4` haalt alleen `computeHealthScoreFromInputs`, niet `buildHealthScoreInput`. De route schrijft `resilience_score` via upsert op `user_id,snapshot_date` (`:250`, `:259`) — draait hij ná auto/cron op dezelfde dag, dan **overschrijft een proxy-score de canonieke score**. Exact het gat dat ADR 0008 claimde te dichten ("alle drie snapshot-schrijfpaden" — feitelijk twee van de drie). Ook het opgeslagen `net_worth` is hier ongewogen (`:162-164`, geen `inclusion_pct`, geen losse cash).
2. **`gezondheids-score-widget` toont een andere score dan /toekomst** — [`gezondheids-score-widget.tsx:329`](../components/widgets/gezondheids-score-widget.tsx#L329) gebruikt de `DashboardData`-variant `computeHealthScore`, waarvan de `tax_optimization`-pijler **hardcoded 50** is ([`financial-health.ts:428-430`](../lib/financial-health.ts#L428)), terwijl de doelpagina `/toekomst` `computeHealthScoreFromInputs` mét echte `taxData` draait ([`horizon-data-loader.ts` ±r644]). De widget-CTA linkt naar precies de pagina waarvan het getal kan afwijken.

### Vrijheidsvoortgang (ADR 0009-gaten)

3. **Sovereignty-niveau ("Jouw Pad") rekent op de oude grondslag** — [`dashboard-data-loader.ts:821-825`](../lib/dashboard-data-loader.ts#L821): `sovFreedomPct = vol netWorth ÷ (3m-uitgaven×12 / NL_SWR)` — vol vermogen incl. huis, vaste `NL_SWR` i.p.v. `effectiveSwr`, geen `computeFreedomProgress`. Voedt `computeSovereigntyLevel` → niveau/fase-weergave. Zelfde familie: [`compute-feature-access.ts:92`](../lib/compute-feature-access.ts#L92) en [`compute-module-access.ts:174`](../lib/compute-module-access.ts#L174) (eigen freedomPct op `NL_SWR` resp. `0.04`). Motivatie-weergave (geen gating), maar een huiseigenaar krijgt een te hoog niveau terwijl de voortgangsbalk ernaast de correcte (lagere) waarde toont. Staat niet in ADR 0009's uitzonderingenlijst.
4. **`vrijheidsvoortgang-widget` + `vrijheidsmijlpalen-widget` herberekenen het percentage zelf** — [`vrijheidsvoortgang-widget.tsx:34-37`](../components/widgets/vrijheidsvoortgang-widget.tsx#L34) en [`vrijheidsmijlpalen-widget.tsx:42-45`](../components/widgets/vrijheidsmijlpalen-widget.tsx#L42): `min(netWorth / effectiveFire × 100, 100)` met **vol `netWorth`** als teller; de canonieke `data.freedomPct` is slechts fallback. Bij housing-strategie exclude/downsize wijkt de widget af van /toekomst én van de aftelling. Zelfde patroon in de horizon-hero: [`horizon-client.tsx` ±r1284]. De fallback-volgorde is omgekeerd: canoniek hoort primair.

### AI & rapport (Will noemt een ander getal dan het scherm)

5. **AI-rapport rekent FIRE zelf** — [`report/route.ts:302-308`](../app/api/report/route.ts#L302): `fireTarget = yearlyMustExpenses / NL_SWR` (negeert gebruikers-`effectiveSwr` uit `resolveFireParams`), `firePercentage` op vol vermogen zonder housing-filter (oude grondslag), `fireAge` via fallback-engine met `monthly_contribution`-som i.p.v. `resolveSavingsSource`. Het naastgelegen `report/persoonlijk-plan` is wél volledig canoniek — dé referentie voor de fix.
6. **What-if-baseline ≠ /toekomst-baseline** — [`whatif-page-client.tsx:441-447`](../app/(app)/horizon/whatif/whatif-page-client.tsx#L441): `assets: fullAssets` (geen `filterAssetsForFire`) en `annualSavings = monthlyContributions × 12` (geen `resolveSavingsSource`-prioriteit zoals `use-horizon-fire-sim.ts:116-120`). De baseline-FIRE-leeftijd (en dus elke "+X maanden"-delta) wijkt af van /toekomst, en landt via `scenarioContext` ook in de AI-chat ([`app/api/ai/chat/route.ts` ±r96]). Bekend open punt ("whatif nog niet geünificeerd") — hiermee herbevestigd en geconcretiseerd.
7. **Briefing-spaarquote ≠ cashflow-pagina** — [`briefing/engine.ts:529-556`](../lib/briefing/engine.ts#L529): 1-maands `(inkomen − uitgaven) / inkomen`, gepresenteerd als "Je spaart X% van je inkomen" / "Je spaarquote is X%" (`:545`, `:553`) — zonder spaarbudgetten, zonder aflossing, zonder 6m-venster. De cashflow-pagina toont `savingsRate6m`. Zelfde maand-quote in de redactie-metrics ([`redactie.ts` ±r91]). `savingsRate6m` zit al in `DashboardData` maar wordt niet aan de briefing-input doorgegeven.
8. **Share/freedom-card** — [`freedom-card/route.ts:63-65`](../app/api/share/freedom-card/route.ts#L63): ongewogen `netWorth` (selecteert `net_worth_inclusion_pct` niet eens, geen losse cash), [`:79-81`](../app/api/share/freedom-card/route.ts#L79): `fireTarget = 1-maands-uitgaven × 12 / NL_SWR` → gedeelde kaart toont ander vermogen en vrijheids-% dan de app.
9. **Next-steps "FIRE-doel niet haalbaar"** — [`next-steps/route.ts:152-160`](../app/api/next-steps/route.ts#L152): klassieke `SWR = 0.04` (uit `constants.ts:26`, niet `NL_SWR` en niet `effectiveSwr`), ongewogen vermogen, 1-maands inkomen/uitgaven → de haalbaarheidstegel oordeelt op een ~28% lager FIRE-doel dan /toekomst.

### Maandgrenzen (regressies/gemiste sites t.o.v. fixronde 2026-06-10)

10. **`notifications/route.ts:146-147`** — `monthStart.toISOString().split('T')[0]` op lokale datum (TZ-trap) in de budget-alert-queries. Daarnaast in dezelfde route: horizon-trigger op impliciete 25× jaaruitgaven + ongewogen vermogen (±r782-810) en partner-vrijheidstijd op `/daysInMonth` met handgerolde formatter (±r563-617).
11. **`checkin/aandachtspunten/route.ts:35-37`** — `new Date(jaar, maand, 1).toISOString().slice(0,10)` (TZ-trap; de zuster-routes gebruiken wél `localMonthBounds`) + dagtarief `totalMonthlyExpenses / 30` (`:87`).

### Widgets met verzonnen constanten/data

12. **`box3-drag-widget`** — [`box3-drag-widget.tsx:145`](../components/widgets/box3-drag-widget.tsx#L145), `:157`, `:67`: magic constanten `0.0643` en `0.0212` die nergens in `lib/` bestaan; canoniek is `NL_FICTIEF_BELEGGINGEN = 0.0588` en `BOX3_DRAG ≈ 0.0212` (`lib/constants.ts:53/59`). Het "Fictief rendement"-bedrag (×0.0643, zonder vrijstelling/splitsing) is overschat en inconsistent met de headline die wél uit de bundel komt. De 5-jaars-projectie is een widget-eigen Box 3-model.
13. **`nibud-benchmark-widget`** — [`nibud-benchmark-widget.tsx:25-36`](../components/widgets/nibud-benchmark-widget.tsx#L25): per-categorie "actual" = `norm × (totalSpent / 2000)` → elke categorie staat op exact hetzelfde %-van-norm; de balkjes suggereren echte vergelijking maar reflecteren geen categorie-data (terwijl de heatmap-data al in de bundel zit).

## R2.2 🟡 Systemische patronen en risico's

| # | Patroon | Plekken (file:line) | Canoniek | Opmerking |
|---|---|---|---|---|
| S1 | **€→tijd-dagbasis tweedeling: `/30` (=jaar/360) naast `/365`** | briefing [`engine.ts:462-465`](../lib/briefing/engine.ts#L462); ~10 kern-widgets (`netto-vermogen:41`, `cash-flow:225`, `spaarquote:96`, `assets:49`, `schulden:46`, `vaste-lasten:72`, `noodfonds:30`, `budgetten:311`, e.a.); [`assets-data-loader.ts:102`](../lib/assets-data-loader.ts#L102); AI [`tax-context.ts:22-25`](../lib/ai/context/tax-context.ts#L22) + `aandachtspunten-context.ts:18-25` (30/360-terugconversie); `notifications` partner-pad | `calculateFreedomTime` met dagtarief `jaar/365` ([`format.ts:109`](../lib/format.ts#L109), [`core-metrics.ts:273`](../lib/core-metrics.ts#L273)) | ~1,4% afwijking + must-vs-totaal-verschil; klein per plek maar overal nét anders. Remedie: één gedeelde dagtarief-helper en alle sites daarop. |
| S2 | **SWR-wildgroei** | [`portfolio-summary.tsx:66`](../components/core/holdings/portfolio-summary.tsx#L66) — **lokale `const NL_SWR = 0.04`** die de echte NL_SWR (≈0.02883) schaduwt → passief inkomen ~39% te hoog; [`household-projection.ts:230-231`](../lib/household-projection.ts#L230) `HOUSEHOLD_SWR = 0.035` met **onjuiste comment** ("consistent met NL_SWR"); `0.04`-hardcodes in `phase-analysis/*` en `scenarios-modal.tsx:67`; [`calculations.ts:186`](../lib/architecture/calculations.ts#L186) documenteert NL_SWR als "4%" (stale) | `resolveFireParams().effectiveSwr` / `NL_SWR` uit `lib/constants.ts` | Vier verschillende SWR-waarden in omloop (0.04 / 0.035 / 0.02883 / per-user). |
| S3 | **Spaarquote-formule als inline-kopie ×3** | `dashboard-data-loader.ts:511-513`, `horizon-data-loader.ts:521-523`, `core-data-loader.ts:865` | `savingsRateFromAggregates` ([`savings-source.ts:67`](../lib/savings-source.ts#L67)) — check-in doet het al goed | Formule-equivalent vandaag, drift-gevoelig morgen. |
| S4 | **Snapshot-`net_worth` onderling verschillend** | POST `:162-164` en cron ±r175-177 ongewogen; auto ±r128-130 gewogen; losse cash ontbreekt overal in het opgeslagen `net_worth` | inclusion-gewogen + losse cash (`dashboard-data-loader.ts:243-255`) | Plus: opgeslagen `resilience_score` erft de snapshot-freedomPct (oude grondslag) terwijl live de nieuwe gebruikt — bewust (trend-historie), maar verdient één expliciete zin in ADR 0008. |
| S5 | **AI-tools rekenen lokaal** | [`freedom-calc.ts:20-26`](../lib/ai/tools/freedom-calc.ts#L20) eigen jaar/maand/dag-breakdown (`%30`) i.p.v. `calculateFreedomTime` + must-vs-totaal noemerkeuze; [`lookup.ts:71-85`](../lib/ai/tools/lookup.ts#L71) eigen budget-spent-aggregatie zonder `is_income`/parent-rollup | `lib/format.ts` / budgets-loader-aggregatie | Maandgrenzen in beide tools wél correct (`localMonthBounds`). |
| S6 | **Report-windows** | `report/balans:145`, `report/vermogen:624-625`, `report/budget:151` — 12m-ondergrens via lokale `toISOString()` | `localMonthBounds` | Impact begrensd (gemiddelde-venster), wel de verboden bug-klasse. |
| S7 | **Tweede projectie-paden (informatief)** | `horizon-context.ts:80-86` (`projectPortfolio`, 5-jaars, geen Box3/strategie); `shared-context.ts:113` `expectedFireDate` uit `computeCoreData`-loop; `subscriptions/advice:103` 3-maands dagtarief-proxy; `pensioen-aow-widget:28-29,73` kapitaliseert AOW op `grossReturn` i.p.v. SWR (~2,4× te laag equivalent); `swr-monitor-widget:52` dupliceert de `effectiveSwr`-formule (nu identiek); `belasting-box3-widget:16,96-104` vrijstelling hardcoded + enkel-forfait-kassabon vs dual-forfait-pagina; `inflatie-impact`/`beleggingsrendement`/`holdings` widget-eigen illustratieve berekeningen | `runUnifiedProjection` / `resolveFireParams` / `calculateBox3` | Per stuk verdedigbaar als illustratie, maar nergens als zodanig gelabeld. |
| S8 | **Briefing-details** | nummer-guard substring-soepel (`redactie.ts:131-154`); dode FIRE-directive (`directives.ts:245` parst een string die geen builder emit); Box 3 in bundel hardcoded `year:2025`/`hasPartner:false` (`dashboard-data-loader.ts:751-768`) | — | Guard is fail-closed (goed), maar eenheid-blind. |
| S9 | **Vangrail ontbreekt** | geen lint-regel/test tegen nieuwe `new Date(y,m,…).toISOString()`-maandgrenzen | `localMonthBounds` | Open uit ronde 1; bevindingen 10-11 bewijzen dat regressie zonder vangrail terugkomt. |
| S10 | **Klein** | `horizon-data-loader.ts:356-361` mist de module-gating-tak (vandaag gedragsneutraal — `activeModules` is altijd alles); `budgeting-active` lees-default true vs schrijf-default false (documenteren); `freedom-milestones.ts` dode code | — | — |

## R2.3 🟢 Geverifieerd consistent (en opgelost sinds ronde 1)

- **AI shared-context is canoniek** — [`shared-context.ts:83-103`](../lib/ai/context/shared-context.ts#L83): `getFireEligibleNetWorth` + `computeFreedomProgress`, FIRE-doel op dezelfde noemer, met ADR 0009-comment. De "open follow-up" in ADR 0009 r23 en de MEMORY-index was stale — gefixt in commit `b088ebb2b` (2026-06-12).
- **Loaders-freedomPct** — dashboard (`:718-728`) en horizon (±r585-592) beide via `computeFreedomProgress` op `fireEligibleNetWorth`; milestone-notificaties (`milestone-fire-near/reached`) vuren op de nieuwe grondslag.
- **Gezondheidsgetal-hoofdpad** — loader, client-recompute en snapshots **auto + cron** via `buildHealthScoreInput`; `resilience_score` wordt nergens als huidig getal gelezen (alleen trend).
- **Check-in** — gespreksstarters/overview blijven volledig geünificeerd (6m + transfers-uit + inclusion-weging + jaar/365 + `localMonthBounds` + `effectiveSwr`); `fire-age.ts` is bewust een simpelere schatter, gedocumenteerd in de file-header.
- **AI-context maandgrenzen** — `lookup`, `kern-context`, `wil-context`, `budget-insights-context`: de fix van 2026-06-10 staat er nog (geen regressie).
- **Meerderheid van de widgets** consumeert netjes bundel-velden (o.a. vrijheidsscenario's, sim-vermogenspad, backtesting, surplus-gap, maand/weekoverzicht, heatmap, trends) — de volledige 26-widget-tabel staat in het ronde 2-deelrapport (widgets-audit).
- **`report/persoonlijk-plan`**, `daily-expense-rate`, `export`, `command-palette` (toont bewust geen bedragen) — canoniek/schoon.
- **`perspective-loader-server.ts`** is een pure cache-wrapper (geen eigen formule); **`budgeting-active.ts`** centraliseert het schrijfpad i.p.v. een tweede waarheid te maken; **`household-projection`** maandgrens-bug uit ronde 1 is opgelost (lokale componenten, gedocumenteerd), eigen motor blijft bewust (ADR 0009).
- **Berekeningen-view** dekt `computeFreedomProgress` én `buildHealthScoreInput` (alleen het NL_SWR-label is stale, zie S2).

## R2.4 Aanbevolen aanpak (prioriteit)

1. **ADR 0008 afmaken** — `snapshots/route.ts` POST naar `buildHealthScoreInput` (of de health-score-tak van deze route schrappen); meteen het opgeslagen `net_worth` over de drie routes gelijktrekken (inclusion-gewogen + losse cash) en de ADR-zin over de fire-pijler-input toevoegen (S4).
2. **ADR 0009 afmaken** — (a) sovereignty-pad (`dashboard-data-loader.ts:821-825`, `compute-feature-access`, `compute-module-access`) op `computeFreedomProgress`; (b) `vrijheidsvoortgang`/`vrijheidsmijlpalen`-widgets + horizon-hero: canonieke `freedomPct` primair, eigen som weg.
3. **Gezondheids-widget** op de canonieke score (bundel-veld via `buildHealthScoreInput`, of `taxData` in de DashboardData-variant).
4. **AI-randen** — `report/route.ts` op de canonieke engines (kopieer het `persoonlijk-plan`-patroon); what-if-baseline op `resolveSavingsSource` + `filterAssetsForFire`; briefing `savingsRate6m` doorgeven; `freedom-card` en `next-steps` op `resolveFireParams` + gewogen vermogen.
5. **Eén dagtarief-helper** (jaar/365) en alle `/30`-sites + 30/360-terugconversies daarop (S1) — dit raakt óók de AI-contexten en de briefing.
6. **SWR-sanering** (S2): `portfolio-summary` schaduw-constante weg, `HOUSEHOLD_SWR`-comment corrigeren, 0.04-hardcodes naar `resolveFireParams`, `calculations.ts`-label.
7. **Maandgrenzen** — `checkin/aandachtspunten`, `notifications`, report-windows naar `localMonthBounds` + de lint-vangrail (S9) zodat dit de laatste keer is.
8. **Klein** — box3-drag-constanten naar `lib/constants.ts`, nibud-widget echte data of expliciet "schatting"-label, spaarquote-inline-kopieën naar `savingsRateFromAggregates`, freedom-calc/lookup-tools naar gedeelde helpers.

## R2.5 Methodologie ronde 2

Vier parallelle read-only deelaudits (AI-oppervlakken, widgets, rekenmotoren/loaders, periferie/snapshots) met de canonieke bronnen als meegegeven "wet". Alle dertien 🔴-bevindingen zijn daarna handmatig in de bron geverifieerd (file:line opnieuw opgezocht in de werkboom van 2026-06-12, incl. uncommitted wijzigingen); de 🟡-tabel steunt deels op de deelaudit-verificaties. Twee agent-claims zijn daarbij gecorrigeerd of genuanceerd: de "shared-context oude grondslag"-aanname uit ADR 0009/MEMORY bleek achterhaald (commit `b088ebb2b`), en de module-gating-omissie in horizon-data-loader is vandaag gedragsneutraal (geen 🔴).

---

# RONDE 1 — 2026-06-10 (historie)

## 1. Overzicht per gegeven (met bron)

| Gegeven | Canonieke bron | Status |
|---|---|---|
| Spaarquote | [`lib/savings-source.ts:41`](../lib/savings-source.ts#L41) (resolver) + berekening [`lib/dashboard-data-loader.ts:495-530`](../lib/dashboard-data-loader.ts#L495) | 🟡 2 afwijkende berekeningen |
| Maandinkomen / -uitgaven | [`lib/effective-financials.ts:13`](../lib/effective-financials.ts#L13) (`resolveEffectiveIncomeExpenses`) | 🟡 meerdere vensters (12m/6m/deze maand) |
| Jaaruitgaven (FIRE-input) | [`lib/budget-utils.ts:44`](../lib/budget-utils.ts#L44) (`computeYearlyMustExpenses`) + [`:109`](../lib/budget-utils.ts#L109) (`computeRetirementExpenses`) | 🟢 intentioneel methodisch verschil |
| Netto vermogen | [`lib/dashboard-data-loader.ts:253-255`](../lib/dashboard-data-loader.ts#L253) (assets×inclusion_pct − debts×inclusion_pct + unlinkedCash) | 🟡 check-in wijkt af |
| FIRE-vermogen (belegbaar) | [`lib/housing-strategy.ts:1190`](../lib/housing-strategy.ts#L1190) (`getFireEligibleNetWorth`) | 🟢 intentioneel ≠ netto vermogen |
| FIRE-leeftijd / -getal | [`lib/unified-projection.ts:919`](../lib/unified-projection.ts#L919) (`runUnifiedProjection`) | 🔴 4 berekeningen naast elkaar |
| Rendement / inflatie / SWR | [`lib/constants.ts:18-64`](../lib/constants.ts#L18) → [`lib/fire-params.ts:54`](../lib/fire-params.ts#L54) (`resolveFireParams`) | 🔴 check-in hardcodet 4%/7% |
| Vrijheidstijd (€→dagen) | [`lib/format.ts:109`](../lib/format.ts#L109) (`calculateFreedomTime`, jaaruitgaven/365) | 🟡 check-in deelt door maand/30 |
| Belastingconstanten | [`lib/constants.ts:59`](../lib/constants.ts#L59) → [`lib/box3-data.ts:112`](../lib/box3-data.ts#L112) (`BOX3_PARAMS`) / [`lib/box1-tax.ts:84`](../lib/box1-tax.ts#L84) (`BOX1_PARAMS`) | 🟢 geen duplicatie |
| Hefboom-status | [`lib/leverage-status.ts:35`](../lib/leverage-status.ts#L35) (`pillarStatus`) | 🟢 domein-drempels gerechtvaardigd |
| Maandgrenzen (queries) | [`lib/month-range.ts:24`](../lib/month-range.ts#L24) (`localMonthBounds`) | 🔴 ~15 onveilige sites resteren |

---

## 2. Kritieke bevindingen (geverifieerd)

### 2.1 🔴 Check-in is een eigen eiland — wijkt op vier punten af

1. **SWR hardcoded 0.04** — [`lib/checkin/fire-age.ts:18`](../lib/checkin/fire-age.ts#L18) — i.p.v. `NL_SWR` ([`lib/constants.ts:64`](../lib/constants.ts#L64), 0.02883) of de gebruikers-`effectiveSwr` uit [`resolveFireParams`](../lib/fire-params.ts#L54). Fallback-rendement 0.07 op [`fire-age.ts:29`](../lib/checkin/fire-age.ts#L29) is wel oké: het profiel-`expected_return` wordt doorgegeven via [`route.ts:97`](../app/api/checkin/gespreksstarters/route.ts#L97).
2. **Deze-maand-cijfers als "maandinkomen/-uitgaven"** — queries op [`route.ts:35`](../app/api/checkin/gespreksstarters/route.ts#L35) en [`:44`](../app/api/checkin/gespreksstarters/route.ts#L44) (alleen `monthStart`–`monthEnd`), gesommeerd op [`:57-58`](../app/api/checkin/gespreksstarters/route.ts#L57) en in `computeFireAge` gestopt op [`:94-98`](../app/api/checkin/gespreksstarters/route.ts#L94). Halverwege de maand springt de FIRE-leeftijd alle kanten op.
3. **Netto vermogen ongewogen** — [`route.ts:53-55`](../app/api/checkin/gespreksstarters/route.ts#L53): som van álle `current_value` − álle `current_balance`, zonder `net_worth_inclusion_pct`-weging en zonder `is_active`-filter. Vergelijk de canonieke berekening: [`lib/dashboard-data-loader.ts:253-255`](../lib/dashboard-data-loader.ts#L253).
4. **Vrijheidsdag-tarief = maanduitgaven/30** — [`route.ts:63`](../app/api/checkin/gespreksstarters/route.ts#L63) — i.p.v. jaaruitgaven/365 zoals in [`lib/format.ts:109`](../lib/format.ts#L109).

**Gevolg:** FIRE-leeftijd en vrijheidsdagen in check-in/gespreksstarters kunnen structureel afwijken van /toekomst, /overzicht en dashboard. Niet gerechtvaardigd — drift, geen bewuste vereenvoudiging. (De 6m-spaarquote in dezelfde route, [`route.ts:66-77`](../app/api/checkin/gespreksstarters/route.ts#L66), is wél formule-equivalent aan de loader — die klopt.)

### 2.2 🔴 Vier FIRE-berekeningen naast elkaar

| Berekening | Definitie | Gebruikt door | Life events? | Withdrawal-strategie? |
|---|---|---|---|---|
| `runUnifiedProjection()` | [`lib/unified-projection.ts:919`](../lib/unified-projection.ts#L919) | /toekomst, /overzicht, dashboard-countdown, huishouden | ✅ | ✅ |
| `runSimulation()` | [`lib/fire-simulation.ts:109`](../lib/fire-simulation.ts#L109) | [`event-pane-view.tsx`](../components/app/horizon/event-pane-view.tsx) (event-impact-preview), [`lib/strategy-preview.ts`](../lib/strategy-preview.ts) | ✅ | ✅ |
| `computeFireProjection()` | [`lib/horizon-data.ts:1453`](../lib/horizon-data.ts#L1453) | dashboard-KPI via [`lib/dashboard-data-loader.ts:600`](../lib/dashboard-data-loader.ts#L600), verify-routes | ❌ | ⚠️ deels (`strategyOpts`) |
| `computeFireAge()` | [`lib/checkin/fire-age.ts:20`](../lib/checkin/fire-age.ts#L20) | check-in overview + gespreksstarters | ❌ | ❌ |

Nuance na herverificatie: de dashboard-aanroep op [`dashboard-data-loader.ts:600`](../lib/dashboard-data-loader.ts#L600) krijgt wél `fireParams.grossReturn`, `fireSwr` en `strategyOpts` mee — de parameters zijn dus consistent. Wat ontbreekt is dat `computeFireProjection` geen cashflows/life events accepteert. **Tweede correctie (na implementatie-review):** de dashboard-widgets prefereren overal al de unified engine — `simFireCountdown ?? fireProjResult` in [`fire-prognose-widget.tsx:28`](../components/widgets/fire-prognose-widget.tsx#L28), [`vrijheidsvoortgang-widget.tsx:65`](../components/widgets/vrijheidsvoortgang-widget.tsx#L65) en [`vrijheidsmijlpalen-widget.tsx:50`](../components/widgets/vrijheidsmijlpalen-widget.tsx#L50), en `simFireAgeFractional ?? snapshotFireAge` in de loader. `computeFireProjection` is daar alleen nog fallback wanneer de unified-sim niet kan draaien (geen geboortedatum, netWorth ≤ 0, of een sim-error) — in die gevallen is er sowieso geen life-event-precisie te verliezen. Het oorspronkelijke risico was dus kleiner dan §2.2 eerst stelde; een comment op de callsite legt de fallback-semantiek nu vast. `runSimulation` en `runUnifiedProjection` delen de binary-search-logica en geven dezelfde FIRE-leeftijd; dat naast elkaar bestaan is een adoptie-risico, geen actuele bug.

### 2.3 🔴 Maandgrens-tijdzonebug bestaat nog op ~15 plekken

Veilig (gebruiken `Date.UTC(...)` — géén actie nodig): [`lib/dashboard-data-loader.ts:142-148`](../lib/dashboard-data-loader.ts#L142), [`lib/core-data-loader.ts:216-218`](../lib/core-data-loader.ts#L216) + [`:699-700`](../lib/core-data-loader.ts#L699), [`lib/horizon-data-loader.ts:212-217`](../lib/horizon-data-loader.ts#L212), [`lib/ai/context/shared-context.ts:159`](../lib/ai/context/shared-context.ts#L159). De eerdere agent-claim "55 sites kritiek" is dus grotendeels vals-positief.

Onveilig — lokale datum + `toISOString()`, grens schuift in NL (UTC+1/+2) één dag terug:

**Productie (data-impact):**
- [`lib/aandachtspunten-loader.ts:111-112`](../lib/aandachtspunten-loader.ts#L111)
- [`lib/assets-data-loader.ts:54-55`](../lib/assets-data-loader.ts#L54)
- [`lib/ai/tools/lookup.ts:52-53`](../lib/ai/tools/lookup.ts#L52) (Will tool-lookups)
- [`lib/ai/context/wil-context.ts:14-15`](../lib/ai/context/wil-context.ts#L14), [`lib/ai/context/kern-context.ts:11-12`](../lib/ai/context/kern-context.ts#L11), [`lib/ai/context/budget-insights-context.ts:10-16`](../lib/ai/context/budget-insights-context.ts#L10) (AI-context: Will rekent met een verschoven maand)
- [`lib/household-projection.ts:479`](../lib/household-projection.ts#L479) + [`:503`](../lib/household-projection.ts#L503)
- [`components/core/assets-client.tsx:280-281`](../components/core/assets-client.tsx#L280)
- [`components/app/freedom-time-label.tsx:44-45`](../components/app/freedom-time-label.tsx#L44)
- [`app/api/daily-expense-rate/route.ts:19-20`](../app/api/daily-expense-rate/route.ts#L19)
- [`app/api/share/freedom-card/route.ts:23-24`](../app/api/share/freedom-card/route.ts#L23)
- [`app/api/snapshots/route.ts:94-97`](../app/api/snapshots/route.ts#L94), [`app/api/snapshots/cron/route.ts:67-70`](../app/api/snapshots/cron/route.ts#L67), [`app/api/snapshots/auto/route.ts:46-48`](../app/api/snapshots/auto/route.ts#L46)
- [`app/api/checkin/upcoming/route.ts:20-21`](../app/api/checkin/upcoming/route.ts#L20), [`app/api/checkin/budgets/route.ts:10-11`](../app/api/checkin/budgets/route.ts#L10)
- [`app/api/next-steps/route.ts:35-36`](../app/api/next-steps/route.ts#L35)
- [`app/api/export/route.ts:69-70`](../app/api/export/route.ts#L69)
- [`app/api/cashflow-forecast/route.ts:26`](../app/api/cashflow-forecast/route.ts#L26)

**Test/verify-routes (lagere prioriteit):** [`verify-freedom-time-labels`](../app/api/verify-freedom-time-labels/route.ts#L44), [`verify-fire-scenario-defaults`](../app/api/verify-fire-scenario-defaults/route.ts#L22), [`verify-fire-inputs`](../app/api/verify-fire-inputs/route.ts#L35), [`report/budget`](../app/api/report/budget/route.ts#L151), regressietest-suites.

Dit is exact de bug die in commit `ab3a4bbf` voor cashflow is gefixt ("vorige-maand-salaris lekt in totalen") — hij leeft nog in de periferie. Fix: overal [`localMonthBounds()`](../lib/month-range.ts#L24); de tijdzone-valkuil is gedocumenteerd in [`lib/month-range.test.ts:13`](../lib/month-range.test.ts#L13).

### 2.4 🟡 WhatIf-baseline berekent eigen spaarquote

[`lib/whatif-overrides.ts:104-118`](../lib/whatif-overrides.ts#L104) (`buildBaselineOverrides`): spaarquote = `(monthlyIncome − monthlyExpenses) / monthlyIncome` op [`:108-110`](../lib/whatif-overrides.ts#L108) — zonder schuldaflossing/spaarbudgetten en zonder 6-maands-venster. De cashflow-pagina toont `savingsRate6m` (mét spaarbudgetten en aflossing als vermogensopbouw, formule op [`lib/dashboard-data-loader.ts:511-512`](../lib/dashboard-data-loader.ts#L511)). De WhatIf-sliders starten dus op een ander baseline-percentage dan wat de gebruiker elders als "jouw spaarquote" ziet.

---

## 3. Gerechtvaardigde verschillen (bewust ontwerp — niet "fixen")

| Verschil | Bron | Waarom gerechtvaardigd |
|---|---|---|
| Netto vermogen ≠ FIRE-vermogen | [`lib/housing-strategy.ts:1190`](../lib/housing-strategy.ts#L1190) | Woningstrategie (exclude/downsize) haalt overwaarde bewust uit de FIRE-pot; display toont totaal. |
| Spaarquote huishouden/partner = maandwaarden | [`components/widgets/spaarquote-widget.tsx:39-41`](../components/widgets/spaarquote-widget.tsx#L39) | Perspectief-cijfers zijn gecombineerde maandwaarden, geen persoonlijke 6m-aggregatie; comment op regel 37 documenteert dit. |
| Inkomen = 12m-gemiddelde, uitgaven = 6m-gemiddelde | [`lib/cashflow-settings-data.ts:115`](../lib/cashflow-settings-data.ts#L115) | Uitgaven bewust actueler venster. Verdedigbaar, maar nergens aan de gebruiker uitgelegd → labelen. |
| FIRE-jaaruitgaven = essentiële budgetten (3 methodes) | [`lib/budget-utils.ts:44`](../lib/budget-utils.ts#L44) + [`:109`](../lib/budget-utils.ts#L109) | Bewuste keuze. Risico: te optimistisch FIRE-doel als essentiële budgetten ≪ werkelijke uitgaven — UX-kwestie, geen rekenbug. |
| Vrijheidstijd-denominatoren: `daysWonPerMonth` deelt door totale uitgaven, `freeDaysPerYear` door must-uitgaven | [`lib/core-metrics.ts:225-227`](../lib/core-metrics.ts#L225) resp. [`:233-235`](../lib/core-metrics.ts#L233) | Verschillende semantiek (gewonnen dagen vs absolute vrijheid); comment op regel 225 benoemt het. Verdient JSDoc. |
| Vermogensmodule-gating: alleen cash-assets, schulden = 0 als module inactief | [`lib/dashboard-data-loader.ts:253-254`](../lib/dashboard-data-loader.ts#L253) | Bewuste progressive disclosure. |
| Health-score & Box 3 blijven persoonlijk in huishouden-perspectief | [`lib/horizon-data-loader.ts`](../lib/horizon-data-loader.ts) (perspectief-blok ±r428-450) | Belasting en pillars zijn per persoon. |
| Belastingconstanten: één keten, per-jaar | [`lib/constants.ts:59`](../lib/constants.ts#L59) → [`lib/box3-data.ts:112`](../lib/box3-data.ts#L112) / [`lib/box1-tax.ts:84`](../lib/box1-tax.ts#L84); `horizon-data.ts` re-exporteert alleen | Geen duplicatie gevonden, ook niet in API-routes/edge functions. |
| Status-drempels cashflow-kaarten (20%-spaarquote, 50/70%-vastelasten) ≠ `pillarStatus` (70/50-score) | [`lib/cashflow-cards.ts:77`](../lib/cashflow-cards.ts#L77) + [`:114`](../lib/cashflow-cards.ts#L114) vs [`lib/leverage-status.ts:35`](../lib/leverage-status.ts#L35) | KPI-vuistregels, geen pillar-scores. Comment in `leverage-status.ts` zou toekomstige verwarring voorkomen. |

---

## 4. Aanbevolen acties (prioriteit) — status na fixronde 2026-06-10

1. **Check-in unificeren** — ✅ **gedaan**: [`computeFireAge`](../lib/checkin/fire-age.ts#L20) gebruikt nu `effectiveSwr` (param) met `NL_SWR`-fallback en `DEFAULT_RETURN`; beide routes ([gespreksstarters](../app/api/checkin/gespreksstarters/route.ts), [overview](../app/api/checkin/overview/route.ts)) rekenen met 6m-gemiddelden (transfer-uitsluiting + extrapolatie bij <6 maanden data), wegen vermogen met `inclusion_pct` + `is_active` + losse bankrekeningen, dagtarief = jaar/365, en maandgrenzen via `localMonthBounds`.
2. **Maandgrenzen migreren** — ✅ **gedaan**: alle 19 productie-sites uit §2.3 naar [`localMonthBounds()`](../lib/month-range.ts#L24)/`localMonthStart()` (semantiek behouden; `lte`-laatste-dag-varianten omgezet naar exclusieve `lt`-grens). Nog open: lint-regel/test op nieuwe `new Date(y,m,…).toISOString()`-maandgrenzen.
3. **WhatIf-baseline** — ✅ **gedaan**: [`buildBaselineOverrides`](../lib/whatif-overrides.ts#L104) accepteert `savingsRate6m`; /toekomst geeft het server-getal door (`healthScoreInput.savingsRate6m`), de standalone WhatIf-pagina rekent via gedeelde helpers [`computeDebtAflossingMonthly` + `savingsRateFromAggregates`](../lib/savings-source.ts) (geen formule-duplicatie).
4. **Dashboard-KPI** — ✅ afgehandeld als documentatie: de widgets prefereren al unified (`simFireCountdown ?? fireProjResult`); de fallback-semantiek staat nu als comment op de callsite. Eventueel vervolg: [`event-pane-view.tsx`](../components/app/horizon/event-pane-view.tsx) van `runSimulation` naar unified en de legacy-engine afbouwen.
5. **Labelen** — 12m/6m-asymmetrie in het cashflow-instellingenblok uitleggen; JSDoc bij [`core-metrics.ts:225`](../lib/core-metrics.ts#L225)-denominatoren; comment bij [`leverage-status.ts`](../lib/leverage-status.ts#L35) over domein-drempels.

---

## 5. Methodologie & review

Vier parallelle read-only verkenningsagenten (spaarquote/inkomen, vermogen, FIRE-parameters/engines, vrijheidstijd/belasting/status/maandgrenzen), waarna alle claims met 🔴/🟡 handmatig in de bron zijn geverifieerd. Het rapport is op 2026-06-10 gereviewd tegen de volledige werkboom van die dag (incl. opschoonronde fase-gating, UI/UX-consistentieronde, huishouden-werk): geen van de gerefereerde bestanden is die dag verwijderd; alle regelnummers zijn opnieuw opgezocht. Correcties t.o.v. de eerste versie: agent-claim "55 tijdzone-onveilige sites" ontkracht (grote loaders gebruiken `Date.UTC`; ~15 echte resteren); `computeFireProjection`-callsite gecorrigeerd naar regel 600 mét gebruikersparameters (gat = alleen life events); spaarquote-formule bevat ook `extSavingsBudget6` (spaarbudgetten).
