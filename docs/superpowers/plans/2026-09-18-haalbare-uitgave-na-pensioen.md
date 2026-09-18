# Haalbare uitgave na pensioen — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toon op /toekomst het bedrag waarbij het plan precies tot de eindleeftijd reikt — als gekleurde regel in de KPI-tegel "Na pensioen" én als vierde draaiknop in de vrijheidsas, beide uit dezelfde bron.

**Architecture:** Eén nieuwe kernel-afgeleide (`solveHaalbareUitgave`) bisecteert op een gepatchte profielrij (`retirement_expense_method: 'custom_amount'`) en reist mee in de bestaande scenario-batch, zodat er één worker-oversteek bij komt in plaats van een bisectie per oppervlak. De draaiknop gebruikt hetzelfde patch-mechanisme via een derde veld op `HorizonScenarioOverrides` — geen nieuw event, geen nieuwe `SliderKey`.

**Tech Stack:** TypeScript, Next.js 16 / React 19, Vitest, de horizon-kernel (`lib/horizon-kernel/**`).

**Spec:** `docs/superpowers/specs/2026-09-18-haalbare-uitgave-na-pensioen-design.md`

## Global Constraints

- **Vitest draait via de PowerShell-tool, niet via de Bash-tool.** Onder Git Bash faalt élke suite in deze repo met `Vitest failed to find the current suite` — een omgevingsgebonden vals-negatief, geen regressie. `npx tsc --noEmit` mag in beide shells. `--reporter=basic` bestaat niet in vitest 4.x.
- **Schrijf bronbestanden nooit met PowerShell `Set-Content`/`Out-File`** — dat mangelt é, —, ± tot mojibake. Gebruik de Edit/Write-tool.
- **Consume, don't recompute.** Geen tweede definitie van "gedekt", geen eigen som in de UI. Het dekkings-oordeel is `SolveFireResult.status`.
- **Kleur:** uitsluitend `text-negative` / `text-positive`. Nooit `red-*`/`emerald-*`/`green-*` of een losse hex voor deze regel.
- **Koppen:** geen `<h1>` in `app/(app)/**` of `components/**`.
- **Euro-weergave:** dit bedrag is een **nominaal jaar-0-jaarbedrag**, net als het bedrag erboven in dezelfde tegel. Niet deflateren, geen eigen `Math.pow` (ADR 0090/0093).
- **Drempel:** `HAALBARE_UITGAVE_DREMPEL = 250` (€/jaar) — één constante, nergens herhaald.
- **Bisectie-precisie:** € 50/jaar. **Sliderstap:** € 600/jaar (= € 50/mnd). **Bovengrens:** 3 × de huidige uitgave.
- **`formatCurrency` gebruikt een NON-BREAKING SPACE** (U+00A0) tussen € en het bedrag: `formatCurrency(2500) === '€ 2.500'`. Hardcodeer die string dus NOOIT met een gewone spatie in een assertie — bouw de verwachting met `formatCurrency(...)` zelf, of gebruik `\s` in een regex (dat matcht U+00A0 wél). Geverifieerd 19 sep 2026.
- **Commit-attributie:** elke commit eindigt op `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Stage per pad**, nooit `git add -A` (parallelle sessies delen deze werkboom). Nooit `git stash` / `git checkout --` / `git reset` / `git clean`.

---

### Task 1: De rekenmotor — `solveHaalbareUitgave`

**Files:**
- Create: `lib/horizon/haalbare-uitgave.ts`
- Test: `lib/horizon/haalbare-uitgave.test.ts`

**Interfaces:**
- Consumes: `buildKernelInputFromApp`, `KernelAdapterPartner` (`@/lib/horizon-kernel/adapter`); `solveFire`, `SolverStatus` (`@/lib/horizon-kernel/solver`); `buildConvergentieAdapterProfile`, `ConvergentieRawProfileRow` (`@/lib/horizon-kernel/convergentie-router`).
- Produces:
  ```ts
  export interface HaalbareUitgave {
    readonly perJaar: number
    readonly eindleeftijd: number
    readonly huidigPerJaar: number
    readonly richting: 'minder' | 'meer' | 'gelijk'
  }
  export interface HaalbareUitgaveContext {
    profile: ConvergentieRawProfileRow
    assets: readonly Asset[]
    debts: readonly Debt[]
    lifeEvents: readonly LifeEvent[]
    aowRows?: readonly AowLeeftijdRow[]
    partner?: KernelAdapterPartner
  }
  export const HAALBARE_UITGAVE_DREMPEL = 250
  export function solveHaalbareUitgave(ctx: HaalbareUitgaveContext): HaalbareUitgave | null
  ```

- [ ] **Step 1: Schrijf de falende test**

Maak `lib/horizon/haalbare-uitgave.test.ts`. De fixture-helpers komen uit de persona-fixture die `lab-antwoorden.kernel.test.ts` al gebruikt.

**Test-ontwerp — lees dit vóór je schrijft.** Assert **relaties**, geen magische bedragen. Het exacte bedrag hangt aan de persona-fixture en zou de test rood maken bij elke onschuldige fixture-tweak. Wat we vastpinnen is de *eigenschap*: het gevonden bedrag ís dekkend, en € 600 hoger is dat niet.

```ts
import { describe, it, expect } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildKernelInputFromApp } from '@/lib/horizon-kernel/adapter'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { solveHaalbareUitgave, HAALBARE_UITGAVE_DREMPEL } from './haalbare-uitgave'

const SHORTFALL = new Set(['anchor_shortfall', 'stop_now_shortfall', 'pension_shortfall'])

/** Context op de persona "compleet": leeftijd, vast stopmoment, jaarlijkse pensioenuitgave. */
function ctx(age: number, stop: number | null, essentieel: number) {
  const fx = buildCompleetHorizonFixture(age)
  const profile: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(age),
    yearly_essential_expenses: essentieel,
    retirement_expense_method: 'essential_budgets',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    housing_strategy_config: { mode: 'include_full' },
    ...(stop == null
      ? { fire_stop_anchor: 'solved' as const }
      : { fire_stop_anchor: 'age' as const, fire_stop_age: stop }),
  }
  return { profile, assets: fx.assets, debts: fx.debts, lifeEvents: fx.lifeEvents, aowRows: [] }
}

/** Draait de kern met een vaste uitgave na pensioen en zegt of het plan dekt. */
function dektBij(c: ReturnType<typeof ctx>, bedrag: number): boolean {
  const input = buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({
      ...c.profile,
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: bedrag,
    }),
    assets: c.assets,
    debts: c.debts,
    lifeEvents: c.lifeEvents,
    aowRows: c.aowRows,
  })
  return !SHORTFALL.has(solveFire(input).status)
}

