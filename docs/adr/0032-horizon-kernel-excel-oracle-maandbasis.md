---
id: 0032-horizon-kernel-excel-oracle-maandbasis
title: 'Horizon-rekenkern volgt het eigen Excel-oracle: maandbasis, nominaal, parity ≤ €0,01'
status: aanvaard
date: 2026-07-02
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0032 — Horizon-rekenkern volgt het Excel-oracle (maandkern vervangt v2-grootboek)

De eigenaar vervangt de rekenwijze achter de Horizon/Toekomst-grafiek door die van
zijn eigen, gevalideerde Excel-model (**`Core calc v5.xlsm`**, vastgesteld
2026-07-02; snapshot SHA256 `3E905809B5CC…A80D`). De app-interactie blijft
ongewijzigd; alleen de motor eronder gaat rekenen zoals het Excel. Het Excel is
de **oracle**: de nieuwe kern moet aantoonbaar dezelfde uitkomsten geven.

## Context

- De huidige v2-grootboek-engine (`lib/horizon-engine/`, ADR 0013) rekent op
  **jaarbasis**, intern **reëel** (ADR 0016), met Box 3 als vermogens-drag en een
  forward doel-zoektocht als FIRE-bepaling.
- Het Excel-model rekent op **maandbasis** (index 0..1199, tot leeftijd 100),
  **nominaal** (reële invoer vooraf geïndexeerd), met een structurele
  **één-maand-lag** (belasting/capaciteit/rendement op saldi van m−1), Box 3
  **via de cashflow**, een **capaciteit-waterval** met prioriteit-gewichten
  ½^(prio−1) + reserve + tekort-lening, behoefte-gebaseerde onttrekking met een
  onttrekkingsprofiel (Vast/Afnemend/Oplopend/Guardrails), en een
  **maand-bisectie-solver** met expliciete statussen.
- Eerdere pogingen tot "twee waarheden naast elkaar" (drie-engines-divergentie)
  hebben geleerd dat alleen een aantoonbaar-gelijke, cel-voor-cel geteste kern
  vertrouwen geeft.

## Besluit

1. **Excel is de bron van waarheid.** Een nieuwe pure-TypeScript rekenkern
   (`lib/horizon-kernel/` — "kernel" om verwarring met De Kern-module te
   vermijden) implementeert de Excel-rekenwijze exact: maandbasis, forward-
   recursie, één-maand-lag (feature, geen bug), Box 3 via cashflow (forfaitair
   én werkelijk), netto = bruto, FIRE-grondslag netto-liquide, capaciteit-
   waterval met tekort-lening, eindstrategieën deplete/legacy/perpetual/
   pensioen, onttrekkingsprofielen, woning-modi incl. opeethypotheek, en de
   bisectie-solver met statussen `reached_now`/`reached_at`/
   `unreachable_within_horizon`/`pension_shortfall`.
2. **Parity is de poortwachter.** Een fixture-extractor trekt inputs + alle
   maandtabellen uit het .xlsm; een vitest-parity-suite vergelijkt cel-voor-cel
   per maand per tabel met tolerantie **≤ €0,01** en draait mee in de normale
   testrun. Elke wijziging aan de kern vereist groene parity.
3. **Nominaal-throughout.** De kern rekent nominaal zoals het Excel; dit keert
   de modelkeuze van ADR 0016 (reëel-intern) bewust om. Reële weergave blijft
   mogelijk als presentatie-wrapper (deflatie achteraf), niet als kernmodel.
4. **Parity binnen het Excel-domein; eigenschaps-tests daarbuiten.** N potten/
   gebeurtenissen is in code onbeperkt (Excel-slots zijn geen limiet; de
   slot-rollen huis/hypotheek/opeethypotheek/tekort-lening worden getypte
   rollen). Buiten het Excel-domein gelden eigenschaps-tests: totalen sluiten,
   geen negatieve potten, waterval sluit.
5. **Domein-expanders vóór de kern.** De 4 levensstrategieën (AOW, Pensioen,
   Huis, Werk) en de event-catalogus voeden de kern als kasstromen/events; de
   kern kent geen domeinbegrippen. De expanders worden zelf parity-getest tegen
   de Geb/Auto-gebeurtenissen-tabel van het Excel.
