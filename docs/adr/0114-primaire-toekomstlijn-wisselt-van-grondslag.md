---
id: 0114-primaire-toekomstlijn-wisselt-van-grondslag
title: De primaire lijn van de Toekomst-grafiek wisselt van grondslag per woonstrategie (herroeping van 5 aug 2026)
status: aanvaard
date: 2026-08-29
elements: [as-planning, as-vermogen, sp-plannen, app-comp]
---

Op `/toekomst` tekent de primaire vermogenslijn voortaan dezelfde grondslag als de voortgangsbalk eronder: Prognose!J (besteedbaar, zonder woning) bij woonstrategie `exclude_from_fire`, Prognose!I (totaal netto vermogen) in alle andere gevallen. Dit herroept het besluit van 5 augustus 2026 dat de hoofdlijn in alle vier de modi op I hield.

## Context

### Wat er vandaag op één scherm staat

Onder woonstrategie **Uitsluiten** (`exclude_from_fire`) staan op `/toekomst` zeven
dingen tegelijk, op twee verschillende grondslagen:

| Element | Grondslag | Bron |
|---|---|---|
| Primaire lijn (massief, fasegekleurd) | **I** — totaal netto vermogen | `SimRow.startPortfolio`/`endPortfolio` ← `UnifiedProjectionRow.startNetWorth`/`netWorth` |
| Voortgangsbalk + vrijheids-% eronder | **J** — besteedbaar | `selectFreedomProgressBasis` (`lib/core-metrics.ts`, ADR 0034) |
| "Nog X jaar"-aftelling / FIRE-leeftijd | **J** | solver zoekt de FIRE-maand op Prognose!J |
| FIRE-doellijn (`fireTarget`) | **J** | `requiredFirePortfolio` |
| Eindstand-/erfenisdoellijn (`targetEndPortfolio`) | **J** | kernel `computeDoelblok` leest J |
| FIRE-stip + fase-splits + gebeurtenis-markers | **I** | interpolatie over `allPts` |
| Monte-Carlo-band | **I** | `p25..p75` op netto vermogen |

De lijn waar het oog op landt is dus de enige die niet op de grondslag staat die de
pagina verder overal hanteert. Drie zichtbare gevolgen, geen ervan cosmetisch:

1. **De balk en de grafiek lopen uit de pas.** Het vrijheids-% hoort bij een ander
   getal dan de lijn waar de gebruiker naar kijkt. De tweede lijn ("Zonder je huis",
   standaard AAN bij deze strategie) was hiervoor de pleister — expliciet zo
   gemotiveerd in `defaultLiquidWealthLineVisible`.
2. **De FIRE-stip raakt de FIRE-doellijn niet.** De solver zoekt de FIRE-maand op J;
   op die maand geldt `J == requiredFirePortfolio` (ADR 0034, endpoint-invariant,
   vergrendeld in `lib/horizon-kernel/fire-basis-invariant.test.ts`). De stip wordt
   echter geplaatst op de I-lijn, en die ligt daar de volle overwaarde boven de
   getekende drempel. De gebruiker ziet een vrijheidsmoment dat zijn eigen doellijn
   mist — op de ADR 0034-fixture `huis-uitsluiten` (€511.474 verschil tussen I@FIRE
   en J@FIRE) is dat geen subtiel hoogteverschil.
3. **De eindstand-doellijn hangt in de lucht.** `targetEndPortfolio` staat op J, de
   lijn waarmee hij vergeleken wordt op I. De calc-catalogus benoemt dat vandaag als
   bewuste keuze ("band en marge staan daar dus BEWUST op verschillende grondslagen")
   met de explainer als vangnet — dat is een tekst die een grafiekfout uitlegt.

### Het besluit dat hier herroepen wordt

Op 5 augustus 2026 is vastgelegd dat de hoofdlijn in **alle vier** de woonmodi op
`netWorth` (Prognose!I) blijft. Dat besluit staat in geen enkele ADR; het leeft op
twee plekken in de code:

- `lib/architecture/calculations.ts`, woonstrategie-entry: *"Puur WEERGAVE: de
  grondslag van de HOOFDlijn blijft in alle vier de modi netWorth (Prognose!I); de
  hoofdlijn per strategie van grondslag laten wisselen is bewust NIET gedaan (vraagt
  een nieuw veld op het gedeelde SimRow-contract plus dezelfde grondslag voor de
  stop-/wat-als-runs, en zou dit besluit herroepen)."*
