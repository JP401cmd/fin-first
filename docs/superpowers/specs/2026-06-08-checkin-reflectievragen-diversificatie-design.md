# Check-in reflectievragen — diversificatie & aanspreekvorm

**Datum:** 2026-06-08
**Status:** Ontwerp goedgekeurd (wacht op spec-review → implementatieplan)
**Branch-context:** `claude/household-integration`

## Probleem

De reflectievragen aan het einde van de maandelijkse check-in heten in de code
**gespreksstarters**. Ze worden volledig gegenereerd door regelgebaseerde logica
die inline in de route-handler `app/api/checkin/gespreksstarters/route.ts` zit.

Drie tekortkomingen (door de gebruiker bevestigd):

1. **Herhaling per maand.** Eén datapatroon levert exact één hardgecodeerde zin.
   Blijft het vermogen groeien, dan krijgt de gebruiker elke check-in letterlijk
   dezelfde tekst.
2. **Te weinig onderwerpen.** Slechts 7 regels (15 starter-ID's). Maand na maand
   triggeren dezelfde paar invalshoeken.
3. **Te generiek / niet relevant.** Selectie is `sort(positive→neutral→alert)` +
   `slice(0,5)`. Hierdoor zinken échte alerts (problemen) naar onderen en vallen
   ze soms weg, terwijl de magnitude van een signaal geen rol speelt.

Daarnaast een **correctheidsbug**: alle vragen zijn in "jullie"-vorm geschreven,
ongeacht of de gebruiker een partner/huishouden heeft. Voor een solo-gebruiker
leest *"Welke schuld willen jullie het eerste aanpakken?"* vreemd.

Expliciet **geen** doel (door gebruiker afgewezen): AI-gegenereerde taal. De
oplossing blijft deterministisch — dat past bij de projectwaarden (testbaar,
gratis, snel, geen AI-latency in een blokkerende load).

## Doelen

- Variatie in formulering zodat hetzelfde signaal niet elke maand identiek leest.
- Bredere onderwerp-dekking (7 → ~14 onderwerpen).
- Scherpere selectie op basis van relevantie/magnitude i.p.v. sentiment-volgorde.
- Correcte aanspreekvorm: solo "je/jij" vs huishouden "jullie".
- De logica testbaar maken (nu zit ze onbereikbaar in een route-handler).

## Niet-doelen / grenzen

- **Geen AI-laag.** Bewust deterministisch.
- **Geen data-scope-wijziging.** De check-in toont overal de data van de huidige
  gebruiker (terugblik-metrics, herwaardering, enz.). We passen alleen de
  *aanspreekvorm* aan, niet de cijfers naar huishoudtotalen — dat zou inconsistent
  zijn met de rest van het scherm. Genoteerd als bekende grens; eventuele
  perspectief-bewuste data is een latere, aparte stap.
- **Geen persistentie van "wat is getoond".** Anti-herhaling werkt via
  deterministische rotatie op maand-index, dus geen migratie nodig.

## Architectuur

### Pure engine-module

Nieuw bestand **`lib/checkin/gespreksstarters.ts`** — pure functies, geen
Supabase, geen I/O. Spiegelt de zustermodule `lib/aandachtspunten.ts` (de andere
helft van de check-in, die al pure + getest is).

```ts
export function buildGespreksstarters(
  input: GespreksstartersInput,
): GesprekStarterData[]
```

`GesprekStarterData` blijft canoniek in `lib/checkin-types.ts` (geen vierde
duplicaat aanmaken). De engine importeert dat type.

`route.ts` wordt **dun**:

1. Data ophalen (bestaande queries + enkele nieuwe, zie Dataflow).
2. `loadPerspectiveContext(supabase)` → `hasHousehold`, `partnerName`.
3. `GespreksstartersInput` samenstellen.
4. `buildGespreksstarters(input)` aanroepen.
5. JSON terug (`{ starters }`).

### Dataflow & input

```ts
export interface GespreksstartersInput {
  // Aanspreekvorm
  audience: 'solo' | 'household'
  partnerName: string | null

  // Rotatie — absolute maandteller (year*12 + month), schuift elke maand door
  monthIndex: number

  // Kernfeiten (grotendeels reeds in de route berekend)
  netWorth: number
  netWorthTrend: number          // laatste snapshot − vorige snapshot
  prevNetWorth: number
  monthlyIncome: number
  monthlyExpenses: number
  prevMonthIncome: number
  prevMonthExpenses: number
  monthlySavings: number
  prevMonthlySavings: number
  savingsRate6m: number          // bestaande 6m-spaarquote
  dailyExpenses: number

  goals: Array<{
    name: string; current: number; target: number;
    completed: boolean; targetDate: string | null
  }>
  totalDebts: number
  debtCount: number
  completedActionsThisMonth: number
  completedActionsFreedomDays: number
  pendingActionsCount: number

  // Nieuwe signalen voor de uitgebreide regelset
  fireAge: number | null
  prevFireAge: number | null               // uit vorige snapshot metrics.fireAge
  savingsRate6mPrev: number | null         // 6m-spaarquote van de voorgaande periode
  expensesByCategory: Array<{ name: string; amount: number; prevAmount: number; limit: number | null }>
  newRecurring: Array<{ name: string; monthlyAmount: number }>   // nieuw deze maand
  topAsset: { name: string; value: number } | null               // grootste bezitting
}
```

Hergebruik van bestaande patronen voor de nieuwe signalen:

- `expensesByCategory` — zelfde groepering als in
  `app/api/checkin/aandachtspunten/route.ts` (categorie-uitgaven huidige vs vorige
  maand). Bij voorkeur die afleiding delen i.p.v. herimplementeren.
- `newRecurring` — terugkerende tegenpartijen zoals in
  `app/api/checkin/upcoming/route.ts` (count ≥ 2 over de afgelopen maanden), maar
  gefilterd op tegenpartijen die in voorgaande maanden níét voorkwamen.
- `fireAge` — de SWR-formule staat nu **inline** in de overview-route
  (`app/api/checkin/overview/route.ts:112-143`) en is gedupliceerd in de
  regressietest. **DRY-actie:** extraheer een gedeelde helper
  (`lib/checkin/fire-age.ts` of hergebruik `computeFireProjection` uit
  `lib/horizon-data.ts`) en gebruik die in zowel overview als gespreksstarters.
  `prevFireAge` komt uit `metrics.fireAge` van de vorige snapshot.
- `topAsset` — grootste actieve asset op `current_value`.

### Aanspreekvorm-laag (`Voice`)

Eén `Voice`-object, opgebouwd uit `audience`. Nederlands vervoegt werkwoorden
(*jullie hebben* ↔ *je hebt*, *jullie willen* ↔ *je wilt*, *voelen jullie je* ↔
*voel je je*), dus platte placeholder-vervanging volstaat niet. `Voice` levert
**vooraf-vervoegde bouwstenen** die elke template één keer samenstelt — geen
dubbel auteuren van teksten.

```ts
interface Voice {
  audience: 'solo' | 'household'
  subj: string      // 'jullie' | 'je'
  subjCap: string   // 'Jullie' | 'Je'
  poss: string      // 'jullie' | 'je'     → "{poss} vermogen"
  hebt: string      // 'hebben' | 'hebt'
  wilt: string      // 'willen' | 'wilt'
  zijn: string      // 'zijn'   | 'bent'
  voelt: string     // 'voelen jullie je' | 'voel je je'
  samen: string     // 'samen'  | 'voor jezelf'
}
```

Een template ziet er dan zo uit (één definitie, beide doelgroepen correct):

```ts
(v) => `${v.subjCap} ${v.poss} vermogen is gegroeid met ${eur} — dat ${v.zijn} ${days} extra vrijheidsdagen. Welke schuld ${v.wilt} ${v.subj} het eerste aanpakken?`
```

Een test bewaakt dat er **geen "jullie"/"jullie"-vormen in solo-output lekken**.

## Variatie, regelset & selectie

### Kandidaat-model

Elke detector levert (bij trigger) een kandidaat i.p.v. een kant-en-klare zin:

```ts
interface StarterCandidate {
  id: string                         // stabiel onderwerp-id, bv. 'vermogen-groei'
  theme: StarterTheme                // vermogen | sparen | uitgaven | doelen |
                                     // schulden | acties | fire | algemeen
  sentiment: 'positive' | 'neutral' | 'alert'
  score: number                      // relevantie, 0..100
  variants: Array<(v: Voice) => {
    vraag: string; actie: string; context: string; vrijheidstijd?: string
  }>
}
```

### 1. Variatiepools + rotatie

Elk onderwerp heeft **3-4 formuleringen**. De engine kiest
`variants[monthIndex % variants.length]`. Zelfde situatie → andere zin per maand.
Volledig deterministisch, geen opslag. `monthIndex` is absoluut (`year*12+month`),
dus de rotatie stopt niet aan een jaargrens.

### 2. Uitgebreide regelset (7 → ~14 onderwerpen)

**Behouden (nu met variatiepools):**

| ID-groep | Trigger (ongewijzigd) |
|---|---|
| `vermogen-groei` / `-daling` | `netWorthTrend` ≠ 0 (laatste 2 snapshots) |
| `sparen-stijging` / `-daling` / `negatief-sparen` | besparing deze vs vorige maand (±€50); of negatief sparen |
| `uitgaven-stijging` / `-daling` | > +15% / < −10% vs vorige maand |
| `doel-bijna` / `doel-start` | dichtstbijzijnde doel ≥50–<100% / <20% |
| `schulden-vrijheid` | totale schuld > 0 |
| `acties-momentum` / `-openstaand` | acties afgerond deze maand / openstaand |
| `sparen-vrijheid` | maandelijks gespaard > €100 |

**Nieuw (~7 onderwerpen):**

| Nieuw ID | Trigger | Framing |
|---|---|---|
| `fire-versnelling` / `-vertraging` | `fireAge` vs `prevFireAge`, ≥1 jaar verschil | "X jaar dichter bij volledige vrijheid" |
| `spaarquote-trend` | `savingsRate6m` passeert drempel (bv. 20%) of vs `savingsRate6mPrev` | spaarquote-as-momentum |
| `budgetcategorie-uitschieter` | grootste categorie-overschrijding uit `expensesByCategory` | reflectief (niet alarm — dat is `aandachtspunten`) |
| `nieuwe-vaste-last` | nieuwe terugkerende tegenpartij in `newRecurring` | "nieuwe vaste last = N vrijheidsdagen/jaar — bewust?" |
| `doel-deadline` | actief doel, deadline < 60 dagen én < 75% | urgentie-reflectie |
| `vermogensconcentratie` | `topAsset.value` > ~60% van `netWorth` | "voelt die concentratie comfortabel?" |
| `mijlpaal-nadering` | `netWorth` dicht bij volgende ronde mijlpaal | eigen ronde-getal-math in de engine (NIET `natural-milestones`, dat zijn tijdlijn-momenten) |

Drempels zijn richtinggevend; exacte waarden worden in het implementatieplan
vastgelegd en getest.

### 3. Relevantie-scoring (vervangt `slice(5)`)

- Elke kandidaat krijgt een **score op magnitude**: omvang in vrijheidsdagen,
  %-verandering, of urgentie (dagen-tot-deadline). Alerts krijgen een
  basisverhoging zodat échte problemen bovenaan kunnen komen i.p.v. door de
  sentiment-sortering onderaan te zinken.
- **Diversiteit-bewuste top-N:** sorteer op score, maar neem **max ~2 per
  `theme`**, zodat de gebruiker niet 5× een spaar-vraag krijgt.
- **Min 2** gegarandeerd via een geroteerde fallback-pool
  (`algemeen-dromen` / `algemeen-waarden`, ook met variatie). **Max 5.**

## Bestanden

| Bestand | Wijziging |
|---|---|
| `lib/checkin/gespreksstarters.ts` | **Nieuw** — pure engine + `Voice` + detectoren + scoring |
| `lib/checkin/fire-age.ts` (of hergebruik horizon-data) | **Nieuw/gedeeld** — FIRE-leeftijd-helper (DRY) |
| `app/api/checkin/gespreksstarters/route.ts` | **Dun** — data ophalen + perspectief + engine aanroepen |
| `app/api/checkin/overview/route.ts` | FIRE-leeftijd via gedeelde helper (verwijder inline duplicaat) |
| `lib/checkin/gespreksstarters.test.ts` | **Nieuw** — unit-tests engine |
| `lib/regression-tests/suites/checkin-flow.ts` | Importeer onderwerp-id-registry uit engine; voeg voice-contract-check toe |
| `app/(app)/core/checkin/page.tsx` | Geen functionele wijziging (consumeert dezelfde `GesprekStarterData[]`); evt. kleine copy |

## Teststrategie

**`lib/checkin/gespreksstarters.test.ts`:**

- Drempels per detector (trigger aan/uit rond de grens).
- Scoring + diversiteit-cap (max ~2 per theme; alert kan top-5 halen).
- `min 2` / `max 5`.
- **Rotatie-determinisme:** zelfde input + `monthIndex` → identieke output;
  ander `monthIndex` → andere variant; `variants[i % n]`-correctheid.
- **Aanspreekvorm:** solo-output bevat geen "jullie"; werkwoordvormen kloppen
  ("je hebt"/"jullie hebben"); huishouden-output gebruikt "jullie".

**`lib/regression-tests/suites/checkin-flow.ts`:**

- Vervang de hardgecodeerde 15-ID-lijst door import van de engine-registry
  (test wordt zo betekenisvol i.p.v. stale).
- Voice-contract: solo vs household.

**Verificatie voor "klaar":** `npx tsc --noEmit` + de twee vitest-paden groen.

## Filosofie-afstemming

De vrijheidstijd-framing (vrijheidsdagen) blijft het hart van elke vraag; nieuwe
regels gebruiken dezelfde `freedomDays`/`freedomLabel`-helpers waar bedragen
voorkomen. "Geld is opgeslagen tijd" blijft consistent doorklinken.

## Open punten voor het implementatieplan

- Exacte drempels en scoregewichten per detector.
- Precieze definitie "nieuwe" terugkerende tegenpartij (vanaf welk venster geldt
  iets als nieuw?).
- Mijlpaal-stappen (€10k/€25k/€100k-grenzen) en "dichtbij"-marge.
- Wel/niet de FIRE-helper extraheren naar een nieuw bestand vs `computeFireProjection` hergebruiken.
