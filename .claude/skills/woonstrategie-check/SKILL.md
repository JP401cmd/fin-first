---
name: woonstrategie-check
description: Gebruik na wijzigingen aan de horizon-kernel, lib/housing-strategy.ts, de horizon-loaders of de Toekomst-grafiek (sim-chart/wealth-composition), bij twijfel of de vier eigen-woningstrategieën (meetellen, uitsluiten, verkopen, opeethypotheek) nog correct doorrekenen, of als periodieke visuele regressie-check bovenop de matrix-vitest. Ook wanneer iemand vraagt "check de woonstrategieën" of een rapport met schermafbeeldingen per strategie wil.
---

# Woonstrategie-check — live verificatie van de 4 eigen-woningstrategieën

Meet per strategie (`include_full`, `exclude_from_fire`, `downsize`, `reverse_mortgage`) wat de Toekomst-grafiek (Pad + Opbouw) toont op een geschikt seed-account, toets de uitkomsten aan de engine-regressie en lever een rapport met oordeel.

## Vaste gegevens

- Dev-server `http://localhost:3000`; chromedev-browser ingelogd als **jochen@test.trifinity.nl** (wegwerp-superadmin). **NOOIT** uitloggen, **NOOIT** het echte account (jpsmit@…). Verifieer het account vóór alles (e-mail in `/mijn/account`-HTML).
- Engine-waarheid: `npx vitest run lib/regression-tests/horizon-strategie/matrix.test.ts` — goldens `A-*` dekken exact deze vier strategieën. Rood = eerst dáár kijken, niet in de browser.
- Persona: **`lisa` + kalibratie** (stap 2) → FIRE ≈ 59–60 met interen. **NIET persona-sleutel `compleet`** (weergavenaam "Tessa"): die is zo vermogend dat het FIRE-doel onder interen al op de huidige leeftijd haalbaar is, waardoor alle vier de strategieën dezelfde vrijheidsleeftijd tonen — hun effecten spelen pas ná het FIRE-moment. Correct berekend, maar niets te verifiëren.

## Stappen

1. **Preflight** — account-check; matrix-vitest groen; dev-server bereikbaar.
2. **Seed + kalibratie** (alles via `evaluate_script` in de ingelogde sessie):
   - `POST /api/admin/seed` `{"persona":"lisa"}` — stream uitlezen tot `{"done":true}`.
   - `PUT /api/parameters` `{income_source:'manual', net_monthly_income:5200, expenses_source:'manual', estimated_monthly_expenses:5100}`
   - `PUT /api/fire-settings` `{fire_end_strategy:'deplete', fire_end_age:90, fire_legacy_amount:0, retirement_expense_method:'custom_amount', retirement_expense_custom_amount:42000, monthly_savings_override:null}`
   - Verwacht op /toekomst: referentie-FIRE ≈ 59–60 (±1 jr leeftijdsdrift), inleg ≈ € 200/mnd. Fors anders → kalibratie bijstellen, niet doorduwen.
3. **Per strategie (4×)**, in deze volgorde. Body is telkens `{config: <config>}` op `PUT /api/housing-strategy`; configs exact als de matrix-goldens:
   - `{mode:'include_full'}` — de referentie, meet deze eerst.
   - `{mode:'exclude_from_fire'}`
   - `{mode:'downsize', trigger:'fixed_age', triggerAge:67, depletionThresholdYears:0, salePricePct:1, salesCostsPct:0.04, newMonthlyHousingCost:null, saleValuationBasis:'market'}`
   - `{mode:'reverse_mortgage', trigger:'fixed_age', triggerAge:67, depletionThresholdYears:0, maxLoanPct:0.5, interestRate:0.055, monthlyPayout:null}`

   Per strategie: PUT → **harde reload** (`navigate_page` type `reload` met `ignoreCache:true`; de KPI's komen uit een server-render en blijven anders op de oude waarde staan) → config verifiëren via `GET /api/housing-strategy` → de wat-als-stippellijn uitzetten (knop met tekst "Wat-als" en `aria-pressed="true"`; komt na elke reload terug) → Pad-screenshot → schakelen met de knop `aria-label="Opbouw-modus"` → Opbouw-screenshot → KPI's noteren (vrijheidsleeftijd, doel incl./excl.). Klikken doe je door `pointerdown`+`pointerup`+`click` te dispatchen; een kale `.click()` laat React-knoppen soms onberoerd.
4. **Invarianten toetsen** (afwijking = eerst matrix-vitest, dan bug-fix-route — niet wegredeneren):
   - Ordening FIRE-leeftijd: `include_full ≤ reverse ≤ downsize ≤ exclude`.
   - `exclude`: vermogenslijn identiek aan include_full; dubbel doel (incl./excl.); voortgangsbalk op excl.-grondslag; FIRE > AOW → "Doorgaan/Stop op AOW"-chips.
   - `downsize`: "Verkoop eigen woning"-marker + "Huis verkocht"-annotatie op triggerleeftijd; vastgoedlaag + hypotheekdeel rode staaf verdwijnen daar; beleggingen-sprong ≈ geprojecteerde waarde × (1 − kosten) − resthypotheek; als FIRE ≥ triggerleeftijd → incl.-doel = excl.-doel.
   - `reverse`: FIRE eerder dan downsize/exclude; schuldstaaf na trigger niet meer dalend (opeetschuld compenseert de aflossende hypotheek).
5. **Rapport + herstel** — artifact met de 8 screenshots, per strategie uitleg + oordeel (bestaand rapport bijwerken via dezelfde URL als het een vervolg is); daarna `PUT /api/housing-strategy` `{config:{mode:'include_full'}}` terugzetten. De geseede persona-data en de kalibratie laat je staan (dit is een wegwerpaccount en de volgende run herseedt toch) — meld in het rapport wél dat het account op de lisa-opstelling blijft. Niets committen; nooit uitloggen.

## Valkuilen (uit de eerste run, 5 aug 2026)

| Signaal | Oorzaak / actie |
|---|---|
| Alle 4 strategieën zelfde FIRE-leeftijd én zelfde excl.-doel | Persona te rijk: FIRE al op de huidige leeftijd bereikt, strategie-effecten spelen pas ná dat moment. Geen bug — neem de lisa-kalibratie. |
| INLEG/MAAND verandert niet na `monthly_savings_override` | De kernel rekent op de effectieve cashflow, niet op die override. Gebruik `income_source`/`expenses_source='manual'` via `/api/parameters`. |
| KPI's ongewijzigd na PUT | RSC-render van vóór de PUT. Harde reload met ignoreCache; config verifiëren via GET. |
| Klik doet niets op een React-knop | Dispatch `pointerdown`+`pointerup`+`click`; verse snapshot vóór uid-kliks. |
| Wat-als-stippellijn vervuilt de figuur | Wat-als-toggle (aria-pressed=true) uitzetten vóór elke screenshot; komt na reload terug. |
| Opbouw-knop ontbreekt | 'Eenvoudig'-weergave verbergt hem (HideInSimple) — weergave op volledig zetten. |
| `evaluate_script` faalt met "Execution context was destroyed" | Pagina navigeerde tussendoor — gewoon opnieuw uitvoeren. |