- `lib/horizon/liquid-wealth-line.ts`, module-doccommentaar: *"De hoofdlijn van
  `SimChart` plot het TOTALE netto vermogen — inclusief de eigen woning"*, plus de
  motivering onder `defaultLiquidWealthLineVisible`.

De **motivering** van dat besluit was een implementatiekost, geen inhoudelijk
argument: een nieuw veld op het gedeelde `SimRow`-contract, en de doorwerking naar de
stop-/wat-als-runs. Die kost is nu vermijdbaar (zie D8): de grondslagkeuze wordt een
**geometrie-input**, geen rijveld, en de J-reeks komt als eigen feed uit de
kernelrijen — precies zoals de bestaande besteedbaar-lijn dat al doet. Daarmee
vervalt de reden waarom het niet gedaan werd, en blijft alleen het punt over dat het
besluit zelf al benoemde: de grafiek loopt uit de pas met de balk eronder.

De besteedbaar-lijn zelf (5 aug 2026, `shouldShowLiquidWealthLine`) blijft bestaan en
blijft gemotiveerd voor `downsize` en `reverse_mortgage`. Alleen bij
`exclude_from_fire` keert haar rol om.

## Besluit

### D1 — De primaire lijn draagt de grondslag van de woonstrategie

`SimChartGeometryInput` krijgt `primaryBasis: 'total' | 'liquid'` (default `'total'`,
dus byte-identiek voor elke bestaande aanroeper). Bij `'liquid'` vult `allPts` zich
uit de J-reeks — de kernelrijen `UnifiedProjectionRow.nettoLiquide`, met het nieuwe
`startNettoLiquide` als J(0)-anker — en wordt de I-reeks de dunne secundaire lijn.
Een **rolomkering**, geen nieuwe lijn.

Schakelvoorwaarde, één predikaat en geen tweede: `'liquid'` **alléén** bij
`isHomeExcludedFromFire` (`lib/housing-strategy.ts`) — hetzelfde predikaat dat
`selectFreedomProgressBasis` gebruikt. `downsize` en `reverse_mortgage` blijven op I
(daar is het totaal het hoofdverhaal en convergeren de lijnen juist);
`include_full` is n.v.t. (J ≡ I exact). Dat de grafiek en de voortgangsbalk vanaf nu
door hetzelfde predikaat worden gestuurd is het punt: een tweede conditie zou de
drift die dit besluit opheft opnieuw kunnen introduceren.

De Monte-Carlo-band krijgt een J-variant (`bandLiquide`) en wordt onder `'liquid'` op
die variant getekend: band en lijn dragen dezelfde grootheid, of de band wordt niet
getekend. Een I-band om een J-lijn is precies de menging die D7 verbiedt.

### D2 — `rows` blijft I; alleen de getekende reeks wisselt

`SimChartGeometryInput.rows` (`SimRow[]`) blijft de I-projectie en blijft de bron van
fase-indeling, FIRE-/AOW-leeftijd, drijvers/drukkers en de jaar-kassabon. De
fasekleuring en de splitsingen worden dus ongewijzigd berekend en toegepast op de
J-punten. `primaryBasis` bepaalt uitsluitend welke reeks `allPts` vult.

Gevolg, en het is het gewenste: FIRE-stip, AOW-stip, fase-splits en
gebeurtenis-markers interpoleren over `allPts` en verhuizen dus mee naar de J-lijn.
Daarmee landt de FIRE-stip onder `exclude_from_fire` exact op de FIRE-doellijn
(`J@FIRE == requiredFirePortfolio`) en staat de eindstand-doellijn voor het eerst op
dezelfde grondslag als de lijn eronder.

### D3 — De jaar-kassabon blijft een volledige jaarbalans op I, met één "waarvan besteedbaar"-regel

`components/app/horizon/horizon-year-details-sheet.tsx` blijft in alle vier de modi
sluiten op `row.netWorth` (Prognose!I): hoofdcijfer in de meta-strip, de
`+ bezittingen · − schulden`-regel, de secties Opbouw/Bezittingen/Schulden en de
sluitregel "Eind netto". **De bon schakelt niet mee met de lijn.**