describe('solveHaalbareUitgave', () => {
  it('vindt bij een tekort een LAGERE uitgave die wel dekt, en € 600 hoger dekt niet', () => {
    // Stoppen op 50 met € 100.000/jr pensioenuitgave is voor deze persona een tekort
    // (gemeten 15 sep 2026 in lab-antwoorden.kernel.test.ts: 77,1% dekking).
    const c = ctx(42, 50, 100_000)
    const h = solveHaalbareUitgave(c)
    expect(h).not.toBeNull()
    expect(h!.richting).toBe('minder')
    expect(h!.perJaar).toBeLessThan(h!.huidigPerJaar)
    expect(h!.eindleeftijd).toBe(90)
    // De eigenschap die het getal draagt — geen magisch bedrag.
    expect(dektBij(c, h!.perJaar)).toBe(true)
    expect(dektBij(c, h!.perJaar + 600)).toBe(false)
  })

  it('vindt bij een overschot een HOGERE uitgave', () => {
    // Ruim doorwerken met een lage pensioenuitgave ⇒ er blijft over.
    const c = ctx(42, 62, 24_000)
    const h = solveHaalbareUitgave(c)
    expect(h).not.toBeNull()
    expect(h!.richting).toBe('meer')
    expect(h!.perJaar).toBeGreaterThan(h!.huidigPerJaar)
    expect(dektBij(c, h!.perJaar)).toBe(true)
  })

  it('geeft null zonder vast stopmoment', () => {
    expect(solveHaalbareUitgave(ctx(42, null, 100_000))).toBeNull()
  })

  it('geeft null wanneer het plan ook zonder pensioenuitgaven niet dekt', () => {
    // Stoppen op de huidige leeftijd: het tekort zit vóór het stopmoment, niet erna.
    const c = ctx(42, 42, 100_000)
    const h = solveHaalbareUitgave(c)
    if (h !== null) expect(dektBij(c, 0)).toBe(true) // anders had hij null moeten geven
  })

  it('noemt een verschil onder de drempel "gelijk"', () => {
    const c = ctx(42, 50, 100_000)
    const h = solveHaalbareUitgave(c)!
    // Zet de huidige uitgave gelijk aan het gevonden bedrag: dan is het verschil ~0.
    const gelijk = solveHaalbareUitgave({
      ...c,
      profile: {
        ...c.profile,
        retirement_expense_method: 'custom_amount',
        retirement_expense_custom_amount: h.perJaar,
      },
    })!
    expect(Math.abs(gelijk.perJaar - gelijk.huidigPerJaar)).toBeLessThan(HAALBARE_UITGAVE_DREMPEL)
    expect(gelijk.richting).toBe('gelijk')
  })
})
```

- [ ] **Step 2: Draai de test en zie hem falen**

Draai (PowerShell-tool):
```
npx vitest run lib/horizon/haalbare-uitgave.test.ts
```
Verwacht: FAIL — `Failed to resolve import "./haalbare-uitgave"`.

- [ ] **Step 3: Schrijf de implementatie**

Maak `lib/horizon/haalbare-uitgave.ts`:

```ts
// lib/horizon/haalbare-uitgave.ts
//
// DE HAALBARE UITGAVE NA PENSIOEN (spec 2026-09-18, ADR 0160)
// ───────────────────────────────────────────────────────────────────────────
// Onder een VAST stopmoment is de vraag niet "wanneer kan ik stoppen?" maar "reikt mijn
// geld tot mijn eindleeftijd?". Deze module beantwoordt de omgekeerde vraag: bij wélke
// uitgave na pensioen reikt het precies tot daar. Minder dan je nu rekent bij een tekort,
// méér bij een overschot.
//
// WAAROM EEN GEPATCHTE PROFIELRIJ EN NIET ÉÉN VELD OP DE KernelInput:
// `buildInkomenUitgaven` leidt bij actieve flex-spending óók `flexNiceFractiePerJaar` af
// uit `uitgaveNaPensioenPerJaar` (`deriveNiceFractie`). Alleen dat ene veld overschrijven
// laat de nice-fractie op de oude stand staan en trekt daarmee de must/nice-split stil
// scheef. Door per iteratie de KernelInput te herbouwen uit een profielrij met
// `retirement_expense_method: 'custom_amount'` herleidt de adapter alles consistent — en
// het is exact hetzelfde mechanisme als de draaiknop "Uitgave na pensioen", dus het
// beloofde getal en wat de slider doorrekent zijn dezelfde run.
//
// "GEDEKT" IS DE KERNEL Z'N EIGEN OORDEEL: we lezen `SolveFireResult.status` en herhalen
// de formule uit `computeStatusBlok` (`tekortLening > 0 ∥ gap < 0 ∥ doelbedrag < 0`) niet.

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildKernelInputFromApp, type KernelAdapterPartner } from '@/lib/horizon-kernel/adapter'
import { solveFire, type SolverStatus } from '@/lib/horizon-kernel/solver'

/** De drie statussen die de kern onder een vast anker zet bij een tekort. */
const SHORTFALL: ReadonlySet<SolverStatus> = new Set<SolverStatus>([
  'anchor_shortfall',
  'stop_now_shortfall',
  'pension_shortfall',
])

/** Bisectie-precisie in €/jaar — fijner dan de sliderstap, zodat het antwoord niet op de stap afrondt. */
const PRECISIE = 50
/** Bovengrens van de zoekruimte: 3 × wat je nu rekent. Daarboven klemmen we. */
const BOVENGRENS_FACTOR = 3
/** Eén stap van de draaiknop (€ 50/mnd) — de afstand waarop de vangrail toetst. */
const SLIDER_STAP = 600

/**
 * Verschil waaronder we geen richting meer claimen. Gespiegeld aan de € 500-regel van de
 * eindvermogen-badge (ADR 0145 M5): zonder drempel toont een plan dat feitelijk klopt een
 * rode of groene regel over een paar euro per jaar.
 */
export const HAALBARE_UITGAVE_DREMPEL = 250

export interface HaalbareUitgave {
  /** €/jaar waarbij het plan precies tot de eindleeftijd reikt (nominaal, jaar-0-euro's). */
  readonly perJaar: number
  /** De eindleeftijd waartegen gesolved is — de eind-vorm van het plan. */
  readonly eindleeftijd: number
  /** De uitgave na pensioen waarmee het plan vandaag rekent. */
  readonly huidigPerJaar: number
  /** Richting t.o.v. `huidigPerJaar`, ná de drempel. */
  readonly richting: 'minder' | 'meer' | 'gelijk'
}

export interface HaalbareUitgaveContext {
  profile: ConvergentieRawProfileRow
  assets: readonly Asset[]
  debts: readonly Debt[]
  lifeEvents: readonly LifeEvent[]
  aowRows?: readonly AowLeeftijdRow[]
  /** TPR-07 — partnerblok van de hoofdrun (huishoudperspectief); afwezig ⇒ solo. */
  partner?: KernelAdapterPartner
}

/** De KernelInput van deze context, met (optioneel) een afgedwongen uitgave na pensioen. */
function inputMet(ctx: HaalbareUitgaveContext, bedrag: number | null) {
  const profile =
    bedrag == null
      ? ctx.profile
      : {
          ...ctx.profile,
          retirement_expense_method: 'custom_amount',
          retirement_expense_custom_amount: bedrag,
        }
  return buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile(profile),
    assets: ctx.assets,
    debts: ctx.debts,
    lifeEvents: ctx.lifeEvents,
    aowRows: ctx.aowRows,
    ...(ctx.partner ? { partner: ctx.partner } : {}),
  })
}

/** Dekt het plan tot de eindleeftijd bij deze uitgave? Plus de eindleeftijd van die run. */
function dekking(ctx: HaalbareUitgaveContext, bedrag: number): { ok: boolean; eindleeftijd: number } {
  const solve = solveFire(inputMet(ctx, bedrag))
  return { ok: !SHORTFALL.has(solve.status), eindleeftijd: solve.eindleeftijd }
}

function maak(perJaar: number, huidigPerJaar: number, eindleeftijd: number): HaalbareUitgave {
  const delta = perJaar - huidigPerJaar
  const richting =
    Math.abs(delta) < HAALBARE_UITGAVE_DREMPEL ? 'gelijk' : delta < 0 ? 'minder' : 'meer'
  return { perJaar, eindleeftijd, huidigPerJaar, richting }
}

/**
 * De uitgave na pensioen (€/jaar) waarbij het plan precies tot de eindleeftijd reikt.
 *
 * `null` wanneer de vraag niet gesteld kan worden: geen vast stopmoment (dan ís de
 * hoofdrun het antwoord), geen uitgave-grondslag, een tekort dat al vóór het stopmoment
 * zit (ook € 0 uitgeven dekt niet — daar helpen alleen de bestaande drie hefbomen), of
 * een kern-fout. Zelfde degradatie als `solveWithoutAnchor`: liever geen getal dan een
 * getal dat niet klopt.
 *
 * KOSTEN: ~14 geankerde runs. Onder een vast anker kórtsluit `solveFire` (geen binnenste
 * bisectie), dus dit is een fractie van wat de scenario-batch toch al doet — en het
 * draait in diezelfde ene worker-oversteek (ADR 0129 D7).
 */
