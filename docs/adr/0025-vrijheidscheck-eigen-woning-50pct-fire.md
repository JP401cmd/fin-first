---
id: 0025-vrijheidscheck-eigen-woning-50pct-fire
title: Vrijheidscheck — eigen woning telt voor 50% mee in de FIRE-grondslag
status: aanvaard
date: 2026-06-17
elements: [as-vrijheidscheck, sp-vrijheidscheck]
---

In de Vrijheidscheck-funnel (`/check`) telt de eigen woning voortaan voor **50%** van haar netto overwaarde mee in de FIRE-/vrijheidsberekening — inclusief 50% van het verwachte woning-rendement — i.p.v. volledig uitgesloten te worden. De implementatie is bewust **gescoped tot het rapport** (één constante `HOUSE_FIRE_WEIGHT = 0.5` in `lib/check/build-report.ts`), niet als nieuwe app-brede housing-strategie. Het getoonde netto vermogen blijft de vólle waarde (incl. 100% huis); een nieuw DTO-veld `freedomBaseEur` maakt de vrijheidsgrondslag expliciet zodat euro's en vrijheidstijd voor een leek kloppen, en een `houseInclusion`-disclosure vertelt dat de app dit nauwkeuriger kan.

## Context

De check-funnel hanteerde `CHECK_HOUSING_STRATEGY = { mode: 'exclude_from_fire' }`: de eigen woning + gekoppelde hypotheek werden volledig uit de FIRE-pot gefilterd ("dat is je dak, niet je rendement"). Dat leverde drie problemen op:

- **Onverklaarbare grondslag-mismatch.** De snapshot toonde het netto vermogen *incl.* huis (bv. €115k) maar berekende de vrijheidstijd op het *FIRE-eligible* vermogen *excl.* huis. Een leek zag "€115k = 1 jaar 4 maanden" en kon de simpele som (€115k ÷ maanduitgaven) niet rijmen — de twee getallen stonden op verschillende grondslagen (CLAUDE.md: grondslag-vermenging).
- **Volledig uitsluiten is te conservatief.** Voor een huis-zwaar profiel verdwijnt vrijwel al het vermogen uit de vrijheidsberekening, terwijl een deel van de overwaarde wél te verzilveren is (verkopen/verkleinen/opeethypotheek).
- **Volledig meetellen is te optimistisch.** 100% van de overwaarde als FIRE-besteedbaar voorstellen overschat de liquiditeit — je woont er nog in.

## Besluit

**(a) 50%-weging, gescoped tot het rapport.** De eigen woning telt voor 50% van haar netto overwaarde mee in de FIRE-eligible grondslag: `fireEligibleNetWorth = netWorth − (1 − HOUSE_FIRE_WEIGHT) × overwaarde`. Dit is een rapport-constante, **geen** nieuwe `HousingStrategyMode` in de gedeelde `lib/housing-strategy.ts`-union — om de blast radius op het app-brede housing-model (en alle bijbehorende switch-statements/parsers/tests) te vermijden.

**(b) Synthetisch 50%-bezit dat meegroeit op de canonieke woning-appreciatie.** De échte woning + hypotheek blijven uit de engine-pot gefilterd (zo blijft de woonlast alléén in het budget en wordt de hypotheek-aflossing niet dubbel geteld). In plaats daarvan krijgt de FIRE-portefeuille één synthetisch groei-bezit ter grootte van `HOUSE_FIRE_WEIGHT × overwaarde`, dat meegroeit op de **canonieke** woning-appreciatie (geen hardcoded getal). Zo telt 50% van de overwaarde mee én groeit het mee — conform "consume, don't recompute".

**(c) Reconciliatie via `freedomBaseEur`.** De headline blijft het vólle netto vermogen (incl. 100% huis), maar de snapshot exposeert nu `freedomBaseEur` (= de FIRE-eligible grondslag, incl. 50% huis) en toont expliciet "€Y vrijheidsvermogen = Z vrij". Daarmee rijmt de getoonde euro met de getoonde vrijheidstijd. Pariteit met `twoFutures.stopToday`/`fireCards` blijft (gedeelde `buildNetWorthFreedom`).

**(d) Eerlijke disclosure.** Een DTO-veld `houseInclusion { weightPct, note }` draagt een leek-uitleg ("We rekenen je eigen woning voor 50% mee … in de app stel je dit nauwkeuriger in — verkopen, opeethypotheek of niet meerekenen"), gerenderd als voetnoot. De vereenvoudiging is dus zichtbaar, niet verborgen.

## Alternatieven

- **Volledig uitsluiten (de oude `exclude_from_fire`).** Verworpen: te conservatief en bron van de grondslag-mismatch die de leek niet kon rijmen.
- **Volledig meetellen (`include_full`).** Verworpen: overschat de liquiditeit — je kunt je dak niet opmaken zonder te verhuizen.
- **Nieuwe app-brede gewogen housing-mode in de gedeelde union.** Verworpen: raakt elk switch-statement/parser/test rond `HousingStrategyConfig` (downsize/reverse_mortgage/exclude/include) en verbreedt de blast radius ver buiten de check-funnel. De bug-fix-scope vroeg een rapport-lokale ingreep.
- **De échte woning voor 50% + de hypotheek voor 50% in de engine-pot.** Verworpen: de hypotheek-maandlast zit al in de uitgaven; 'm half in de FIRE-pot zetten zou de woonlast/aflossing dubbel tellen en de amortisatie verstoren. Het synthetische 50%-overwaarde-bezit vermijdt dat.

## Gevolgen

- De 50%-weging is nu een **rapport-scoped aanname** (`HOUSE_FIRE_WEIGHT`), bewust losgekoppeld van de in-app per-gebruiker housing-strategieën (verkopen/opeethypotheek/uitsluiten — ADR 0015/0021). Bij verdere integratie van de check met het ingelogde model moet deze aanname dáármee verzoend worden (de app laat de gebruiker dit per woning preciezer kiezen); de disclosure verwijst daar al naar.
- Huis-zware / liquide-schuld-zware profielen kunnen nu vaker een **tekort** (negatief vrijheidsvermogen) tonen dan onder volledige uitsluiting; de render-laag (FotoVanNu) bewaakt die tekort-tak expliciet.
- Elke wijziging aan `lib/check/build-report.ts` blijft een consument: geen eigen formule, de woning-appreciatie via de canonieke helper. Bewaakt door `lib/check/__tests__/build-report.test.ts` (de 50%-rekenwijze is met expliciete arithmetiek gepind).
- De Berekeningen-curatie (`lib/architecture/calculations.ts`) is bijgewerkt zodat de plaat de 50%-grondslag weergeeft.