Drie redenen, in volgorde van gewicht:

1. **Een bon is een balans, geen lens.** De secties Bezittingen/Schulden sommen de
   werkelijke balans op. Een J-bon zou het eigen huis uit "Opbouw — bezittingen"
   moeten weglaten terwijl dat huis bestaat en op naam staat. `exclude_from_fire`
   betekent "reken mijn huis niet mee in mijn vrijheidsdoel"; het betekent niet "ik
   heb geen huis". Een bon die je bezit verzwijgt is geen andere weergave van
   dezelfde waarheid.
2. **Er is geen sluitende J-reconciliatie, en die mag hier niet ontstaan.** Het
   verschil tussen `startNettoLiquide` en `nettoLiquide` bevat naast rendement óók
   strategie-effecten: een downsize-verkoop verplaatst waarde van niet-liquide naar
   liquide, een opeethypotheek voegt een schuld ín J toe, een hypotheekaflossing
   schuift waarde tussen twee niet-liquide posten. De kernel levert geen per-jaar
   J-sluitterm. Er één in de sheet berekenen is een **parallelle rekensom** — de
   overtreding die CLAUDE.md verbiedt — en het restant zou onvermijdelijk landen in
   een regel die "Afronding" heet. Dat is exact het verworpen alternatief A van
   ADR 0093 §2, één laag lager toegepast.
3. **De splitsing zit er al, op de plek waar hij wél sluit.** De bon splitst het
   rendement al in `totalGrowthLiquide` plus een neutrale `growthNietLiquide`-regel
   met `woningRest`-sluiting, juist zodat hij op `totalGrowth` blijft sluiten. Dat is
   de bewezen manier om "welk deel hiervan is besteedbaar" te tonen zonder de
   optelling te breken.

**Wat er wél bijkomt** wanneer `primaryBasis === 'liquid'`: één neutrale *"waarvan
besteedbaar"*-regel met `row.nettoLiquide` (consume-only uit dezelfde rij), op twee
plekken — direct onder het hoofdcijfer in de meta-strip én onder de sluitregel "Eind
netto". Twee plekken en niet één, omdat de bon met een I-getal opent terwijl de
gebruiker op een J-punt klikte: het openings- en het sluitcijfer mogen daarover niet
verschillend berichten. De regel is **neutraal van toon** (geen `income`/`expense`)
en doet **niet mee in de waterval** — het is een *waarvan*, geen term. Eén
grondslag-zin erbij: *"Je huis staat op deze bon omdat je het bezit — het telt alleen
niet mee in je vrijheidsdoel."*

De regel verschijnt precies wanneer de primaire lijn op J staat, niet per
woonstrategie apart geregeld: één conditie, dezelfde als D1.

Deflatie: identiek aan `netWorth` — nominale `fc()` plus de `PvLine` op
`row.inflationFactor` van dezelfde rij (klasse S, ADR 0093 §1). Geen nieuwe sleutel.

### D4 — In de tooltip wisselen de twee bedragen van rol; de drijvers blijven, met hun grondslag erbij

Bij `primaryBasis === 'liquid'` wordt in de crosshair-tooltip van `sim-chart.tsx`
**"Zonder je huis" de primaire regel** (bovenaan, vet, in de opmaak die vandaag de
"Met je huis"-regel draagt) en zakt **"Met je huis" naar de secundaire regel**
(gedimd, met de streepjes-swatch van de nu-secundaire lijn). Dezelfde twee bedragen,
dezelfde volgorde-logica als de lijnen zelf; geen derde getal.

De **drijvers/drukkers blijven alle zes staan**, ongewijzigd uit `SimRow`, maar
krijgen een groepskop die hun grondslag noemt: *"Wat er dit jaar gebeurde (mét je
huis)"*. Ze worden gerenderd direct onder de I-regel die ze verklaren, zodat de
leesvolgorde J → I → drijvers-van-I klopt.

Waarom labelen, en niet verwijderen of omrekenen:

- **Omrekenen kan niet zonder het contract op te blazen.** `SimRow.growth` is per
  contract het totaal over álle bezit-slots; de liquide tegenhanger
  (`totalGrowthLiquide`) bestaat alleen op `UnifiedProjectionRow`, niet op `SimRow` —
  de calc-catalogus legt vast dat de SimRow-only paden die splitsing structureel niet
  hebben. Hem toevoegen is precies de `SimRow`-verbreding die D8 afwijst, en hij zou
  bovendien maar één van de zes regels raken: sparen, cashflow, eenmalig en
  onttrekking zijn portefeuillestromen die in J én I identiek landen. Een
  half-omgerekend blok is slechter dan een eerlijk gelabeld blok.
- **Verwijderen is een overcorrectie.** De drijvers zijn de enige causale uitleg op
  de crosshair. Vijf van de zes zijn grondslag-onafhankelijk; alleen `growth` bevat
  de woningwaardestijging. Voor die ene is het label het eerlijke antwoord: het
  verschil tussen de twee bedragen erboven ís die post.

Beide bedragen komen uit view-space feeds (D9) en dragen dus dezelfde euro-weergave —
de rolomkering raakt de deflatie niet.

### D5 — De pill keert om, de default herijkt, en de opgeslagen voorkeur verhuist mee

Bij `primaryBasis === 'liquid'` heet de pill **"Met je huis"** en schakelt hij de
secundaire (I-)lijn aan/uit. Bij `downsize`/`reverse_mortgage` blijft hij onveranderd
"Zonder je huis" en schakelt hij de J-lijn.

De **standaardstand wordt UIT** onder `exclude_from_fire`. De enige reden waarom de
tweede lijn daar standaard AAN stond, staat letterlijk in
`defaultLiquidWealthLineVisible`: *"zonder de lijn loopt de grafiek zichtbaar uit de
pas met de balk eronder."* Dit besluit heft die reden op — de primaire lijn ís nu de
grondslag van de balk. Hem tóch aan laten staan zou twee lijnen tonen voor een
probleem dat niet meer bestaat, en de "te druk"-melding heropenen die de pill juist
introduceerde. De strategie-afhankelijke default vervalt daarmee: de secundaire lijn
staat in alle drie de strategieën standaard uit.

**De opgeslagen voorkeur mag niet stil van betekenis veranderen.** De pill bewaart
vandaag `horizon_show_liquid_line` in localStorage (per apparaat). Onder
`exclude_from_fire` gaat diezelfde boolean een ándere lijn besturen; een gebruiker die
de J-lijn ooit uitzette zou na deze wijziging zijn I-lijn uit hebben staan zonder dat
hij iets deed. De sleutel is daarom **per semantiek, niet per gebruiker**: de
omgekeerde pill krijgt een eigen sleutel, en `horizon_show_liquid_line` behoudt zijn
huidige betekenis voor de twee strategieën waar de pill niet omkeert. Elke
`exclude_from_fire`-gebruiker start dus schoon op de nieuwe default.

### D6 — Vreemde en geforceerde hoofdlijnen blijven op I

De partner-, huishoud- en AOW-stop-hoofdlijnen blijven op Prognose!I. Ze hebben
vandaag bewust geen `liquidPoints` (`liquidLineAvailable` sluit ze al uit): hun rijen
komen uit een vreemde of geforceerde run waarvan de J-reeks niet wordt geproduceerd en
niet op dezelfde as vergelijkbaar is. Als regel: **de grondslagwissel geldt uitsluitend
voor de eigen basis-projectie; zodra een vreemde of geforceerde hoofdlijn actief is
valt `primaryBasis` terug op `'total'`, ongeacht de woonstrategie.** Die terugval is
niet vrijblijvend — zonder hem zou een J-vlag doorlekken naar een run zonder J-anker
en stil een gemengde lijn tekenen.

### D7 — Elke reeks die `SimChart` binnenkomt declareert haar grondslag; mengen is verboden

Dit besluit maakt de grondslag van de primaire lijn **conditioneel**, en dat is een
blijvend risico: elke toekomstige overlay, band of marker die aan `SimChart` wordt
gevoerd moet expliciet zeggen op welke grondslag hij staat, en mag alleen worden
getekend wanneer die overeenkomt met `primaryBasis`. Twee grootheden op één Y-as of
één marker is en blijft verboden (CLAUDE.md). Concreet nu al: de Monte-Carlo-band
volgt `primaryBasis` (D1); de FIRE-doellijn (J) en de incl.-woning-doellijn (I) houden
ieder hun eigen niveau maar wisselen van rol als primaire/secundaire drempel; de
scenario-/wat-als-overlays blijven op I — wat betekent dat een wat-als-lijn naast een
J-hoofdlijn **niet** getekend mag worden zonder eigen J-reeks. Aanbevolen vastlegging
als aandachtspunt `simchart-grondslag-per-reeks` in
`lib/architecture/archimate-concerns.ts`.