6. **Cutover per oppervlak achter een (her te bouwen) flag**, met een harde
   invariant: de **convergentie-set** (/overzicht-hero, /toekomst-grafiek,
   dashboard-loader/freedomPct via `fire-target-shared`, AI-context) flipt als
   geheel — nooit gedeeltelijk, om een nieuwe engines-divergentie te voorkomen.
   Default-flip en fysieke verwijdering van v2-paden volgen het C5-precedent en
   vereisen expliciet akkoord van de eigenaar.
7. **vpw en bucket vervallen** als onttrekkingsstrategieën; bestaande profielen
   migreren naar "Vast". Het onttrekkingsprofiel vervangt de oude
   `WithdrawalStrategyType`-as; de eindstrategie-as blijft apart.

## Gevolgen

- ADR 0013 en 0016 blijven van kracht tijdens de flag-periode en gaan pas naar
  `vervangen` bij de default-flip; besluiten die de kern materieel wijzigt
  (0014/0015/0027/0028/0030/0031) krijgen bij cutover een gerichte addendum-
  of superseding-ADR.
- Tijdens de flag-periode bestaan twee motoren naast elkaar — vastgelegd als
  aandachtspunt op de plaat; verwijderen bij afronding (FASE 6).
- Plan, mapping en gap-besluitenregister: `docs/horizon-excel-oracle-plan.md`.

## Addendum (2026-07-03) — FASE 6 afgerond: default-flip + fysieke v2-verwijdering

De cutover (punt 6 hierboven) is afgerond volgens het C5-precedent:

- **Default-flip** naar de horizon-kernel: commit `afb75d738` (2026-07-03) — de kernel is
  de motor, de v2-grootboek-engine wordt de noodklep.
- **Fysieke verwijdering** van de v2-paden: commit `95bafeb53` (FASE 6 stap 5A,
  2026-07-03) — `lib/horizon-engine/` bestaat niet meer. Alle routers zijn dunne
  kernel-calls rond `runKernelUnified` (`lib/horizon-kernel/run-unified.ts`); de
  vlaggen/vergelijk-route zijn weg. `buildSimNetWorthRows` verhuisde naar
  `lib/horizon/networth-rows.ts`, `buildHorizonInput` naar `lib/horizon/build-input.ts`;
  `lib/unified-projection.ts` is nu een kaal consumer-typecontract (zie de addendum op dat
  gedeelte in de catalogus-entry `unified-projection`).
- **ADR 0013 en 0016 gaan naar status `vervangen`** (zie hun addenda). De besluiten die de
  kernel materieel wijzigt kregen een gerichte addendum: ADR 0014 (geërfd, ander
  detectiepad), ADR 0015 (geërfd, ander mechanisme), ADR 0027 (geërfd, maand-precisie),
  ADR 0028 (VERVALLEN — de kernel unificeert `spendable`/`saleManaged` niet), ADR 0030
  (MOOT — de tweedeling die het oploste bestaat niet meer) en ADR 0031 (MOOT — geen
  vaste-punt-iteratie meer nodig; de valuatie-basis-keuze is niet overgenomen). Twee
  concerns die uit de ADR 0028/0030-spanning volgden (`downsize-display-eligibility-desync`,
  `downsize-fire-gate-eligibility-vs-besteedbaar`) zijn met deze cutover opgelost en van de
  plaat verwijderd; het concern `horizon-kernel-flag-periode` (twee-motoren-tijdens-cutover)
  is eveneens verwijderd nu er nog maar één motor is.
- Catalogus-entry hernoemd van `horizon-grootboek-v2` naar `horizon-kernel`
  (`lib/architecture/calculations.ts`).

## Addendum (2026-08-27) — échte annuïteit op het app-pad (gap V22)

Het oracle modelleert élke reguliere schuld-slot als *"annuïteit met een vaste
maandaflossing"*: `aflossing = MIN(saldo(m−1), D€/12)` (`tables/s.ts`). Voor een
lineaire lening en een aflossingsvrije schuld klopt dat, maar voor een échte
annuïteit niet: daar is het aflossingsdeel juist het deel dat **groeit** terwijl de
rente over een dalend saldo krimpt. De app-adapter bevroor bovendien de
aflossingscomponent van *vandaag*, waardoor een hypotheek van €249.278,39 @4% met
een maandlast van €1.193,54 in de projectie ~687 maanden deed over wat in
werkelijkheid 358 maanden is — netto vermogen structureel te laag en de
FIRE-leeftijd te laat voor iedere hypotheekhouder.