export function solveHaalbareUitgave(ctx: HaalbareUitgaveContext): HaalbareUitgave | null {
  try {
    const basis = inputMet(ctx, null)
    if (basis.stopAnker === undefined) return null
    const huidig = basis.inkomenUitgaven.uitgaveNaPensioenPerJaar
    if (!Number.isFinite(huidig) || huidig <= 0) return null

    // Ondergrens van de zoekruimte. Dekt zelfs € 0 niet, dan zit het tekort vóór het
    // stopmoment en is de uitgave na pensioen niet de knop die het oplost.
    const nul = dekking(ctx, 0)
    if (!nul.ok) return null
    const eindleeftijd = nul.eindleeftijd

    // Bovengrens. Dekt 3× ook nog, dan klemmen we daar — de slider-tekst meldt dat het
    // bedrag boven het bereik ligt; de regel doet geen belofte over de klem.
    const hoogBedrag = huidig * BOVENGRENS_FACTOR
    if (dekking(ctx, hoogBedrag).ok) return maak(Math.floor(hoogBedrag), huidig, eindleeftijd)

    let laag = 0
    let hoog = hoogBedrag
    while (hoog - laag > PRECISIE) {
      const mid = (laag + hoog) / 2
      if (dekking(ctx, mid).ok) laag = mid
      else hoog = mid
    }
    const gevonden = Math.floor(laag)

    // Monotonie-vangrail. De dekking hóórt monotoon af te nemen in de uitgave; is dat
    // door een discontinuïteit (woningverkoop, potregel) niet zo, dan zegt dit getal
    // niets. Eén extra run, precies de eigenschap die we beloven: één sliderstap hoger
    // dekt niet meer.
    if (dekking(ctx, gevonden + SLIDER_STAP).ok) return null

    return maak(gevonden, huidig, eindleeftijd)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Draai de test tot hij groen is**

Draai (PowerShell-tool):
```
npx vitest run lib/horizon/haalbare-uitgave.test.ts
```
Verwacht: PASS (5 tests).

Faalt de overschot-test omdat de gekozen fixture-stand tóch een tekort is: pas de fixture-parameters aan (later stoppen, lagere `yearly_essential_expenses`) tot je een dekkende stand hebt — **niet** de assertie.

- [ ] **Step 5: Typecheck**

Draai: `npx tsc --noEmit`
Verwacht: geen fouten.

- [ ] **Step 6: Commit**

```bash
git add lib/horizon/haalbare-uitgave.ts lib/horizon/haalbare-uitgave.test.ts
git commit -m "feat(horizon): solve de haalbare uitgave na pensioen

Bisecteert op een gepatchte profielrij (retirement_expense_method =
custom_amount) tot de kern het plan precies tot de eindleeftijd laat reiken.
Gedekt = SolveFireResult.status, geen tweede definitie.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Het getal reist mee in de scenario-batch

**Files:**
- Modify: `lib/horizon/scenario-presets.ts` (`ScenarioPresetBatch`, `runScenarioPresetBatch`)
- Modify: `lib/horizon-kernel/worker/run-in-worker.ts` (`runScenarioPresetsAsync`, de fout-terugval)
- Test: `lib/horizon/scenario-presets.haalbare-uitgave.test.ts`

**Interfaces:**
- Consumes: `solveHaalbareUitgave`, `HaalbareUitgave` (Task 1).
- Produces: `ScenarioPresetBatch.haalbareUitgave: HaalbareUitgave | null`.

- [ ] **Step 1: Schrijf de falende test**

Maak `lib/horizon/scenario-presets.haalbare-uitgave.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import { runScenarioPresetBatch, type ScenarioPresetContext } from './scenario-presets'
import { solveHaalbareUitgave } from './haalbare-uitgave'

function batchCtx(age: number, stop: number | null): ScenarioPresetContext {
  const fx = buildCompleetHorizonFixture(age)
  const profile: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(age),
    yearly_essential_expenses: 100_000,
    retirement_expense_method: 'essential_budgets',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    housing_strategy_config: { mode: 'include_full' },
    ...(stop == null
      ? { fire_stop_anchor: 'solved' as const }
      : { fire_stop_anchor: 'age' as const, fire_stop_age: stop }),
  }
  return {
    profile,
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
    yearlyExpenses: 30_000,
    currentAge: age,
    verwachtFireAge: null,
    fireEndAge: 90,
    hasEigenHuis: true,
    downsizeStrategyActief: false,
  }
}

describe('runScenarioPresetBatch — haalbare uitgave', () => {
  it('draagt hetzelfde getal als de losse solve', () => {
    const ctx = batchCtx(42, 50)
    const batch = runScenarioPresetBatch(ctx)
    expect(batch.haalbareUitgave).not.toBeNull()
    expect(batch.haalbareUitgave).toEqual(solveHaalbareUitgave(ctx))
  })

  it('is null zonder vast stopmoment', () => {
    expect(runScenarioPresetBatch(batchCtx(42, null)).haalbareUitgave).toBeNull()
  })
})
```

- [ ] **Step 2: Draai de test en zie hem falen**

```
npx vitest run lib/horizon/scenario-presets.haalbare-uitgave.test.ts
```
Verwacht: FAIL — `haalbareUitgave` bestaat niet op `ScenarioPresetBatch`.

- [ ] **Step 3: Breid de batch uit**

In `lib/horizon/scenario-presets.ts`, bij de imports:

```ts
import { solveHaalbareUitgave, type HaalbareUitgave } from '@/lib/horizon/haalbare-uitgave'
```

In `ScenarioPresetBatch`, ná `solvedFireEndAge`:

```ts
  /**
   * De uitgave na pensioen waarbij het plan precies tot de eindleeftijd reikt (spec
   * 2026-09-18). `null` onder `solved`, zonder uitgave-grondslag of bij een tekort dat
   * al vóór het stopmoment zit. Meereizend in DEZE batch om dezelfde reden als
   * `solvedFireAge` (ADR 0129 D7): anders start elk oppervlak zijn eigen bisectie.
   */
  readonly haalbareUitgave: HaalbareUitgave | null
```

In `runScenarioPresetBatch`:

```ts
export function runScenarioPresetBatch(ctx: ScenarioPresetContext): ScenarioPresetBatch {
  const solved = solveWithoutAnchor(ctx)
  return {
    presets: runScenarioPresets(ctx),
    solvedFireAge: solved?.fireAge ?? null,
    solvedFireEndAge: solved?.eindleeftijd ?? null,
    haalbareUitgave: solveHaalbareUitgave(ctx),
  }
}
```

- [ ] **Step 4: Repareer de worker-terugval**

In `lib/horizon-kernel/worker/run-in-worker.ts`, in `runScenarioPresetsAsync`, wordt

```ts
  return { presets: [], solvedFireAge: null, solvedFireEndAge: null }
```

dit:

```ts
  return { presets: [], solvedFireAge: null, solvedFireEndAge: null, haalbareUitgave: null }
```

- [ ] **Step 5: Draai test + typecheck**

```
npx vitest run lib/horizon/scenario-presets.haalbare-uitgave.test.ts
npx tsc --noEmit
```
Verwacht: PASS en geen typefouten. `tsc` wijst je naar elke andere plek die een `ScenarioPresetBatch` letterlijk samenstelt (test-stubs incluis) — vul daar `haalbareUitgave: null` in.

- [ ] **Step 6: Commit**

```bash
git add lib/horizon/scenario-presets.ts lib/horizon-kernel/worker/run-in-worker.ts lib/horizon/scenario-presets.haalbare-uitgave.test.ts
git commit -m "feat(horizon): haalbare uitgave reist mee in de scenario-batch

Een worker-oversteek, zelfde reden als solvedFireAge (ADR 0129 D7).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: De woorden — kopij in `anker-copy.ts`

**Files:**
- Modify: `lib/horizon/anker-copy.ts`
- Test: `lib/horizon/anker-copy.test.ts` (uitbreiden)

**Interfaces:**
- Consumes: `HaalbareUitgave` (Task 1).
- Produces:
  ```ts
  HEFBOOM_COPY.uitgaveNaPensioen // 'Uitgave na pensioen'
  export function haalbaarBijUitgaveRegel(h: HaalbareUitgave, masked?: boolean): string | null
  export function antwoordUitgaveNaPensioen(perJaar: number, masked?: boolean): string
  ```

- [ ] **Step 1: Schrijf de falende tests**

Voeg onderaan `lib/horizon/anker-copy.test.ts` een nieuw `describe`-blok toe, vul de bestaande `import`-regel aan met `haalbaarBijUitgaveRegel` en `antwoordUitgaveNaPensioen`, en importeer `formatCurrency` uit `@/lib/format` (zie de global constraint over de non-breaking space):

```ts
describe('haalbare uitgave na pensioen — kopij', () => {
  const basis = { perJaar: 31_200, eindleeftijd: 90, huidigPerJaar: 38_640 } as const

  it('noemt de doelleeftijd en het bedrag', () => {
    expect(haalbaarBijUitgaveRegel({ ...basis, richting: 'minder' }))
      .toBe(`haalbaar tot 90 bij uitgave: ${formatCurrency(31_200)}`)
  })

  it('zwijgt wanneer het verschil onder de drempel ligt', () => {
    expect(haalbaarBijUitgaveRegel({ ...basis, richting: 'gelijk' })).toBeNull()
  })

  it('maskeert het bedrag in de privacy-weergave', () => {
    const zin = haalbaarBijUitgaveRegel({ ...basis, richting: 'meer' }, true)
    expect(zin).toContain('haalbaar tot 90 bij uitgave:')
    expect(zin).not.toMatch(/31\.200/)
  })

  it('claimt in het antwoord geen dekking, alleen dat het erbij hoort', () => {
    const zin = antwoordUitgaveNaPensioen(31_200)
    expect(zin).toBe(`Zo'n ${formatCurrency(31_200)} per jaar uitgeven hoort bij een gedekt plan.`)
    // "dekt je plan" is voorbehouden aan het doorwerken-antwoord (eindreview I2).
    expect(zin).not.toMatch(/dekt je plan/)
  })

  it('kent de hefboomnaam', () => {
    expect(HEFBOOM_COPY.uitgaveNaPensioen).toBe('Uitgave na pensioen')
  })
})
```

- [ ] **Step 2: Draai de test en zie hem falen**

```
npx vitest run lib/horizon/anker-copy.test.ts
```
Verwacht: FAIL — de functies bestaan niet.

- [ ] **Step 3: Schrijf de kopij**

In `lib/horizon/anker-copy.ts`, bij `HEFBOOM_COPY`:

```ts
export const HEFBOOM_COPY = {
  meerSalaris: 'Meer salaris',
  spaarquote: 'Spaarquote',
  minderWerken: 'Minder werken',
  uitgaveNaPensioen: 'Uitgave na pensioen',
  laterEerder: 'Later of eerder stoppen',
} as const
```

En bij de andere antwoord-zinnen (`antwoordMeerSalaris` / `antwoordMinderUitgeven`):

```ts
/**
 * De regel onder het bedrag in de KPI-tegel "Na pensioen": bij welke uitgave het plan
 * precies tot de eindleeftijd reikt. `null` bij `richting === 'gelijk'` — dan valt er
 * niets te melden en zou een rode of groene regel over een paar euro per jaar liegen.
 *
 * Het bedrag is een NOMINAAL jaar-0-jaarbedrag, net als het bedrag erboven in dezelfde
 * tegel: hier wordt niets gedeflateerd (ADR 0090/0093).
 */
