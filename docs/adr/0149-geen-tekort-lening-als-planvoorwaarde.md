---
id: 0149-geen-tekort-lening-als-planvoorwaarde
title: '"Geen tekort-lening in mijn plan": een tweede haalbaarheidscriterium naast de gap, app-only'
status: accepted
date: 2026-09-16
elements: [as-planning, fn-toekomstplannen, data-cont, sp-plannen]
---

# 0149 — "Geen tekort-lening in mijn plan" als planvoorwaarde

De horizon-kernel kent één haalbaarheidscriterium voor een stopmoment:
`solver.ts#isToereikend`. Zonder de nieuwe instelling is dat exact de Excel-gap
(`computeGap ≥ 0`, P!B38). Met de hoofdinstelling **"Geen tekort-lening in mijn
plan"** (`profiles.fire_no_deficit_loan = true` → `KernelInput.geenTekortLening`)
komt daar een tweede eis bij: t/m de eindleeftijd mag er geen *blijvende*
tekort-lening nodig zijn. De solver kiest dan de vroegste stopleeftijd die aan beide
eisen voldoet; onder een vast stop-anker blijft de leeftijd staan en meldt het tekort
zich via de bestaande anker-status. Default UIT ⇒ byte-identiek aan vandaag.

## Context

- **De gap zegt niet of het plan onderweg leent.** De bisectie in `BepaalFIRE` toetst
  alleen `model ≥ doel op de eindleeftijd`. Een plan waarin het liquide vermogen op 58
  op is, de synthetische tekort-lening dertig jaar loopt en pas ná 68 uit een
  pensioeninkomen wordt afgelost, heeft op 90 een gap ≥ 0 en geldt daarmee als
  "haalbaar vanaf 47". De testpersona in `geen-tekort-lening.test.ts` (vermogen
  geschaald, extra pensioen vanaf 68) laat precies dit zien: een vroege FIRE-leeftijd
  met een tekort-lening die tot ruim boven het jaarinkomen oploopt.
- **De tekort-lening is een rekenkundig vangnet, geen product.** ADR 0033 en 0148
  behandelen 'm als artefact dat zo klein mogelijk hoort te zijn. Voor een deel van
  de gebruikers is "ik wil nooit hoeven lenen" de planvoorwaarde zelf — een
  eigenaarsbesluit van 16 sep 2026.
- **Bruggetjes zijn geen leningen.** Een "wanneer nodig"-huisverkoop geeft een
  één-maand-transitie-lag-tekort dat de maand erna uit de opbrengst wordt afgelost
  (F6, gap V19). De runway-lezer (`runway.ts#depletionMonth`, ADR 0126) en de
  tekort-melding kennen daarvoor al één grens: `MAX_TRANSIENT_SPAN_YEARS = 1`.
- **Oracle-parity is een harde randvoorwaarde** (ADR 0032). Het beproefde patroon
  voor een bewuste afwijking is een optioneel, inert-by-default `KernelInput`-veld
  dat het fixture-pad weglaat (V17/V19/V21/V22, ADR 0129, ADR 0148).

## Besluit

1. **Eén criterium, één home.** `solver.ts#isToereikend(input, es, proj, fireAge)` =
   `computeGap ≥ 0 ∧ (geenTekortLening ≠ true ∨ ¬heeftBlijvendeTekortLening)`. De
   horizon-check en de maand-bisectie van `solveFire`, de scenarioband
   (`wrappers/band.ts`), het MC-slaagcriterium en `sustainProbability`
   (`wrappers/mc.ts`) en de rendement-marge (`rendement-marge.ts#houdtBijShift`)
   toetsen dit predicaat. Geen wrapper herhaalt de gap-toets meer zelf.
2. **Blijvend ≠ brug.** `runway.ts#heeftBlijvendeTekortLening(input, proj,
   eindleeftijd)` leest het saldo van de pot met rol `tekortLening` (S!AB) in het
   P!B99-venster (maand 0 t/m `eindMaandVan(eindleeftijd)`, begrensd door de horizon).
   Materieel = `round(saldo) ≥ €1`. De episode-regel is letterlijk die van
   `depletionMonth` (gedeelde `eersteAanhoudendeEpisode`): een episode die bewezen is
   afgelost binnen `MAX_TRANSIENT_SPAN_MONTHS` telt niet; een langere, of een die aan
   het venster-einde nog openstaat, telt wél. Geen tekort-pot ⇒ `false`.
