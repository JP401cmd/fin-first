---
id: 0034-vrijheidsvoortgang-grondslag-incl-woning
title: 'Vrijheidsvoortgang: default-grondslag incl. eigen woning (herziening van ADR 0009)'
status: aanvaard
date: 2026-07-07
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

Vrijheidsvoortgang (freedomPct) staat vanaf nu STANDAARD op de INCL.-woning grondslag: teller = volledig netto vermogen (incl. eigen woning + overige niet-liquide bezit), noemer = `requiredFireNetWorth` (Prognose!I@FIRE, resp. `inclHomeTargetFromScalar` waar alleen een scalar-doel bekend is). Alléén wanneer de eigen woning expliciet van FIRE is uitgesloten (`isHomeExcludedFromFire` — housing-strategie `exclude_from_fire` mét eigen huis) valt de grondslag terug op EXCL. (liquide): teller = FIRE-eligible netto vermogen, noemer = `requiredFirePortfolio` (Prognose!J@FIRE) — dat is precies het ADR 0009-gedrag. Eén canonieke keuze-helper `selectFreedomProgressBasis` + rekenhelper `computeFreedomProgressWithBasis` (`lib/core-metrics.ts`), gevoed door het predikaat `isHomeExcludedFromFire` (`lib/housing-strategy.ts`).

## Context
ADR 0009 (2026-06-12) legde vast dat vrijheidsvoortgang uitsluitend op de FIRE-eligible/liquide grondslag draait (huis alleen meetellen voor zover housing-strategie het vrijspeelt), zodat de 100%-clamp niet stelselmatig te hoog zou tonen terwijl de "nog X jaar"-aftelling nog jaren beweerde. Die invariant blijft gelden voor de aftelling.

Sindsdien is er een expliciete productbeslissing van de eigenaar bijgekomen: voor de meeste huiseigenaren geldt dat de woning uiteindelijk wél wordt ingezet om het FIRE-doel te halen (meerekenen, downsize of opeethypotheek) — de EXCL.-grondslag onderschatte de voortgang van die groep structureel, ook al is de invariant "100% ⇔ doel bereikt" op zichzelf correct. Alleen wanneer de gebruiker de woning bewust buiten FIRE houdt (`exclude_from_fire`) is de EXCL.-grondslag nog de juiste weergave van wat daadwerkelijk beschikbaar is.

De F6/dubbele-grondslag-uitbreiding van de horizon-kernel-bridge (2026-07-06, zie calc-catalogus-entry `horizon-kernel`) levert sindsdien zowel `requiredFirePortfolio` (excl., Prognose!J@FIRE) als `requiredFireNetWorth` (incl., Prognose!I@FIRE) additief in `UnifiedProjectionResult`/`SimResult`, wat deze herziening zonder tweede rekenpad mogelijk maakt: de identiteit I = J + (niet-liquide bezit − niet-liquide schuld) garandeert dat beide grondslagen hun 100%-mijlpaal op hetzelfde FIRE-moment raken.

## Besluit
Grondslag-keuze op één plek: `selectFreedomProgressBasis(config)` beslist INCL. vs. EXCL. via `isHomeExcludedFromFire`; `computeFreedomProgressWithBasis` berekent het percentage op de gekozen teller/noemer. Waar de unified projection draait (dashboard-data-loader, `/toekomst`-client) is de INCL.-noemer de kernel-`requiredFireNetWorth` zelf; waar alleen een scalar `fireTarget` bekend is (horizon/core-loader, AI shared-context, freedom-card, report, what-if-recompute) levert `inclHomeTargetFromScalar` de INCL.-noemer af als excl.-doel + (netWorth − fireEligibleNetWorth), zodat 100% ook daar op hetzelfde punt valt als op de excl.-grondslag. Alle ~8 display-consumers (zie `elementIds`/`files` in de calc-catalogus-entry `vrijheidsvoortgang`, `lib/architecture/calculations.ts`) routeren via deze twee helpers — geen los tweede rekenpad per surface.

