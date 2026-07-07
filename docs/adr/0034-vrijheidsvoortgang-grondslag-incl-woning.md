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

**Expliciete afbakening (blijft ONGEWIJZIGD onder deze herziening):**
- De **"nog X jaar vrij"-aftelling** is en blijft een aparte kernel-grootheid: de FIRE-leeftijd waarop de LIQUIDE portefeuille `requiredFirePortfolio` bereikt. Die beweegt niet mee met de incl.-grondslag — beide grondslagen raken hun 100%-mijlpaal weliswaar op dezelfde FIRE-maand, maar het percentage ertussenin kan nu optimistischer ogen dan de liquide countdown suggereert. Dat is een bewust aanvaard verschil, geen inconsistentie: percentage en aftelling meten twee verschillende dingen (voortgang naar het doel resp. wanneer de liquide pot het doel haalt).
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