3. **Status.** Zonder vast anker ∧ vlag aan ∧ blijvende tekort-lening op de stand ⇒
   `unreachable_within_horizon` — geplaatst vóór de `reached_now`/`reached_at`-takken
   (zelfde plek als de M6-vangrail), zodat de horizon-parkeerstand niet als "bereikt"
   kan passeren. Onder een vast `stopAnker` is de tak inert: de leeftijd blijft het
   anker en het tekort meldt zich via `anchor_shortfall`/`stop_now_shortfall`
   (ongewijzigd, ADR 0129 K1).
4. **App-only veld.** `KernelInput.geenTekortLening?: boolean`. De adapter zet 'm
   uitsluitend op `true` bij `fire_no_deficit_loan === true`; anders blijft het veld
   `undefined`. `input-from-fixture` zet 'm nooit. Kolom reist mee via
   `KernelAdapterProfile`, `WhatifRawProfileRow`/`ConvergentieRawProfileRow`,
   `KernelMemberProfileRow` (partner: eigen profielwaarde) en het kernel-rapport.
5. **Registerplicht.** `lib/plan-review/register.ts`: `geenTekortLening` → stap
   `plan` (naast het stop-anker).

## Monotonie van de bisectie

De maand-bisectie neemt aan dat het criterium monotoon is in de stopleeftijd: is
maand `m` toereikend, dan ook elke latere maand. Voor de gap was dat al de
VBA-aanname. Voor het tekort-criterium gaat ze in de regel op: later stoppen betekent
langer salaris, meer liquide vermogen op het stopmoment en dus een kortere of geen
tekort-episode — het tekort krimpt monotoon met de stopleeftijd (gemeten: ×0,1-persona
van 47,1 naar 51,6; ×0,25 van 44,3 naar 48,5; de tekort-reeks wordt bij elke latere
stop korter). Ze kan breken wanneer een latere stop een *nieuw* gat opent, bv. een
eenmalige gebeurtenis of een "wanneer nodig"-verkoop die pas bij een late stop op een
lege pot landt en dan langer dan dertien maanden blijft staan. In dat geval houdt de
bisectie haar invariant (`hi` is altijd toereikend, want de horizon-check en elke
`hi`-toewijzing zijn positief getoetst): de gevonden leeftijd is dan nog steeds
toereikend, maar niet gegarandeerd de vroegste. Dat is dezelfde restklasse als bij de
gap en is aanvaard; een niet-monotoon geval hoort als fixture in
`geen-tekort-lening.test.ts` zodra het zich in de praktijk meldt.

## Gevolgen

- **Parity onaangetast.** Geen fixture draagt `geenTekortLening`; alle
  `test/horizon-oracle`-suites (solver, band, mc, engine) blijven byte-groen zonder
  rebaseline.
- **Wie leest de vlag.** Alleen `isToereikend` en `computeStatusBlok` (solver.ts). Wie
  het predicaat leest: `solveFire`, `runScenarioBand`, `runMonteCarlo`
  (`successCriterion` + `sustainOutcomes`), `computeRendementMarge`. Elke
  `solveFire`-consument (bridge, convergentie-router, scalar-router, huishoud-router,
  scenario-presets, kernel-rapport) erft de nieuwe leeftijd/status zonder eigen tak.
- **Geforceerde runs.** `evaluateFireAt` (stop-nu-runway, scenariokaarten, gekozen-
  stop-pad) deelt `computeStatusBlok`, maar is een VAST stopmoment: de nieuwe
  statustak geldt alleen op het gesolvede pad (`vastStop === false`). Een geforceerd
  stopmoment met een tekort-lening houdt dus zijn oude status; anders zette de bridge
  `fireReachable` op false en verdwenen stopkaarten en de gekozen-stop-lijn. Het
  tekort blijft voor die runs zichtbaar via `tekortLeningTotEindleeftijd` en de melding.
- **Catalogus.** `lib/architecture/calculations.ts`, calc `horizon-kernel` (nieuwe
  constante + functies) en calc rendement-marge (functie `isToereikend`).
- **Vangnetten.** `lib/horizon-kernel/geen-tekort-lening.test.ts`: (a) vlag uit/aan op
  het pensioen-gat-plan, (b) huisverkoop-brug verschuift niets, (c) vast anker →
  `anchor_shortfall`, (d) onhaalbaar t/m 100, (e) afwezig ≡ false, (f) helper-episodes,
  (g) band/MC/marge, en de adaptermapping.
- **Buiten scope.** Kopij en UI (`lib/horizon/deficit-loan-copy.ts`, de plan-review-
  wizard, `/api/fire-settings`) en de DB-kolom (`20260916120000`) lopen in de
  parallelle sessie; de RPC `household_member_profiles` moet `fire_no_deficit_loan`
  gaan leveren vóór de partner-run de eigen waarde kan lezen.
