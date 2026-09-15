---
id: 0145-het-doelscenario-volgt-het-anker
title: 'Het doelscenario volgt het anker: dekking als uitkomst onder een vast stopmoment'
status: aanvaard
date: 2026-09-14
elements: [as-planning, fn-toekomstplannen, data-cont, sp-plannen]
---

# 0145 — Het doelscenario volgt het anker: dekking als uitkomst

## Context

Het lab onder de Toekomst-grafiek (katern II "Verken je aannames") is sinds ADR 0144 de
enige wat-als-verkenning. Onder `solved` is dat een `solved`-constructie: de vier
draaiknoppen bewegen de vrijheidsleeftijd, en "Maak dit mijn doel" legt die leeftijd vast.
ADR 0129 (stop-anker × eind-vorm) liet de haalbaarheidsdoelen **bewust buiten scope**
("hier alleen `fire_age`-doelen n.v.t. maken"). Onder een vast stop-anker (`aow`/`age`/
`now`) is de kernel-`fireAge` per constructie het anker zelf — de bisectie bepaalt daar
niet wanneer je vrij bent, ze rekent of het plan op dat moment standhoudt. Zonder dit
besluit liep dat door de hele keten heen scheef:

- alleen de `fire`-tak viel weg uit het vastleg-venster; `/api/toekomst-doel` kende het
  anker niet en een client die `fire: true` stuurde kreeg gewoon een `fire_age`-rij;
- de wat-als-lijn eindigde op het anker, dus de delta zei altijd "0 mnd eerder vrij" —
  een waarheid zonder betekenis;
- de radar-subtitel zei "vrij rond 67 jr" (het stopmoment, geen vrijheid) en as 4
  (eindstrategie, behoud-tak) deelde door `requiredFirePortfolio`, dat onder een vast
  anker geen doel is maar de geprojecteerde stand ÓP het anker — dezelfde fout waarvoor
  ADR 0087 de marktrisico-as al schrapte;
- de verken-slider triggerde "Je draait aan je doel" op `stand.stopAge`, terwijl het plan
  die waarde onder een vast anker niet gebruikt;
- het vrijheidsgetal-doel viel onder een vast anker stil terug op de opgeslagen waarde,
  zonder n.v.t.-notitie (`lib/goals/vrijheidsgetal-source.ts`).

Marktonderzoek bij volwassen planners (Boldin, ProjectionLab, Fidelity, Empower/
MoneyGuidePro) bevestigt het patroon: een vaste leeftijd is het plan, de vroegst haalbare
leeftijd staat er als inzicht naast (dat hebben we al — de "vrij mogelijk vanaf"-tegel,
ADR 0129 D7/B9). Bij een tekort tonen die planners een score plus de hefbomen met een
getal — precies wat de tekort-hint in het lab nu ook doet.

## Ontwerpprincipe

**Hetzelfde lab, één andere uitkomstmaat.** Onder `solved` bewegen de knoppen de
vrijheidsleeftijd (delta "X mnd eerder vrij" — ongewijzigd). Onder `aow`/`age`/`now`
bewegen ze de **dekking**: hoever het plan reikt ("reikt tot 82 → 90") en voor welk
percentage ("78% → 100%"). Het lab krijgt geen eigen modus of systeemlabel — de vraag
("Wanneer kun je stoppen?" vs. "Kun je op 62 stoppen?") draagt de modus (ADR 0129 B10).

## Besluiten

**D1 — Eén pure uitkomst-switch, geen tweede kernel-run.** `lib/horizon/lab-uitkomst.ts
#resolveLabUitkomst` is de ENE plek die de anker-afhankelijke uitkomst én de promotie-gate
bepaalt; ervoor las elk oppervlak (badges, banner, sheet, radar-subtitel) zijn eigen
combinatie van `hasScenario`/`hasStopKeuze`/`fireAgeFractional`. De functie rekent zelf
niets: dekking per run = `computeRunwayCoveragePct({ kernelDepletionMonth, eindMaand:
eindMaandVan(displayEndAge, currentAge), ankerMaand })` — letterlijk de formule van
`lib/horizon-data-loader.ts`, dus `basisPct` is identiek aan het vrijheids-% van de bundel
onder een vast anker. Geen extra kernel-run: de scenario-run draait al op het plan-anker
(`lib/hooks/use-horizon-fire-sim.ts`, sync- én workertak beide via `toSimResult`), en het
stop-pad draagt zijn eigen `maandHint`.

