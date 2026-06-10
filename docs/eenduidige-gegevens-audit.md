# Audit: eenduidige gegevens in TriFinity

**Datum:** 2026-06-10 (gereviewd tegen de werkboom van vandaag, incl. opschoonronde en UI/UX-ronde)
**Vraag:** Welke kerngetallen worden op meerdere plekken berekend/getoond, is er per getal een canonieke bron, en zijn afwijkende getallen gerechtvaardigd?

Alle regelnummers zijn handmatig geverifieerd in de huidige werkboom. Elke claim heeft een bronlink zodat je hem zelf kunt controleren.

---

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
