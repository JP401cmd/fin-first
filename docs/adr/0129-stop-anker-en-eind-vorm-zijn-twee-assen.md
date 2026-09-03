---
id: 0129-stop-anker-en-eind-vorm-zijn-twee-assen
title: 'Stop-anker en eind-vorm zijn twee assen'
status: aanvaard
date: 2026-09-03
elements: [as-planning, fn-toekomstplannen, data-cont, sp-plannen]
---

# 0129 — Stop-anker en eind-vorm zijn twee assen

## Context

`FireEndStrategy` draagt vijf waarden die twee verschillende vragen
beantwoorden: *wat moet er aan het eind gelden* (`deplete` · `legacy` ·
`perpetual`) en *wanneer stop ik* (`pensioen` = AOW, `nu-stoppen` = vandaag).
Ze zitten in één enum omdat ze zo gegroeid zijn — `pensioen` bestond eerst als
eind-vorm-achtig lid, `nu-stoppen` is er in ADR 0127 met opzet naast gezet als
tijdelijke, erkend onvolkomen oplossing ("de conflatie is een bewuste,
tijdelijke keuze — geen definitief model").

Het onderzoek van 3 sep 2026 stelde vast:

- De twee stop-ankers zijn op `/toekomst` grotendeels gespiegeld (~60
  plekken), maar elk op zijn eigen manier onaf. Buiten `/toekomst` leest
  bijna elk oppervlak de kernel-`fireAge` rauw → onder `nu-stoppen` "Vrijheid
  bereikt", "Bereikt!", elk `fire_age`-doel behaald. Onder `pensioen` is de
  Monte-Carlo per constructie 100%, is `fire_end_age` een dood veld met een
  UI-belofte, staat de stop-slider aan en overschrijft hij het marge-anker.
  Fin kent geen enkel anker.
- De eigenaar wil een **zelfgekozen stopleeftijd** ("wat als ik op 58 stop?")
  als instelling. De motor kan het (`evaluateFireAt`), de slider persisteert
  al (`toekomst_scenario_prefs.stopAge`); wat ontbreekt is *plan-status* —
  `solveFire` leest de stopleeftijd nooit.
- Vier geforceerde-stop-mechanismen bestaan naast elkaar met drie
  eind-vorm-regimes: pensioen-anker, nu-anker, AOW-stop-toggle (hand-rolled
  run met deplete-override in `useState`), stop-slider
  (`endStrategy: 'inherit'`).
- Zeven combinaties zijn onuitdrukbaar (`aow × legacy`, `age × perpetual`,
  …) terwijl de slider ze al doorrekent.

Doel: de tweedeling als datamodel én als gebruikerservaring; één
anker-resolutie in de kernel; elk oppervlak eenduidig onder beide
benaderingen; de zelfgekozen stopleeftijd als vierde anker; de zeven
gevonden defecten opgelost ín de fasen (niet apart).

(Bewust zonder accountgegevens of echte bedragen — de aanleiding is
structureel, niet een specifiek account.)

## Besluit

### D1 — datamodel: twee kolommen, expand-contract

`profiles` krijgt `fire_stop_anchor text NOT NULL DEFAULT 'solved' CHECK (IN
('solved','aow','now','age'))` en `fire_stop_age numeric(4,1) NULL` (halve
jaren; `CHECK ((fire_stop_anchor = 'age') = (fire_stop_age IS NOT NULL))`).
`fire_end_strategy` blijft tijdens F1–F3 ongewijzigd en krimpt in F4 naar de
drie eind-vorm-waarden (`deplete`/`legacy`/`perpetual`). Geen zesde
enum-waarde: die zou de conflatie verder rekken in plaats van opheffen (zie
Verworpen alternatieven).

### D2 — parser-regel: geen rij spreekt zichzelf tegen

`parseFirePlan(profile)` is deterministisch over beide rijvormen. Tijdens de
overgangsperiode wint de **legacy-waarde in `fire_end_strategy`** voor het
anker (`pensioen` → `aow`, `nu-stoppen` → `now`) — nooit de nieuwe kolom als
er een tegenstrijdige oude waarde staat. Zo kan geen rij, hoe hij ook
ontstond, twee ankers tegelijk beweren.

### D3 — kernel: één anker-resolutie buiten het oracle-domein

`KernelInput.stopAnker?: { soort:'aow' } | { soort:'nu' } | { soort:'leeftijd'; leeftijd:number }`
is een optioneel blok, patroon-gelijk aan `tekortAflossingUitLiquide`.
Weggelaten = ongewijzigd (oud) gedrag. `resolveVastAnker(input, es)` is de
**enige** plek die een vast anker naar een leeftijd omzet: `aow` →
`persoon.aowLeeftijd`, `nu` → `startLeeftijd`, `leeftijd` → geklemd op
`[startLeeftijd, eindleeftijd − 1/12]` (B7: een stopleeftijd in het verleden
gedraagt zich als nu, met notitie; op of voorbij de eindleeftijd geeft 400).
Zonder blok én `interneCode === 'pensioen'` blijft het bestaande
kortsluitpad (oracle-parity); anders bisectie. `SolverStatus` krijgt
`anchor_shortfall` als generieke tekort-status onder elk vast anker;
`stop_now_shortfall` (ADR 0127 D2) vervalt in F4. `eindleeftijdVan` blijft
gestuurd door de **eind-vorm**, niet het anker — M1 (zie D6) maakt dat voor
app-pensioen data-gestuurd in plaats van hardcoded 100. Monte-Carlo en de
marge-ankerresolutie worden generiek over de vier ankers.

### D4 — bridge: `requiredFireIsAnchorPortfolio`

`requiredFireIsStartPortfolio` (ADR 0127 D4, alleen geldig onder `nu-stoppen`)
wordt `requiredFireIsAnchorPortfolio`: waar onder **elk** vast anker — de
kernel bisecteert daar op tijd, niet op kapitaal, dus het doelvermogen is
betekenisloos ongeacht welk anker het is.

### D5 — dekking: `computeRunwayCoveragePct` met `ankerMaand`

`computeRunwayCoveragePct({ depletionMonth, ankerMaand, eindMaand }) =
(m − ankerMaand) ÷ (eindMaand − ankerMaand)`, met `m < ankerMaand ⇒ 0`.
Onder `now` is dit identiek aan de ADR 0127 D5-formule (`ankerMaand = 0`).
Onder elk ander vast anker dekt hetzelfde principe de periode ná het
stopmoment, niet ervoor.

### D6 — migratie M1: pensioen krijgt een echte eindleeftijd

Backfill: `pensioen` → anker `aow` + `fire_end_age := 100` (zodat de kernel
identiek blijft rekenen als vóór dit besluit); `nu-stoppen` → anker `now`;
overige → `solved`. Na M1 is `fire_end_age` onder elk vast anker vrij
instelbaar — dit maakt combinaties als `aow × legacy` (bv. AOW-ingang als
stopmoment, een nalatenschapsbedrag op leeftijd 90) voor het eerst
uitdrukbaar. Zonder M1 blijft `pensioen`'s eindleeftijd het dode Excel-
artefact 100 dat D3's `eindleeftijdVan`-omkering zinloos zou maken.

### D7 — B9: vrijheid is het moment dat je zóu kunnen

Onder een vast anker blijft de **opgeloste** leeftijd (de FIRE-leeftijd
zónder anker, zoals de kernel die vóór dit besluit al berekende) zichtbaar
als *inzicht* — "vrij mogelijk vanaf X" — naast het **gekozen** stopmoment
(de instelling) en de **dekking** (het oordeel of het plan tot de
eindleeftijd reikt). Bijvoorbeeld: "Vrij mogelijk vanaf 58 · jij stopt op 62
· plan gedekt tot 90". Dit vereist een **tweede kernel-run** onder elk vast
anker: dezelfde bisectie die `solved` altijd al deed, nu ook uitgevoerd
wanneer het anker vast staat. Kost: één extra bisectie per `/toekomst`-load
onder een vast anker — draait in dezelfde worker-batch als de bestaande
scenariokaarten (`lib/hooks/use-horizon-fire-sim.ts`,
`worker/run-in-worker.ts`), niet als aparte belasting per widget. Server-side
(`lib/fire-target-shared.ts`) alleen waar `/overzicht` de opgeloste leeftijd
toont; blijkt dat te duur, dan toont de strip daar alleen "reikt tot" en
laat "vrij mogelijk vanaf" aan `/toekomst`.

### D8 — B3: `isFinanciallyFree` is een gate, geen los cijfer

`freedomPct` = dekking onder elk vast anker (D5), kapitaalratio alleen onder
`solved`. `isFinanciallyFree` = **anker bereikt ∧ dekking ≥ 100** — beide
voorwaarden, niet één. Zonder deze gate zou een dertigjarige op een
AOW-anker met een 100%-gedekt plan de melding "je bent met pensioen" krijgen
zodra de dekkingsformule alleen al ≥ 100 gaf, terwijl het anker (AOW) nog
decennia weg ligt.

### D9 — B4: oracle-afwijking, eerlijk vastgelegd

App-pensioen verlaat vanaf F2 het oracle-pad: `eindleeftijdVan` leest de
eindleeftijd voortaan uit profieldata (D6/M1) in plaats van de vaste
Excel-selector `'Pensioenleeftijd'`. De 736 oracle-fixtures blijven
byte-identiek (de selector-omkering zit buiten het oracle-domein), maar het
bewijs dat de app-uitkomst voor `pensioen` nog klopt is voortaan de gouden
rij `B-pensioen` (rijen identiek onder M1-waarden), niet meer de oracle
zelf — de status verandert van naam (`pension_shortfall` blijft voor het
kortsluitpad, `anchor_shortfall` voor de rest) en Monte-Carlo wordt voor
`pensioen` een echte simulatie in plaats van triviaal 100%. Vastgelegd als
zevende punt in `horizon-kernel-bekende-afwijkingen`, klasse ADR 0033.

## De veertien eigenaar-besluiten (3 sep 2026)

| # | Besluit | Keuze |
|---|---|---|
| B1 | Datamodel | Twee kolommen, expand-contract (D1). Geen zesde enum-waarde. |
| B2 | Pensioen-eindleeftijd bij migratie | M1: `fire_end_age := 100` voor gemigreerde `pensioen`-rijen — kernel rekent identiek; daarna vrij instelbaar (bv. `aow × legacy`, bedrag op 90). |
| B3 | Vrijheids-% onder vast anker | Dekking onder élk vast anker, kapitaalratio alleen onder `solved`. `isFinanciallyFree` = anker bereikt ∧ dekking ≥ 100. |
| B4 | App-pensioen verlaat het oracle-pad | Ja. Fixtures byte-identiek; vastgelegd als bekende kernel-afwijking. |
| B5 | Combinatieruimte | Alle 12 (4 ankers × 3 eind-vormen) toegestaan. |
| B6 | `fire_stop_age` | Halve jaren (slider staat op 0,5; kernel neemt fractioneel). |
| B7 | Stopleeftijd in het verleden | Gedraagt zich als `now` + notitie; ≥ eindleeftijd = 400. |
| B8 | Fasering | F1 → F2 → F3 → F4, `age` in F2/F3. |
| B9 | Vrijheid onder vast anker | "Vrijheid = het moment dat je zóu kunnen." De opgeloste leeftijd blijft als inzicht zichtbaar naast het gekozen stopmoment; de dekking is het oordeel. |
| B10 | Naamgeving modi | Vanuit de vraag, geen systeemlabel: "Wanneer kun je stoppen?" vs. "Kun je op 58 stoppen?". Definitieve zinnen via `merkstem`. |
| B11 | AOW-stop-toggle | Ombouwen tot snelkoppeling die de slider op AOW zet; eigen kernel-run en deplete-override verdwijnen. |
| B12 | Pensioen-gebruikers informeren | Niet nodig (geen productiegebruikers); releasenotitie volstaat. |
| B13 | Plek van de plan-regel | Voorkeuren is de bron; de strategie-modal op `/toekomst` spiegelt dezelfde twee vragen. |
| B14 | Zeven losse defecten | Allemaal in de fasen, geen aparte release. |

## Fasering (bewijs per fase)

- **F0** — Fundament op papier: dit besluit + merkstem-ronde op de vaste
  zinnen + UAT-definities + regressielijsten al op de canonieke bron.
  Bewijs: ADR-scan (`npm run arch:diagram`), `lib/uat`-suites groen.
- **F1** — Expand: schema (D1/D6), parser (D2), route. Gedragsbehoudend.
  Bewijs: gouden matrix byte-identiek, parser-tests over beide rijvormen,
  own-row leaktest, `check:client-reads`, `tsc`, live `pg_constraint`.
- **F2** — Kernel-anker: `stopAnker`-blok, `resolveVastAnker`,
  `anchor_shortfall`, generieke MC/marge, D7-tweede-run, D9-oracle-afwijking.
  Bewijs: 736 oracle-fixtures byte-identiek, `B-nu-stoppen`/`B-pensioen`
  identiek, nieuwe gouden rijen `B-aow-legacy`, `B-age-58-deplete`,
  `B-age-perpetual`.
- **F3a/F3b** (één release) — lib-consumenten op `isFixedAnchor(plan)`
  (D4/D8), UI-oppervlakken tonen de vraag die bij het anker hoort (D7-drieslag
  op hero/strip/kop). Bewijs: per-anker component- en loadertests,
  `check:headings`, `check:client-reads`, `page-info:check`, `/uat` op
  zeven toestanden, `npm run build`.
- **F4** — Contract: legacy-rijen herschrijven, `fire_end_strategy` naar drie
  waarden, kernel-compat (`'nu'`/`stop_now_shortfall`) weg, concerns
  verwijderen, ADR 0127 status → "vervangen door 0129". Bewijs: `tsc`,
  matrix, 736 fixtures, `arch:diagram` + architectuur-suites, grep op
  `'nu-stoppen'`/`isPensioenMode` = 0 buiten AOW-gebonden regels.

## Verworpen alternatieven

- **Zesde enum-waarde** (bv. `'leeftijd-x'`). Vereist alsnog een aparte
  leeftijdkolom (dus geen echte vereenvoudiging), kan `aow × legacy` niet
  uitdrukken (het anker en de eind-vorm blijven verstrengeld), voegt een
  derde kortsluitpad toe naast `pensioen` en `nu-stoppen` in plaats van het
  patroon op te lossen, en raakt `pensioen` niet aan — precies waar de
  gevonden fouten zitten (dode `fire_end_age`, MC 100%, marge-overschrijving).
- **Eén `fire_plan jsonb`-kolom.** Verliest CHECK-constraints en
  query-baarheid zonder een aantoonbaar voordeel boven twee getypeerde
  kolommen; maakt expand-contract lastiger te bewijzen (geen kolomvergelijk
  in `pg_constraint`).
- **Slider-als-anker** (het bestaande verken-mechanisme persisteren als het
  plan zelf). Verkennen zou daarmee destructief worden: een tijdelijke "wat
  als ik op 58 stop"-blik zou ongemerkt het opgeslagen plan overschrijven.
- **Modus als aparte schakelaar** (naast de eind-vorm, los van het anker).
  Voegt een derde as toe waar er maar twee zijn; B10 kiest expliciet voor
  vraag-gedreven naamgeving in plaats van een systeemmodus.

## Gevolgen

Kosten: één extra kernel-bisectie per `/toekomst`-load onder een vast anker
(D7, gemeten doel: geen zichtbare vertraging t.o.v. de huidige zes
kaart-runs); F3 raakt ~50 bestanden verspreid over kernel-lib, `/toekomst`,
`/overzicht`, rapporten en Fin — gemitigeerd door per-zone verificatie en de
`isFixedAnchor`-grep als voortgangsmeter; het migratieregister is op de
betrokken kolom al in beide richtingen gedrift, dus F1/F4 verifiëren op
naam via `pg_constraint`, niet via het register.

Bewust buiten dit besluit gelaten: nieuwe haalbaarheidsdoel-typen ("dekking
≥ 100% bij stop op X") — hier alleen `fire_age`-doelen "n.v.t." maken onder
een vast anker; dieper coach-gedrag van Fin voorbij één contextregel (via
`ai-gedrag`); deeltijd-/barista-ankers (het model laat ze toe, niet in
scope); een sterftekans-visualisatie ("Rich, Broke or Dead") als apart
positioneringsvoorstel.

## Verwijzing

Zie ADR 0126 voor de runway-motor: onder een vast anker volgt de kop op
`/overzicht` (`buildBriefingHeadline`) het plan-anker uit dit besluit in
plaats van uitsluitend het `nu`-anker. Zie ADR 0127 voor "nu stoppen" als
vijfde eindstrategie — dat besluit wordt in fase F4 van dit besluit
gecontraheerd tot het `now`-anker binnen dit tweeassige model; de status van
0127 blijft `aanvaard` tot die fase.

## Bijlage — vastgestelde zinnen (merkstem-ronde F0)

Getoetst aan `lib/ai/dna/base.ts` (`== TOON ==` / `== FRAMING ==`) en de
claimlijst in `.claude/skills/compliance-check/SKILL.md`. Alle zinnen zijn
rekensommen op eigen data — inzicht, geen advies ("zo loopt het bij deze
aannames"). Beschrijvend, nooit aansporend. De toon-invarianten die
`lib/horizon/nu-stoppen-copy.test.ts` vandaag bewaakt blijven staan en worden
in F3a anker-generiek: geen `/je kunt (nu )?(al )?stoppen/`, geen
`/oneindig|voorgoed|voor altijd/` in een bereik-zin, geen `\bAOW\b` in een
tekortzin (een tekort kan ook ná AOW vallen). De grondslag heet **liquide
vermogen** — de gevestigde term; niet "vrij besteedbaar", dat is bezet voor
inkomen.

Placeholders: `{stop}` gekozen stopleeftijd · `{vrij}` opgeloste
vrijheidsleeftijd (tweede run, D7) · `{reikt}` uitputtingsleeftijd · `{eind}`
eindleeftijd van het plan · `{pct}` dekking · `{hint}` maandbedrag uit
`maandHint` · `{dagen}` vrijheidstijd-equivalent van `{hint}`.

### De twee vragen (Voorkeuren; gespiegeld in de strategie-modal)

**Wanneer stop je met werken?**

| optie | anker | ondertitel |
|---|---|---|
| Laat de app het uitrekenen | `solved` | De app zoekt de vroegste leeftijd waarop je vermogen je plan draagt. |
| Op mijn AOW-leeftijd | `aow` | Je werkt door tot je AOW ingaat. De app laat zien of je vermogen dan reikt. |
| Op een leeftijd die ik kies | `age` | Jij kiest het moment. De app laat zien hoe het dan loopt. |
| Nu | `now` | Je rekent alsof je vandaag stopt. |

**Wat moet er aan het eind gelden?** — de drie bestaande ondertitels in
`STRATEGY_LABELS` (Vermogen opeten · Nalatenschap · Eeuwigdurend) blijven
ongewijzigd; ze zijn al canoniek in code. Het eindleeftijd-veld heet: *"Tot
welke leeftijd moet je vermogen reiken?"*

### Hero /toekomst

Kop — de vraag draagt de modus: `solved` **Wanneer kun je stoppen?** ·
vast anker **Kun je op {stop} stoppen?** · `now` **Hoe ver reikt je vermogen?**

Drie tegels onder een vast anker:

| tegel | label | waarde | caption |
|---|---|---|---|
| 1 | VRIJ MOGELIJK VANAF | {vrij} | "als je de app had laten rekenen" |
| 2 | JOUW STOPMOMENT | {stop} | "jouw instelling" · bij `aow`: "je AOW-leeftijd" |
| 3 | REIKT TOT | {reikt} of "voorbij je {eind}e" | "het einde van je plan" / "plan loopt tot {eind}" |

Onder `now` valt tegel 2 weg; tegel 1 blijft, in de verleden tijd als
`{vrij}` vóór de huidige leeftijd ligt ("vrij was mogelijk vanaf").

Duidingszin, gedekt:
> Als je op {stop} stopt, reikt je liquide vermogen tot voorbij je {eind}e —
> het einde van je plan. Vrij was al mogelijk vanaf je {vrij}e; de jaren die je
> langer werkt komen bovenop je plan.

Duidingszin, tekort:
> Als je op {stop} stopt, reikt je liquide vermogen tot je {reikt}e. Je plan
> loopt tot je {eind}e. Het verschil komt neer op zo'n €{hint} per maand
> (≈ {dagen} vrijheid) tot je stopmoment.

Tweede run onbereikbaar binnen de horizon:
> De app vindt binnen dit plan nog geen leeftijd waarop je vermogen het zelf
> draagt.

Statusblok `anchor_shortfall`:
> Als je op {stop} stopt, komt je liquide vermogen tot je {reikt}e. Je plan
> rekent tot je {eind}e.

Statusblok gedekt (vervangt de `reached_now`-tautologie):
> Als je op {stop} stopt, reikt je liquide vermogen tot het einde van je plan.

### Vrijheidsas

Sectiekop volgt de hero-kop. Slider-intro: *Verken een ander stopmoment. Je
plan verandert pas als je het vastzet.* CTA **Maak dit mijn plan** → toast
*Je plan rekent nu met stoppen op {stop}.* AOW-snelkoppeling (B11): knop
**Op AOW-leeftijd** — zet alleen de slider. Onder `now` blijft de bestaande
notitie.

### /overzicht

Kop (runway): `solved` bestaand — *Als je nu zou stoppen, reikt je liquide
vermogen tot je {reikt}e.* · `aow`/`age` — *Als je op {stop} stopt, reikt je
liquide vermogen tot je {reikt}e* (gedekt: *… tot voorbij je {eind}e*) ·
`now` bestaand — *Je liquide vermogen reikt tot je {reikt}e.*

Strip: gedekt *Plan gedekt tot je {eind}e · stopmoment {stop} · vrij mogelijk
vanaf {vrij}* · tekort *Reikt tot je {reikt}e · stopmoment {stop} · plan loopt
tot {eind}* · anker bereikt ∧ gedekt *Je bent vrij.* (bestaande `free`-framing).
Banner volgt de strip.

Minigrafiek: label **Vermogen bij stop**; nooit "Vrijheid bereikt" tenzij anker
bereikt ∧ gedekt. Deelkaart: *Reikt tot je {reikt}e* i.p.v. "Bereikt!".
Briefing-tekst: *Je rekent met stoppen op {stop}; je liquide vermogen reikt tot
je {reikt}e.*

### Doelen

`fire_age`-doel onder een vast anker, notitie op de doelkaart:
> Je stopmoment ligt vast op {stop}, dus dit doel heeft geen uitkomst om naar te
> kijken. Wat telt, is of je plan tot je {eind}e reikt.

### Fin — contextregel

> Stopmoment: vast op {stop} ({anker}). Vrij mogelijk vanaf {vrij}. Liquide
> vermogen reikt tot {reikt}; plan tot {eind}; dekking {pct}%. Coach op de
> houdbaarheid van uitgaven en onttrekking, niet op eerder stoppen. Zeg nooit
> dat de gebruiker "kan stoppen" — beschrijf hoe ver het reikt.

### Rapporten

"Vrijheidsleeftijd (FIRE)" → onder vast anker **Gekozen stopmoment** {stop} ·
**Vrij mogelijk vanaf** {vrij} · **Reikt tot** {reikt}. "Doelbedrag" →
**Vermogen op je stopmoment (geprojecteerd)**.

### Compliance-toets

Geen productaanbeveling, geen "moet", geen inleg- of aflosinstructie. `{hint}`
is een som ("komt neer op"), geen instructie; het vrijheidstijd-equivalent
staat erbij zoals de framing eist. Geen rendementsbelofte — de aannames staan
op Voorkeuren, met de bestaande voetnoot. "Vrij was al mogelijk vanaf" is
beschrijvend over de projectie, geen aansporing. Geen "oneindig": het plafond
heet "het einde van je plan" of "voorbij je {eind}e".

### Woordkeuze (eigenaar-besluit, open tot F3b)

"Stopmoment" als overkoepelend begrip; "stopleeftijd" alleen waar het getal
centraal staat. Definitief te bevestigen vóór F3b.