### D8 — Geen veld erbij op `SimRow`; de J-reeks komt uit de kernelrijen

De grondslagkeuze is een **geometrie-input**, geen rijveld. `SimRow` wordt niet
verbreed, `toSimRow` niet gewijzigd, en de stop-/wat-als-/preview-runs blijven
ongemoeid. De J-reeks (inclusief het nieuwe J(0)-anker `startNettoLiquide`) komt uit
`UnifiedProjectionRow`, langs exact hetzelfde pad als de bestaande besteedbaar-lijn.

Dit is het punt waarop dit besluit het besluit van 5 aug 2026 niet zozeer overrulet
als wel beantwoordt: de daar genoemde kost — "een nieuw veld op het gedeelde
SimRow-contract plus dezelfde grondslag voor de stop-/wat-als-runs" — wordt niet
betaald maar vermeden.

### D9 — De bronjaar-sleutel reist mee met de feed; anders deflateert de hoofdlijn stil één jaar te ver

`buildLiquidWealthPoints` plot de waarde van rij `age` op **`age + 1`**. Aan de
render-grens wordt die reeks daarom gedeflateerd met de expliciete bronjaar-sleutel
`keyOf: x => x - 1` (ADR 0093 §6). Wordt J de primaire feed, dan **moet die sleutel
mee**. Bij `deflatePoints` zonder sleutel pakt elk punt `f(age + 1)` in plaats van
`f(age)` en staat de hele hoofdlijn in `'real'` één inflatiejaar te laag; het
staartpunt (x = laatste leeftijd + 1) valt bovendien buiten `factorByAge` en blijft
nominaal — een zichtbare haak omhoog aan de rechterrand. Dat haakje is de enige
uiterlijke aanwijzing; de rest van de fout ziet er plausibel uit.

Vier randen die hierbij horen:

1. **Het J(0)-anker deflateert niet, en dat is goed.** `startNettoLiquide` staat op
   `x = rows[0].age`; onder `x - 1` mapt dat naar `startAge − 1`, dat niet in
   `factorByAge` zit, waarna `deflatePoints` het bedrag ongemoeid laat. Jaar 0 draagt
   factor 1.0, dus dat is exact correct — hetzelfde mechanisme als de
   scenario-overlay-seed. **Niet "repareren".**
2. **Rij-vorm of punt-vorm, niet allebei.** Wordt de J-reeks als rijen aangeleverd en
   met `deflateRowsByAge` op `row.age` gedeflateerd, dan zit de bronjaar-sleutel er al
   impliciet in en mag `x - 1` er niet nogmaals overheen. Eén van beide, nooit twee.
3. **`bandLiquide` sleutelt op offset, niet op leeftijd**, met dezelfde
   `i − 1`-bronjaarsleutel als de bestaande band (ADR 0093 §6).
4. **De doelbedragen blijven klasse S** op hun eigen leeftijd (`factorAtAge`) en
   krijgen géén `x − 1`-behandeling.

Alles hierboven speelt zich af **binnen de render-grens** van `horizon-client.tsx`;
de bron-test `horizon-client.euro-view.test.ts` bewaakt dat onveranderd, en
`InEuroView<T>` maakt een tweede deflatie van de J-feed een compile-fout.

## Verhouding tot ADR 0034

Dit besluit **herroept ADR 0034 niet en amendeert hem niet** — het voert zijn
`exclude_from_fire`-uitzondering voor het eerst consistent door.

ADR 0034 legde vast dat vrijheidsvoortgang standaard op de incl.-woning-grondslag
staat en **alléén** bij `exclude_from_fire` terugvalt op de liquide grondslag, en
toonde in zijn addendum aan dat de "nog X jaar"-aftelling daar automatisch mee
meebeweegt (de solver rekent op J). Wat ontbrak was de derde weergave van diezelfde
grootheid: de grafiek. Balk, percentage, aftelling, FIRE-doellijn en
eindstand-doellijn stonden onder `exclude_from_fire` al op J; de primaire lijn was de
enige achterblijver. D1 sluit dat gat, met hetzelfde predikaat
(`isHomeExcludedFromFire`) als bron.

