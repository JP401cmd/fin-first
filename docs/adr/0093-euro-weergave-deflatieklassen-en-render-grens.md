---
id: 0093-euro-weergave-deflatieklassen-en-render-grens
title: Euro-weergave wave 2+3 — deflatie-klassen, twee kruis-regimes, de render-grens en de kernelfactor-naad
status: aanvaard
date: 2026-08-08
elements: [as-planning, as-vermogen, fn-toekomstplannen, app-comp, do-meta]
---

ADR 0090 (wave 1) legde het choke point en de scalar-voorkeur vast, maar liet de dekking van
`/toekomst`, de fase-kassabons, `/overzicht` en de AI-context expliciet open (gefaseerd). Dit besluit
is die uitwerking: hoe een bedrag zijn deflatie-klasse krijgt, hoe dubbele deflatie een compile-fout
wordt in plaats van een leesfout, waar de render-grens in een 8800-regelscomponent ligt en hoe de
bron-test die grens daadwerkelijk bewaakt, en hoe de kernelfactor de kernel verlaat naar de
`/overzicht`-bundel en de AI-context zonder dat iets zelf gaat rekenen.

## Context

Wave 1 leverde `lib/euro-display.ts` (`deflate`, `buildFactorByAge`, `factorAtAge`,
`euroViewLabel`), de scalar `profiles.euro_view` en de fasetabel op `/toekomst`. De rest van de app
toonde nog uitsluitend nominale bedragen. Vier dingen bleken bij het uitwerken niet vanzelfsprekend:

1. Niet elk bedrag hoort bij één leeftijd — sommige zijn een som over jaren, sommige een ratio.
   Zonder klasse-indeling deelt de eerste naïeve implementatie een cumulatief kassabon-totaal met de
   factor van het eindjaar, en dan sluit de waterval-optelling niet meer.
2. `horizon-client.tsx` (8800 regels) heeft minstens acht onafhankelijke chart-feeds plus losse
   puntbedragen. "Eén memo die alles voedt" is geen werkbaar advies; zonder een harde grens raakt de
   deflatie verspreid door het bestand en wordt hij onbewijsbaar volledig.
3. De kernelfactor (`UnifiedProjectionRow.inflationFactor`) verlaat de horizon-kernel nergens
   richting de server — `HorizonFireSim` gaf tot nu toe alleen `SimRow[]` terug, dat de factor niet
   draagt. Zonder een naad kan `/overzicht` en de AI-context niet meebewegen.
4. Een gedeflateerde rij is met het typesysteem van vóór dit besluit niet te onderscheiden van een
   nominale rij — dubbele deflatie is dus onzichtbaar tenzij het type het zelf afdwingt.

## Besluit

### 1. Vier deflatie-klassen; de klasse bepaalt de factor, niet de callsite

| Klasse | Wat | Deflator | Voorbeeld |
|---|---|---|---|
| **S** — stock/punt | Bedrag hoort bij één leeftijd | `factorAtAge(rows, age)` | FIRE-doel, eindvermogen fase, mijlpaal |
| **F** — flow, één jaar | Jaarstroom in één projectiejaar | de factor van díé rij | onttrekking jaar k, Box 3 jaar k |
| **C** — cumulatief/gemiddeld | Som/gemiddelde over meerdere jaren | **geen canonieke deflator → exempt** | totale inleg, cumulatief rendement |
| **R** — ratio | Verhouding, geen euro | nooit | dekkingsgraad, spaarquote, freedomPct, SWR |

"Deflateer elk bedrag met de rij waar het vandaan komt" is precies de val: klasse C heeft geen rij.

### 2. Cumulatieve kassabons blijven nominaal, als één blok

