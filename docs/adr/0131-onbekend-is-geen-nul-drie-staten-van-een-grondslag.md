---
id: 0131-onbekend-is-geen-nul-drie-staten-van-een-grondslag
title: 'Onbekend is geen nul: een grondslag is gemeten, geschat of onbekend'
status: aanvaard
date: 2026-09-05
elements: [as-budget, as-vermogen, as-planning, fn-budgetteren, sp-inzicht]
---

# 0131 — Onbekend is geen nul: een grondslag is gemeten, geschat of onbekend

## Context

Sanne (31) koos in de onboarding bij inkomen en uitgaven voor **"Later
invullen"** — een knop die de app even prominent aanbiedt als invullen — en
vulde wél € 14.000 spaargeld in. Haar eerste oordeel op `/overzicht` was
**"8 van 100 — Kritiek"**, met in het detail "Spaarquote 0 %" en "Noodfonds
0,0 × salaris". `/overzicht/cashflow` zei "Geschat jaarinkomen € 0 · uit je
profiel", de check-in "Inkomen € 0 · Uitgaven € 0 · Gespaard € 0", en de
briefing adviseerde "begin met 10 % van je inkomen". Henk, die alles invulde,
kreeg 78 — het verschil zat in één overslaanbare stap, niet in hun situatie.

Eén oorzaak verklaarde alle vijf oppervlakken: de app had **geen representatie
voor "nog niet ingevuld"**, los van "geverifieerd nul". `profiles.net_monthly_income`
is `NUMERIC DEFAULT 0`; "Later invullen" schrijft letterlijk `0`, en
`income_source` blijft leeg. `resolveAmountWithBasis` (ADR 0103) viel daarna
door tot de `profile`-terugval met bedrag 0, en elke consument las dat als
meting. Drie van de zeven score-pijlers hadden — blijkens hun eigen
code-commentaar — bewust géén no-data-pad ("always has a value"), in
tegenstelling tot budgetdiscipline, schuldenlast en spreiding (ADR 0010).

Tegelijk besloot de eigenaar bij UR3-05 dat de app een bedrag mag **schatten**
("Schat het voor me", CBS-leeftijdsband) en dat zo'n schatting de score en de
briefing wél voedt — mét zichtbaar voorbehoud. Daarmee ontstaan drie staten
naast elkaar, en die horen in één contract.

## Besluit

1. **`ResolvedBasis` krijgt twee waarden erbij: `'estimate'` en `'unknown'`.**
   De grondslag is "de uitspraak over het getal", niet de bron. Drie staten:
   - *gemeten/opgegeven* — `budget` | `transaction` | `manual` | `profile`;
   - *geschat* — `estimate`: de app heeft geraden. Voedt score en briefing,
     draagt zijn label mee tot de gebruiker het bedrag vervangt;
   - *onbekend* — `unknown`: geen keuze, geen meting, geen profielbedrag > 0.
   `BASIS_LABEL`/`BASIS_PHRASE` zijn `Record<ResolvedBasis, …>`, dus een nieuwe
   waarde zonder woorden is een compile-fout.

2. **`resolveAmountWithBasis` levert `'unknown'`** zodra de keten doorvalt tot
   het profiel en daar niets staat. Het bedrag blijft numeriek `0` (de
   rekenketen hoeft niet op `null`/`NaN` te toetsen); **de vlag draagt de
   betekenis**. Invariant: `basis === 'unknown'` ⇒ `amount === 0`. Alleen
   `'manual'` met 0 is een geverifieerde nul — de gebruiker koos dat.

3. **`'estimate'` is een placeholder, geen keuze.** Als `BasisSource` is hij
   system-only: hij staat niet in `BASIS_SOURCES`, dus
   `sanitizeCashSettingsInput` weigert hem van de client. In de resolver gedraagt
   hij zich als `'auto'` (budget en transacties verdringen de gok vanzelf), maar
   wint het profiel dan heet de uitkomst `'estimate'`. Een echte `'manual'` wint
   over alles — dát is het verschil tussen een keuze en een placeholder.

4. **Eén weergave-guard: `lib/grondslag-guard.ts`**, zuster van
   `lib/horizon/outcome-guard.ts` (ADR 0109). Hij rekent niets en corrigeert
   niets; hij beoordeelt een reeds bepaalde grondslag en levert de ene zin en de
   ene knop (`/overzicht/cashflow`, waar "Eigen bedrag" bron én bedrag in één
   PUT schrijft). De kop is dezelfde als die van de horizon-melding — geen twee
   "we missen iets"-formuleringen naast elkaar.

5. **De gezondheidsscore oordeelt niet over wat ze niet weet.**
   `HealthScoreScalars` draagt verplicht `incomeBasis`/`expensesBasis` — de
   grondslag van het **brede venster** (12-/6-maands resolutie), nooit de lopende
   maand: een lege maand mag een transactiegebruiker niet "onbekend" maken. Bij
   `'unknown'` vallen de pijlers die die kant nodig hebben inactief (gewicht
   herverdeeld, hetzelfde mechanisme als elk no-data-pad): spaarquote (beide
   kanten), noodfonds (alleen als beide ontbreken), schuldenlast (inkomen, mét
   schuldlast), FIRE-voortgang (uitgaven). `HealthScore.onbekend` draagt de
   weggevallen pijlers, de zin en de knop. `total`/`label` blijven de gewogen
   som over de resterende pijlers — de historie blijft een getal — maar
   **oppervlakken lezen cijfer en oordeel uitsluitend via `healthScoreVerdict`**
   en tonen bij `onbekend` géén getal, géén oordeel, wél "nog niet bekend" bij de
   weggevallen pijlers.

6. **De check-in beweegt mee (eigenaarbesluit, optie A).** De bewuste keuze
   "ontbrekend → 0, kaart blijft gevuld" in `lib/checkin/terugblik.ts` is
   teruggedraaid: zonder geboekte inkomsten én uitgaven zegt de terugblik "niets
   om op terug te blikken".

7. **`deferred_onboarding_fields` is géén bron.** Het is een eenmalige
   onboarding-momentopname die niet zelf-corrigeert; de afleiding leunt op
   `income_source` + bedrag + metingen. De coach-regel blijft er wél op draaien.

## Gevolgen

- Vijf oppervlakken tonen bij ontbrekend inkomen één gedrag: geen cijfer, geen
  oordeel, één zin, één knop — `/overzicht`-hero, gezondheidswidget, kassabon
  (/toekomst en /core), rondleiding, `/overzicht/cashflow` (instellingenblok en
  spaarquote-widget), check-in-terugblik. De briefing kiest per constructie geen
  weggevallen pijler meer als "vraagt aandacht".
- Een account mét inkomen gedraagt zich byte-identiek aan voorheen: de nieuwe
  velden zijn `undefined`-tolerant op `HealthScoreInput` en de resolver wijzigt
  alleen de tak "profiel-terugval zonder bedrag".
- **Bewust open:** de drie snapshot-routes schrijven bij `onbekend` nog steeds
  `total` weg als `resilience_score` — de trendlijn kan daardoor een partiële
  score tonen voor een maand zonder oordeel. Aandachtspunt in
  `archimate-concerns.ts`; oplossen zodra besloten is of zo'n maand `null` of
  de partiële score hoort te dragen.
- UR3-05 bouwt op dit contract: de schrijfkant van `'estimate'` (onboarding,
  `save-own-data`), het label op dagtarief/spaarquote/hero en het gat op
  `/mijn/profiel` (client-direct write zonder bron).