**Expliciete afbakening:**
- De **"nog X jaar vrij"-aftelling** (FIRE-leeftijd `fireAgeFractional` = P!B16, óók de bron van de grafiek-FIRE-marker en de hero-KPI "vrijheidsleeftijd") staat AL op DEZELFDE grondslag als de vrijheidsvoortgang — zie het addendum van 2026-07-07. De solver zoekt de FIRE-maand op Prognose!J (netto-liquide), en `J = I − (niet-liquide bezit − niet-liquide schuld)`. Onder woning-strategie **Meerekenen** (include_full) is de eigen woning NIET niet-liquide (adapter: alléén "Eigen huis"/"Woning" krijgen de niet-liquide-vlag, en alléén als de strategie ≠ Meerekenen) → **J == I** → `requiredFirePortfolio == requiredFireNetWorth`. De aftelling meet dus HETZELFDE incl.-woning doel als freedomPct. Alléén bij `exclude_from_fire` valt de woning uit Prognose!J → de aftelling blijft op de LIQUIDE grondslag — spiegelbeeld van freedomPct dat daar óók terugvalt op EXCL. In beide gevallen raken 100% freedomPct en aftelling-0 hun mijlpaal op EXACT dezelfde FIRE-maand (op die maand geldt I == requiredFireNetWorth én J == requiredFirePortfolio).
- **ADR 0030** (drawdown-grondslag `besteedbaarVermogen` vs. `liquideVermogen`) is niet geraakt: die splitsing zit binnen de kernel-eligibility/drawdown-laag en wordt door de kernel `requiredFirePortfolio`/`requiredFireNetWorth` ongewijzigd doorgegeven aan deze herziening.
- **reverse_mortgage**: de EXCL.-tak (indien gekozen) blijft de leen-ruimte-grondslag (ADR 0029); onder INCL. telt de volle overwaarde mee.
- **Snapshot-historie** (`app/api/snapshots`) en de **household-projectie** houden bewust hun eigen per-rij/per-huishouden definitie (ongewijzigd t.o.v. ADR 0009/0008).
- De **check-funnel** (`lib/check/build-report.ts`, ADR 0025, `HOUSE_FIRE_WEIGHT=0.5`) is een aparte public-intake-grondslag, bewust niet geraakt.

## Gevolgen
- **Gezondheidsgetal**: de fire-pijler erft `freedomPct`. Voor huiseigenaren met een meerekenen/downsize/opeethypotheek-strategie valt de live health-score nu HOGER uit dan onder ADR 0009 (die de score juist verlaagde omdat "een huis waarin je woont geen vrijheid vrijspeelt"). Dat is de bewuste keerzijde van deze herziening, geen regressie — de eigenaar accepteert dat een woning die uiteindelijk wordt ingezet, ook in het gezondheidsgetal als toekomstige vrijheid telt.
- De balk-label op `/toekomst` toont voortaan het incl.-woning doel (`fireTargetInclHome`) i.p.v. het liquide doel, voor gebruikers zonder `exclude_from_fire`.
- Milestone-/insight-triggers die op `freedomPct` hangen, kunnen voor deze groep eerder vuren dan onder ADR 0009 — consistent met de nieuwe grondslag, geen los besluit nodig.
- **ADR 0009 wordt hiermee vervangen** (status `vervangen`, addendum toegevoegd) voor zover het de default-grondslag van vrijheidsvoortgang betreft; de EXCL.-tak van ADR 0009 blijft **letterlijk** herleefd als de `exclude_from_fire`-uitzondering van dit besluit — geen inhoudelijk verschil in dat geval.

Bewaakt door `lib/core-metrics.test.ts` en de calc-catalogus-entry `vrijheidsvoortgang` in `lib/architecture/calculations.ts` (`validateCalculations`).