export function haalbaarBijUitgaveRegel(h: HaalbareUitgave, masked = false): string | null {
  if (h.richting === 'gelijk') return null
  const bedrag = masked ? MASKED_AMOUNT_PLACEHOLDER : formatCurrency(Math.round(h.perJaar))
  return `haalbaar tot ${heroFireAgeYear(h.eindleeftijd)} bij uitgave: ${bedrag}`
}

/**
 * Antwoord 4 — de uitgave na pensioen als hefboom, onder zijn eigen knop.
 *
 * Toon: beschrijvend, geen instructie, en bewust NIET "dekt je plan" — die claim is
 * voorbehouden aan het doorwerken-antwoord, dat kernel-bewezen is (eindreview I2,
 * 15 sep 2026). Dit getal ís weliswaar gesolved, maar het staat naast een knop waarvan
 * het bereik geklemd kan zijn; dezelfde terughoudendheid als bij de €-regels.
 */
export function antwoordUitgaveNaPensioen(perJaar: number, masked = false): string {
  const bedrag = masked ? MASKED_AMOUNT_PLACEHOLDER : formatCurrency(Math.round(perJaar))
  return `Zo'n ${bedrag} per jaar uitgeven hoort bij een gedekt plan.`
}
```

Voeg bovenaan toe: `import type { HaalbareUitgave } from './haalbare-uitgave'`. `formatCurrency`, `MASKED_AMOUNT_PLACEHOLDER` en `heroFireAgeYear` worden in dit bestand al gebruikt (door `antwoordMeerSalaris` resp. `antwoordDoorwerken`); importeer alleen wat nog ontbreekt.

- [ ] **Step 4: Draai de test tot groen**

```
npx vitest run lib/horizon/anker-copy.test.ts
```
Verwacht: PASS, inclusief de bestaande toon-invariant-tests in dit bestand. Wordt een bestaande invariant rood omdat hij over álle geëxporteerde zinnen loopt: lees wat hij eist en pas de **kopij** aan, niet de test.

- [ ] **Step 5: Commit**

```bash
git add lib/horizon/anker-copy.ts lib/horizon/anker-copy.test.ts
git commit -m "feat(horizon): kopij voor de haalbare uitgave na pensioen

Een home voor de tegelregel en het vierde antwoord, zodat de woorden niet kunnen
driften. Geen 'dekt je plan'-claim (eindreview I2).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Het vierde antwoord + het sliderbereik

**Files:**
- Modify: `lib/scenario-events.ts` (nieuwe range-helper)
- Modify: `lib/horizon/lab-antwoorden.ts`
- Test: `lib/scenario-events.uitgave-range.test.ts` (nieuw), `lib/horizon/lab-antwoorden.test.ts` (uitbreiden)

**Interfaces:**
- Consumes: `HaalbareUitgave` (Task 1); `antwoordUitgaveNaPensioen`, `HEFBOOM_COPY.uitgaveNaPensioen` (Task 3).
- Produces:
  ```ts
  // lib/scenario-events.ts
  export const UITGAVE_NA_PENSIOEN_STAP = 600
  export function uitgaveNaPensioenRange(basis: number, saved: number): { min: number; max: number }

  // lib/horizon/lab-antwoorden.ts
  // LabAntwoordActie krijgt: | { readonly kind: 'uitgave'; readonly perJaar: number }
  // LabAntwoord['kind'] krijgt: 'uitgave_na_pensioen'
  // LabAntwoordenInput krijgt: haalbareUitgave?: HaalbareUitgave | null
  // LabAntwoordenPerSlider krijgt: uitgave: SliderAntwoordItem | null
  ```

- [ ] **Step 1: Schrijf de falende tests**

Maak `lib/scenario-events.uitgave-range.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { uitgaveNaPensioenRange, UITGAVE_NA_PENSIOEN_STAP } from './scenario-events'

describe('uitgaveNaPensioenRange', () => {
  it('spant ±40% rond de basis, afgerond op de sliderstap', () => {
    const r = uitgaveNaPensioenRange(30_000, 30_000)
    expect(r.min).toBe(18_000) // 30.000 × 0,6
    expect(r.max).toBe(42_000) // 30.000 × 1,4
    expect(r.min % UITGAVE_NA_PENSIOEN_STAP).toBe(0)
    expect(r.max % UITGAVE_NA_PENSIOEN_STAP).toBe(0)
  })

  it('zakt nooit onder nul', () => {
    expect(uitgaveNaPensioenRange(0, 0).min).toBe(0)
  })

  it('verbreedt naar een opgeslagen waarde buiten de band (niets clampt)', () => {
    expect(uitgaveNaPensioenRange(30_000, 60_000).max).toBeGreaterThanOrEqual(60_000)
    expect(uitgaveNaPensioenRange(30_000, 6_000).min).toBeLessThanOrEqual(6_000)
  })
})
```

Voeg toe aan `lib/horizon/lab-antwoorden.test.ts`. Til daarvoor eerst de bestaande tekort-invoer van dat bestand op naar een `const tekortInput` op `describe`-niveau (pure verplaatsing, geen gedragswijziging), zodat de volgorde-test hem kan hergebruiken:

```ts
describe('vierde antwoord — uitgave na pensioen', () => {
  const hu = { perJaar: 31_200, eindleeftijd: 90, huidigPerJaar: 38_640, richting: 'minder' } as const
  const leeg = { dekking: null, solvedFireAge: null, planMaandHint: null, baseline: null }

  it('verschijnt ook zonder tekort (overschot: je mag meer uitgeven)', () => {
    const a = resolveLabAntwoorden({
      ...leeg,
      haalbareUitgave: { ...hu, richting: 'meer', perJaar: 44_000 },
    })
    expect(a).toHaveLength(1)
    expect(a[0].kind).toBe('uitgave_na_pensioen')
    expect(a[0].actie).toEqual({ kind: 'uitgave', perJaar: 44_000 })
  })

  it('verschijnt niet bij richting "gelijk"', () => {
    expect(resolveLabAntwoorden({ ...leeg, haalbareUitgave: { ...hu, richting: 'gelijk' } })).toHaveLength(0)
  })

  it('staat achteraan, zodat de bestaande volgorde niet verschuift', () => {
    const a = resolveLabAntwoorden({ ...tekortInput, haalbareUitgave: hu })
    expect(a[0].zin).toMatch(/^Doorwerken tot /)
    expect(a[a.length - 1].kind).toBe('uitgave_na_pensioen')
  })

  it('landt op zijn eigen uitgang in labAntwoordenPerSlider', () => {
    const per = labAntwoordenPerSlider(resolveLabAntwoorden({ ...leeg, haalbareUitgave: hu }), () => {})
    expect(per.uitgave?.tekst).toBe(`Zo'n ${formatCurrency(31_200)} per jaar uitgeven hoort bij een gedekt plan.`)
    expect(per.uitgave?.knop?.label).toBe('Reken hiermee')
    expect(per.stop).toBeNull()
  })

  it('meldt de nieuwe stand na een klik', () => {
    expect(labAntwoordGezetMelding({ kind: 'uitgave', perJaar: 31_200 }))
      .toBe(`Uitgave na pensioen staat nu op ${formatCurrency(31_200)}.`)
  })
})
```

- [ ] **Step 2: Draai beide tests en zie ze falen**

```
npx vitest run lib/scenario-events.uitgave-range.test.ts lib/horizon/lab-antwoorden.test.ts
```
Verwacht: FAIL — `uitgaveNaPensioenRange` bestaat niet, `haalbareUitgave` is geen bekende property.

- [ ] **Step 3: Voeg de range-helper toe**

Onderaan `lib/scenario-events.ts`, ná `computeSliderUiRange`:

```ts
/** Eén stap van de knop "Uitgave na pensioen": € 600/jaar = € 50/mnd, zoals Meer salaris. */
export const UITGAVE_NA_PENSIOEN_STAP = 600

/**
 * Zichtbaar bereik van de knop "Uitgave na pensioen": ±40% rond wat je nu rekent,
 * afgerond op de sliderstap. Bewust ruimer dan de ±20%/±30% van de andere knoppen — een
 * tekort van tientallen procenten is bij een vastgezet stopmoment heel gewoon, en een
 * knop die het antwoord niet kán bereiken is een knop zonder nut.
 *
 * Zelfde verbreding-vangnet als `computeSliderUiRange`: ligt de opgeslagen waarde buiten
 * de band, dan verbreedt de band — niets clampt. Staat hier (en niet in de component)
 * omdat het antwoordenblok hetzelfde bereik nodig heeft om `bovenBereik` te bepalen.
 */
