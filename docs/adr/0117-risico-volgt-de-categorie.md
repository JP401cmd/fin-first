---
id: 0117-risico-volgt-de-categorie
title: Risico volgt de categorie — een markt-risicofactor per pot in band, Monte-Carlo en rendement-marge
status: aanvaard
date: 2026-08-29
elements: [as-planning, as-vermogen, sp-plannen, app-comp]
---

De scenarioband (P!B43), de Monte-Carlo (MC!B3/B10/<col>12) en de rendement-marge schalen hun verstoring voortaan met een **markt-risicofactor per bezitting-pot** (`AssetPot.risicoFactor`, een beta) in plaats van met de binaire `investering`-vlag. Daarmee beweegt een premieregeling-pensioenpot voor het eerst überhaupt mee, en krijgt een obligatiepot niet langer dezelfde onzekerheid als een aandelenpot. Het veld is optioneel en inert-by-default: ontbreekt het — precies wat het oracle-fixture-pad doet — dan is de uitkomst byte-identiek aan het Excel-model (ADR 0032). Snede 1 van de portefeuille-allocatiemodellering (roadmap I).

## Context

### Het defect: het plan was systematisch te zeker

Drie waarnemingen, gedaan op HEAD vóór deze wijziging:

1. **De scenarioband was een vaste ±2 procentpunt.** `SCENARIO_SHIFT` in
   `wrappers/band.ts` gaf elk scenario dezelfde shift voor álle investeringspotten.
   Een 100%-obligatieportefeuille kreeg exact dezelfde band als 100% aandelen. Die
   band voedt de zichtbare uitspraak *"waarschijnlijk vrij tussen X en Y"* (ADR 0085).

2. **De Monte-Carlo draaide op één σ.** `runMonteCarlo` gebruikt één gedeelde
   marktschok plus 0,3·σ idiosyncratische ruis per pot — dezelfde σ voor
   spaargeld-achtige en aandelen-achtige potten.

3. **De ****`investering`****-vlag is een 2-categorie-whitelist.**
   `INVESTERING_CATEGORIEEN` in `adapter/potten.ts` bevat alleen `Beleggingen` en
   `Vastgoed`. Een pot in de kern-categorie **Pensioen** viel er dus buiten en groeide
   in band én Monte-Carlo **deterministisch** door. In Nederland is de
   premieregeling-pot vaak de grootste aandelenblootstelling van een huishouden. Het
   plan werd daardoor te zeker in evenredigheid met hoeveel pensioenvermogen iemand
   heeft — de onzekerheidsband was het smalst juist waar de blootstelling het grootst
   was.

Punt 3 is geen wens maar een modelfout: de band belooft een spreiding en levert er
aantoonbaar te weinig.

### Een tweede hardcode voor σ

`adapter/params.ts` zette `sigma: EXCEL_ONZEKERHEID_DEFAULTS.mcSigma` = `0.15`
(`adapter/defaults.ts`). De beheerbare jaarlaag `fire_assumptions.volatility` — ook
0,15 — bereikte de projectie nergens. Geen zichtbare drift zolang beide 0,15 waren,
maar zette beheer de jaarlaag op 0,18, dan veranderde er in de band niets. Twee
bronnen voor één getal.

### De randvoorwaarde: het Excel-oracle mag niet bewegen

`SCENARIO_SHIFT` spiegelt P!B43 en `EXCEL_ONZEKERHEID_DEFAULTS` spiegelt MC!B3; de
parity-suites (`test/horizon-oracle`) pinnen `outcomes`/`successProbability` en de
scenario-rijen cel-exact. Elke oplossing die de kern hardt verbouwt, breekt die gate.

## Besluit

### 1 · Een optionele markt-risicofactor per pot (de overlay-truc)

`AssetPot` krijgt een optioneel veld `risicoFactor?: number` — een dimensieloze
**beta**: hoe hard deze pot de markt volgt. Eén gedeelde, pure helper
`wrappers/risico.ts#potRisicoFactor(pot)` beantwoordt de vraag voor alle consumenten:

- factor aanwezig en geldig (eindig, ≥ 0) → die waarde;
- **afwezig → `investering ? 1 : 0`** = exact het gedrag van vóór dit ADR.

Het fixture-pad (`input-from-fixture.ts`) vult het veld nooit; de app-adapter
(`adapter/potten.ts`) altijd. Zelfde inert-by-default-patroon als
`tekortAflossingUitLiquide` (gap V19) en `echteAnnuiteitAflossing` (V22): het
parity-pad blijft byte-groen, het app-pad krijgt de correctie.

### 2 · Drie consumenten, één hefboom

`wrappers/band.ts`, `wrappers/mc.ts` en `rendement-marge.ts` bakken hun verstoring
per pot in `pot.rendement` van de INVOER, geschaald met de factor. De tabellen
blijven onaangeraakt — dezelfde invoer-transform die `wrappers/mc.ts` al gebruikte.

Twee eigenschappen die dit veilig maken:

- **Schalen van de trekking ≡ schalen van σ.** `normInv(u, 0, σ) = σ·x`, dus
  `normInv(u, 0, σ)·f === normInv(u, 0, σ·f)`. De factor levert een per-pot σ zonder
  de seed-reeks of `wrappers/noise.ts` aan te raken. De gedeelde marktschok blijft
  gedeeld: alle potten bewegen dezelfde kant op, alleen verschillend hard — precies
  de beta-lezing, en dezelfde correlatiestructuur als het Excel-model.