De drie fase-modals (opbouw/overgang/onttrekking) dragen elk een waterval-optelidentiteit
(`start + inleg + rendement − Box 3 + events ≈ eind`, met een afrondingsrij die pas boven €1.000
verschijnt). Die identiteit geldt nominaal. Per term deflateren met de eigen jaarfactor laat de
identiteit niet meer sluiten, en het verschil valt in de rij die "Afronding" heet — op een
30-jaarsplan tienduizenden euro's onder het minst opvallende label.

**Besluit: het hele identiteitsblok is klasse C en blijft nominaal**, inclusief start-/eindrij en
kopregel. In `'real'` draagt het blok één zichtbare grondslag-regel: *"Deze optelling loopt over
meerdere jaren en staat in toekomstige euro's."*

*Verworpen alternatief A:* per term deflateren en het restant in de afrondingsrij laten vallen — een
stille leugen op de plek waar hij het minst opvalt.
*Verworpen alternatief B:* een extra rij "koopkracht-effect (inflatie)" die de reële kassabon exact
laat sluiten — rekenkundig correct, maar introduceert een nieuw begrip in wat een weergavetoggle
hoort te zijn en botst met de bestaande afrondingsrij (twee residuen in één bon). Apart geagendeerd
als productkaart "kassabon in koopkracht van vandaag" (concern
`kassabon-cumulatief-buiten-euro-weergave`).

### 3. Eén render-grens per bestand, met een bron-test die drie dingen bewaakt

In `components/app/horizon/horizon-client.tsx` (8800 regels) staat één gemarkeerd blok, direct vóór
de render, tussen twee vaste bakens:

```
// ── EURO-WEERGAVE: DE RENDER-GRENS ─────────────────────────────────────────
//   Alles hierboven is NOMINAAL. Alles hieronder consumeert `view*`-waarden.
// ── EINDE EURO-WEERGAVE ────────────────────────────────────────────────────
```

Naamconventie hard: nominaal ongesuffixt (`displaySimRows`, `targetInflationFactors`), gedeflateerd
draagt een `view`-prefix (`viewSimRows`, `viewLiquidPoints`). De JSX verwijst voor euro-bedragen
uitsluitend naar `view*`.

De grens is niet vrijblijvend geformuleerd — hij wordt bewaakt door een bron-test
(`horizon-client.euro-view.test.ts`, precedent `lib/fire-target-shared.test.ts`) die het bestand als
tekst leest en **drie** dingen eist, letterlijk zo geformuleerd omdat elk van de drie een andere fout
vangt:

1. **exact één** `EURO-WEERGAVE: DE RENDER-GRENS`-baken en één `EINDE EURO-WEERGAVE`-baken, in die
   volgorde;
2. elk voorkomen van `deflate(`, `deflateRowsByAge(`, `deflatePoints(`, `deflateSeriesByOffset(` ligt
   **tussen** de bakens;
3. elk voorkomen van `inflationFactor` ligt tussen de bakens **óf** draagt `// euro-view: exempt` op
   dezelfde of de voorgaande regel.

Regel 3 is de reden dat deze test iets bewaakt: regel 2 vangt alleen de vier functienamen. Een
handgerolde `x / row.inflationFactor` buiten het blok — bijvoorbeeld het eerder al aanwezige
`housingHeldNotice.realLegacyTarget = targetEndPortfolio / lastRow.inflationFactor` — noemt geen van
de vier functienamen en zou een test die alleen op regel 2 test niet doen bijten. Dat is precies wat
bijt-proef 3 bewees: ronde 1 (`deflate(...)` buiten de bakens) en ronde 2 (`x /
row.inflationFactor` buiten de bakens, zonder exempt-markering) maken de test allebei rood; zonder
regel 3 zou ronde 2 groen zijn gebleven, en dat is het geval waarin een groene test niets bewaakt. Een
ADR die hier alleen "we greppen op `deflate(`" zegt, laat de volgende lezer opnieuw in deze val lopen
— vandaar dat de drieledigheid hier expliciet staat.

### 4. Twee kruis-regimes over de render-grens