export function uitgaveNaPensioenRange(basis: number, saved: number): { min: number; max: number } {
  const stap = UITGAVE_NA_PENSIOEN_STAP
  const veilig = Number.isFinite(basis) && basis > 0 ? basis : 0
  const min = Math.max(0, Math.round((veilig * 0.6) / stap) * stap)
  const max = Math.max(stap, Math.round((veilig * 1.4) / stap) * stap)
  return { min: Math.min(min, saved), max: Math.max(max, saved) }
}
```

- [ ] **Step 4: Breid het antwoordenblok uit**

In `lib/horizon/lab-antwoorden.ts` — types eerst:

```ts
export type LabAntwoordActie =
  | { readonly kind: 'stop'; readonly stopAge: number }
  | { readonly kind: 'slider'; readonly key: 'extra_inleg' | 'savings'; readonly value: number }
  /** Geen SliderKey: deze hefboom is een profielparameter, geen life-event (spec 2026-09-18). */
  | { readonly kind: 'uitgave'; readonly perJaar: number }
```

`LabAntwoord['kind']` wordt `'doorwerken' | 'extra_opzij' | 'minder_uitgeven' | 'uitgave_na_pensioen'`.

Aan `LabAntwoordenInput`:

```ts
  /**
   * De gesolvede uitgave na pensioen uit `ScenarioPresetBatch` — `null`/afwezig ⇒ geen
   * vierde antwoord. Anders dan de drie bestaande antwoorden hangt deze NIET aan een
   * tekort: bij een overschot luidt hij "je mag méér uitgeven".
   */
  haalbareUitgave?: HaalbareUitgave | null
```

`resolveLabAntwoorden`: de bestaande vroege `return []` verdwijnt, de drie bestaande `out.push(…)`-aanroepen komen **ongewijzigd** binnen de nieuwe `if` te staan, en het vierde antwoord gaat **achteraan** zodat bestaande indices niet verschuiven:

```ts
export function resolveLabAntwoorden(input: LabAntwoordenInput): LabAntwoord[] {
  const { dekking, solvedFireAge, planMaandHint, baseline, masked = false, haalbareUitgave } = input
  const out: LabAntwoord[] = []

  // De drie bestaande hefbomen: alleen bij een tekort onder een vast anker.
  if (dekking && dekking.tekort && dekking.stop && dekking.stop.kind !== 'now') {
    const stopAge = dekking.stop.stopAge
    // …de bestaande body, ongewijzigd: doorwerken, extra_opzij, minder_uitgeven…
  }

  // Vierde hefboom — hangt aan het PLAN, niet aan een tekort: bij een overschot is het
  // antwoord "je mag méér uitgeven". Achteraan, zodat de volgorde van de drie hierboven
  // ongewijzigd blijft.
  if (haalbareUitgave && haalbareUitgave.richting !== 'gelijk') {
    const range = uitgaveNaPensioenRange(haalbareUitgave.huidigPerJaar, haalbareUitgave.huidigPerJaar)
    const bedrag = Math.round(haalbareUitgave.perJaar)
    out.push({
      kind: 'uitgave_na_pensioen',
      zin: antwoordUitgaveNaPensioen(bedrag, masked),
      bovenBereik: bedrag > range.max || bedrag < range.min,
      actie: { kind: 'uitgave', perJaar: Math.min(range.max, Math.max(range.min, bedrag)) },
    })
  }

  return out
}
```

`LabAntwoordenPerSlider` en `labAntwoordenPerSlider`:

```ts
export interface LabAntwoordenPerSlider {
  sliders: Partial<Record<'extra_inleg' | 'savings', SliderAntwoordItem>>
  stop: SliderAntwoordItem | null
  /** De knop "Uitgave na pensioen" — geen SliderKey, dus een eigen uitgang. */
  uitgave: SliderAntwoordItem | null
}
```

```ts
  const out: LabAntwoordenPerSlider = { sliders: {}, stop: null, uitgave: null }
  // …
    if (a.actie.kind === 'stop') out.stop = item
    else if (a.actie.kind === 'uitgave') out.uitgave = item
    else out.sliders[a.actie.key] = item
```

En in `labAntwoordGezetMelding`, vóór de bestaande takken:

```ts
  if (actie.kind === 'uitgave') {
    return `${HEFBOOM_COPY.uitgaveNaPensioen} staat nu op ${formatCurrency(actie.perJaar)}.`
  }
```

Imports erbij: `antwoordUitgaveNaPensioen` uit `./anker-copy`, `uitgaveNaPensioenRange` uit `@/lib/scenario-events`, `type HaalbareUitgave` uit `./haalbare-uitgave`.

- [ ] **Step 5: Draai de tests tot groen**

```
npx vitest run lib/scenario-events.uitgave-range.test.ts lib/horizon/lab-antwoorden.test.ts lib/horizon/lab-antwoorden.kernel.test.ts
npx tsc --noEmit
```
Verwacht: PASS. De kernel-test hoort ongewijzigd groen te blijven — die geeft geen `haalbareUitgave` mee, dus het vierde antwoord verschijnt daar niet.

- [ ] **Step 6: Commit**

```bash
git add lib/scenario-events.ts lib/scenario-events.uitgave-range.test.ts lib/horizon/lab-antwoorden.ts lib/horizon/lab-antwoorden.test.ts
git commit -m "feat(horizon): vierde hefboom-antwoord — uitgave na pensioen

Eigen actie-variant (geen SliderKey) en een eigen uitgang in
labAntwoordenPerSlider. Hangt aan het plan, niet aan een tekort: bij een
overschot luidt het antwoord 'je mag meer uitgeven'.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Het override-kanaal naar de scenario-run

**Files:**
- Modify: `lib/hooks/use-horizon-fire-sim.ts` (`HorizonScenarioOverrides`, `resolveScenarioAssetsAndEvents` → `resolveScenarioContext`, drie aanroepers, drie guards)
- Test: `lib/hooks/use-horizon-fire-sim.scenario-context.test.ts`

**Interfaces:**
- Produces:
  ```ts
  HorizonScenarioOverrides.uitgaveNaPensioenPerJaar?: number
  export function heeftScenarioOverrides(ov: HorizonScenarioOverrides | null): boolean
  export function resolveScenarioContext(
    assets: Asset[] | undefined,
    lifeEvents: LifeEvent[] | undefined,
    ov: HorizonScenarioOverrides | null,
    profile: ConvergentieRawProfileRow,
  ): { assets: Asset[]; lifeEvents: LifeEvent[]; profile: ConvergentieRawProfileRow }
  ```

- [ ] **Step 1: Schrijf de falende test**

Maak `lib/hooks/use-horizon-fire-sim.scenario-context.test.ts`. We testen de pure helpers, niet de hook — die hangt aan de volledige kernel-bundel (zelfde reden als de bron-tests in `components/app/horizon/`).

```ts
import { describe, it, expect } from 'vitest'
import { heeftScenarioOverrides, resolveScenarioContext } from './use-horizon-fire-sim'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'

const profile = {
  retirement_expense_method: 'essential_budgets',
  retirement_expense_custom_amount: null,
} as ConvergentieRawProfileRow

describe('heeftScenarioOverrides', () => {
  it('ziet de uitgave-override als actief scenario', () => {
    expect(heeftScenarioOverrides({ extraLifeEvents: [], uitgaveNaPensioenPerJaar: 30_000 })).toBe(true)
  })
  it('is onwaar bij een lege override-set', () => {
    expect(heeftScenarioOverrides({ extraLifeEvents: [] })).toBe(false)
    expect(heeftScenarioOverrides(null)).toBe(false)
  })
})

describe('resolveScenarioContext — profiel', () => {
  it('laat het profiel ONGEWIJZIGD (zelfde referentie) zonder override', () => {
    expect(resolveScenarioContext([], [], { extraLifeEvents: [] }, profile).profile).toBe(profile)
  })

  it('patcht methode en bedrag met de override, zonder te muteren', () => {
    const out = resolveScenarioContext([], [], { extraLifeEvents: [], uitgaveNaPensioenPerJaar: 24_000 }, profile)
    expect(out.profile.retirement_expense_method).toBe('custom_amount')
    expect(out.profile.retirement_expense_custom_amount).toBe(24_000)
    expect(profile.retirement_expense_method).toBe('essential_budgets')
  })
})
```

- [ ] **Step 2: Draai de test en zie hem falen**

```
npx vitest run lib/hooks/use-horizon-fire-sim.scenario-context.test.ts
```
Verwacht: FAIL — beide functies bestaan niet / zijn niet geëxporteerd.

- [ ] **Step 3: Breid het contract uit**

In `lib/hooks/use-horizon-fire-sim.ts`, in `HorizonScenarioOverrides`:

```ts
  /**
   * Uitgave na pensioen (€/jaar) voor de verkenning — de vierde draaiknop (spec
   * 2026-09-18). Bewust GEEN `WhatIfEvent`: de kern leest deze grootheid als
   * profielparameter (`inkomenUitgaven.uitgaveNaPensioenPerJaar`), en 'm als
   * `lifestyle_adjustment` modelleren zou een tweede waarheid naast dat veld zetten.
   * Afwezig ⇒ het profiel bepaalt de uitgave (ongewijzigd, referentie behouden).
   */
  uitgaveNaPensioenPerJaar?: number
```