## Addendum (2026-07-07) — aftelling-grondslag geverifieerd, GEEN kernel-wijziging nodig

Eigenaar-besluit: óók de **"nog X jaar vrij"-aftelling / FIRE-leeftijd** moet op de incl.-woning grondslag staan, consistent met freedomPct — behalve wanneer de woning expliciet is uitgesloten. Bij het uitwerken bleek dit besluit voor het default-geval **al geïmplementeerd** te zijn; er is geen kernel-herdefinitie gedaan (en die zou parity breken en/of modelmatig onjuist zijn). Bewijs (bron + oracle-fixtures):

- **Mechanisme.** De solver bepaalt de FIRE-maand op Prognose!J (`solver.ts`/`gap.ts`). `tables/prognose.ts`: `J = I − (L − M)` met `L`/`M` = niet-liquide bezit/schuld via de TS!H-vlaggen. `adapter/prio-overgang.ts` (regels 182/197): op het APP-pad krijgt **uitsluitend** "Eigen huis"/"Woning" de niet-liquide-vlag, en **alléén** wanneer woning-strategie ≠ Meerekenen. Pensioen/vastgoed/overig staan altijd in J.
- **Meerekenen (include_full, app-default) ⇒ J == I.** `requiredFirePortfolio == requiredFireNetWorth`; de aftelling meet exact het incl.-woning doel. Fixture `huis-meerekenen`: J@FIRE = I@FIRE = €638.143,74 (verschil €0,00).
- **Uitsluiten (exclude_from_fire) ⇒ J < I.** De aftelling blijft liquide — spiegel van freedomPct dat daar óók op EXCL. staat. Fixture `huis-uitsluiten`: I@FIRE − J@FIRE = €511.474,83 (= overwaarde).
- **Endpoint-invariant.** Voor élke housing-strategie geldt op de FIRE-maand `prognoseI == requiredFireNetWorth` én `prognoseJ == requiredFirePortfolio` → 100% freedomPct en aftelling-0 vallen op EXACT dezelfde maand (fixtures `huis-verkoop-vast`, `huis-opeethypotheek`, `basis` idem).
- **Downsize/opeethypotheek.** De woning is niet-liquide TOTDAT de kernel haar monetariseert (verkoop/opeet); de FIRE-maand wacht daar correct op. De woning "eerder" laten meetellen (aftelling naar 0 vóór de liquide pot toereikend is) zou betekenen dat je een niet-verkochte woning opeet — modelmatig onjuist. Bewust NIET gedaan.

Vergrendeld door `lib/horizon-kernel/fire-basis-invariant.test.ts`. Gevolg: de eerdere afbakening (die de aftelling als "liquide, beweegt niet mee met incl." omschreef) is hierboven gecorrigeerd; het besluit "aftelling op incl." is voor het default-geval een feit, niet een openstaande wijziging.

## Addendum (2026-08-27) — het balk-label volgt de euro-weergave

Eigenaar-besluit: het bedrag-label rechts van de voortgangsbalk op `/toekomst` (zie Gevolgen hierboven) toont voortaan het doelbedrag in de **actieve euro-weergave** (ADR 0093), gelijkgetrokken met de Doelbedrag-KPI ernaast — "ca. €180.000 — volledige vrijheid" in `'real'` waar het nominaal €200.032 was. De grondslag-keuze (incl. woning, excl. bij `exclude_from_fire`) en het percentage zelf zijn niet geraakt: `freedomPct` is een ratio en deflateert nooit. Bewuste keerzijde: in `'real'` is de balkvulling niet meer letterlijk teller ÷ label; twee verschillende bedragen voor hetzelfde doel op één scherm woog voor de eigenaar zwaarder. De euro-view-uitzondering die hier stond (ADR 0093 §12) vervalt; bewaakt door `components/app/horizon/horizon-client.euro-view.test.ts`.
