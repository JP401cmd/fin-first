---
id: 0127-nu-stoppen-als-vijfde-eindstrategie
title: "'Nu stoppen' als vijfde eindstrategie, kernel-native op het startleeftijd-anker"
status: aanvaard
date: 2026-09-02
elements: [as-planning, as-vermogen, do-budget, do-transactie]
---

# 0127 — 'Nu stoppen' als vijfde eindstrategie, kernel-native op het startleeftijd-anker

(ADR 0129 splitst stop-anker en eind-vorm in twee assen en contracteert dit
besluit in fase F4 tot het `now`-anker binnen dat model. Status blijft
`aanvaard` tot die fase.)

## Context

Wie ná zijn FIRE-leeftijd doorwerkt heeft niets aan een plan dat FIRE-relatief
ankert (`verwachtFireAge + offset`): de offset staat op een datum die al
gepasseerd is. Wie werkelijk gestopt is wil zijn beeld vanaf vandaag zien. De
horizon-kernel-runway (ADR 0126, PR B — "als ik nu stop, hoe lang kom ik toe")
gaf hier al een deel van het antwoord; dit besluit maakt "nu stoppen" ook een
volwaardige, kiesbare `FireEndStrategy` — het vijfde lid naast
`perpetual`/`legacy`/`deplete`/`pensioen`.

Dit besluit is genomen in drie PR's: **B1** (kernel-fundament + een blokkerende
guardrails-anker-fout gedicht), **B4** (de scenariokaart) en **B3** (de
eindstrategie zelf + migratie). Alle drie zijn eigenaar-akkoord en al gebouwd
op 2 sep 2026.

## Besluit

### D1 — kernel-native, geen bisectie

`FireEndStrategy` krijgt het lid `'nu-stoppen'` (code `'nu'`). `solveFire`
sluit hiervoor kort op `input.startLeeftijd` — in **hele jaren**, nooit de
fractionele leeftijd: 47,6 zou FIRE-maand 7 geven, en dat is niet "nu". Geen
bisectie, precies zoals het bestaande `pensioen`-kortsluitpad. Buiten het
oracle-domein: alle 736 fixtures blijven byte-identiek.

Rechtvaardiging van de plaatsing in dezelfde enum: `pensioen` is al géén
eind-vórm maar een **stop-anker** op de AOW-leeftijd. De enum conflateert dus
twee assen — *wanneer stop ik* × *wat moet er aan het eind gelden*.
`nu-stoppen` is hetzelfde patroon met het anker op vandaag in plaats van de
AOW-leeftijd. Omdat elke `solveFire`-consument (convergentie-, household-,
what-if- en scalar-router, Monte-Carlo, marktcheck, kernel-report, de gouden
matrix) via de kernel loopt, erft elk van hen het anker zonder eigen tak.

### D2 — eind-vorm en status

Eindleeftijd = de **eigen** `fire_end_age`, bewust **niet** de 100 die
`pensioen` gebruikt (een Excel-artefact). Dat maakt de D7-invariant van ADR
0126 PR B2 exact: *runway haalt de eindleeftijd ⇔ solver-status
`reached_now`*.

Nieuwe solver-status `stop_now_shortfall`, geen hergebruik van
`pension_shortfall`: die laatste toont AOW-kopij bij een tekort, terwijl een
tekort onder `nu-stoppen` ook ná de AOW-leeftijd kan vallen — een andere
boodschap voor een andere oorzaak.

### D3 — guardrails-anker bij FIRE-maand 0 (blokkerende fout, gedicht in PR B1)

Bij het bouwen van het kernel-fundament voor "nu stoppen" bleek een latent
defect: het guardrails-onttrekkingsanker werd self-captured op maand
`fireMaand − 1`. Die maand bestaat niet bij `fireMonth = 0`, dus het anker
bleef `0` voor alle 1200 maanden. `guardrailsFactorInHorizon` maakt van anker
`0` een ratio `0` (< onderdrempel) ⇒ `MAX(floor, 1 − stap)`: een **permanente
cut** op de uitgave-term, elke maand. Tot de komst van een kiesbare stop-nu
onbereikbaar (geen bestaande run raakte maand 0) — met dit besluit wordt het
het productiepad voor elk Guardrails-profiel.

De fix zit in de engine, niet als opts-doorgeefluik op `evaluateFireAt`: dat
laatste repareert alleen de aanroeper, niet het defect zelf. De engine
initialiseert het anker nu zelf op de T0-liquide-stand, dezelfde afleiding die
de bridge voor rij 0 al gebruikt.

Bewuste rest-afwijking, vastgelegd als aandachtspunt: `Ont!G(0)` is de
oracle-cel `""` → `0` (m−1-lag), dus maand 0 zelf houdt niettemin één maand de
floor-factor. Eén van 1200 maanden — geregistreerd onder
`horizon-kernel-bekende-afwijkingen`, niet opgelost (zou van de oracle-parity
afwijken).

### D4 — geen doelvermogen

`requiredFirePortfolio` is onder dit anker per constructie gelijk aan `J(0)`
= het huidige liquide vermogen — de kernel bisecteert hier op **tijd**, niet
op kapitaal, dus dat getal is betekenisloos als doel. Bridge-vlag
`requiredFireIsStartPortfolio` markeert dit; `guardFireTarget` geeft
`'geen-doelvermogen'` terug en de grafiek toont geen doellijn.

### D5 — vrijheids-% wordt tijdsdekking