- [ ] **Step 4: Eén home voor "is er een scenario" en voor de context**

Vervang `resolveScenarioAssetsAndEvents` door `resolveScenarioContext` — zelfde body, plus het profiel — en voeg de guard toe:

```ts
/**
 * Draagt deze override-set iets? Eén home voor de drie takken (synchrone scenario-memo,
 * worker-effect, stop-pad). Stond eerder drie keer uitgeschreven als
 * `extraEvents.length === 0 && !hasReturnDeltas`; met een derde override erbij is dat
 * precies het soort regel dat op één van de drie plekken vergeten wordt.
 */
export function heeftScenarioOverrides(ov: HorizonScenarioOverrides | null): boolean {
  if (!ov) return false
  if ((ov.extraLifeEvents?.length ?? 0) > 0) return true
  if (ov.returnDeltaByCategorie && Object.keys(ov.returnDeltaByCategorie).length > 0) return true
  return ov.uitgaveNaPensioenPerJaar != null && Number.isFinite(ov.uitgaveNaPensioenPerJaar)
}

/**
 * Context-assemblage voor de scenario-/stop-pad-runs (één home). Past — ALLEEN wanneer er
 * actieve overrides zijn — (a) de per-categorie rendement-delta's op de assets toe,
 * (b) de scenario-events bovenop de hoofd-`lifeEvents` en (c) de uitgave na pensioen op
 * het profiel. Nul overrides ⇒ ongewijzigde referenties (identiek aan de basislijn —
 * golden: scenario-baseline-parity.test.ts).
 */
export function resolveScenarioContext(
  assets: Asset[] | undefined,
  lifeEvents: LifeEvent[] | undefined,
  ov: HorizonScenarioOverrides | null,
  profile: ConvergentieRawProfileRow,
): { assets: Asset[]; lifeEvents: LifeEvent[]; profile: ConvergentieRawProfileRow } {
  // …bestaande body van resolveScenarioAssetsAndEvents, ongewijzigd…
  const bedrag = ov?.uitgaveNaPensioenPerJaar
  const scenarioProfile =
    bedrag != null && Number.isFinite(bedrag)
      ? { ...profile, retirement_expense_method: 'custom_amount', retirement_expense_custom_amount: bedrag }
      : profile
  return { assets: scenarioAssets, lifeEvents: scenarioLifeEvents, profile: scenarioProfile }
}
```

- [ ] **Step 5: Bedraad de drie aanroepers**

Zoek op `resolveScenarioAssetsAndEvents` — er zijn er precies drie (regelnummers indicatief):

1. **`buildStopPadInput`** (~r335):
```ts
  const { assets, lifeEvents, profile: scenarioProfile } = resolveScenarioContext(p.assets, p.lifeEvents, ov, profile)
  return { profile: scenarioProfile, assets, debts: p.debts ?? [], lifeEvents, /* …rest ongewijzigd… */ }
```
2. **De synchrone scenario-memo** (~r543): vervang `profile: kernelProfileWithBasis` in de `rawContext` door het teruggegeven `scenarioProfile`.
3. **Het worker-scenario-effect** (~r642): idem in de `rawContext`.

Vervang in alle drie de guard

```ts
if (extraEvents.length === 0 && !hasReturnDeltas) …
```

door

```ts
if (!heeftScenarioOverrides(ov)) …
```

(laat het `return null` resp. `setAsyncScenario(null); return` van elke tak staan zoals het is), en verwijder de daarmee ongebruikte `extraEvents` / `returnDeltas` / `hasReturnDeltas`-locals.

- [ ] **Step 6: Draai tests + typecheck**

```
npx vitest run lib/hooks/use-horizon-fire-sim.scenario-context.test.ts lib/horizon/scenario-baseline-parity.test.ts
npx tsc --noEmit
```
Verwacht: PASS. **`scenario-baseline-parity.test.ts` moet ongewijzigd groen zijn** — dat is de regressie-eis: nul overrides ⇒ byte-identieke scenario-run.

- [ ] **Step 7: Commit**