| Wat kruist | Regime | Reden |
|---|---|---|
| Chart-feeds & puntbedragen (`SimRow[]`, overlay-reeksen, doelbedragen, scalars) | **view-space**, gemerkt `InEuroView<T>` | Het kind is een tekenmachine; mag niet hoeven weten wat een euro-weergave is |
| Rekenrijen (`UnifiedProjectionRow[]`) | **nominaal, onveranderd** | Dragen kruis-rij-identiteiten (klasse C) die een blanket-deling breekt; dragen bovendien hun eigen factor, dus het kind kan zelf per klasse correct deflateren |

Componenten die rekenrijen ontvangen (fase-modals, `sim-chart-widget`, `phase-detail-table`,
`horizon-year-details-sheet`) lezen de weergave uit `useEuroView()`, nooit uit een prop. Eén bron,
geen prop-drilling, en de fallback (`'nominal'` buiten een provider) houdt bestaande tests groen.

`InEuroView<UnifiedProjectionRow>` is verboden — dat is de enige constructie waarmee beide regimes
zouden kunnen mengen.

### 5. `InEuroView<T>` maakt dubbele deflatie een compile-fout

```ts
declare const EURO_VIEW_APPLIED: unique symbol
export type InEuroView<T> = T & { readonly [EURO_VIEW_APPLIED]?: true }
```

`deflateRowsByAge`/`deflatePoints`/`deflateSeriesByOffset` accepteren als input uitsluitend het
ongemerkte type, en geven `InEuroView<T>` terug. Een tweede aanroep op een al gedeflateerde rij is
dan een `TS2345`, niet een stil verkeerd getal — geverifieerd in de praktijk: `InEuroView<SimRow>[]`
nogmaals door `deflateRowsByAge` halen geeft exact die compile-fout.

Waarom dit type nodig is (scherper dan "rij-interne consistentie", zie het amendement op ADR 0090):
een gedeflateerde `SimRow` is *typegelijk* aan een nominale — zonder het merk kan het typesysteem
dubbele deflatie niet zien, en runtime ziet het pas terug als een stilletjes te laag bedrag.

Harde eis: in `'nominal'` geven alle drie de helpers **dezelfde array-referentie** terug (identiteit,
geen allocatie) — dat houdt de default byte-identiek en de memo's van een 8800-regelscomponent
stabiel.

**Drie helpers, niet één** — er zijn drie feed-vormen in de codebase, en één helper dekt ze niet:

```ts
// 1. Rij-vorm: SimRow[] en alles met {age}
deflateRowsByAge<T extends {age:number}, K extends keyof T>(rows, factorByAge, moneyFields, view)
// 2. Tuple-vorm: [x, value][] — liquidPoints, scenario-/huishoudoverlays
deflatePoints(points, factorByAge, view, keyOf?)
// 3. Index-vorm: number[] op jaar-offset — Monte-Carlo p10..p90
deflateSeriesByOffset(series, factorByOffset, view)
```

### 6. Partner-/huishoudfeeds en de Monte-Carlo-band sleutelen op jaar-offset, niet op leeftijd

`partnerLine`/`householdMainLine` dragen hun eigen `currentAge`; hun `rows[k].age` is de leeftijd van
de partner, niet van de gebruiker. Een leeftijd-sleutel op zo'n feed vindt op elke rij toevallig geen
of de verkeerde factor en valt dan stil terug op factor 1 — het bedrag oogt plausibel en er is niets
gedeflateerd; geen enkele reviewer ziet dit aan het scherm af. Deflateer deze feeds daarom op
**positie/jaar-offset** (`buildFactorByOffset`, index 0 = vandaag = factor 1.0), niet op absolute
leeftijd. Dezelfde val geldt voor de Monte-Carlo-band (`p10..p90`, geïndexeerd op jaar-offset vanaf
`startAge`). Gepind in `horizon-client.feed-keys.test.ts` met een partner die acht jaar jonger is dan
de gebruiker.