De eigenaar heeft op 27-08-2026 besloten dit **wél** te corrigeren, via het
M6-patroon (ADR 0108/0109) i.p.v. een wijziging in de kern zelf:

- **`KernelInput.echteAnnuiteitAflossing`** — optioneel, inert-by-default.
- **`DebtPot.annuiteitMaandlast`** — optioneel; de constante totale maandlast
  (rente + aflossing) in euro's per **maand** (bewust niet de jaarvorm van
  `aflossingEur`, zodat de schaal in de naam zit).
- Met beide gevuld herrekent `tables/s.ts#plannedMonthlyAt` de split per periode:
  `aflossing(m) = CLAMP(maandlast − saldo(m−1)·rente/12, 0, saldo(m−1))`.

**Parity blijft de norm.** `input-from-fixture` zet de vlag niet en vult de maandlast
niet, dus élke oracle-fixture is byte-identiek aan Excel v5 — geen golden-herijking
(geverifieerd: 53 testbestanden / 1201 assertions groen, geen gewijzigd fixture- of
golden-bestand). De app-adapter (`adapter/index.ts`) zet de vlag op `true`; de
adapter vult de maandlast alléén voor schulden die daadwerkelijk annuïtair aflossen —
`lineair`, `aflossingsvrij`, een handgezette `custom_aflossing_amount` en een
maandlast ≤ rente krijgen 'm bewust niet.

**Bekende, begrensde restpost.** De payoff-vrijval `CF!G`
(`tables/cf.ts#geplandeMaandAflossing`) blijft de bevroren `aflossingEur/12`
vrijgeven i.p.v. de aflossing zoals die op het payoff-moment is. Dat is een eigen,
apart gedocumenteerde conventie (ADR 0020-inverse) en valt buiten dit besluit; het
effect is **conservatief** (het onderschat de vrijval, dus het voordeel van de fix).
Wijzigen vergt een nieuw eigenaar-besluit.

Achtergrond en volledige besluittekst: gap V22 in
`docs/horizon-excel-oracle-plan.md`. Vangnet:
`lib/horizon-kernel/annuiteit-aflossing.test.ts`.

### Golden-herijking van de strategiematrix (2026-08-28)

De oracle-fixtures bleven byte-identiek (de vlag staat daar uit), maar de **app-pad**-goldens
van `lib/regression-tests/horizon-strategie/matrix.ts` niet: die meten juist het app-pad en
zijn daarom bewust herijkt. Onderbouwing vóór de herijking, per combinatie gemeten:

- **Geen lek.** Per schuld-slot is de saldo-reeks (1200 maanden) met vlag AAN vs. UIT
  vergeleken. Alleen de vier `annuiteit`-schulden bewegen; elke `lineair`- en
  `aflossingsvrij`-schuld heeft max Δ = €0,00 exact — inclusief de €110.000
  beleggingshypotheek die de A-groep-goldens draagt, en de tekort-lening.
- **Richting eenduidig.** Met de FIRE-maand gepind zijn bezit, schuld én netto vermogen met
  de vlag AAN op elke gemeten maand gelijk of beter (m=360: netto €6,64 → €6,76 mln, schuld
  €230k → €113k; vanaf m=480 is de hypotheek weg en resteert exact het aflossingsvrije deel).
- **Verschuiving van de verwachte orde.** `B-pensioen` heeft een VÁSTE FIRE-maand (de solver
  kortsluit op 67) en stijgt daar met exact de schuldverlaging op die maand (+€78.081,
  +1,35%). De combinaties met een vrije FIRE-maand komen 2–9 maanden eerder uit en hun
  doelbedrag (= Prognose!J@FIRE) daalt navenant (−1,8% t/m −7,3%). De vijf "reached
  now"-combinaties meten op maand ~1, vóór enige amortisatie, en bewegen niet.

**Apart gevonden, niet van deze fix:** een schone worktree op HEAD levert dezelfde waarden
als deze tree met de vlag geforceerd UIT, en béide weken al −0,08 à −0,17 jr / −0,5 à
−1,6% van de vorige goldens af — binnen de marges, dus onopgemerkt. Oorzaak: de
matrix-persona pint de leeftijd maar de life-events dragen vaste `target_date`-strings,
zodat de afstand tot AOW met elke verstreken kalendermaand krimpt. Deze herijking zet die
klok op nul zonder de oorzaak weg te nemen; dat hoort op een eigen kaart.