- **Byte-identiteit bij f = 1.** De consumenten schrijven bewust
  `x + shock * f + ruis * f` en NIET `x + (shock + ruis) * f`: drijvende-komma-optelling
  is niet associatief, vermenigvuldiging met 1 wél exact. Bij `f = 0` gaat de pot
  ONgewijzigd door in plaats van `+ 0` op te tellen.

### 3 · De afleiding: expliciet > subtype > categorie

`adapter/risico.ts#assetRisicoFactor` (app-zijde, de kern blijft domein-vrij):

1. Categorie niet marktgevoelig → 0. Dat geldt voor **Spaargeld** (nominaal
   gegarandeerd; renterisico is geen marktschok), **Eigen huis** (loopt via de
   woonstrategie) en **Overig**.
2. `assets.risk_profile` wint altijd — de expliciete gebruikerskeuze, zelfde
   precedentie-regel als `resolveFireParamsWithAssumptions`.
3. anders `ASSET_SUBTYPE_DEFAULTS[subtype].risk_profile` — de bestaande canonieke
   "wat voor ding is dit"-tabel; geen tweede lijst.
4. anders de categorie-terugval `middel`.

De marktgevoelige set is `{Beleggingen, Vastgoed, Pensioen}`. **Pensioen erbij is de
correctie**; de `investering`-vlag zelf blijft ongewijzigd omdat die óók de scope van
market_shock-events (`potMutaties.alleenInvestering`) en de scalar-shift-tak in
`tables/bez.ts` stuurt — hem verbreden zou stil de reikwijdte van een
gebruikers-event veranderen.

De factoren staan als benoemde constanten in `lib/constants.ts`
(`RISICO_FACTOR_PER_PROFIEL`): **laag 0,3 · middel 1 · hoog 1,4**. `middel = 1` is het
ANKER — σ = `DEFAULT_VOLATILITY` (15%) en ±2pp zijn geijkt op een breed gespreide
aandelenportefeuille, precies waar de band al op rekende. Een bezitting zonder
risico-informatie houdt daarmee exact het oude gedrag; de correctie treft alleen wat
de data aantoonbaar rechtvaardigt.

### 4 · σ uit één bron

`EXCEL_ONZEKERHEID_DEFAULTS.mcSigma` verwijst voortaan naar `DEFAULT_VOLATILITY` — de
duplicaat-literal is weg. De jaarlaag bereikt de projectie via een nieuwe optionele
`KernelAdapterInput.marktVolatiliteit` (al geresolveerd door
`resolveFireAssumptions`), doorgegeven vanaf `HorizonRawData.marktVolatiliteit` via de
convergentie- en what-if-context. Precedentie: **jaarlaag → `DEFAULT_VOLATILITY`**.
Een ongeldige of niet-positieve waarde valt terug op de default: σ = 0 zou de hele
band tot één lijn platdrukken zonder dat iemand dat als "uit" bedoelde.

## Gevolgen

- **Getallen bewegen voor bestaande gebruikers, en dat is de bedoeling.** Wie een
  pensioenpot heeft, ziet een bredere band en een kleinere rendement-marge; wie een
  obligatie- of depositopot als belegging heeft staan, ziet een smallere. Wie niets
  heeft ingevuld (geen `risk_profile`, geen subtype) ziet **niets** veranderen. Dit is
  een correctie, geen regressie — en het is een release-aantekening waard.
- **Oracle-pariteit blijft byte-groen.** `test/horizon-oracle` (21 bestanden, 736
  toetsen) draait ongewijzigd; `lib/horizon-kernel/risico-volgt-categorie.test.ts`
  toetst de inertie bovendien direct met een EXACTE vergelijking (afwezige overlay vs.
  expliciet 1/0), omdat juist laatste-bit-drift de foutklasse is.
- **De rendement-marge verandert van betekenis, licht.** Het getal is nu de
  tegenvaller op een pot met beta 1 — een MARKTbrede verschuiving die per pot met zijn
  eigen risico doorwerkt. Bewust meegenomen: bleef de marge op de uniforme Δr staan,
  dan zou de band de pensioenpot wél meenemen en de marge niet, en zouden twee
  uitspraken over hetzelfde plan het oneens zijn over wie marktrisico loopt.
- **Wat deze snede NIET doet.** De factor raakt uitsluitend de ONZEKERHEID rond het
  rendement, nooit het rendement zelf en nooit de SWR (zie ADR 0116). De mix die het
  verwachte rendement voedt is snede 2; doelallocatie/glidepath is snede 3; de
  account-type-kant (toegangsleeftijd, uitkeringsregeling als stroom, Box 2 op
  deelneming, lijfrente-aftrek) is losgeknipt naar een eigen kaart.
- **Categorie Overig blijft bewust op 0**, óók voor `deelneming` — dat is echt
  aandelenrisico, maar het hoort bij de Box 2-snede: daar krijgt het én zijn heffing
  én zijn risico. Nu zou het een pot met `expected_return: 0` laten schommelen zonder
  dat de fiscale kant meebeweegt.