De besteedbaar-/liquide-vermogenslijn plot bovendien op `row.age + 1` terwijl de waarde bij `row.age`
hoort; `deflatePoints` accepteert daarom een expliciete `keyOf: x => x - 1` op die callsite, zodat de
offset zichtbaar op de aanroepplek staat in plaats van verstopt in een generieke helper.

### 7. De doellijn in `'real'`: een unit-factorlijst, niet `undefined`

De sim-chart-geometrie (`lib/horizon/sim-chart-geometry.ts`, bevroren) tekent de erfenis-/
koopkrachtdoellijn alleen wanneer er een `targetInflationFactors`-lijst is; zonder factoren is
`targetLine === null` en **verdwijnt de doellijn volledig** — geen vlakke terugval.

**Besluit — unit-factorlijst.** In `'real'` levert de render-grens:

- `targetEndPortfolio` = het al **gedeflateerde** doel (klasse S op de laatste zichtbare leeftijd);
- `targetInflationFactors` = dezelfde leeftijdenreeks met **`factor: 1` overal** (géén `undefined`).

Met `endFactor = 1` tekent de geometrie een vlakke polyline op het reële doel-van-nu, zónder één
regel wijziging in de bevroren geometrie. Het bijkomende `"€…k nu"`-sublabel zou in die situatie
hetzelfde bedrag een tweede keer tonen; het wordt onderdrukt op een **waarde-conditie**
(`labelVal === realTargetNow`) in `chart-static-layers.tsx`, niet op een nieuwe prop — `SimChartProps`
blijft daardoor ongewijzigd en de sim-chart blijft euro-weergave-onwetend.

### 8. Bedragmaskering op de sim-chart — sluit ADR 0091

`useMaskedAmounts()` wordt in `sim-chart.tsx` zelf aangeroepen (fallback-context, geen provider-eis,
geen nieuwe prop). `fmtAbs(val, masked)` maskeert alle zeven crosshair-bedragen; de losse `+`/`−`
verdwijnen (richting blijft via kleur/icoon/groepskop); de Y-as-ticks verdwijnen onder maskering
zonder de gridlijnen te raken; de doellijnen houden hun woordlabel en verliezen hun bedrag. Geometrie
(gridlijnen, nullijn, lijn-/padposities, MC-band, FIRE-stip, crosshair) blijft bewijsbaar identiek
masked vs. unmasked. Zie ADR 0091 voor de volledige regel; dit besluit levert de uitvoering die de
"Openstaand"-sectie daar sluit.

### 9. De kernelfactor verlaat de kernel via `HorizonFireSim.unifiedRows`, niet via `SimRow`

`HorizonFireSim` (`lib/fire-target-shared.ts`) krijgt additief:

```ts
/** Kernelrijen van DEZE run — canonieke weergave-deflator per jaar (jaar 0 = 1.0). Consume-only. */
unifiedRows: { age: number; inflationFactor: number }[]
```

Compact (alleen `age`+`inflationFactor`, geen volledige `UnifiedProjectionRow[]`) zodat de RSC-payload
klein blijft. `SimRow` wordt **niet** uitgebreid — dat zou de blast radius over `toSimRow`, what-if,
previews, stubs en mocks trekken en een deflator zetten op een type dat óók door niet-kernel-paden
wordt geproduceerd.

`lib/dashboard-data-loader.ts` **joint** (voegt niet alleen door) de factor op leeftijd:
`buildFactorByAge(shared.unifiedRows)` tegen `simResult.rows` (dat de factor zelf niet draagt);
ontbrekende factor ⇒ `?? 1` (geen deflatie). De reconcile-offset in `buildSimNetWorthRows` blijft
**nominaal** toegepast; `inflationFactor` reist uitsluitend mee als passagier en wordt pas in het
renderende component gedeeld, ná de her-ankering — omgekeerd verschuift het Vandaag-punt en ontstaat
een knik op de naad historie↔projectie. Rij 0 draagt factor 1.0, dus jaar 0 gedeflateerd is exact
`currentNetWorth`.