```bash
git add lib/hooks/use-horizon-fire-sim.ts lib/hooks/use-horizon-fire-sim.scenario-context.test.ts
git commit -m "feat(horizon): uitgave na pensioen als scenario-override

Derde override op HorizonScenarioOverrides, via het profiel in plaats van een
event — de kern leest deze grootheid als profielparameter. De drie
hasScenario-guards krijgen een home, zodat een override niet op een van de drie
takken wegvalt.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: De vierde draaiknop

**Files:**
- Modify: `components/app/horizon/whatif-sliders.tsx`
- Test: `components/app/horizon/whatif-sliders.test.tsx` (uitbreiden)

**Interfaces:**
- Consumes: `uitgaveNaPensioenRange`, `UITGAVE_NA_PENSIOEN_STAP` (Task 4); `HEFBOOM_COPY.uitgaveNaPensioen` (Task 3).
- Produces:
  ```ts
  SlidersProps.uitgaveNaPensioen?: { waarde: number; basis: number; onChange: (v: number) => void }
  // SliderAntwoordKey krijgt 'uitgave_na_pensioen'
  ```

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `components/app/horizon/whatif-sliders.test.tsx`. `basisProps` = de props-opstelling die de bestaande tests in dat bestand al gebruiken (baseline / events / setEvents / currentAge); til die zo nodig op naar een `const` op bestandsniveau.

```ts
describe('vierde knop — Uitgave na pensioen', () => {
  it('verschijnt niet zonder de prop', () => {
    render(<WhatIfSliders {...basisProps} />)
    expect(screen.queryByLabelText('Uitgave na pensioen')).toBeNull()
  })

  it('toont de knop, de sliderstap en de maandvertaling', () => {
    render(<WhatIfSliders {...basisProps} uitgaveNaPensioen={{ waarde: 30_000, basis: 30_000, onChange: () => {} }} />)
    expect(screen.getByLabelText('Uitgave na pensioen')).toHaveAttribute('step', '600')
    expect(screen.getByText(/€\s2\.500\/mnd/)).toBeInTheDocument()
  })

  it('geeft de nieuwe waarde door', () => {
    const onChange = vi.fn()
    render(<WhatIfSliders {...basisProps} uitgaveNaPensioen={{ waarde: 30_000, basis: 30_000, onChange }} />)
    fireEvent.change(screen.getByLabelText('Uitgave na pensioen'), { target: { value: '24000' } })
    expect(onChange).toHaveBeenCalledWith(24_000)
  })

  it('rendert het antwoord onder zijn eigen knop', () => {
    render(
      <WhatIfSliders
        {...basisProps}
        uitgaveNaPensioen={{ waarde: 30_000, basis: 30_000, onChange: () => {} }}
        antwoorden={{
          uitgave_na_pensioen: {
            tekst: `Zo'n ${formatCurrency(24_000)} per jaar uitgeven hoort bij een gedekt plan.`,
            bovenBereik: false,
            knop: null,
          },
        }}
      />,
    )
    expect(screen.getByText(/€\s24\.000 per jaar uitgeven/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Draai de test en zie hem falen**

```
npx vitest run components/app/horizon/whatif-sliders.test.tsx
```
Verwacht: FAIL — `uitgaveNaPensioen` is geen bekende prop.

- [ ] **Step 3: Bouw de knop**

In `components/app/horizon/whatif-sliders.tsx`:

```ts
type SliderAntwoordKey = 'extra_inleg' | 'savings' | 'workdays' | 'uitgave_na_pensioen'

interface SlidersProps {
  // …bestaand…
  /**
   * De vierde knop (spec 2026-09-18). Optioneel: alleen /toekomst levert 'm, en alleen
   * onder een vast stopmoment. Geen `SliderKey`/event — de host houdt de waarde zelf en
   * stuurt 'm als scenario-override naar de kern.
   */
  uitgaveNaPensioen?: { waarde: number; basis: number; onChange: (v: number) => void }
}
```

Bovenaan `SliderGrid`, bij de andere range-berekeningen:

```ts
  const uitgaveRange = uitgaveNaPensioenRange(
    uitgaveNaPensioen?.basis ?? 0,
    uitgaveNaPensioen?.waarde ?? 0,
  )
```

Ná de derde `SliderRow` (Minder werken), binnen dezelfde grid:

```tsx
      {/* 4 — Uitgave na pensioen: de enige hefboom die ná het stopmoment grijpt, en bij
          een vastgezette stopleeftijd vaak de enige die nog draait. In €/JAAR (gelijk aan
          de KPI-tegel "Na pensioen", zodat het antwoord hetzelfde getal is als daar), met
          de maandvertaling in de detail-regel — zoals de euro-regel onder Spaarquote. */}
      {uitgaveNaPensioen && (
        <div className="border-b border-dashed border-[var(--border-ed)] xl:col-span-2 xl:border-b-0">
          <SliderRow
            label={HEFBOOM_COPY.uitgaveNaPensioen}
            hint="→ Uitgave na pensioen"
            value={uitgaveNaPensioen.waarde}
            baseValue={uitgaveNaPensioen.basis}
            min={uitgaveRange.min}
            max={uitgaveRange.max}
            step={UITGAVE_NA_PENSIOEN_STAP}
            formatValue={formatCurrency}
            formatDelta={v => `${formatCurrency(v)}/jr`}
            detail={`≈ ${formatCurrency(Math.round(uitgaveNaPensioen.waarde / 12))}/mnd`}
            onChange={uitgaveNaPensioen.onChange}
            minLabel={formatCurrency(uitgaveRange.min)}
            maxLabel={formatCurrency(uitgaveRange.max)}
            antwoord={antwoorden.uitgave_na_pensioen}
          />
        </div>
      )}
```

Geef `uitgaveNaPensioen` door in `WhatIfSliders` → `SliderGrid` (beide props-lijsten) en importeer `uitgaveNaPensioenRange`, `UITGAVE_NA_PENSIOEN_STAP` uit `@/lib/scenario-events`.

- [ ] **Step 4: Draai de test tot groen**

```
npx vitest run components/app/horizon/whatif-sliders.test.tsx
npx tsc --noEmit
```
Verwacht: PASS, bestaande tests ongewijzigd groen (zonder de prop rendert er niets extra's).

- [ ] **Step 5: Commit**

```bash
git add components/app/horizon/whatif-sliders.tsx components/app/horizon/whatif-sliders.test.tsx
git commit -m "feat(horizon): vierde draaiknop — uitgave na pensioen

In euro's per jaar (gelijk aan de KPI-tegel) met de maandvertaling eronder.
Optionele prop, dus hosts zonder vast stopmoment renderen niets extra's.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Bedrading in horizon-client + de regel in de tegel

**Files:**
- Modify: `components/app/horizon/horizon-client.tsx`
- Test: `components/app/horizon/horizon-client.haalbare-uitgave.test.ts` (nieuw, bron-test)

**Interfaces:**
- Consumes: alles uit Task 1–6.

> **Waarom een bron-test en geen render-test:** `horizon-client.tsx` is > 10.000 regels en hangt aan de volledige kernel-bundel; renderen in vitest is niet realistisch. Precedent in dezelfde map: `horizon-client.na-pensioen-klik.test.ts`, `horizon-client.kpi-gegevensmelding.test.ts`.

- [ ] **Step 1: Schrijf de falende test**

Maak `components/app/horizon/horizon-client.haalbare-uitgave.test.ts`:

```ts
/**
 * Bron-grendel op de haalbare-uitgave-regel in de KPI-tegel "Na pensioen"
 * (spec 2026-09-18). Wat we vastpinnen:
 *  1. beide layouts (desktop + mobiel) tonen de regel via DEZELFDE helper — geen tweede
 *     berekening, geen tweede formulering;
 *  2. de kleur komt uit de semantische tokens, nooit uit een Tailwind-standaardkleur;
 *  3. de regel valt weg in huishoud-/partnerweergave (twee grondslagen niet mengen);
 *  4. de batch-uitkomst landt in state en wordt bij een fout teruggezet.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(
  join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx'),
  'utf8',
)

/** Desktop-strip + mobiele strip. */
const LAYOUTS = 2

describe('haalbare uitgave — bron-grendel', () => {
  it('rendert de regel in beide KPI-layouts via één helper', () => {
    expect(source.match(/data-testid="haalbaar-bij-uitgave"/g) ?? []).toHaveLength(LAYOUTS)
    // Eén aanroep van de kopij-helper, hergebruikt in beide tegels.
    expect((source.match(/haalbaarBijUitgaveRegel\(/g) ?? []).length).toBe(1)
  })

  it('kleurt met de semantische tokens en niets anders', () => {
    const blokken = source.match(/data-testid="haalbaar-bij-uitgave"[\s\S]{0,400}/g) ?? []
    expect(blokken).toHaveLength(LAYOUTS)
    for (const b of blokken) {
      expect(b).toMatch(/haalbareUitgaveToon/)
      expect(b).not.toMatch(/text-(red|emerald|green|rose)-\d/)
      expect(b).not.toMatch(/#[0-9a-fA-F]{6}/)
    }
    expect(source).toMatch(/haalbareUitgaveToon\s*=[\s\S]{0,160}text-negative[\s\S]{0,80}text-positive/)
  })

  it('toont niets in huishoud-/partnerweergave', () => {
    expect((source.match(/!hasPerspectiveHero && haalbareUitgaveRegel/g) ?? [])).toHaveLength(LAYOUTS)
  })

  it('zet de batch-uitkomst in state én ruimt hem op bij een fout', () => {
    expect(source).toMatch(/setHaalbareUitgave\(batch\.haalbareUitgave \?\? null\)/)
    expect(source).toMatch(/setHaalbareUitgave\(null\)/)
  })

  it('geeft de override door aan de scenario-run', () => {
    expect(source).toMatch(/uitgaveNaPensioenPerJaar: scenarioUitgaveNaPensioen/)
  })
})
```

- [ ] **Step 2: Draai de test en zie hem falen**

```
npx vitest run components/app/horizon/horizon-client.haalbare-uitgave.test.ts
```
Verwacht: FAIL op alle vijf.

- [ ] **Step 3: State + batch-bedrading**

Bij de andere `useState`-declaraties (in de buurt van `setSolvedRun`):

```ts
  /** De gesolvede uitgave na pensioen uit de scenario-batch (spec 2026-09-18). */
  const [haalbareUitgave, setHaalbareUitgave] = useState<HaalbareUitgave | null>(null)
  /** Sliderstand van de vierde draaiknop (€/jaar); null = op de basis, geen override. */
  const [scenarioUitgaveNaPensioen, setScenarioUitgaveNaPensioen] = useState<number | null>(null)
```

In het batch-effect, in de `.then`, direct ná `setSolvedRun(…)`:

```ts
        setHaalbareUitgave(batch.haalbareUitgave ?? null)
```

Zet `setHaalbareUitgave(null)` óók in:
- de `.catch` (naast `setSolvedRun({ fireAge: null, endAge: null })`);
- de tak `if (yearlyExp <= 0)`;
- de tak `if (!presetBatchNodig)`.

Anders blijft er na een anker-wissel of een gegevensgat een stale bedrag staan.

- [ ] **Step 4: Scenario-override + antwoorden + de knop**

`hasScenario` en de `scenarioOverrides`-memo:

```ts
  const hasScenario =
    scenarioSliderEvents.length > 0 ||
    Object.keys(scenarioReturnDeltas).length > 0 ||
    scenarioUitgaveNaPensioen != null

  const scenarioOverrides = useMemo<HorizonScenarioOverrides | null>(() => {
    if (!hasScenario) return null
    return {
      extraLifeEvents: scenarioSliderEvents,
      returnDeltaByCategorie: scenarioReturnDeltas as Partial<Record<AssetCategorie, number>>,
      ...(scenarioUitgaveNaPensioen != null
        ? { uitgaveNaPensioenPerJaar: scenarioUitgaveNaPensioen }
        : {}),
    }
  }, [hasScenario, scenarioSliderEvents, scenarioReturnDeltas, scenarioUitgaveNaPensioen])
```

In de `resolveLabAntwoorden`-memo: `haalbareUitgave` meegeven én aan de dependency-array toevoegen.

In de bestaande `onActie`-handler van `labAntwoordenPerSlider`, vóór de bestaande takken:

```ts
    if (actie.kind === 'uitgave') { setScenarioUitgaveNaPensioen(actie.perJaar); return }
```

Geef de knop door aan `WhatIfSliders` (op de plek waar `antwoorden={…}` al meegaat):

```tsx
  uitgaveNaPensioen={
    haalbareUitgave
      ? {
          waarde: scenarioUitgaveNaPensioen ?? haalbareUitgave.huidigPerJaar,
          basis: haalbareUitgave.huidigPerJaar,
          onChange: (v: number) =>
            setScenarioUitgaveNaPensioen(v === haalbareUitgave.huidigPerJaar ? null : v),
        }
      : undefined
  }
```

Zoek op `clearScenarioEvents` en zet `setScenarioUitgaveNaPensioen(null)` ernaast, zodat de bestaande reset ("alles terug naar nu") ook deze knop terugzet.

- [ ] **Step 5: De regel in beide tegels**

Eén afgeleide, vlak bij de andere tegel-afleidingen:

```ts
  /** De regel onder het bedrag in de KPI-tegel "Na pensioen"; null = niets te melden. */
  const haalbareUitgaveRegel = haalbareUitgave ? haalbaarBijUitgaveRegel(haalbareUitgave, masked) : null
  /** Donkerrood = minder moeten uitgeven, donkergroen = meer mogen. Semantische tokens. */
  const haalbareUitgaveToon =
    haalbareUitgave?.richting === 'minder' ? 'text-negative' : 'text-positive'
```

In de **desktop**-tegel, direct ná de `per jaar`-regel en binnen dezelfde fragment:

```tsx
                {!hasPerspectiveHero && haalbareUitgaveRegel && (
                  <p
                    data-testid="haalbaar-bij-uitgave"
                    className={`mt-1 font-sans text-[11px] leading-snug ${haalbareUitgaveToon}`}
                  >
                    {haalbareUitgaveRegel}
                  </p>
                )}
```

In de **mobiele** tegel identiek, met `text-[10px]` in plaats van `text-[11px]`.

Importeer `haalbaarBijUitgaveRegel` uit `@/lib/horizon/anker-copy` en `type HaalbareUitgave` uit `@/lib/horizon/haalbare-uitgave`.

- [ ] **Step 6: Draai de tests en de gates**

```
npx vitest run components/app/horizon/horizon-client.haalbare-uitgave.test.ts components/app/horizon/horizon-client.na-pensioen-klik.test.ts components/app/horizon/vrijheidsas.test.tsx
npx tsc --noEmit
npm run check:headings
npm run check:client-reads
```
Verwacht: alles groen. De bestaande `na-pensioen-klik`-bron-test moet ongewijzigd slagen — de knop-structuur van de tegel is niet aangeraakt.

- [ ] **Step 7: Commit**

```bash
git add components/app/horizon/horizon-client.tsx components/app/horizon/horizon-client.haalbare-uitgave.test.ts
git commit -m "feat(toekomst): haalbaar-bij-uitgave in de tegel en de vierde knop bedraad

De regel staat in beide KPI-layouts via een helper, in donkerrood of donkergroen
uit de semantische tokens, en valt weg in huishoudweergave.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Curatie — catalogus, ADR, UAT en de volle suite

**Files:**
- Modify: `lib/architecture/calculations.ts`
- Create: `docs/adr/0160-de-haalbare-uitgave-na-pensioen.md`
- Modify: `lib/uat/acceptance/toek.ts` + `lib/uat/acceptance/toek-checks.ts`
- Modify: `docs/architecture/architecture.json` (gegenereerd)

- [ ] **Step 1: De Berekeningen-catalogus**

Voeg in `lib/architecture/calculations.ts` een calc-entry toe voor de nieuwe motor. Volg de vorm van de naastgelegen horizon-entries en vul minimaal:

- `inputs`: `ConvergentieRawProfileRow`, bezittingen, schulden, gebeurtenissen, AOW-rijen;
- `outputs`: `HaalbareUitgave` (perJaar, eindleeftijd, huidigPerJaar, richting);
- `formula`: bisectie op `retirement_expense_custom_amount` tot `SolveFireResult.status` geen shortfall meer is; precisie € 50/jaar; bovengrens 3× de huidige uitgave; drempel € 250/jaar;
- `files`: `lib/horizon/haalbare-uitgave.ts`;
- `functions`: `solveHaalbareUitgave`, `solveFire`, `buildKernelInputFromApp`, `buildConvergentieAdapterProfile`;
- `constants`: `HAALBARE_UITGAVE_DREMPEL` (250), precisie (50), bovengrens-factor (3), sliderstap (600);
- `elementIds`: dezelfde elementen als de bestaande labuitkomst-entry.

Leg in de `note` vast **waaróm** er op de profielrij wordt gebisecteerd en niet op het kale veld (de `flexNiceFractiePerJaar`-afleiding in `buildInkomenUitgaven`) — precies het soort valkuil waarvoor deze catalogus bestaat. Noem ook dat het getal aan de HOOFD-run hangt en niet aan de wat-als-run (zelfde keuze als `planMaandHint`, eindreview I1).

Draai: `npx vitest run lib/architecture/` — `validateCalculations` eist dat elke `elementIds`-verwijzing bestaat en dat elke calc een bronbestand heeft.

- [ ] **Step 2: Het ADR**

Maak `docs/adr/0160-de-haalbare-uitgave-na-pensioen.md`, met frontmatter in de vorm van ADR 0158 (`id`, `title`, `status: aanvaard`, `date: 2026-09-19`, `elements: [...]`) en deze secties:

- **Context** — onder een vast stopmoment verandert de vraag; de drie bestaande hefbomen grijpen allemaal vóór het stopmoment, terwijl de uitgave ná het stopmoment bij een vastgezette stopleeftijd vaak de enige knop is die nog draait.
- **Besluit** — één gesolved getal, twee oppervlakken, één bron; bisectie op de profielrij; "gedekt" = `SolveFireResult.status`.
- **Waarom geen event** — de kern leest de uitgave als profielparameter; een `lifestyle_adjustment` zou een tweede waarheid naast `uitgaveNaPensioenPerJaar` zetten.
- **De drie open keuzes uit de spec, nu vastgelegd mét reden:** bovengrens 3× de huidige uitgave, drempel € 250/jaar (gespiegeld aan de € 500-regel van ADR 0145 M5), sliderstap € 600/jaar (= € 50/mnd, gelijk aan Meer salaris).
- **Gevolgen** — een opgeslagen scenario draagt deze knop niet terug; huishoudweergave toont de regel niet; de batch kost onder een vast anker ~350 ms extra; bij een niet-monotone dekking geeft de solve `null` in plaats van een getal.

- [ ] **Step 3: UAT-definities bijwerken (niet uitvoeren)**

Draai `npm run uat:stale` en kijk welke criteria door de gewijzigde bestanden geraakt zijn. Voeg in `lib/uat/acceptance/toek.ts` een criterium toe in Given/When/Then-vorm:

> **Gegeven** een plan met een vastgezette stopleeftijd waarbij het geld niet tot de eindleeftijd reikt, **wanneer** /toekomst geladen is, **dan** toont de tegel "Na pensioen" onder het bedrag de regel "haalbaar tot {eindleeftijd} bij uitgave: {bedrag}" in donkerrood, en staat datzelfde bedrag in de antwoordregel onder de draaiknop "Uitgave na pensioen".

Spiegel het in `toek-checks.ts` zoals de omliggende criteria dat doen en draai `npx vitest run lib/uat/acceptance/toek.engine.test.ts`. **Voer de live UAT-run niet uit** — dat is het `/uat`-commando, niet deze taak.

- [ ] **Step 4: Architectuur-feiten regenereren**

```
npm run arch:diagram
```

- [ ] **Step 5: De volle suite + gates**

Draai (PowerShell-tool):
```
npx tsc --noEmit
npx vitest run
npm run check:headings
npm run check:client-reads
npm run check:self-modification
```
Verwacht: groen. Faalt een test in een bestand dat je níet hebt aangeraakt: inspecteer het pad en stel vast of hij pre-existing is — **niet** door een "schone baseline" te meten met werkboom-muterende git-commando's (geen `stash` / `checkout --` / `reset`).

- [ ] **Step 6: Commit**

```bash
git add lib/architecture/calculations.ts docs/adr/0160-de-haalbare-uitgave-na-pensioen.md lib/uat/acceptance/toek.ts lib/uat/acceptance/toek-checks.ts docs/architecture/architecture.json
git commit -m "docs(arch): ADR 0160 + Berekeningen-catalogus voor de haalbare uitgave

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Afronding

Ná Task 8, vóór het eindrapport:

- [ ] **Gebundelde eindreview** als **fork-subagent** (`subagent_type: "fork"`), met drie lenzen in één opdracht: correctheid/neveneffecten op bestaand gedrag, UI-consistentie (de nieuwe regel en de vierde knop tegen de ui-ux-skill én tegen hun zusterelementen), en de security-lens. Instrueer 'm de diff **adversarieel** te lezen in plaats van de aannames uit het gesprek te vertrouwen. Is `fork` niet beschikbaar: `senior-developer` met de bestandslijst, de drie lenzen én de opdracht `tsc`/vitest zelf te draaien en de echte output te rapporteren.
- [ ] Een aparte `security-specialist`-run is **niet** nodig: geen auth, RLS, migratie, nieuwe route met datatoegang of partner-/huishouddata — de huishoudtak is juist uitgesloten.
- [ ] **`git status --porcelain -- .claude/`** in de eindsamenvatting, ook als het leeg is.
- [ ] Rapporteer: wat er gebouwd is, het bewijs dat bestaand gedrag heel is (`scenario-baseline-parity` + `na-pensioen-klik` groen), restrisico en next steps.

## Restrisico

1. **De persona-fixture bepaalt of Task 1's overschot-test een dekkende stand vindt.** Lukt dat niet met de voorgestelde parameters, dan zoekt de implementeur een stand die wél dekt — de assertie blijft ongewijzigd.
2. **~350 ms extra in de batch onder een vast anker.** Gemeten referentie (ADR 0129 D7): de volledige anker-batch kost vandaag ~460 ms. Blijkt het in de praktijk zwaarder, dan is de goedkope uitweg de bovengrens verlagen (minder iteraties), niet het getal cachen.
3. **Discontinuïteiten** (woningverkoop, potregels) kunnen de dekking niet-monotoon maken. De vangrail in Task 1 geeft dan `null` in plaats van een misleidend getal — zichtbaar als "geen regel", niet als een verkeerd bedrag.