De endpoint-invariant uit ADR 0034 (`prognoseJ == requiredFirePortfolio` op de
FIRE-maand, vergrendeld in `fire-basis-invariant.test.ts`) is daarmee voor het eerst
óók zichtbaar op het scherm: de FIRE-stip raakt de FIRE-doellijn.

Beschouw dit als het grafiek-addendum bij ADR 0034.

## Verhouding tot ADR 0090 / 0093

Onaangeraakt in hun besluiten; D9 is hun toepassing op een nieuwe feed. De vier
deflatieklassen, de render-grens met zijn drieledige bron-test, het
`InEuroView<T>`-merk en het "elk bedrag exact één keer"-principe gelden onverkort.
Twee expliciete bevestigingen omdat ze hier makkelijk zouden sneuvelen: de
kassabon-waterval blijft klasse C en dus nominaal (ADR 0093 §2) — de nieuwe "waarvan
besteedbaar"-regel is klasse S en deflateert wél, precies zoals het
`netWorth`-hoofdcijfer ernaast; en `freedomPct` is een ratio (klasse R) en deflateert
nooit, ook niet nu de grafiek eronder van grondslag wisselt.

## Gevolgen

**Goed.** Grafiek, voortgangsbalk, vrijheids-%, aftelling, FIRE-doellijn en
eindstand-doellijn staan onder `exclude_from_fire` voor het eerst alle zes op dezelfde
grondslag. De FIRE-stip landt op zijn eigen doellijn. De tweede lijn is verdieping
geworden in plaats van correctie, waardoor de grafiek daar met minder lijnen opent dan
vandaag. De explainer-zin die nu een grondslagverschil moet goedpraten ("de band toont
je netto vermogen mét huis") kan verdwijnen zodra `bandLiquide` er is.

**Kosten.** De grondslag van de primaire lijn is niet langer een constante. Dat kost
een blijvende discipline (D7) en maakt elke nieuwe reeks een expliciete keuze in
plaats van een vanzelfsprekendheid. De jaar-kassabon en de tooltip-drijvers blijven
bewust op I onder een J-lijn — opgelost met een regel respectievelijk een groepskop,
niet met een herberekening.

**Bewust open gelaten.** `SimRow.growth` blijft in de tooltip het totale rendement
(inclusief woningwaardestijging) onder een J-hoofdlijn. Dat is een gelabeld verschil,
geen fout, en het oplossen vraagt een verbreding van het gedeelde `SimRow`-contract
die D8 juist afwijst. Wordt de liquide rendementssplitsing ooit alsnog op `SimRow`
beschikbaar (bijvoorbeeld omdat de kernel de breakdowns gaat vullen), dan is dit de
plek om het opnieuw te wegen.

**Regressierisico.** Nul in de rekenkern: engine, solver, bridge en de
parity-fixtures zijn onaangeraakt; `primaryBasis` heeft `'total'` als default, dus
elke bestaande aanroeper en elke bestaande snapshot blijft byte-identiek. Het risico
zit uitsluitend in de weergave-naad, en daar is D9 de scherpe rand.

## Doc-sync (hoort in dezelfde wijziging)

1. `lib/architecture/calculations.ts`, woonstrategie-entry: de zin *"de grondslag van
   de HOOFDlijn blijft in alle vier de modi netWorth"* vervangen door dit besluit, met
   verwijzing naar ADR 0114. De aantekening dat band en marge bewust op verschillende
   grondslagen staan vervalt zodra `bandLiquide` bestaat.
2. `lib/horizon/liquid-wealth-line.ts`: module-doccommentaar en
   `defaultLiquidWealthLineVisible` herschrijven — de lijn is onder
   `exclude_from_fire` niet langer "de tweede lijn", en de daar vastgelegde
   default-AAN vervalt (D5).
3. `lib/architecture/archimate-concerns.ts`: aandachtspunt
   `simchart-grondslag-per-reeks` toevoegen (D7).
4. `npm run arch:diagram` draaien en de architectuur-vitest-suites groen houden.