**Bundel-optionaliteit, expliciet besloten.** Op `DashboardData.simRows`/`simNetWorthRows` is
`inflationFactor` **optioneel** (`inflationFactor?: number`); op de engine-typen (`SimNetWorthRow`,
`BuildSimNetWorthRowsParams.simRows`) en de loader-lokale variabele is het **verplicht**. Reden:
bestaande widget-testfixtures (`type SimRow = NonNullable<DashboardData['simRows']>[number]`) zouden
door een verplicht bundelveld repo-breed tsc breken, in een bestand buiten de golf die het contract
uitbreidt. De compile-dwang op de join zelf gaat niet verloren — die zit op de loader-lokale
typering — en dit spiegelt het bestaande idioom van `simRequiredNetWorth?: number | null` twee
regels verderop ("optioneel/additief: mock-/empty-bundels blijven geldig"). Wordt dit later
"aangescherpt" naar verplicht op de bundel, dan breekt dat opnieuw tsc op dezelfde fixture — vandaar
hier expliciet vastgelegd in plaats van stilzwijgend een keuze te laten worden die iemand later
terugdraait.

### 10. AI-context: nominaal, met één gepaarde waarde — geen voorkeur naar het model

1. `euro_view` (de weergavevoorkeur) gaat **niet** naar het model. Een voorkeur zonder cijfers
   verleidt tot een eigen `(1+i)^n` — de zuiverste consume-don't-recompute-overtreding.
2. Waar de kernelfactor beschikbaar is, staan beide bedragen in de context:
   `FIRE-doel: € X (toekomstige euro's; ≈ € Y in geld van vandaag)`, met
   `Y = deflate(X, factorAtAge(unifiedRows, fireAge), 'real')` via de naad uit besluit 9.
3. `horizon-context.ts` draagt één vaste, statische grondslag-regel: *"Alle projectiebedragen staan in
   toekomstige euro's (nominaal). Reken zelf nooit om naar huidige euro's — gebruik alleen bedragen
   die hier letterlijk staan."*
4. **De "≈"-toevoeging verschijnt alléén wanneer die daadwerkelijk iets anders zegt** — bij een lege
   of unit-factorlijst (geen kernelrijen met een van 1 afwijkende factor) blijft het bij het nominale
   bedrag. Een "≈ € X" met exact hetzelfde getal als het nominale bedrag is vals-precies: het
   suggereert een omrekening die niet heeft plaatsgevonden.
5. De 5-jaars assetprojectie (`projectPortfolio`, eigen motor) blijft nominaal onder dezelfde
   grondslag-zin — geen tweede reële variant, geen tweede grondslag in één contextblok.

### 11. Het dagtarief deflateert nooit

`formatWithFreedom`/`dailyExpenseRate` rekenen met een dagtarief van vandaag (12-maands rolling). Als
het bedrag deflateert, deflateert de vrijheidstijd automatisch mee — en dat is correcter dan voorheen:
een nominaal toekomstbedrag gedeeld door het dagtarief van nu overschatte de vrijheidstijd. Het
dagtarief zelf blijft per definitie een grootheid van vandaag en wordt **nooit** gedeflateerd; "ook de
noemer consistent maken" zou de deflatie twee keer toepassen.

### 12. Badge, exempt-klassen, export-artefacten

