# Haalbare uitgave na pensioen — ontwerp

**Datum:** 18 september 2026
**Status:** goedgekeurd ontwerp, wacht op implementatieplan
**Bouwt voort op:** spec `2026-09-14-lab-haalbaarheid-design.md` (§1 dekkingsas, §3 antwoordenblok), ADR 0129 (vast stopmoment × eind-vorm), ADR 0145 (labuitkomst)
**Voorgesteld ADR-nummer:** 0159

## Context

Zodra een gebruiker zijn stopleeftijd vastzet (`fire_stop_anchor = 'age'`), stelt het
plan een andere vraag dan daarvoor. Niet meer *"wanneer kan ik stoppen?"* maar *"reikt
mijn geld tot mijn eindleeftijd als ik op deze leeftijd stop?"* — en het antwoord is
zelden precies "ja". Het plan reikt tot je 76e terwijl het tot je 90e moet reiken, of
het reikt er ruim voorbij en er blijft meer over dan bedoeld.

De app toont vandaag wél het **verschil** (dekkingsas: "Reikt tot 76 · Plan tot 90 ·
Gedekt 12%") maar niet de **knop waaraan dat verschil hangt**: de uitgave ná pensioen.
Die staat als kaal getal in de KPI-tegel "Na pensioen · € 38.640 · per jaar" zonder enige
relatie tot de dekking ernaast.

Het antwoordenblok uit spec lab-haalbaarheid §3 geeft bij een tekort al drie hefbomen
("doorwerken tot 63", "€ 7.729/mnd meer salaris", "€ 7.729/mnd minder uitgeven"). Alle
drie werken op de periode **vóór** het stopmoment. De vierde hefboom — minder of meer
uitgeven **ná** het stopmoment — ontbreekt, terwijl dat voor iemand met een vastgezette
stopleeftijd vaak de enige knop is die nog draait.

Bovendien is de bestaande "€ X/mnd minder uitgeven"-regel een *hint* (`P!B96` =
`-gap / maandenTotEind`, een lineaire, ongedisconteerde uitsmering), geen opgelost getal.
Voor de uitgave na pensioen willen we het echte antwoord: het bedrag waarbij het plan
precies tot de eindleeftijd reikt.

## Doel

Eén getal toevoegen — **de haalbare uitgave na pensioen** — en het op twee plekken tonen
waar het de vraag beantwoordt die de gebruiker daar stelt:

1. in de KPI-tegel "Na pensioen", als duiding bij het bedrag dat er al staat;
2. als vierde draaiknop in de vrijheidsas, met de antwoordregel eronder.

Beide tonen **hetzelfde getal uit dezelfde bron** — dat is de kern van de wens
("dan zou ik het bedrag verwachten van erboven").

## Scope

### In scope

- Een nieuwe kernel-afgeleide: de uitgave na pensioen (€/jaar) waarbij het plan precies
  tot de eindleeftijd reikt, plus de richting (minder moeten / meer mogen).
- Een regel onder het bedrag in beide KPI-tegels (desktop + mobiel), in donkerrood of
  donkergroen.
- Een vierde draaiknop "Uitgave na pensioen" in de vrijheidsas, die de
  wat-als-doorrekening daadwerkelijk aanstuurt, met antwoordregel + "Reken hiermee".
- De curatie-bijwerking die daarbij hoort: `lib/architecture/calculations.ts`, de
  UAT-acceptatiecriteria van de geraakte zone, en een ADR.

### Uit scope

- **Plannen zonder vast stopmoment** (`stopAnker === undefined`, anker `solved`). Daar is
  het plan per constructie precies dekkend; er is geen tekort of overschot om te melden.
  Geen regel in de tegel, geen antwoordregel onder de knop. De knop zelf blijft wel
  bruikbaar als verkenning.
- **Round-trip van de knop in een opgeslagen scenario.** De scenario-state reist als
  `WhatIfEvent[]`; deze hefboom is een profielparameter en zit daar bewust niet in.
  Een opgeslagen/gedeeld scenario draagt deze knop dus niet terug. Bewuste keuze — zie
  "Waarom geen event" hieronder.
- **Schrijven naar het plan.** De knop zet een *verkenning*, net als zijn drie buren. Het
  vastleggen van een nieuwe uitgave na pensioen blijft lopen via de bestaande route
  (`UitgavenPane` → `PUT /api/fire-settings`).
- **Huishoudperspectief.** De regel volgt het bestaande perspectief-gedrag van de tegel:
  in partner-/huishoudweergave (`hasPerspectiveHero`) toont de tegel het
  huishoudbedrag en tonen we géén haalbaar-regel — de solve rekent op de eigen
  kernel-invoer, en die twee naast elkaar zetten zou twee grondslagen mengen.
- Wijzigingen aan de dekkingsas, de dekkingsbalk-tegels of de eindvermogen-weergave.

## Onderdeel 1 — de rekenmotor

Nieuw bestand `lib/horizon/haalbare-uitgave.ts`.

```ts
export interface HaalbareUitgave {
  /** €/jaar waarbij het plan precies tot de eindleeftijd reikt (nominaal, jaar-0-euro's). */
  readonly perJaar: number
  /** De eindleeftijd waartegen gesolved is (`solve.eindleeftijd` — de eind-vorm van het plan). */
  readonly eindleeftijd: number
  /** De uitgave na pensioen waarmee het plan vandaag rekent. */
  readonly huidigPerJaar: number
  /** Richting t.o.v. `huidigPerJaar`, ná de drempel uit onderdeel 2. */
  readonly richting: 'minder' | 'meer' | 'gelijk'
}

export function solveHaalbareUitgave(ctx: HaalbareUitgaveContext): HaalbareUitgave | null
```

### Recept

Het patroon van `solveWithoutAnchor` (`lib/horizon/scenario-presets.ts`): dezelfde
context als de hoofdrun, en per iteratie één ding anders. Geen gespiegelde profielrij, geen
tweede assemblageweg.

**Waar de variatie ingrijpt — correctie op de eerste lezing.** `solveWithoutAnchor` mag
`{ ...input, stopAnker: undefined }` doen omdat `stopAnker` geen afgeleide buren heeft.
`uitgaveNaPensioenPerJaar` heeft die wél: `buildInkomenUitgaven` leidt bij actieve
flex-spending óók `flexNiceFractiePerJaar` uit datzelfde bedrag af
(`deriveNiceFractie(uitgaveNaPensioenPerJaar, yearlyEssential)`,
`lib/horizon-kernel/adapter/params.ts`). Alléén het bedrag verlagen zou de must/nice-split
stil scheeftrekken: de nice-fractie blijft dan op de oude stand staan en daarmee schuift
het *must*-deel mee omlaag, terwijl essentiële uitgaven per definitie niet meebewegen.

Daarom bisecteren we op de **rauwe profielrij** en bouwen we de `KernelInput` per
iteratie opnieuw:

```ts
const patched = { ...ctx.profile,
  retirement_expense_method: 'custom_amount',
  retirement_expense_custom_amount: E }
```

`ConvergentieRawProfileRow` draagt beide kolommen al, dus `buildKernelInputFromApp`
herleidt alles consistent — inclusief de nice-fractie. Twee winstpunten bovenop de
correctheid: dit is **exact hetzelfde mechanisme als de nieuwe draaiknop** (onderdeel 3),
dus het beloofde getal en wat de slider daadwerkelijk doorrekent zijn dezelfde run; en
`buildKernelInputFromApp` is O(bezittingen + gebeurtenissen), verwaarloosbaar naast de
projectie van ~800 maanden die er per iteratie toch al loopt.

```
if (input.stopAnker === undefined) return null      // geen vast anker → geen vraag
huidig = input.inkomenUitgaven.uitgaveNaPensioenPerJaar
if (!(huidig > 0)) return null                       // geen grondslag om tegen af te zetten

gedekt(E) = isGedekt(solveFire(buildKernelInputFromApp(metUitgave(ctx, E))))

if (!gedekt(0))        return null                   // ook zonder uitgaven niet dekkend
hoog = 3 × huidig
if (gedekt(hoog))      → perJaar = hoog, richting = 'meer'  (geklemd, zie randen)
bisecteer op [0, hoog] tot < € 50/jaar breed → perJaar = ondergrens (de laatste gedekte stand)
```

### "Gedekt" is de kernel z'n eigen oordeel

`isGedekt(solve)` toetst uitsluitend `SolveFireResult.status`:

```ts
status !== 'anchor_shortfall' && status !== 'stop_now_shortfall' && status !== 'pension_shortfall'
```

Dat zijn exact de drie statussen die `computeStatusBlok` onder een vast anker zet bij
`vastAnkerTekort` (`tekortLening > 0 ∥ gap < 0 ∥ doelbedrag < 0`,
`lib/horizon-kernel/solver.ts`). **Wij herhalen die formule niet** — we lezen het verdict.
Daarmee betekent "haalbaar" hier hetzelfde als overal elders op de pagina, inclusief de
eind-vorm van het plan (opeten, nalatenschap, koopkracht behouden) en de
tekort-lening-keuze uit ADR 0149.

### Monotonie

Meer uitgeven na pensioen kan de dekking nooit verbeteren: de uitgave voedt zowel de
onttrekking ná het stopmoment als — via `computeRetirementExpenses` → doelbedrag — het
te bereiken vermogen. Bisectie is dus geldig. De implementatie voegt een
monotonie-vangrail toe: vindt de bisectie een niet-monotone stand, dan `null` in plaats
van een getal (liever geen antwoord dan een verkeerd antwoord).

### Kosten

Onder een vast anker *kortsluit* een `solveFire`-run (geen binnenste bisectie — dat is
gemeten in ADR 0129 D7: 174 ms voor zes anker-kaarten). ~14 iteraties ≈ 350 ms, in
**dezelfde worker-oversteek** als `solvedFireAge`. Dat volgt de regel van ADR 0129 D7:
elk oppervlak dat dit getal wil, zou anders zijn eigen bisectie starten.

Uitbreiding van `ScenarioPresetBatch`:

```ts
readonly haalbareUitgave: HaalbareUitgave | null
```

gevuld in `runScenarioPresetBatch`, naast `solvedFireAge` / `solvedFireEndAge`.

### Grondslag: het plan, niet je sliderstand

Het getal hoort bij de **hoofdrun** (het plan), niet bij de wat-als-run. Zelfde keuze als
`planMaandHint` (eindreview I1 van spec lab-haalbaarheid: "het bedrag hoort bij een ánder
stopmoment dan het plan waarover dit blok spreekt"). Gevolg: het springt niet rond terwijl
je aan Meer salaris draait, en de antwoordregel blijft staan waar hij op sloeg.

## Onderdeel 2 — de regel in de KPI-tegel

Beide tegels `data-testid="hero-stat-retirement-expense"` in `horizon-client.tsx`
(desktop-strip én mobiele strip) krijgen onder de bestaande regel "per jaar" één extra
regel:

> haalbaar tot 90 bij uitgave: **€ 31.200**

### Kleur

| situatie | betekenis | token |
|---|---|---|
| `perJaar < huidig` | je moet minder uitgeven | `text-negative` — `oklch(0.50 0.09 25)`, donkerrood |
| `perJaar > huidig` | je mag meer uitgeven | `text-positive` — `oklch(0.50 0.09 162)`, donkergroen |
| `richting === 'gelijk'` | geen regel | — |

Dit zijn de bestaande **semantische** tokens. Ze volgen de accentkeuze van de gebruiker
niet en mogen dat ook niet (CLAUDE.md, kleurconventie: "Semantiek blijft semantisch en is
NOOIT instelbaar"). Geen Tailwind-standaardkleuren, geen losse hexen.

### Drempel

Verschil < **€ 250 per jaar** ⇒ `richting = 'gelijk'` ⇒ geen regel. Spiegelt de
bestaande "toon de delta alleen bij |Δ| ≥ € 500"-regel van de eindvermogen-badge
(ADR 0145 M5). Zonder drempel zou een plan dat feitelijk klopt een rode of groene regel
tonen over € 8 per jaar.

### Kopij en maskering

De zin krijgt één home in `lib/horizon/anker-copy.ts`:

```ts
export function haalbaarBijUitgaveRegel(h: HaalbareUitgave, masked?: boolean): string | null
```

`null` bij `richting === 'gelijk'`. In de privacy-weergave (`useMaskedAmounts`) staat er
`···` op de plek van het bedrag — via `MASKED_AMOUNT_PLACEHOLDER`, hetzelfde pad als de
andere bedragen in de tegel, geen tweede maskeer-route.

### Markup

De tegel is al een `<button>` (hij opent `UitgavenPane`). De regel is platte tekst
binnenín die knop — geen link, geen geneste knop.

### Euro-weergave

Het bedrag is een **jaarbedrag in jaar-0-euro's** — dezelfde grondslag als het bedrag
erboven, dat óók ongedeflateerd uit `input.yearlyMustExpenses` komt. Er wordt hier dus
niets gedeflateerd en niets machtsverheven (ADR 0090/0093). De solve levert nominale
jaar-0-euro's; de tegel formatteert alleen.

## Onderdeel 3 — de vierde draaiknop

### Plaats en vorm

`HEFBOOM_COPY.uitgaveNaPensioen = 'Uitgave na pensioen'`, als vierde `SliderRow` in
`components/app/horizon/whatif-sliders.tsx`, ná Minder werken.

- waarde in **€/jaar** (gelijk aan de tegel, zodat het bedrag in de antwoordregel
  letterlijk hetzelfde getal is als "erboven");
- `detail`-regel eronder: `≈ € 2.600/mnd` — dezelfde plek en stijl als de euro-regel
  onder Spaarquote;
- `hint`: `→ Uitgave na pensioen`;
- bereik: ±40% rond de huidige uitgave, stap € 600/jaar (= € 50/mnd), met hetzelfde
  verbreding-vangnet als `computeSliderUiRange` (een stand buiten de band clampt niet);
- `baseValue` = de huidige uitgave, dus de "nu"-inkeping staat in het midden.

### Antwoordregel

Via de bestaande `SliderAntwoordRegel` / `labAntwoordenPerSlider`:

> Zo'n **€ 31.200 per jaar** uitgeven hoort bij een gedekt plan.  ·  *Reken hiermee*

Toonregel uit `anker-copy.ts` blijft gelden: beschrijvend ("hoort bij een gedekt plan"),
nooit een instructie. "Dekt je plan" is voorbehouden aan het doorwerken-antwoord, dat
kernel-bewezen is; hier geldt dezelfde terughoudendheid als bij de €-regels.

De actie achter "Reken hiermee" past niet in de bestaande `LabAntwoordActie`
(`stop` | `slider` met een `SliderKey`), want deze hefboom is geen `SliderKey`. Er komt
één variant bij:

```ts
| { readonly kind: 'uitgave'; readonly perJaar: number }
```

`labAntwoordenPerSlider` krijgt daarvoor een derde uitgang naast `sliders` en `stop`, en
`labAntwoordGezetMelding` een derde zin ("Uitgave na pensioen staat nu op € 31.200").

Ligt de haalbare uitgave buiten het sliderbereik, dan geldt de bestaande
`bovenBereik`-regel: de regel zegt het, en de knop heet `Reken met maximum` en zet de
rand. Onder een *overschot* kan het bedrag boven de bovenrand liggen, onder een tekort
onder de onderrand — beide takken gebruiken dezelfde vlag.

### Bedrading — waarom geen event

De drie bestaande knoppen bouwen een `WhatIfEvent` (`buildSliderEvent`). De uitgave na
pensioen is géén life-event maar een **profielparameter**: de kern leest 'm als
`inkomenUitgaven.uitgaveNaPensioenPerJaar`, afgeleid uit `retirement_expense_method` +
`retirement_custom_amount`. Hem als `lifestyle_adjustment`-event modelleren zou een
tweede waarheid naast dat veld zetten (het event voedt de kasstroomtabel, niet het
doelbedrag), en dat is exact het soort drift dat de conventie "consume, don't recompute"
moet uitsluiten.

Daarom: **geen nieuwe `SliderKey`**, maar één veld erbij op de bestaande
override-ingang.

```ts
// lib/hooks/use-horizon-fire-sim.ts
export interface HorizonScenarioOverrides {
  extraLifeEvents: WhatIfEvent[]
  returnDeltaByCategorie?: Partial<Record<AssetCategorie, number>>
  /** €/jaar; afwezig ⇒ het profiel bepaalt de uitgave na pensioen (ongewijzigd). */
  uitgaveNaPensioenPerJaar?: number
}
```

De override landt in de scenario-context als een profiel met
`retirement_expense_method: 'custom_amount'` +
`retirement_expense_custom_amount: <waarde>` — dezelfde twee kolommen die
`WhatifRawProfileRow` al kent, dus de adapter heeft geen nieuwe tak nodig.

Dat veld reist mee door de worker-oversteek (`lib/horizon-kernel/worker/kernel-protocol.ts`)
en telt mee in `hasScenario` in `horizon-client.tsx`, zodat de knop een scenario-run
start zoals zijn buren.

### Regressie-eis

Nul overrides ⇒ byte-identieke scenario-run. De golden
`lib/horizon/scenario-baseline-parity.test.ts` moet ongewijzigd groen blijven: afwezig veld
⇒ ongewijzigde profielreferentie ⇒ dezelfde context als de basislijn.

## Acceptatiecriteria

**AC-1 — het getal**
Gegeven een plan met een vastgezet stopmoment dat tot leeftijd 76 reikt terwijl de
eindleeftijd 90 is, wanneer de batch draait, dan levert `solveHaalbareUitgave` een
`perJaar` dat lager is dan de huidige uitgave, en een run met exact dat bedrag geeft een
`status` die géén shortfall is, terwijl datzelfde bedrag + € 600 dat wél doet.

**AC-2 — overschot**
Gegeven een plan dat ruim voorbij de eindleeftijd reikt, dan is `perJaar` hóger dan de
huidige uitgave en is `richting === 'meer'`.

**AC-3 — de regel in de tegel**
Gegeven AC-1, wanneer /toekomst rendert, dan staat in beide KPI-tegels
"haalbaar tot 90 bij uitgave: € 31.200" met klasse `text-negative`; bij AC-2 met klasse
`text-positive`.

**AC-4 — geen anker, geen regel**
Gegeven een plan met anker `solved`, dan levert `solveHaalbareUitgave` `null` en toont de
tegel exact wat hij vandaag toont — geen extra regel, geen extra DOM-knoop.

**AC-5 — drempel**
Gegeven een plan waarvan de haalbare uitgave € 120/jaar van de huidige afligt, dan is
`richting === 'gelijk'` en toont de tegel geen regel.

**AC-6 — één bron, twee plekken**
Gegeven AC-1, dan toont de antwoordregel onder de nieuwe draaiknop hetzelfde bedrag als
de tegel — beide lezen `ScenarioPresetBatch.haalbareUitgave`, er is geen tweede
berekening in de UI.

**AC-7 — de knop rekent**
Gegeven de nieuwe draaiknop op een andere stand dan de basis, wanneer de scenario-run
landt, dan rekent die run met de gekozen uitgave na pensioen en bewegen de dekkingsas
("Reikt tot", "Gedekt") en de wat-als-lijn mee.

**AC-8 — privacy**
Gegeven de privacy-weergave (bedragen gemaskeerd), dan staat er `···` op de plaats van
het bedrag in de regel én in de antwoordregel, en draagt de antwoordregel geen knop
(bestaande `masked`-regel van `labAntwoordenPerSlider`).

**AC-9 — regressie**
Zonder actieve overrides is de scenario-run identiek aan de basislijn
(`scenario-baseline-parity.test.ts` groen), zijn de drie bestaande antwoordregels
ongewijzigd, en is de kopij van de bestaande hefbomen niet aangeraakt.

**AC-10 — geen kleurlek**
De nieuwe regel gebruikt uitsluitend `text-negative` / `text-positive`; een bron-test
bewaakt dat er geen Tailwind-standaardkleur of losse hex in de nieuwe markup staat.

## Randgevallen

| geval | gedrag |
|---|---|
| geen vast anker (`solved`) | `null` — geen regel, geen antwoordregel |
| huidige uitgave ≤ 0 | `null` (geen grondslag; de tegel toont al de `HeroKpiNotice`) |
| ook bij € 0 uitgaven niet dekkend | `null` — het tekort zit vóór het stopmoment; de bestaande drie antwoorden blijven de route |
| haalbaar > 3× huidig | geklemd op de bovengrens, `richting = 'meer'`; de regel noemt de klem niet maar de slider-`bovenBereik`-tekst wel |
| huishoud-/partnerperspectief | geen regel (zie Uit scope) |
| kern-fout / exception | `try/catch` → `null`, zelfde degradatie als `solveWithoutAnchor` |
| niet-monotone bisectie | `null` (vangrail) |

## Raakvlak

| bestand | wijziging |
|---|---|
| `lib/horizon/haalbare-uitgave.ts` | **nieuw** — de solve |
| `lib/horizon/scenario-presets.ts` | `ScenarioPresetBatch.haalbareUitgave` + vulling in `runScenarioPresetBatch` |
| `lib/horizon-kernel/worker/kernel-protocol.ts` | veld reist mee over de oversteek |
| `lib/hooks/use-horizon-fire-sim.ts` | `HorizonScenarioOverrides.uitgaveNaPensioenPerJaar` → scenario-profiel |
| `lib/horizon/anker-copy.ts` | `HEFBOOM_COPY.uitgaveNaPensioen`, `haalbaarBijUitgaveRegel`, antwoordzin |
| `lib/horizon/lab-antwoorden.ts` | vierde antwoord + derde `LabAntwoordActie`-variant (zie hieronder) |
| `components/app/horizon/whatif-sliders.tsx` | vierde `SliderRow` |
| `components/app/horizon/horizon-client.tsx` | regel in beide tegels, knop-state, override in `scenarioOverrides` |
| `lib/architecture/calculations.ts` | de nieuwe afgeleide in de Berekeningen-catalogus |
| `lib/uat/acceptance/toek.ts` + `reken.ts` | criteria bijwerken (definities, niet uitvoeren); `*-checks.ts`-spiegels mee |
| `docs/adr/0159-*.md` | het besluit |

## Definition of done

- `npx tsc --noEmit` schoon.
- Nieuwe unit-tests: de solve (AC-1, AC-2, AC-4, AC-5, randen), de kopij-helper, de
  mapping naar de knop. Een kernel-bewijstest in de geest van
  `lab-antwoorden.kernel.test.ts`: het gevonden bedrag ís dekkend en één stap hoger niet.
- Bron-test op de tegels (het patroon van `horizon-client.na-pensioen-klik.test.ts`):
  beide layouts tonen de regel via dezelfde helper, geen tweede berekening.
- Bestaande suites groen — in het bijzonder `scenario-baseline-parity.test.ts`,
  `lab-antwoorden*.test.ts`, `anker-copy.test.ts`, `vrijheidsas.test.tsx`,
  `dekkingsbalk.test.tsx`.
- Vitest via PowerShell, niet via Bash (CLAUDE.md).
- ADR 0159 geschreven; `lib/architecture/calculations.ts` bijgewerkt;
  `npm run arch:diagram` gedraaid.
- Gebundelde fork-eindreview (correctheid · UI-consistentie · security-lens). Geen
  aparte `security-specialist`-run nodig: geen auth, geen RLS, geen migratie, geen nieuwe
  route, geen partner-/huishouddata — de huishoudtak is juist uitgesloten.

## Open punten voor de ADR

1. **Bovengrens 3× huidig.** Willekeurig gekozen als praktische klem. Alternatief: klem
   op het netto jaarinkomen. Vast te leggen in de ADR met reden.
2. **Drempel € 250/jaar.** Afgeleid van de € 500-regel van de eindvermogen-badge, niet
   apart gemeten.
3. **Stap € 600/jaar (€ 50/mnd).** Gekozen zodat de knop dezelfde "voelbare stap" heeft
   als Meer salaris (€ 50/mnd); bisectie-precisie (€ 50/jaar) is bewust fijner dan de
   sliderstap, zodat het antwoord niet op de stap afrondt.