Onder dit anker is de gewone kapitaalratio (teller/noemer, zie calc
"Vrijheidsvoortgang") zinloos: door D4 zou hij voor vrijwel iedereen ~100
uitkomen, en dan zeggen **beide** triggers van `isFinanciallyFree` "je bent
vrij" — ongeacht of het geld twee jaar of dertig jaar reikt.

Het besluit: vrijheids-% = **tijdsdekking** onder dit anker —
`kernelDepletionMonth ÷ eindMaand × 100` (`computeRunwayCoveragePct`, zie calc
"Vrijheidsvoortgang"). Het alternatief (leeg of 0) is verworpen: dat zou elk
oppervlak "0% op weg" laten zeggen tegen iemand die net gestopt is en zijn
geld dertig jaar ziet reiken.

Gevolg: register-getal 3 (`freedomPct`) krijgt hiermee een expliciet
**strategie-afhankelijke** definitie. De FIRE-pijler van de gezondheidsscore
(ADR 0124, peer-relatief) oordeelt onder dit anker dus ook op tijdsdekking in
plaats van op de koers t.o.v. de FIRE-nastrevers-lat — die lat vergelijkt een
opbouw naar een FIRE-moment, en `fireAge` ís hier per D1 de startleeftijd.

### D6 — framing

`FreedomFraming` krijgt het lid `'nu-stoppen'`. De kopij toont "Reikt tot"
waar andere strategieën "Vrijheidsleeftijd" tonen; de marge ankert op
`startLeeftijd`. `planningMode` blijft tweewaardig — dit voegt geen derde
planningsmodus toe, alleen een vijfde eindstrategie binnen de bestaande
modi.

### D7 — naast-beeld, geen onboarding-optie

De `stop-nu`-scenariokaart (ADR 0126, PR B4) is hetzelfde recept met
`endStrategy: 'inherit'`: het eigen plan van de gebruiker blijft staan, de
stop-nu-variant verschijnt ernaast. Onboarding biedt de strategie zelf
(nog) niet aan — hij is via `STRATEGY_LABELS` wel kiesbaar op
`/toekomst → Voorkeuren`.

### D8 — migratie

`20260902120000_allow_nu_stoppen_fire_end_strategy.sql` verruimt de
CHECK-constraint op `profiles.fire_end_strategy` naar vijf waarden.
Append-only, uitgerold en geregistreerd op 2 sep 2026; de constraint is
ná uitrol geverifieerd — nul bestaande rijen konden hem schenden (gemeten,
niet aangenomen).

### D9 — uitsluitregel en het gesloten schaduwpad

`parseFireStrategy` leidt zijn allowlist voortaan **af** uit
`STRATEGY_LABELS` in plaats van een eigen `includes`-lijst te onderhouden —
de gevaarlijkste vondst tijdens de bouw was dat de oude vorm een onbekende
waarde stil naar `'deplete'` vouwde: de database zou `'nu-stoppen'`
opslaan terwijl de hele app een deplete-plan doorrekende. Elke consument
waar de union-verbreding door een getypte `Record` afgedwongen wordt
(compiler wijst erop) is nagelopen; elke plek waar de compiler **zwijgt**
(number/string-gebaseerde dispatch) kreeg een eigen test.

`POST /api/fire-settings` had een eigen schaduwpad: bij een
CHECK-violation parkeerde het de kolom op `'deplete'`, bewaarde de échte
keuze apart in `feature_preferences`, en antwoordde `200` — terwijl het
terugleespad die parkeerplaats **alleen** voor `'pensioen'` uitlas,
hardcoded. Gevolg: een gebruiker zag "opgeslagen" en zag bij herladen iets
anders. Dat pad is nu dicht voor alles behalve de legacy-pensioensituatie
waarvoor het gebouwd is (nu een eerlijke `409`, geen writes); het
terugleespad is generiek gemaakt, zodat een zesde strategie niet opnieuw
over dezelfde kabel hoeft.

## Bewust open gelaten

- **De conflatie stop-anker × eind-vorm** (D1) is een bewuste, tijdelijke
  keuze — geen definitief model. Het eerstvolgende anker (bijvoorbeeld een
  persisterende "stop op leeftijd X") hoort de splitsing in twee aparte
  kolommen af te dwingen, niet een zesde enum-waarde die het patroon verder
  rekt.
- **`pensioen`'s eigen `freedomPct`** blijft de oude kapitaalratio — dit
  besluit verandert alleen de definitie onder `nu-stoppen`, niet onder
  `pensioen`.
- **Migratieregister-drift op deze kolom, in béíde richtingen** (gemeten
  2 sep 2026, ongerelateerd aan D8 zelf): het `pensioen`-migratiebestand
  staat in de repo maar niet in `schema_migrations`, terwijl
  `20260227221838_add_fire_end_strategy_columns` in het register staat
  zonder repo-bestand. Niet in dit besluit opgelost.

## Verwijzing

Zie ADR 0126 voor de runway-motor waarop dit besluit rust: onder
`nu-stoppen` leest de kop op /overzicht (buildBriefingHeadline) dezelfde
gedeelde run als de eindstrategie hier — geen tweede engine-run per
surface.

## Bewijs

`tsc` exit 0; 736 oracle-fixtures byte-identiek (de selector zit buiten het
oracle-domein); gouden matrixrij B-nu-stoppen toegevoegd; volledige suite
15874 groen op 2 sep 2026 (de enige rode, `test/node-webstreams-race`, is een
omgevingsvangrail op Node < 24.15.0, geen regressie).