- **Markering = badge, geen tweede as-label.** `EuroViewBadge` (wave 1, tot deze release nergens
  gemount) is klikbaar en onzichtbaar in `'nominal'`. Op `/toekomst`: chart-header, jaar-details-sheet
  en naast de Nominaal/Reëel-pill in de fasetabel. Op `/overzicht`: **één** badge, inline in de
  hero-band (mini-vermogensgrafiek-header) — nadrukkelijk *niet* in de absolute
  header-controls-stack (`i` op `right-4`, statuspunt `right-[52px]`, insight-toggle `right-[84px]`,
  CLAUDE.md); een vierde control op vaste offsets breekt die documenteerde reeks, en acht
  widget-badges naast elkaar is ruis.

  > **⚠️ De badge-PLAATSING hierboven is achterhaald — zie
  > [ADR 0094](0094-euro-weergave-status-in-de-sidebar.md) (9 aug 2026).** `EuroViewBadge` is
  > verwijderd; de weergave-status hangt app-breed bovenaan de sidebar. "Geen tweede as-label" en de
  > redenering over de header-controls-stack blijven gelden — er komt juist géén vierde control bij.
  > De overige punten van §12 (exempt-klassen, export-artefacten) zijn onverkort van kracht.
- **Toggle volgt de kernel; eigen projectiemotoren zijn exempt.** Een oppervlak kan alleen meebewegen
  met een kernelrij onder zich. Exempt, met reden: `net-worth-projection-chart.tsx` (eigen
  compound-projectie), `compound-insight-card.tsx`/`fee-impact-card.tsx` (illustratief, geen
  gebruikersprojectie), de aanvullend-pensioenprojectie achter `DashboardData.pensionMonthlyGross` in
  `pensioen-aow-widget.tsx` (het vierde geval, niet in het oorspronkelijke ontwerp voorzien), gerealiseerde/korte-termijn-oppervlakken
  (`cashflow-forecast.tsx`, `networth-history-sheet.tsx`), de bestaande koopkracht-erosie-kaarten
  (deflateren al zelf) en `/horizon/whatif` (legacy backing-route). Zie concern
  `projectiemotoren-naast-de-kernel`.
- **Gedeelde/geëxporteerde artefacten hebben een vaste grondslag.** Rapportage-PDF, de deelbare
  freedom-card-PNG en de briefing tonen **altijd nominaal**, met de grondslag in de tekst — een
  document dat je met je partner of adviseur deelt mag niet afhangen van wiens weergavevoorkeur er
  toevallig actief was toen er op "export" werd gedrukt.

## Gevolgen

**Goed.** `/toekomst`, de fase-kassabons (nominaal, bewust), `/overzicht` en de AI-context volgen nu
dezelfde weergavevoorkeur, met exact één canonieke deflator per bedrag. Dubbele deflatie is een
compile-fout (view-space feeds) of een bron-test-fout (rekenrijen buiten de render-grens) geworden in
plaats van een stil verkeerd getal. `SimNetWorthRow`/`DashboardData` breiden additief uit — geen
hernoeming, dus geen blast radius over de ~13 bestanden die een `netWorthNominal`-hernoeming zou
hebben geraakt (zie ADR 0090's overweging tegen ADR 0073-achtige naamgeving, die voor deze as niet
opgaat: nominaal is de enige grondslag die in de datalaag bestaat, geen tweede grondslag ernaast).

**Kosten.** Vier oppervlakken blijven structureel exempt tot een aparte rekenmotor-sanering ze onder
de kernel brengt (concern `projectiemotoren-naast-de-kernel`). De fase-kassabons tonen in `'real'`
nog steeds hetzelfde nominale bedrag met een grondslag-regel — een gebruiker die de kassabon zelf in
koopkracht van vandaag wil lezen kan dat nog niet (concern
`kassabon-cumulatief-buiten-euro-weergave`).

**Bewust open gelaten.** `chart-event-markers.tsx` zet een aria-label die van de aanroeper komt; een
toekomstige callsite die daar een bedrag in zet zou onder maskering lekken (concern
`chart-event-marker-label-maskeringslek`) — vandaag geen bekende callsite die dat doet.

**Regressierisico: nul.** Dit is pure presentatielaag; de horizon-kernel, de solver en de 735
parity-fixtures zijn onaangeraakt. De gouden FIRE-matrix (`lib/regression-tests/horizon-strategie/`)
bewijst dat: geen enkele golden bewoog.