**D2 — `plan_coverage` sluit het in ADR 0129 uitgestelde haalbaarheidsdoel-type af.**
Nieuw doeltype `plan_coverage` ("Plan gedekt", `lib/goal-data.ts`), spiegel van `fire_age`
onder `solved`: het uitkomstdoel onder een vast anker, voortgang = dekking. Bewust
**lab-only** (`viaLab: true`) en **geen doelbasis** (`metricBasis: false`) — net als
`expected_return`: niet vrij aanmaakbaar als gewoon doel, wel het resultaat van "Maak dit
mijn doel" onder een vast anker met een tekort. Kleinste oppervlak nu; later te openen als
doelbasis is een aparte kaart, geen impliciet gevolg van dit besluit.

**D3 — Het anker is server-bepaald, nooit uit de request-body.** `PUT /api/toekomst-doel`
leest het plan zelf via `resolveFirePlanWithOverride` (own-row `profiles`-select,
`FIRE_PLAN_COLUMNS` + `feature_preferences` — dezelfde lezing als de loaders) vóórdat
`buildParameterGoalRows` draait. Een client die `fire: true` of `dekking` meestuurt kan het
anker dus niet overschrijven. Foutpaden: `now` → 400 ("Onder dit stopmoment legt het lab
geen doel vast" — `now` is verkenning, nooit een doel, D6); `solved` + `dekking` → 400
("Een dekkingsdoel hoort bij een vast stopmoment"). Ná de upserts verwijdert de route de
**anker-onverenigbare rij** (`fire_age` onder een vast anker, `plan_coverage` onder
`solved`) — de anker-wissel-reconciliatie, own-row, vóór de pref-schrijf. Niet atomair:
faalt de pref-schrijf daarna, dan loopt het doel-blok achter op de rijen tot de volgende
vastlegging of het loslaten; de leeslaag vangt dat op (een onverenigbare rij krijgt de
n.v.t.-reden).

**D4 — Een stopkeuze alléén is onder een vast anker geen doelstand.** Onder `solved` telt
een losse stop-slider-beweging (`hasStopKeuze`) al als reden om "Maak dit mijn doel" aan
te bieden (bestaand gedrag, ongewijzigd). Onder een vast anker ligt het stopmoment al vast
— een stopkeuze zónder een andere knopbeweging (`hasScenario`) verandert de dekking niet
en is dus geen doelstand om vast te leggen. `stripStopKeuze()` (`lib/horizon/
toekomst-scenario.ts`) laat de stop-velden (`stopAge`/`stopKoppel`/`stopMarge`) weg uit de
opgeslagen doelstand onder een vast anker; `isDoelConceptGewijzigd(live, stand, {
stopKeuzeTelt })` bepaalt of de concept-banner op een stopkeuze reageert
(`stopKeuzeTelt: !isFixedAnchorMode`) — dat is exact het "Je draait aan je doel"-lek uit de
Context hierboven, nu bewust dichtgezet in plaats van toevallig fout.

**D5 — Radar-as 4 (eindstrategie, behoud-tak) is n.v.t. onder een geprojecteerde
ankerstand.** `DekkingsradarInput.anchorPortfolio` (gevoed uit
`SimResult.requiredFireIsAnchorPortfolio` van de run die de rijen levert) laat de
behoud-tak `pct: null` teruggeven met een reden (`radarEindstrategieAnkerReden()`) in
plaats van te delen door een stand die geen doel is — hetzelfde principe waarmee ADR 0087
de marktrisico-as al schrapte. De brug-tot-AOW- en pensioeninkomen-assen blijven
onaangeroerd: die rekenen op de behoefte, niet op het doelvermogen.

**D6 — Gate op de promotie ("mag hier een doel uit het lab komen?"), per anker
(eigenaarsbesluiten E4/E5/E6, 13 sep 2026):**

| anker | toestand | promotie |
|---|---|---|
| `solved` | — | `vrijheidsleeftijd` bij `hasScenario \|\| hasStopKeuze` (ongewijzigd) |
| `now` | — | nooit (`nu-anker`) — verkennen mag, geen doel uit het lab |
| `aow`/`age` | gedekt | ~~nooit (`gedekt`) — de losse doelen volstaan~~ **herzien door D12 (15 sep 2026):** `eindvermogen`, alléén bij `hasScenario` |
| `aow`/`age` | tekort | `dekking`, alléén bij `hasScenario` (D4) |
| `aow`/`age` | **herzien door D12 punt 2 (eindreview I1, 15 sep 2026)** | "gedekt"/"tekort" in de twee rijen hierboven is de **scenario-stand die wordt vastgelegd**, niet de basis: scenario gedekt → `eindvermogen`, scenario met tekort → `dekking`; scenario-run nog onbekend → terugval op de basis |
| aow · age · now | geen run | nooit (`geen-run`); onder solved geldt geen run-eis, zoals vóór dit besluit |

"Doel loslaten" blijft in **elke** ankertoestand beschikbaar (eigenaarskeuze) — dat is UI,
geen gate: een al vastgelegd doel moet je altijd kunnen loslaten, ook nadat het anker of de
dekking is veranderd.

**D7 — Seed op verzoek, nooit automatisch.** De tekort-hint (`€X/mnd extra sparen`) krijgt
een knop **"Reken met € {hint} extra inleg"** die de bestaande extra-inleg-slider-route
vult (`buildSliderEvent('extra_inleg', …)`), geklemd op de extra-inleg-range. Dat gebeurt
uitsluitend op klik — nooit automatisch bij het laden van de pagina. Een auto-seed zou
`hasScenario` stilzwijgend waar maken, het persist-effect laten schrijven en de
concept-banner laten afgaan zonder dat de gebruiker iets deed.

**D7a — "Vrij mogelijk vanaf" wacht niet meer op scrollen (15 sep 2026, spec
lab-haalbaarheid Task 0).** De tweede run die de D7-tegel voedt draaide vóór dit besluit
alleen wanneer de duiding-sectie in beeld kwam (`duidingInView`, alleen onder `displayMode
'full'`) — onder een vast anker liet dat de hero-tegel op "—" staan zolang niemand
scrolde, en de intersection-observer haakte via `?whatif=open` soms nooit aan.
`presetBatchNodig` (`horizon-client.tsx`) laat die gate onder een vast anker
(`isFixedAnchorMode`) vallen — de batch draait dan altijd zodra profiel/leeftijd/uitgaven
bekend zijn; de hero-tegel toont intussen een pending state ("wordt berekend",
`solvedPending = isFixedAnchorMode && solvedRun === null`) in plaats van een tweede getal.
De batch-aanroep geeft daarbij ook dezelfde ADR 0103-grondslag-injectie mee als de
hoofdrun (`withResolvedKernelBedragen`) — een nevenaanpassing voor consistentie, niet de
oorzaak van het eerdere "—". Die injectie geldt onder **élk** anker, dus óók onder
`solved`: voor gebruikers met een budget- of transactiegrondslag voor het inkomen rekenen
de vijf scenariokaarten voortaan op het geïnjecteerde inkomen in plaats van op de rauwe
profielrij, en kunnen de kaartdelta's onder `solved` daardoor verschuiven. Dat is een
correctie, geen regressie: de kaarten vergelijken met `verwachtFireAge` uit de hoofdrun, en
die draaide al op deze grondslag — nu staan beide op dezelfde (eindreview I3, 15 sep 2026).

**D8 — Sectie 2 van de Vrijheidsas is onder een vast anker de dekkingsas** (15 sep 2026,
spec lab-haalbaarheid §1). Schaal van stopmoment tot eindleeftijd, slider "Doorwerken tot",
tegels Reikt tot · Plan tot · Gedekt (D12: "Plan tot" werd "Eindvermogen"). Marge-band, verwacht-streep, koppel-checkbox en de
FIRE-tegels verdwijnen daar: ze meten een grootheid die de gebruiker niet gekozen heeft.

**D9 — Drie draaiknoppen in beide invalshoeken** (§2, bijgesteld door de eigenaar op 15 sep
2026). In vaste volgorde en alle drie zichtbaar: 1 **Meer salaris** (het `extra_inleg`-event —
een salarisverhoging is rekenkundig dezelfde hefboom, dus de oude Maandinkomen-knop verviel
als knop en als `DOEL_PARAMETERS`-lid; bestaande `salary`-rijen blijven,
`LEGACY_PARAMETER_GOAL_TYPES`), 2 **Spaarquote** (hele procenten, met eronder het bedrag
minder uitgeven via `spaarquoteEuroRegel`; het event blijft in procentpunten), 3 **Minder
werken** (werkdagen per week). "Later of eerder stoppen" is de stop-slider in sectie 2. Het
antwoordenblok (D10) noemt de tweede hefboom dan ook "meer salaris". Bereiken: salaris ±30% van
het maandinkomen (ook omlaag — een negatieve delta loopt via hetzelfde salaris-kanaal als
`slider:workdays`), spaarquote ±15 procentpunt, werkdagen 1–5.

**D10 — Bij een tekort: de drie hefbomen als antwoorden** (§3). `resolveLabAntwoorden`
geeft "doorwerken tot X" (tweede run), "€X extra opzij" en "€X minder uitgeven"
(`planMaandHint` = P!B96 van de hoofd-run, dus het plan-stopmoment — nooit de hint van het
verkende stop-pad, die bij een ander stopmoment hoort; eindreview I1); elke regel zet een
verkenning, nooit het plan (D7 blijft: alleen op klik). **Elk antwoord staat naast zijn
knop** (bijstelling 15 sep 2026, spec antwoorden-naast-sliders): "meer salaris" onder Meer
salaris, "minder uitgeven" onder Spaarquote, "doorwerken tot" onder de stop-slider van de
dekkingsas; de verdeling doet de pure `labAntwoordenPerSlider`, de regel is één
`SliderAntwoordRegel` in beide hosts. Het losse blok met kop verviel; er blijft **één
sluitregel** volle breedte onder de twee kolommen ("Indicatie, geen advies — …, uitgesmeerd
over de maanden tot je eindleeftijd."), alleen bij ≥1 antwoord. Alleen "Doorwerken tot X
**dekt je plan**." claimt een uitkomst. De twee €-regels zeggen kort "Zo'n €X/mnd meer" resp.
"Zo'n €X/mnd minder uitgeven **hoort bij een gedekt plan**." — het "uitgesmeerd" staat één
keer, in de sluitregel: P!B96 is
uitgesmeerd over de maanden tot de eindleeftijd, terwijl de slider-hefbomen via het
FIRE-gegate salariskanaal op het stopmoment stoppen. Gemeten met de echte motor
(`lib/horizon/lab-antwoorden.kernel.test.ts`, eindreview I2): leeftijd 42 · stop 50 · basis
77% → hint gezet 94%; leeftijd 55 · stop 58 · basis 82% → hint gezet 87%; doorwerken tot het
antwoord → 100% (plan-anker én stop-pad). Een hint die over de maanden tot het stopmoment
deelt, is een kernel-/fase-2-vraag.
Boven het slider-bereik zegt een tweede regel "Meer dan deze knop toelaat." en heet de knop
"Reken met maximum" (anders "Reken hiermee"; tot de eindreview van 15 sep 2026 "Zet op
maximum" — een gebiedend "Zet …" ging er in de compliance-ronde van 14 sep bewust uit, dus de
toon-invariant geldt weer strikt over zinnen én knoplabels); in de privacy-weergave geen knop.
Na een klik meldt één gedeelde sr-only live-regio de nieuwe stand (een teller als `key` laat een
herhaalde klik opnieuw voorlezen). De sluitregel staat er alleen bij minstens één €-antwoord. Vervangt, onder een
vast anker, zowel de oude plan-hint ("Reken met € X extra inleg", die tekst en knop
bestaan niet meer) als het stop-pad-blok "Wat hoort daarbij?" — dat blok blijft alleen
staan onder `solved` (`!isFixedAnchorMode`-gate in `horizon-client.tsx`); onder een vast
anker tonen de antwoorden naast de knoppen hetzelfde inzicht. De tegels van de dekkingsas
staan in de volgorde Gedekt · Reikt tot · Eindvermogen.

**D11 — Doelen volgen het plan** (§4). De "Plan gedekt"-kaart leest naam en subregel uit
het huidige plan (`FinPageData.labPlan`); de metadata blijft historie
(`planCoverageGoalName`, `lib/horizon/anker-copy.ts`). Eén melding op de doelenpagina —
zelfde markup in beide weergavemodi (Eenvoudig/Uitgebreid) — telt lab-doelen met een
n.v.t.-reden (`selectLabDoelenBuitenPlan`) met de acties Bijwerken (opent het lab via de
canonieke deeplink `/toekomst?whatif=open`) · Loslaten (de bestaande confirm-flow); niets
verdwijnt automatisch. Knop-doelen krijgen nooit een n.v.t.-reden.

**D12 — Eindvermogen als derde verandercomponent; een gedekt plan levert een
`end_balance`-doel uit het lab** (eigenaarsbesluit 15 sep 2026). Onder een vast stopmoment
toonde het lab twee componenten: dekking (%) en bereik ("reikt tot"). Bij een **gedekt** plan
bewegen die niet meer (100 % blijft 100 %, het bereik is het plan-einde), dus draaide de
gebruiker aan knoppen zonder zichtbaar effect en viel er niets vast te leggen. Wat wél
beweegt, is wat er op de eindleeftijd **over** is. Daarom:

1. **Derde component.** `LabUitkomstDekking` draagt `basisEindvermogen`,
   `scenarioEindvermogen` en `verkendEindvermogen` = `pickEndBalanceAtEndAge(run)`
   (`lib/goals/vrijheidsgetal-goal.ts`) op de reeds gedraaide run — het **netto vermogen**
   (Prognose!I via `SimRow.endPortfolio = netWorth`; bij een woonstrategie anders dan
   meerekenen telt de eigen woning mee) op `displayEndAge`, **nominaal**. (Tot de eindreview
   van 15 sep 2026 stond hier "de liquide portefeuille"; de rij-mapping in
   `lib/unified-projection.ts` zegt anders — eindreview I2.) Hergebruik, geen tweede
   selectie: dit is exact de bron waarmee het `end_balance`-doel al meet. De dekkingsas
   toont tegel 2 als **Eindvermogen** (basis → wat-als, in de actieve euro-weergave; "Plan tot"
   verviel — de eindleeftijd staat al als as-label onder de balk), met het onderschrift "op je
   {eind}e, in huidige euro's" resp. "in toekomstige euro's" (`euroViewLabel`, eindreview I3).
   Naast `lab-dekking-badge` staat een delta-badge "+€ X / −€ X eindvermogen". De deflatie
   gebeurt uitsluitend in het euro-weergave-blok van `horizon-client.tsx`
   (`factorAtAge(displayUnifiedRows, eind)` + `deflate`, zelfde patroon als
   `viewTargetEndPortfolio`); `Dekkingsbalk` formatteert alleen. De privacy-weergave levert
   `null` (tegel "···", badge weg).
   **Weergaveregel (eindreview I1, 15 sep 2026).** Een eindvermogen bestaat alleen als de run de
   eindleeftijd haalt (bereik `gedekt`). Raakt de run eerder op, dan financiert de kern het
   tekort met de synthetische tekort-lening en is Prognose!I op de eindleeftijd die lening
   (negatief — een live-screenshot toonde "€ -34.388.335" — of zelfs positief: woning min
   lening). Het veld is daarom een tagged union `{ kind: 'bedrag', nominaal } | { kind: 'op' }`;
   de tegel toont bij `op` geen bedrag maar **"op vóór je {eind}e"** (gemengd "op vóór je 90e →
   € 50.000"), het onderschrift alleen wanneer er een bedrag staat, niet klemmen op € 0 (dat
   verzwijgt dat het model leent). De delta-badge verschijnt alleen als basis én wat-als een
   bedrag hebben en het verschil ≥ € 500 is (`EINDVERMOGEN_DELTA_DREMPEL`, eindreview M5).
2. **Gate.** `aow`/`age` + `hasScenario` → de promotie volgt de **scenario-stand die wordt
   vastgelegd** (eindreview I1): scenario gedekt (en geen negatief eindvermogen) → `eindvermogen`,
   scenario met tekort → `dekking`, scenario-run nog onbekend → terugval op de basis. Zonder
   verkenning `geen/geen-verkenning` (D4 geldt onverkort). De reden `geen/gedekt` bestaat niet
   meer. **Dit overschrijft eigenaarsbesluit E5** ("gedekt → geen doel uit het lab"). Vóór de
   eindreview besliste de basis: een gedekte basis met een verkenning die het plan krap maakt
   (salaris −30 %, spaarquote −15 pp) bood dan een negatief eindvermogen als doel aan, dat de
   builder weigerde ("Probeer het zo nog eens."). "Maak dit mijn doel" bij `eindvermogen` wacht
   bovendien op een bekend scenario-bedrag (M10).
3. **Doel.** "Maak dit mijn doel" schrijft een `end_balance`-parameterrij
   (`DOEL_PARAMETERS` + `eindvermogen`, `PARAM_TO_GOAL_TYPE.eindvermogen = 'end_balance'`),
   naam "Eindvermogen op je {eind}e" (`eindvermogenGoalName`), doelwaarde = het
   **nominale** scenario-eindvermogen uit de client (alleen de live-sim kent 'm; ≥ 0, anders
   tolerant overgeslagen; zod begrenst op ≤ € 10 mld, M9), plan-velden (eindleeftijd/anker/
   stopleeftijd) server-side zoals bij `dekking` (D3). `solved` + `eindvermogen` → 400
   `eindvermogen_vereist_vast_anker`. **Onder een vast anker zijn `dekking` en `eindvermogen`
   onderling uitsluitend** (eindreview M8): wie de één vastlegt, ruimt de lab-rij van de ander
   op (own-row, `bron='parameter'`), zodat pref en pagina hetzelfde ene uitkomstdoel noemen.
   Onder `solved` blijft een lab-`end_balance`-rij staan; "Doel loslaten" ruimt 'm op
   (`PARAMETER_GOAL_TYPES`, nu vijf typen). `GOAL_TYPE_META.end_balance` blijft ongewijzigd
   (géén `viaLab`): het handmatige/doelbasis-pad mag dit type blijven aanmaken.
4. **Meten.** `syncActiveGoalValues` (`lib/goal-current-value.ts`) past het eindsaldo nu toe
   over `injectionSet` in plaats van alleen `metricGoals` — zonder die wijziging bleef een
   lab-`end_balance`-kaart eeuwig op "nog geen meting" staan, want parameter-doelen zitten
   niet in `metricGoals`. Voor het ongekoppelde auto-sync-doel verandert niets (het zit in
   beide sets). De doelkaart volgt naam en subregel van het plan zoals "Plan gedekt" (D11),
   zonder tempo-pill. Reikt het plan onder een vast anker niet meer tot de eindleeftijd
   (`planCoveragePct < 100`), dan krijgt een lab-`end_balance` (alleen `bron='parameter'`;
   handmatige doelen nooit) waarde 0 en de reden "Je plan reikt nu niet tot je {eind}e, dus er
   is op dat moment niets over om te meten. Wat telt, is of je plan weer gedekt raakt."
   (`eindvermogenGoalNotApplicableReason`, eindreview I1) — nooit een negatieve meting, en de
   D11-melding telt het doel.
5. **Kopij.** De gedekt-tak van zin 8 zei "Verkennen kan; er is niets vast te leggen." — onder
   D12 onwaar. Nieuw: "Draai aan de knoppen om te zien wat er op je {eind}e over is." De
   nieuwe zinnen (13–18 in de bijlage) zijn beschrijvend en noemen het woord AOW niet, maar
   zijn **nog niet door de compliance-check/merkstem** gegaan — open punt vóór release.

**Open punt voor de eigenaar — twee euro-grondslagen voor hetzelfde doel.** Het lab toont
het eindvermogen in de actieve euro-weergave (onder "huidige euro's" **gedeflateerd**), maar het
doel wordt **nominaal** vastgelegd en de doelenpagina meet nominaal
(`GOAL_TYPE_META.end_balance`, `pickEndBalanceAtEndAge`). Het getal op de doelkaart ligt dus
hoger dan het getal dat de gebruiker in het lab koos — bij ~2 % inflatie over 45 jaar ruwweg een
factor 2,4. Dat is geen rekenfout maar een bekend cross-surface-verschil; oplossen (doelkaart
deflateren óf het doel reëel opslaan) is een aparte keuze. **Tijdelijke duiding (eindreview I4):**
de preview-rij in de sheet noemt onder "huidige euro's" het bedrag dat wordt opgeslagen erbij —
"nu € X → € Y op je {eind}e (opgeslagen als € Z in toekomstige euro's)" — zodra dat ≥ 1 %
afwijkt; onder "toekomstige euro's" valt de duiding weg. De doelkaart zelf is ongewijzigd.

**Open besluit: grondslag I vs J (nettoLiquide) — eigenaar.** Het eindvermogen en het
`end_balance`-doel lezen Prognose!I (netto vermogen; bij een woonstrategie anders dan
meerekenen incl. de eigen woning), terwijl de tegel "Gedekt" ernaast op J (liquide) staat — het
mengen van twee grondslagen dat CLAUDE.md verbiedt. Overstappen op J (`nettoLiquide` uit de
unified rows, voor tegel én doel) raakt de betekenis van het bestaande `end_balance`-doeltype en
is dus een apart besluit. Tot dat besluit is alleen de documentatie gecorrigeerd (eindreview I2).

## Verworpen alternatieven

- **Auto-seed van de tekort-hint bij het laden van /toekomst.** Verworpen: zie D7 — een
  ongevraagde wijziging van de scenario-staat.
- **Server-side swap in `/api/fire-settings`.** Het anker-onverenigbare-rij-verwijderen
  hoort bij de doel-route (D3), niet bij de instellingen-route die het anker zelf zet —
  anders schrijft één PUT-aanroep in twee tabellen zonder dat de client dat kan zien.
- **`plan_coverage` als vrij aanmaakbaar doeltype onder `solved`.** Verworpen: onder
  `solved` zoekt de app het stopmoment zelf, dus een dekkingsdoel heeft daar geen
  uitkomst om naar te kijken (zin 4, bijlage).
- **`plan_coverage` met `metricBasis: true`.** Verworpen: het lab-only karakter (D2) sluit
  uit dat andere doelen op dit doeltype kunnen voortbouwen — dat vraagt een aparte,
  toekomstige beslissing.
- **Extra inleg als eigen doeltype.** Eigenaarskeuze: de tekort-hint blijft een
  knop die de bestaande slider vult, geen nieuw doeltype naast `plan_coverage`.

## Gevolgen

- **Doelenpagina**: een `plan_coverage`-kaart toont "Plan gedekt tot {eind} jaar", met
  sub-regel "tot je {eind}e · stopmoment {stop}" (aow: "je AOW-leeftijd", zin 3). Onder
  `solved` krijgt zo'n kaart (als hij nog bestaat na een anker-wissel) de n.v.t.-notitie
  van zin 4; het vrijheidsgetal-doel krijgt onder een vast anker de n.v.t.-notitie van
  zin 5 (`lib/goals/vrijheidsgetal-source.ts#planCoveragePct`, alleen gevuld wanneer het
  anker vast staat).
- **Radar-subtitel** benoemt voortaan of de rijen van het plan komen of van een verkend
  stopmoment (zin 9); as 4 toont bij een geprojecteerde ankerstand geen percentage meer,
  met de reden van zin 10 in plaats van een misleidend getal.
- **Anker-wissel** (bv. `solved` → `age` bij een bestaand `fire_age`-parameterdoel): de
  kaart wordt n.v.t. totdat de eerstvolgende "Doel bijwerken" de anker-onverenigbare rij
  verwijdert en `plan_coverage` schrijft (D3); terug naar `solved` laat `plan_coverage`
  n.v.t. tot de volgende promotie.
- **Open punten, getoetst tijdens de bouw (14 sep 2026) — beantwoord, niet meer open:**
  1. Vult de solver `kernelMaandHint` (P!B96) ook onder `anchor_shortfall`? **Ja** —
     `computeStatusBlok` (`lib/horizon-kernel/solver.ts`) rekent P!B96 voor élke
     doorgerekende stand, ongeacht status; de bridge geeft 'm door. `resolveLabUitkomst`
     gebruikt 'm dus als terugval zonder een aparte tak nodig te hebben.
  2. Loopt de worker-scenario-run via hetzelfde `toSimResult`? **Ja**, sync- én
     workertak beide (`lib/hooks/use-horizon-fire-sim.ts`).
  3. `requiredFireIsAnchorPortfolio` op een geforceerd stop-pad onder `solved`:
     `requiredFireIsAnchorPortfolio = input.stopAnker !== undefined` — het stop-pad krijgt
     zijn invoer uit `buildStopAnker(profile)`, dat onder `solved` `undefined` is; de vlag
     is daar dus `false` en as 4 gedraagt zich zoals vóór dit besluit.
  4. `measured = current > 0` (`doelen-view.tsx`): dekking 0% ("nu op") leest als "nog
     geen meting" — bekende edge, benoemd op de kaart, niet apart opgelost in dit besluit.
- **Compliance-check (14 sep 2026)**: de elf zinnen in de bijlage zijn goedgekeurd; het
  knoplabel is aangepast naar "Reken met € {hint} extra inleg" (beschrijvend, geen
  aansporing aan de gebruiker — de app rekent, niet de gebruiker "doet iets"). Eén
  nagekomen zin ("Je plan reikt nu niet verder dan vandaag — 0% gedekt. …", de 'nu-op'-tak
  van zin 8) is door de orchestrator afzonderlijk goedgekeurd.
- **Geen productiecijfers in deze ADR** (ADR 0111, publieke repo).

## Bijlage — de vastgestelde zinnen (`lib/horizon/anker-copy.ts`, compliance-check 14 sep 2026)

1. Sheet-toelichting (aow/age): "Je stopmoment ligt vast op {stop}. Het lab legt daarom
   geen vrijheidsleeftijd vast, maar of je plan tot je {eind}e reikt."
2. Preview-rij **Plan gedekt**: "nu {basis}% → {scenario}% · doel 100% tot je {eind}e".
3. Kaart-subregel: "tot je {eind}e · stopmoment {stop}" (aow: "je AOW-leeftijd").
4. `plan_coverage` n.v.t. (`solved`): "De app zoekt je stopmoment zelf, dus dit doel
   heeft geen uitkomst om naar te kijken. Wat telt, is vanaf welke leeftijd werken een
   keuze wordt."
5. Vrijheidsgetal n.v.t. (vast anker): "Je stopmoment ligt vast{ op stop}, dus er is geen
   doelvermogen om naartoe te sparen. Wat telt, is of je plan {tot je eind'e/tot je
   eindleeftijd} reikt."
6. Verken-samenvatting: "Wat-als actief — plan gedekt {basis}% → {scenario}%{, reikt tot
   je {reikt}e}".
7. Badge "{pct}% gedekt" / delta-badge "+{n}% gedekt" (< 1pp: "gelijk").
8. Vrijheidsas-notitie: tekort "Je plan reikt nu tot je {reikt}e — {pct}% gedekt. Draai
   aan de knoppen om te zien wat dat verandert." · nu-op (nagekomen) "Je plan reikt nu
   niet verder dan vandaag — {pct}% gedekt. Draai aan de knoppen om te zien wat dat
   verandert." · gedekt ~~"Je plan is gedekt {tot je eind'e}. Verkennen kan; er is niets
   vast te leggen."~~ → sinds D12 (15 sep 2026, nog NIET door de compliance-check):
   "Je plan is gedekt {tot je eind'e}. Draai aan de knoppen om te zien wat er op je {eind}e
   over is."
9. Radar-subtitel: "Vier dekkingsratio's — gerekend op je plan: stoppen op {stop}." ·
   `now`: "… je rekent alsof je nu stopt." · verkend: "… gerekend op een verkend
   stopmoment: stoppen op {X} jr; je plan rekent met {stop}."
10. Radar-as 4 reden: "Onder een vast stopmoment is er geen doelvermogen om het
    eindvermogen tegen af te zetten — de dekking hiernaast zegt of je plan reikt."
11. Tekort-hint: "Om je plan {tot je eind'e} te laten reiken {als je op {stop} stopt},
    hoort daar zo'n €{hint} per maand extra sparen bij, bovenop wat je nu opzij zet —
    omgerekend {dagen} dagen vrijheid per maand." + knop "Reken met € {hint} extra
    inleg" (compliance 14 sep: geen "Zet als …").
12. Toast: "Je verkenning is nu je doel — de app volgt of je plan {tot je eind'e} reikt."

**Aanvulling D12 (15 sep 2026) — nog NIET door de compliance-check/merkstem** (beschrijvend,
geen aansporing, geen woord AOW, maar de poort is niet gelopen):

13. Tegel "Eindvermogen" met onderschrift "op je {eind}e, in huidige euro's" / "… in toekomstige
    euro's" (volgt de euro-weergave, eindreview I3; was "in euro's van nu"); zonder eindvermogen
    de tegelwaarde "op vóór je {eind}e" / "op vóór je eindleeftijd" (I1).
14. Delta-badge "+€ {X} eindvermogen" / "−€ {X} eindvermogen" (alleen bij |X| ≥ € 500).
15. Sheet-toelichting (gedekt): "Je stopmoment ligt vast op {stop} en je plan is gedekt. Het
    lab legt daarom vast wat er op je {eind}e over is." (`now`: "Je rekent alsof je nu stopt
    en je plan is gedekt. …").
16. Preview-rij **Eindvermogen**: "nu € {basis} → € {wat-als} op je {eind}e".
17. Doelnaam: "Eindvermogen op je {eind}e".
18. Toast: "Je verkenning is nu je doel — de app volgt wat er op je {eind}e over is."
19. Preview-duiding (I4): "(opgeslagen als € {nominaal} in toekomstige euro's)".
20. `end_balance` n.v.t. (lab, plan reikt niet, I1): "Je plan reikt nu niet tot je {eind}e, dus er
    is op dat moment niets over om te meten. Wat telt, is of je plan weer gedekt raakt."
21. Knoplabel boven het slider-bereik: "Reken met maximum" (was "Zet op maximum", I5).

Toon-invarianten over alle zinnen: nooit "je kunt stoppen" (beschrijvend, niet
aansporend), nooit "oneindig" (het model stopt bij leeftijd 100 en claimt niets
voorbij), nooit het woord AOW in een tekortzin (een tekort kan ook ná de AOW-leeftijd
vallen — het aow-anker noemt alleen zijn getal).
