# Het lab onder een vaste stopleeftijd — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onder `aow`/`age` beantwoordt het lab op /toekomst één vraag — *reikt je plan, en wat maakt het haalbaar?* — met een dekkingsas i.p.v. de marge-band, drie hefbomen i.p.v. vier knoppen, een antwoordenblok bij een tekort, en lab-doelen die de plankeuze volgen.

**Architecture:** Alles consumeert bestaande kernel-uitvoer (`resolveLabUitkomst`, `solveWithoutAnchor`, `maandHint`, `FIRE_PLAN_COLUMNS`); er komt geen rekenmotor en geen migratie bij. Nieuwe pure modules (`lib/horizon/lab-antwoorden.ts`, `lib/goals/lab-doelen-buiten-plan.ts`) en één presentational component (`components/app/horizon/dekkingsbalk.tsx`) dragen de nieuwe logica; `horizon-client.tsx`, `vrijheidsas.tsx`, `whatif-sliders.tsx` en `doelen-view.tsx` worden alleen bedraad. Alle nieuwe gebruikerszinnen wonen in `lib/horizon/anker-copy.ts` (merkstem/compliance-spoor). Prerequisite is de "VRIJ MOGELIJK VANAF —"-bug (Task 0).

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Vitest (**altijd via de PowerShell-tool**, nooit Bash — zie CLAUDE.md), Tailwind v4-tokens, chrome-devtools MCP voor de handmatige checks.

**Spec:** `docs/superpowers/specs/2026-09-14-lab-haalbaarheid-design.md` (goedgekeurd 15 sep 2026). ADR 0129 (stop-anker × eind-vorm), ADR 0145 (het lab volgt het anker).

## Global Constraints

- **Branch:** de werkboom staat op lokale `master`, die gelijk is aan `origin/preview` (`cb741b659`, met `b90314839`, `a6a51c98e`, `73bfbd7c1`). Lokale `master` is GEDIVERGEERD van `origin/master` (hotfix-cherry-pick `1e1ae15b2`). Committen op lokale `master` is goed; **pushen uitsluitend met `git push origin HEAD:preview`** — nooit naar `origin/master`. Nooit `git stash`/`checkout --`/`reset`; stage per pad (nooit `git add -A`); een parallelle sessie kan in dezelfde werkboom schrijven.
- **Vitest via PowerShell:** `npx vitest run <paden>`; via Bash faalt élke suite vals-negatief. `npx tsc --noEmit` mag overal.
- **Consume, don't recompute:** dekking alleen uit `resolveLabUitkomst`/`computeRunwayCoveragePct`; "doorwerken tot" alleen uit `solvedRun.fireAge` (tweede run); €-hint alleen uit `maandHint`. Geen eigen `/ 12`-, `eindMaand`- of dekkingssom in componenten (bron-grendel `horizon-client.lab-uitkomst.test.ts` bewaakt dit).
- **Kleur:** stoplicht-semantiek via `text-positive`/`bg-positive-bg`/`text-warning`/`bg-warning-bg`, nooit een module-accent voor gedekt/tekort. Module-identiteit via `horizon-*`-classes.
- **Koppen:** geen `<h1>` in components; nieuwe secties ≤ `h3`.
- **Kopij (spec §5, letterlijk):** sectie-2-kop `Reikt je plan?` · tag `de dekking` · slider `Doorwerken tot` · tegels `Reikt tot` · `Plan tot` · `Gedekt` · hefbomen `Meer opzij` · `Minder uitgeven` · `Later of eerder stoppen` · `Minder werken` · antwoordenblok-kop `Wat maakt het haalbaar?` · antwoorden `Doorwerken tot {X} dekt je plan.` / `Zo'n €{hint} per maand extra opzij dekt je plan.` / `Zo'n €{hint} per maand minder uitgeven dekt je plan.` · boven bereik `Dat is meer dan de knop toelaat — de knop zet het hoogste bedrag.` · knop `Reken hiermee` · doelen-melding `Je plan is veranderd. {n} doel(en) uit het lab passen er niet meer bij.` · acties `Bijwerken` · `Loslaten`. Beschrijvend, nooit "je moet"; sluitregel "Indicatie, geen advies — …" blijft. Geen "AOW" in een tekortzin.
- **Solved blijft byte-identiek** behalve de hefboom-indeling (§2). Onder `now` geen antwoordenblok, geen promotie.
- **Geen migratie:** `goals.goal_type` is TEXT zonder CHECK; `DOEL_PARAMETERS` krimpt zonder schemawijziging. Bestaande `salary`-doelrijen blijven bestaan en syncen.
- Commit-messages in het Nederlands, prefix `feat(toekomst):`/`fix(toekomst):`/`test(toekomst):`/`docs(...)`, afsluiten met `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Bestandsoverzicht

| Bestand | Rol | Task |
|---|---|---|
| `components/app/horizon/horizon-client.tsx` (~10.4k regels) | orchestrator; alleen bedrading | 0, 2, 4, 5 |
| `lib/horizon/scenario-presets.ts` / `.test.ts` | tweede run; regressietest | 0 |
| `components/app/horizon/horizon-client.vrij-mogelijk-vanaf.test.ts` (nieuw) | bron-grendel op de preset-batch-invoer | 0 |
| `lib/scenario-events.ts` / `.test.ts` | `savingsBaselineIncome`, `savingsPpForMonthlyAmount`, `computeSliderUiRange` (verhuisd) | 1 |
| `lib/horizon/toekomst-scenario.ts` / `.test.ts` | `DOEL_PARAMETERS` zonder `salaris`; `slidersGelijk` negeert income | 1 |
| `lib/horizon/toekomst-doel.ts` / `.test.ts` | `PARAM_TO_GOAL_TYPE`, `LEGACY_PARAMETER_GOAL_TYPES`, `planCoverageGoalName` | 1, 6 |
| `app/api/toekomst-doel/schema.ts`, `route.ts`, `route.test.ts` | zod zonder `salaris`; loslaten ruimt legacy `salary` mee op | 1 |
| `components/app/horizon/doel-vastleg-sheet.tsx` | `buildLiveStand` zonder income | 1 |
| `components/app/horizon/whatif-sliders.tsx` / `.test.tsx` | drie hefbomen + ingeklapt "Minder werken" | 2 |
| `lib/horizon/anker-copy.ts` / `.test.ts` | alle nieuwe zinnen | 3, 5, 6 |
| `components/app/horizon/dekkingsbalk.tsx` / `.test.tsx` (nieuw) | de dekkingsas (puur presentational) | 3 |
| `components/app/horizon/vrijheidsas.tsx` / `.test.tsx` | sectie 2 krijgt een vaste-anker-gezicht | 4 |
| `lib/horizon/lab-antwoorden.ts` / `.test.ts` (nieuw) | drie antwoorden bij een tekort (puur) | 5 |
| `components/app/horizon/horizon-client.lab-uitkomst.test.ts` | bron-grendel bijwerken (antwoordenblok) | 5 |
| `lib/goals/lab-doelen-buiten-plan.ts` / `.test.ts` (nieuw) | telling lab-doelen die n.v.t. zijn (puur) | 6 |
| `lib/fin-data-loader.ts`, `app/(app)/toekomst/doelen/page.tsx`, `components/future/doelen-view.tsx` / `.test.tsx`, `components/future/doel-loslaten-confirm.tsx` | plan-context naar de doelenpagina; melding; live naam | 6 |
| `lib/uat/acceptance/toek.ts`, `toek-checks.ts`, `lib/uat/catalog.ts`, `lib/uat/flows/toek.ts` | WF-TOEK-49 uitbreiden, WF-TOEK-50 nieuw | 7 |
| `lib/page-info-content.ts`, `lib/architecture/calculations.ts`, `lib/architecture/hld-model.ts`, `docs/adr/0145-*.md` | curatie | 7 |

---

### Task 0: Prerequisite — "VRIJ MOGELIJK VANAF" toont "—" onder een vast anker

**Diagnose (geverifieerd 15 sep 2026).** De tweede run (`solveWithoutAnchor`, ADR 0129 D7) draait in de preset-batch. Die batch krijgt in `horizon-client.tsx:1999` de **rauwe** profielrij (`profile: kernelRawProfile`). `loadData` (`:1507-1510`) en de mount-fetch (`:1306-1310`) zetten `kernelRawProfile` op de rauwe `profiles`-rij, waar `net_monthly_income` onder een budget-/transactiegrondslag 0/null is. De hoofd-, scenario- en stop-pad-runs zijn daartegen beschermd: `lib/hooks/use-horizon-fire-sim.ts:460-469` injecteert de effectieve bedragen via `withResolvedKernelBedragen(raw, { monthlyIncome, monthlyExpenses })` (ADR 0103). De preset-batch niet → `nettoJaarinkomen` 0 → geen maand met `gap ≥ 0` → `unreachable_within_horizon` → `fireAge: null` → tegel "—". Onder `solved` valt het niet op omdat de hoofdrun (wél geïnjecteerd) de leeftijd levert. Bijvangst: dezelfde rauwe rij voedt de zes preset-kaarten — die krijgen dezelfde correctie gratis.

**Files:**
- Modify: `lib/horizon/scenario-presets.test.ts` (nieuwe `it` in het describe op regel 490)
- Create: `components/app/horizon/horizon-client.vrij-mogelijk-vanaf.test.ts`
- Modify: `components/app/horizon/horizon-client.tsx:1988-2026` (+ import)

**Interfaces:**
- Consumes: `withResolvedKernelBedragen(row, { monthlyIncome, monthlyExpenses })` uit `@/lib/horizon/kernel-profile-basis`; `effectiveInput: FinancialInput | null` (`horizon-client.tsx:1776`, velden `monthlyIncome`, `monthlyExpenses`).
- Produces: niets nieuws; `solvedRun.fireAge` wordt gevuld onder een vast anker (Task 5 leest 'm).

- [ ] **Step 1: Regressietest op de pure laag (rauwe rij → null, geïnjecteerde rij → leeftijd)**

Voeg toe aan `lib/horizon/scenario-presets.test.ts`, binnen `describe('solveFireAgeWithoutAnchor — "vrij mogelijk vanaf" (D7/B9)', …)` ná de `it` op regel 516:

```ts
  // Bijvangst 1 uit de lab-haalbaarheid-spec (15 sep 2026): de batch kreeg in de
  // client de RAUWE profielrij, waar net_monthly_income onder een budget-/
  // transactiegrondslag 0/null is. Zonder inkomen vindt de bisectie geen maand
  // met gap ≥ 0 → null → hero-tegel "—". Met de ADR 0103-injectie (dezelfde als
  // de hoofdrun) is de leeftijd er wél.
  it('een rauwe rij zonder net_monthly_income solvet naar null; de ADR 0103-injectie herstelt de leeftijd', () => {
    const rauw: ConvergentieRawProfileRow = { ...ankerProfiel, net_monthly_income: 0 }
    expect(solveFireAgeWithoutAnchor(makeCtx({ profile: rauw }))).toBeNull()
    const geinjecteerd = withResolvedKernelBedragen(rauw, {
      monthlyIncome: profile.net_monthly_income as number,
      monthlyExpenses: (profile.estimated_monthly_expenses as number | null) ?? 0,
    })
    expect(solveFireAgeWithoutAnchor(makeCtx({ profile: geinjecteerd }))).toBe(VERWACHT_FIRE)
  })
```

Voeg bovenaan het testbestand de import toe: `import { withResolvedKernelBedragen } from '@/lib/horizon/kernel-profile-basis'`.

Let op: als `profile.estimated_monthly_expenses` in de fixture `null` is, geeft de injectie 0 uitgaven mee terwijl `yearly_essential_expenses: 30_000` in de rij blijft staan — controleer met een `console.log`-vrije assert dat `VERWACHT_FIRE` inderdaad terugkomt; komt er een ándere leeftijd, gebruik dan `monthlyExpenses: 30_000 / 12`.

- [ ] **Step 2: Draai de test — de tweede assert moet nu al groen zijn, de eerste ook (dit is de mechanisme-test)**

Run (PowerShell): `npx vitest run lib/horizon/scenario-presets.test.ts -t "rauwe rij"`
Expected: PASS (deze test bewijst het mechanisme; de client-fix wordt gepind in Step 3).

- [ ] **Step 3: Bron-grendel op de client-bedrading (rood vóór de fix)**

Create `components/app/horizon/horizon-client.vrij-mogelijk-vanaf.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * BRON-GRENDEL (precedent: horizon-client.nu-stoppen.test.ts): de preset-batch — en
 * daarmee de tweede run "vrij mogelijk vanaf" (ADR 0129 D7) — moet op DEZELFDE
 * profielrij draaien als de hoofdrun: de rij mét de ADR 0103-grondslag-injectie.
 * Bijvangst 1 uit de lab-haalbaarheid-spec (15 sep 2026): met de rauwe rij was
 * net_monthly_income 0 → null → hero-tegel "—".
 */
const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')
const src = readFileSync(SOURCE_PATH, 'utf8')

describe('preset-batch draait op de geïnjecteerde profielrij (ADR 0103 × ADR 0129 D7)', () => {
  it('runScenarioPresetsAsync krijgt withResolvedKernelBedragen(kernelRawProfile, …), niet de rauwe rij', () => {
    const start = src.indexOf('runScenarioPresetsAsync({')
    expect(start).toBeGreaterThan(-1)
    const call = src.slice(start, src.indexOf('})', start))
    expect(call).toContain('profile: withResolvedKernelBedragen(kernelRawProfile, {')
    expect(call).toContain('monthlyIncome: effectiveInput.monthlyIncome')
    expect(call).toContain('monthlyExpenses: effectiveInput.monthlyExpenses')
    expect(call).not.toContain('profile: kernelRawProfile,')
  })

  it('de helper wordt uit de canonieke module geïmporteerd', () => {
    expect(src).toContain("import { withResolvedKernelBedragen } from '@/lib/horizon/kernel-profile-basis'")
  })
})
```

- [ ] **Step 4: Draai de bron-grendel — rood**

Run: `npx vitest run components/app/horizon/horizon-client.vrij-mogelijk-vanaf.test.ts`
Expected: FAIL op `toContain('profile: withResolvedKernelBedragen(kernelRawProfile, {')`.

- [ ] **Step 5: Fix in horizon-client**

Import toevoegen bij de andere `@/lib/horizon/...`-imports (rond regel 156-170):

```ts
import { withResolvedKernelBedragen } from '@/lib/horizon/kernel-profile-basis'
```

Vervang in het effect (`:1998-2010`) de regel `profile: kernelRawProfile,` door:

```ts
      // ADR 0103 × ADR 0129 D7 — dezelfde grondslag-injectie als de hoofdrun
      // (use-horizon-fire-sim.ts#kernelProfileWithBasis). Zonder deze regel rekent
      // de tweede run met net_monthly_income 0 onder een budget-/transactie-
      // grondslag → "unreachable" → hero-tegel "—" (bijvangst 1, 15 sep 2026).
      profile: withResolvedKernelBedragen(kernelRawProfile, {
        monthlyIncome: effectiveInput.monthlyIncome,
        monthlyExpenses: effectiveInput.monthlyExpenses,
      }),
```

Voeg aan de dependency-array (`:2026`) toe: `effectiveInput?.monthlyIncome, effectiveInput?.monthlyExpenses` (de `eslint-disable`-regel erboven blijft).

- [ ] **Step 6: Verifiëren**

Run: `npx tsc --noEmit` → schoon.
Run: `npx vitest run components/app/horizon/horizon-client.vrij-mogelijk-vanaf.test.ts lib/horizon/scenario-presets.test.ts components/app/horizon/horizon-client.nu-stoppen.test.ts lib/horizon-kernel/worker/run-in-worker.test.ts` → PASS.
Handmatig (chrome-devtools, dev-server localhost:3000, testaccount jochen@test.trifinity.nl, wachtwoord zie `TEST_USER_PASSWORD` in `.env.local`): zet via `/toekomst` → plan-keuzes het stopmoment op "leeftijd 60" (of PUT `/api/fire-settings` `{fire_stop_anchor:'age', fire_stop_age:60}` vanaf `/mijn`), laad `/toekomst`, scroll tot de duiding in beeld is; de hero-tegel **VRIJ MOGELIJK VANAF** toont een getal, geen "—". Zet daarna het plan terug op "zo vroeg als het kan".

- [ ] **Step 7: Commit**

```bash
git add lib/horizon/scenario-presets.test.ts components/app/horizon/horizon-client.vrij-mogelijk-vanaf.test.ts components/app/horizon/horizon-client.tsx
git commit -m "fix(toekomst): de tweede run \"vrij mogelijk vanaf\" rekent met de geïnjecteerde grondslag, niet met de rauwe profielrij

Onder een budget-/transactiegrondslag is profiles.net_monthly_income 0/null; de
preset-batch kreeg die rauwe rij en solvete naar null → hero-tegel \"—\" onder een
vast anker. Nu dezelfde ADR 0103-injectie als de hoofdrun.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 1: Drie hefbomen — de pure laag (`salaris` uit het lab, euro-helpers, range-verhuizing)

**Files:**
- Modify: `lib/scenario-events.ts` (nieuwe exports; `computeSliderUiRange` hiernaartoe verhuisd)
- Modify: `lib/scenario-events.test.ts` (bestaat? zo niet: create)
- Modify: `components/app/horizon/whatif-sliders.tsx:28-73` (`computeSliderUiRange` wordt re-export)
- Modify: `lib/horizon/toekomst-scenario.ts:74, 302-314`
- Modify: `lib/horizon/toekomst-scenario.test.ts`
- Modify: `lib/horizon/toekomst-doel.ts:30-41`
- Modify: `lib/horizon/toekomst-doel.test.ts:44-60, 83-96, 151-160, 174-185`
- Modify: `app/api/toekomst-doel/schema.ts:25-31`
- Modify: `app/api/toekomst-doel/route.ts:400-405`
- Modify: `app/api/toekomst-doel/route.test.ts`
- Modify: `components/app/horizon/doel-vastleg-sheet.tsx:56-67`

**Interfaces:**
- Produces (lib/scenario-events.ts):
  - `export function savingsBaselineIncome(baseline: WhatIfOverrides): number` = `baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)` (de bestaande som uit `buildSliderEvent('savings')`, nu één home).
  - `export function savingsPpForMonthlyAmount(baseline: WhatIfOverrides, euroPerMaand: number): number | null` — procentpunten spaarquote die `euroPerMaand` minder uitgeven vertegenwoordigt: `baseline.savingsRate + euroPerMaand / savingsBaselineIncome(baseline) * 100`, `null` als de basis ≤ 0. Ongeclampt (de UI klemt).
  - `export function savingsEuroForPp(baseline: WhatIfOverrides, pp: number): number` = `Math.round(savingsBaselineIncome(baseline) * (pp - baseline.savingsRate) / 100)` (euro minder uitgeven t.o.v. nu; 0 op de basis).
  - `export function computeSliderUiRange(type, base, saved): { min: number; max: number }` — ongewijzigde body, verhuisd uit `whatif-sliders.tsx`.
- Produces (lib/horizon/toekomst-scenario.ts): `DOEL_PARAMETERS = ['spaarquote', 'rendement', 'fire', 'dekking'] as const`.
- Produces (lib/horizon/toekomst-doel.ts): `LEGACY_PARAMETER_GOAL_TYPES: readonly GoalType[] = ['salary']`.

- [ ] **Step 1: Falende tests voor de euro-helpers en de range-verhuizing**

Maak/vul `lib/scenario-events.test.ts` (bestaat het al: voeg het describe toe):

```ts
import { describe, it, expect } from 'vitest'
import {
  buildSliderEvent,
  readSliderValueFromEvents,
  savingsBaselineIncome,
  savingsPpForMonthlyAmount,
  savingsEuroForPp,
  computeSliderUiRange,
} from '@/lib/scenario-events'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'

const baseline: WhatIfOverrides = {
  monthlyIncome: 4000,
  workDaysPerWeek: 4,
  savingsRate: 20,
  expectedReturn: 6,
  extraContribution: 0,
}

describe('spaarquote in euro — één som voor event, weergave en antwoorden (spec §2)', () => {
  it('savingsBaselineIncome = maandinkomen × werkdagen/5 (de bestaande som van buildSliderEvent)', () => {
    expect(savingsBaselineIncome(baseline)).toBe(3200)
  })

  it('savingsEuroForPp geeft de euro-delta t.o.v. nu; op de basis is dat 0', () => {
    expect(savingsEuroForPp(baseline, 20)).toBe(0)
    expect(savingsEuroForPp(baseline, 25)).toBe(160)
    expect(savingsEuroForPp(baseline, 15)).toBe(-160)
  })

  it('savingsPpForMonthlyAmount is de inverse: €160 minder uitgeven = 25 pp', () => {
    expect(savingsPpForMonthlyAmount(baseline, 160)).toBeCloseTo(25, 9)
    expect(savingsPpForMonthlyAmount({ ...baseline, monthlyIncome: 0 }, 160)).toBeNull()
  })

  it('round-trip: het event dat buildSliderEvent bouwt voor die pp draagt exact −€160 monthly_cost_change', () => {
    const ev = buildSliderEvent('savings', 25, baseline, 40)
    expect(ev?.monthly_cost_change).toBe(-160)
    expect(readSliderValueFromEvents('savings', ev ? [ev] : [], baseline)).toBeCloseTo(25, 9)
  })

  it('computeSliderUiRange woont in lib (importeerbaar zonder component)', () => {
    expect(computeSliderUiRange('extra_inleg', 7600, 0)).toEqual({ min: 0, max: 1500 })
    expect(computeSliderUiRange('savings', 50, 50)).toEqual({ min: 40, max: 60 })
  })
})
```

- [ ] **Step 2: Draai — rood**

Run: `npx vitest run lib/scenario-events.test.ts`
Expected: FAIL — `savingsBaselineIncome`/`computeSliderUiRange` bestaan niet in `@/lib/scenario-events`.

- [ ] **Step 3: Implementeer in `lib/scenario-events.ts`**

Boven `buildSliderEvent` (rond regel 82):

```ts
/**
 * Basisinkomen waartegen de spaarquote-knop rekent: maandinkomen geschaald met de
 * werkdagen (4 van 5 dagen = 80%). ÉÉN home voor `buildSliderEvent('savings')`,
 * `readSliderValueFromEvents('savings')`, de euro-weergave van de knop "Minder
 * uitgeven" en het antwoordenblok (spec §2/§3, 15 sep 2026).
 */
export function savingsBaselineIncome(baseline: WhatIfOverrides): number {
  return baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)
}

/** Euro per maand minder uitgeven die een spaarquote van `pp` procentpunt betekent t.o.v. nu (0 op de basis). */
export function savingsEuroForPp(baseline: WhatIfOverrides, pp: number): number {
  return Math.round(savingsBaselineIncome(baseline) * ((pp - baseline.savingsRate) / 100))
}

/** Inverse: welke spaarquote (pp, ongeclampt) hoort bij `euroPerMaand` minder uitgeven; `null` zonder basisinkomen. */
export function savingsPpForMonthlyAmount(baseline: WhatIfOverrides, euroPerMaand: number): number | null {
  const basis = savingsBaselineIncome(baseline)
  if (basis <= 0) return null
  return baseline.savingsRate + (euroPerMaand / basis) * 100
}
```

Vervang in `buildSliderEvent` (regel 133) `const baselineIncome = baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)` door `const baselineIncome = savingsBaselineIncome(baseline)`; idem in `readSliderValueFromEvents` (regel 196).

Verhuis `computeSliderUiRange` (doc-comment + functie, `whatif-sliders.tsx:28-73`) letterlijk naar `lib/scenario-events.ts` (onderaan, vóór `applySliderEvent`). In `whatif-sliders.tsx` vervang je het blok door:

```ts
import { computeSliderUiRange } from '@/lib/scenario-events'
export { computeSliderUiRange }
```

(en voeg `computeSliderUiRange` toe aan de bestaande import op regel 4-9 i.p.v. een tweede import-regel).

- [ ] **Step 4: Draai — groen, plus de bestaande consumenten**

Run: `npx vitest run lib/scenario-events.test.ts components/app/horizon/whatif-sliders.test.tsx lib/horizon/toekomst-scenario.test.ts`
Expected: PASS.

- [ ] **Step 5: Falende tests voor `DOEL_PARAMETERS` zonder `salaris`**

`lib/horizon/toekomst-scenario.test.ts` — vervang het describe `— dekking als vijfde parameter (ADR 0145)` (regel 480) door:

```ts
describe('DOEL_PARAMETERS — vier parameters: spaarquote, rendement, fire, dekking (spec §2: salaris vervalt)', () => {
  it('bevat geen salaris meer en houdt de volgorde spaarquote → rendement → fire → dekking', () => {
    expect([...DOEL_PARAMETERS]).toEqual(['spaarquote', 'rendement', 'fire', 'dekking'])
  })

  it('parseToekomstScenarioPrefs blijft sliders.income tolerant lezen (legacy-prefs breken niet)', () => {
    const p = parseToekomstScenarioPrefs({ v: 2, sliders: { income: 5000, savings: 30 } })
    expect(p.sliders?.income).toBe(5000)
    expect(p.sliders?.savings).toBe(30)
  })
})
```

Voeg toe aan `describe('isDoelConceptGewijzigd', …)` (regel 339):

```ts
  it('een income-verschil telt niet meer mee: de knop bestaat niet meer, een legacy-stand met income mag geen eeuwige banner geven', () => {
    expect(isDoelConceptGewijzigd({ sliders: { savings: 30 } }, { sliders: { savings: 30, income: 5000 } })).toBe(false)
    expect(isDoelConceptGewijzigd({ sliders: { savings: 31 } }, { sliders: { savings: 30, income: 5000 } })).toBe(true)
  })
```

`lib/horizon/toekomst-doel.test.ts`:
- regel 44-60 (`it` "bouwt … in DOEL_PARAMETERS-volgorde"): verwachte volgorde wordt `['spaarquote', 'rendement', 'fire']` en goal_types `['savings_rate', 'expected_return', 'fire_age']`; verwijder `salaris: true` uit de input.
- regel 83-96: verwijder de `salary`-asserts (`byType.salary…`); de rendement-/spaarquote-formatasserts blijven.
- regel 151-160: input `{ parameters: { rendement: true }, doelwaarden: {} }` → `overgeslagen` wordt `['rendement']`.
- regel 174-185: verwachting wordt

```ts
    expect(PARAM_TO_GOAL_TYPE).toEqual({
      spaarquote: 'savings_rate',
      rendement: 'expected_return',
      fire: 'fire_age',
      dekking: 'plan_coverage',
    })
    expect(PARAMETER_GOAL_TYPES).toEqual(['savings_rate', 'expected_return', 'fire_age', 'plan_coverage'])
    expect(PARAMETER_GOAL_TYPES).toHaveLength(4)
    expect(LEGACY_PARAMETER_GOAL_TYPES).toEqual(['salary'])
```

- [ ] **Step 6: Draai — rood**

Run: `npx vitest run lib/horizon/toekomst-scenario.test.ts lib/horizon/toekomst-doel.test.ts`
Expected: FAIL (tsc-fout op `LEGACY_PARAMETER_GOAL_TYPES`, volgorde-asserts).

- [ ] **Step 7: Implementeer**

`lib/horizon/toekomst-scenario.ts:74`:

```ts
/**
 * De parameters die het lab als doel kan vastleggen. `salaris` verviel op 15 sep 2026
 * (spec lab-haalbaarheid §2): een salarisverhoging is rekenkundig dezelfde hefboom als
 * extra inleg. Bestaande `salary`-doelrijen blijven bestaan (LEGACY_PARAMETER_GOAL_TYPES
 * in toekomst-doel.ts); de pref-parser leest `sliders.income` tolerant en negeert 'm.
 */
export const DOEL_PARAMETERS = ['spaarquote', 'rendement', 'fire', 'dekking'] as const
```

`slidersGelijk` (regel 302-314): verwijder regel 308 (`income`-vergelijking) en pas het commentaar aan: "income telt niet meer (knop vervallen, spec §2) — een legacy-stand met income mag geen 'gewijzigd' geven."

`lib/horizon/toekomst-doel.ts:30-41`:

```ts
export const PARAM_TO_GOAL_TYPE: Record<DoelParameter, GoalType> = {
  spaarquote: 'savings_rate',
  rendement: 'expected_return',
  fire: 'fire_age',
  dekking: 'plan_coverage',
}

export const PARAMETER_GOAL_TYPES: readonly GoalType[] = DOEL_PARAMETERS.map(
  (p) => PARAM_TO_GOAL_TYPE[p],
)

/**
 * Doeltypen die het lab NIET meer aanmaakt maar die als rij nog bestaan (spec §2, 15 sep
 * 2026: de knop Maandinkomen verviel). Ze syncen zoals altijd; "Doelsituatie loslaten"
 * ruimt ze mee op.
 */
export const LEGACY_PARAMETER_GOAL_TYPES: readonly GoalType[] = ['salary']
```

Verwijder in `buildRow` de `case 'salaris'`-tak (regel 219-231) en `salarisMnd` uit `ParameterGoalInput.doelwaarden` (regel ~104). Laat `PARAMETER_GOAL_COLOR`/iconen staan.

`app/api/toekomst-doel/schema.ts:25-31`: verwijder `salaris: gekozen,` (z.object stript onbekende sleutels: een oude client die `salaris: true` stuurt breekt niet). Verwijder `salarisMnd` uit `DoelwaardenSchema`. Werk het doc-blok (regel 18-20) bij: "`salaris`/`salarisMnd` worden sinds 15 sep 2026 genegeerd."

`app/api/toekomst-doel/route.ts:400-405` (`handleLoslaten`): `.in('goal_type', [...PARAMETER_GOAL_TYPES, ...LEGACY_PARAMETER_GOAL_TYPES])` + import.

`components/app/horizon/doel-vastleg-sheet.tsx:56-67` (`buildLiveStand`): verwijder regel 58 en 62 (`income`), zodat een stand nooit meer `sliders.income` draagt.

- [ ] **Step 8: Route-test aanvullen**

In `app/api/toekomst-doel/route.test.ts` (patroon van de bestaande loslaten-test; profiel-mock met `mockReturnValueOnce`): voeg toe

```ts
  it('loslaten verwijdert óók legacy salary-rijen (bron parameter), hoewel het lab die niet meer aanmaakt', async () => {
    // arrange zoals de bestaande loslaten-test …
    // assert: de .in('goal_type', …)-aanroep bevat 'salary' én 'plan_coverage'
  })

  it('vastleggen met parameters.salaris wordt genegeerd (geen 400, geen salary-rij)', async () => {
    // body: { action: 'vastleggen', parameters: { spaarquote: true, salaris: true }, stand: {}, doelwaarden: { spaarquotePct: 30, salarisMnd: 5000 } }
    // assert: 200, alleen savings_rate geüpsert
  })
```

Schrijf de arrange/assert uit naar het patroon van de bestaande tests in dat bestand (zelfde `mockSupabase`-helper).

- [ ] **Step 9: Verifiëren + commit**

Run: `npx tsc --noEmit` → verwacht fouten in `horizon-client.tsx` (`salaris`, `salarisMnd`) — die lost Task 2 op; noteer ze, ga door als het alleen díe fouten zijn.
Run: `npx vitest run lib/scenario-events.test.ts lib/horizon components/app/horizon/whatif-sliders.test.tsx components/app/horizon/doel-vastleg-sheet.test.tsx app/api/toekomst-doel` → PASS (behalve eventuele tests die `salaris` via horizon-client raken — noteer).

```bash
git add lib/scenario-events.ts lib/scenario-events.test.ts components/app/horizon/whatif-sliders.tsx lib/horizon/toekomst-scenario.ts lib/horizon/toekomst-scenario.test.ts lib/horizon/toekomst-doel.ts lib/horizon/toekomst-doel.test.ts app/api/toekomst-doel/schema.ts app/api/toekomst-doel/route.ts app/api/toekomst-doel/route.test.ts components/app/horizon/doel-vastleg-sheet.tsx
git commit -m "feat(toekomst): salaris vervalt als lab-parameter; spaarquote krijgt één euro-som (spec §2)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(Als tsc rood is op horizon-client: commit tóch, met Task 2 direct erachter in dezelfde sessie — of voer Task 1+2 als één commit uit. Nooit een rode tree pushen.)

---

### Task 2: Drie hefbomen — de UI (`whatif-sliders.tsx` + horizon-client-bedrading)

**Files:**
- Modify: `components/app/horizon/whatif-sliders.tsx:175-271`
- Modify: `components/app/horizon/whatif-sliders.test.tsx:82-129`
- Modify: `lib/horizon/anker-copy.ts` (hefboom-kopij)
- Modify: `components/app/horizon/horizon-client.tsx:1944-1949, 3590-3600, 3649-3661, 3806-3811, 6926-6942`

**Interfaces:**
- Consumes: `savingsEuroForPp`, `computeSliderUiRange` (Task 1).
- Produces (anker-copy.ts): `export const HEFBOOM_COPY = { meerOpzij: 'Meer opzij', minderUitgeven: 'Minder uitgeven', laterEerder: 'Later of eerder stoppen', minderWerken: 'Minder werken', werkdagen: 'Werkdagen per week' } as const`.

- [ ] **Step 1: Tests herschrijven (rood)**

`components/app/horizon/whatif-sliders.test.tsx` regel 102-128 vervangen door:

```ts
  it('benoemt de drie hefbomen bij naam; werkdagen zit onder "Minder werken" (spec §2)', () => {
    renderSliders()
    expect(screen.getByRole('slider', { name: 'Meer opzij' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Minder uitgeven' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Maandinkomen' })).toBeNull()
    // ingeklapt: de werkdagen-slider is er pas na openklappen
    expect(screen.queryByRole('slider', { name: 'Werkdagen per week' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Minder werken/ }))
    expect(screen.getByRole('slider', { name: 'Werkdagen per week' })).toBeInTheDocument()
  })

  it('Minder uitgeven toont euro per maand t.o.v. nu (0 op de basis), Meer opzij euro', () => {
    renderSliders()
    expect(screen.getByRole('slider', { name: 'Minder uitgeven' })).toHaveAttribute('aria-valuetext', formatCurrency(0))
    expect(screen.getByRole('slider', { name: 'Meer opzij' })).toHaveAttribute('aria-valuetext', formatCurrency(0))
  })

  it('Minder uitgeven schuift nog steeds in procentpunten onder de motorkap (event-shape ongewijzigd)', () => {
    const setEvents = vi.fn()
    render(<WhatIfSliders baseline={baseline} events={[]} setEvents={setEvents} currentAge={40} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Minder uitgeven' }), { target: { value: '25' } })
    expect(setEvents).toHaveBeenCalled()
    const updater = setEvents.mock.calls[0][0] as (prev: WhatIfEvent[]) => WhatIfEvent[]
    const next = updater([])
    expect(next[0]?.scenario_origin).toBe('slider:savings')
    expect(next[0]?.monthly_cost_change).toBe(-150) // 3000 × 5/5 × 5pp
  })
```

(imports: `fireEvent`, `vi`, `WhatIfEvent` — controleer wat het bestand al importeert.) De iOS-tests (regel 139-190) gebruiken de `Spaarquote`-slider als handle → hernoem daar naar `'Minder uitgeven'`.

- [ ] **Step 2: Draai — rood**

Run: `npx vitest run components/app/horizon/whatif-sliders.test.tsx`
Expected: FAIL (sliders heten nog Maandinkomen/Spaarquote/Extra inleg).

- [ ] **Step 3: Kopij in anker-copy.ts**

Onder `ANKER_KPI_LABEL_KORT` (regel 175):

```ts
/** De drie hefbomen + de secundaire knop (spec lab-haalbaarheid §2/§5, 15 sep 2026). */
export const HEFBOOM_COPY = {
  meerOpzij: 'Meer opzij',
  minderUitgeven: 'Minder uitgeven',
  laterEerder: 'Later of eerder stoppen',
  minderWerken: 'Minder werken',
  werkdagen: 'Werkdagen per week',
} as const
```

- [ ] **Step 4: `SliderGrid` herbouwen**

Vervang `SliderGrid` (`whatif-sliders.tsx:175-271`) door:

```tsx
function SliderGrid({ baseline, events, setEvents, currentAge }: SlidersProps) {
  const [minderWerkenOpen, setMinderWerkenOpen] = useState(false)
  const workdaysValue = readSliderValueFromEvents('workdays', events, baseline)
  const savingsValue = readSliderValueFromEvents('savings', events, baseline)
  const extraValue = readSliderValueFromEvents('extra_inleg', events, baseline)

  // Zichtbaar UI-bereik (±20% rond de basisstand) — met verbreding-vangnet zodat een opgeslagen
  // waarde buiten de band niet clampt. Validatie-clamps blijven ongewijzigd.
  const workdaysRange = computeSliderUiRange('workdays', baseline.workDaysPerWeek, workdaysValue)
  const savingsRange = computeSliderUiRange('savings', baseline.savingsRate, savingsValue)
  // Extra inleg = bóvenop je huidige inleg (basis 0); het bereik hangt aan het maandinkomen.
  const extraRange = computeSliderUiRange('extra_inleg', baseline.monthlyIncome, extraValue)
  const dayLabel = (n: number) => `${n} dag${n === 1 ? '' : 'en'}`
  // Spec §2: de spaarquote-knop schuift onder de motorkap in procentpunten (event-shape en
  // savings_rate-doel ongewijzigd); alleen de WEERGAVE is euro per maand minder uitgeven.
  const euroMinder = (pp: number) => formatCurrency(savingsEuroForPp(baseline, pp))

  const setSliderValue = (key: SliderKey, value: number) => {
    const newEvent = buildSliderEvent(key, value, baseline, currentAge)
    setEvents(prev => applySliderEvent(prev, key, newEvent))
  }

  return (
    <div className="xl:grid xl:grid-cols-2 xl:gap-x-6">
      <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
        <SliderRow
          label={HEFBOOM_COPY.meerOpzij}
          hint="→ Extra-inleg-event"
          value={extraValue}
          baseValue={0}
          min={extraRange.min}
          max={extraRange.max}
          step={50}
          formatValue={formatCurrency}
          formatDelta={v => formatCurrency(v) + '/mnd'}
          onChange={v => setSliderValue('extra_inleg', v)}
          minLabel={formatCurrency(extraRange.min)}
          maxLabel={formatCurrency(extraRange.max)}
        />
      </div>

      <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
        <SliderRow
          label={HEFBOOM_COPY.minderUitgeven}
          hint="→ Spaarquote-event"
          value={savingsValue}
          baseValue={baseline.savingsRate}
          min={savingsRange.min}
          max={savingsRange.max}
          step={1}
          formatValue={euroMinder}
          formatDelta={v => formatCurrency(savingsEuroForPp(baseline, baseline.savingsRate + v)) + '/mnd'}
          onChange={v => setSliderValue('savings', v)}
          minLabel={euroMinder(savingsRange.min)}
          maxLabel={euroMinder(savingsRange.max)}
        />
      </div>

      {/* Secundair: parttime is een levenskeuze, geen geldhefboom (spec §2) — ingeklapt. */}
      <div className="xl:col-span-2">
        <button
          type="button"
          onClick={() => setMinderWerkenOpen(o => !o)}
          aria-expanded={minderWerkenOpen}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
        >
          <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {HEFBOOM_COPY.minderWerken}
            {workdaysValue !== baseline.workDaysPerWeek && (
              <span className="ml-2 font-mono text-[10px] font-normal normal-case tracking-normal text-horizon-700">
                {dayLabel(workdaysValue)}
              </span>
            )}
          </span>
          {minderWerkenOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
          )}
        </button>
        {minderWerkenOpen && (
          <SliderRow
            label={HEFBOOM_COPY.werkdagen}
            hint="→ Part-time-event"
            value={workdaysValue}
            baseValue={baseline.workDaysPerWeek}
            min={workdaysRange.min}
            max={workdaysRange.max}
            step={1}
            formatValue={v => `${v} dagen`}
            formatDelta={v => `${v} dag${Math.abs(v) !== 1 ? 'en' : ''}`}
            onChange={v => setSliderValue('workdays', v)}
            minLabel={dayLabel(workdaysRange.min)}
            maxLabel={dayLabel(workdaysRange.max)}
          />
        )}
      </div>
    </div>
  )
}
```

Imports bovenaan: `import { useState } from 'react'`, `import { ChevronDown, ChevronUp } from 'lucide-react'`, `savingsEuroForPp` + `computeSliderUiRange` bij de `@/lib/scenario-events`-import, `import { HEFBOOM_COPY } from '@/lib/horizon/anker-copy'`. Werk de doc-comment op regel 273-277 bij ("drie hefbomen + Minder werken, spec §2").

Slider-kopij "Later of eerder stoppen" hoort bij de stop-slider in de Vrijheidsas (Task 4), niet hier.

- [ ] **Step 5: horizon-client ontkoppelen van `income`/`salaris`**

- `:1944-1949` (pref-hydratie `KEY_MAP`) en `:3806-3811` (`handleDoelHerstellen`): verwijder de regel `income: 'income',` — een legacy-pref met `sliders.income` wordt genegeerd (spec §2/§6).
- `:3597-3600` (`doelPreviews`): verwijder het `salaris`-blok.
- `:3654-3657` (`handleDoelVastleggen`): verwijder `salarisMnd`.
- `:6928-6932` (badge-rij): verwijder de income-`DeltaBadge`; de savings-badge (`:6933-6937`) krijgt `format={v => formatCurrency(savingsEuroForPp(whatIfBaseline, whatIfBaseline.savingsRate + v)) + '/mnd minder uitgeven'}` (import `savingsEuroForPp`).
- Grep `readSliderValueFromEvents('income'` en `'salaris'` in horizon-client: verwacht 0 treffers na deze stap.

- [ ] **Step 6: Verifiëren + commit**

Run: `npx tsc --noEmit` → schoon.
Run: `npx vitest run components/app/horizon/whatif-sliders.test.tsx components/app/horizon/horizon-client.lab-uitkomst.test.ts components/app/horizon/horizon-client.doel-loslaten-terugweg.test.ts components/app/horizon/doel-vastleg-sheet.test.tsx lib/horizon` → PASS.
Handmatig (chrome-devtools, solved-profiel): lab toont Meer opzij · Minder uitgeven · Minder werken (ingeklapt); Minder uitgeven toont "€ 0" op de basis en euro's bij schuiven; "Maak dit mijn doel" → sheet zonder Salaris-rij; `/toekomst/doelen` toont een bestaand salaris-doel (indien aanwezig) nog gewoon.

```bash
git add components/app/horizon/whatif-sliders.tsx components/app/horizon/whatif-sliders.test.tsx lib/horizon/anker-copy.ts components/app/horizon/horizon-client.tsx
git commit -m "feat(toekomst): drie hefbomen in het lab — Meer opzij, Minder uitgeven, Minder werken (spec §2)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: De dekkingsbalk (puur presentational component) + kopij

**Files:**
- Modify: `lib/horizon/anker-copy.ts` (+ `.test.ts`)
- Create: `components/app/horizon/dekkingsbalk.tsx`
- Create: `components/app/horizon/dekkingsbalk.test.tsx`

**Interfaces:**
- Produces (anker-copy.ts):

```ts
export const DEKKINGSAS_COPY = {
  kop: 'Reikt je plan?',
  tag: 'de dekking',
  sliderLabel: 'Doorwerken tot',
  tegelReikt: 'Reikt tot',
  tegelPlan: 'Plan tot',
  tegelGedekt: 'Gedekt',
} as const
```

- Produces (dekkingsbalk.tsx):

```ts
export interface DekkingsasData {
  /** Het stopmoment van het plan als leeftijd (`now` → huidige leeftijd); `null` = onbekend. */
  stopAge: number | null
  /** Eindleeftijd van het plan (`displayEndAge`). */
  eindAge: number | null
  basisReach: AnkerReach
  basisPct: number | null
  /** Wat-als-run; `null` zonder scenario. */
  scenarioReach: AnkerReach | null
  scenarioPct: number | null
  /** Verkend stopmoment (stop-pad); `null` zonder stopkeuze. */
  verkendReach: AnkerReach | null
  verkendStopAge: number | null
}
export function dekkingsbalkPosities(d: DekkingsasData): { basisPct: number; scenarioPct: number | null; verkendPct: number | null } | null
export function Dekkingsbalk({ data, masked }: { data: DekkingsasData; masked?: boolean }): JSX.Element
```

`dekkingsbalkPosities` (puur, getest): schaal van `stopAge` (0 %) tot `eindAge` (100 %); positie van een reach = `ankerReachesAge(reach)` geklemd op [stopAge, eindAge] → percentage; `gedekt` = 100. `null` als `stopAge`/`eindAge` ontbreken of `eindAge <= stopAge`.

- [ ] **Step 1: Test voor de kopij en de posities (rood)**

`lib/horizon/anker-copy.test.ts` — nieuw describe onderaan:

```ts
describe('dekkingsas-kopij (spec lab-haalbaarheid §5)', () => {
  it('draagt de vastgestelde woorden letterlijk', () => {
    expect(DEKKINGSAS_COPY).toEqual({
      kop: 'Reikt je plan?',
      tag: 'de dekking',
      sliderLabel: 'Doorwerken tot',
      tegelReikt: 'Reikt tot',
      tegelPlan: 'Plan tot',
      tegelGedekt: 'Gedekt',
    })
  })
})
```

`components/app/horizon/dekkingsbalk.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Dekkingsbalk, dekkingsbalkPosities, type DekkingsasData } from './dekkingsbalk'

const basis: DekkingsasData = {
  stopAge: 60,
  eindAge: 90,
  basisReach: { kind: 'reikt-tot', age: 75, endAge: 90 },
  basisPct: 50,
  scenarioReach: null,
  scenarioPct: null,
  verkendReach: null,
  verkendStopAge: null,
}

describe('dekkingsbalkPosities — één schaal van stop tot eind', () => {
  it('reikt-tot 75 op een as 60→90 staat op 50%', () => {
    expect(dekkingsbalkPosities(basis)).toEqual({ basisPct: 50, scenarioPct: null, verkendPct: null })
  })
  it('gedekt = 100%, nu-op = 0%, klemt buiten de as', () => {
    expect(dekkingsbalkPosities({ ...basis, basisReach: { kind: 'gedekt', endAge: 90 } })?.basisPct).toBe(100)
    expect(dekkingsbalkPosities({ ...basis, basisReach: { kind: 'nu-op' } })?.basisPct).toBe(0)
    expect(dekkingsbalkPosities({ ...basis, basisReach: { kind: 'reikt-tot', age: 95, endAge: 90 } })?.basisPct).toBe(100)
  })
  it('de wat-als-run zet een tweede markering', () => {
    expect(dekkingsbalkPosities({ ...basis, scenarioReach: { kind: 'reikt-tot', age: 84, endAge: 90 }, scenarioPct: 80 })?.scenarioPct).toBe(80)
  })
  it('zonder stop of eind, of met eind ≤ stop, is er geen as', () => {
    expect(dekkingsbalkPosities({ ...basis, stopAge: null })).toBeNull()
    expect(dekkingsbalkPosities({ ...basis, eindAge: 60 })).toBeNull()
  })
})

describe('Dekkingsbalk — rendering', () => {
  it('toont de drie tegels Reikt tot · Plan tot · Gedekt met basis → wat-als', () => {
    render(<Dekkingsbalk data={{ ...basis, scenarioReach: { kind: 'reikt-tot', age: 84, endAge: 90 }, scenarioPct: 80 }} />)
    expect(screen.getByText('Reikt tot')).toBeInTheDocument()
    expect(screen.getByText('Plan tot')).toBeInTheDocument()
    expect(screen.getByText('Gedekt')).toBeInTheDocument()
    expect(screen.getByTestId('dekkingsbalk-reikt')).toHaveTextContent('75 → 84')
    expect(screen.getByTestId('dekkingsbalk-gedekt')).toHaveTextContent('50% → 80%')
    expect(screen.getByTestId('dekkingsbalk-plan')).toHaveTextContent('90')
  })
  it('kleurt de vulling met het stoplicht: tekort = warning, gedekt = positive — nooit een module-accent', () => {
    const { container, rerender } = render(<Dekkingsbalk data={basis} />)
    expect(container.querySelector('[data-testid="dekkingsbalk-vulling"]')?.className).toContain('bg-warning')
    rerender(<Dekkingsbalk data={{ ...basis, basisReach: { kind: 'gedekt', endAge: 90 }, basisPct: 100 }} />)
    expect(container.querySelector('[data-testid="dekkingsbalk-vulling"]')?.className).toContain('bg-positive')
    expect(container.innerHTML).not.toMatch(/bg-horizon-/)
  })
  it('heeft een toegankelijke meter (role=meter, aria-valuenow = basis-dekking)', () => {
    render(<Dekkingsbalk data={basis} />)
    expect(screen.getByRole('meter', { name: /dekking/i })).toHaveAttribute('aria-valuenow', '50')
  })
})
```

- [ ] **Step 2: Draai — rood**

Run: `npx vitest run components/app/horizon/dekkingsbalk.test.tsx lib/horizon/anker-copy.test.ts`
Expected: FAIL (module bestaat niet; `DEKKINGSAS_COPY` bestaat niet).

- [ ] **Step 3: Implementeer kopij + component**

`lib/horizon/anker-copy.ts` — onder `HEFBOOM_COPY`:

```ts
/** Sectie 2 van de Vrijheidsas onder een vast anker (spec lab-haalbaarheid §1/§5). */
export const DEKKINGSAS_COPY = {
  kop: 'Reikt je plan?',
  tag: 'de dekking',
  sliderLabel: 'Doorwerken tot',
  tegelReikt: 'Reikt tot',
  tegelPlan: 'Plan tot',
  tegelGedekt: 'Gedekt',
} as const
```

`components/app/horizon/dekkingsbalk.tsx`:

```tsx
'use client'

import { ankerReachesAge, DEKKINGSAS_COPY, type AnkerReach } from '@/lib/horizon/anker-copy'
import { leeftijdJaar } from '@/lib/horizon/hero-fire-age'

/**
 * De DEKKINGSAS (spec lab-haalbaarheid §1, 15 sep 2026): één horizontale schaal van het
 * stopmoment van het plan tot de eindleeftijd, gevuld tot waar het plan reikt; de
 * wat-als-run en het verkende stopmoment zetten extra markeringen. Puur presentational —
 * elke waarde komt uit `resolveLabUitkomst` (ADR 0145), hier wordt niets herrekend.
 * Stoplichtkleur op de vulling (tekort = warning, gedekt = positive), nooit een module-accent.
 */
export interface DekkingsasData {
  stopAge: number | null
  eindAge: number | null
  basisReach: AnkerReach
  basisPct: number | null
  scenarioReach: AnkerReach | null
  scenarioPct: number | null
  verkendReach: AnkerReach | null
  verkendStopAge: number | null
}

function posOf(reach: AnkerReach, stopAge: number, eindAge: number): number {
  if (reach.kind === 'gedekt') return 100
  if (reach.kind === 'nu-op') return 0
  const age = ankerReachesAge(reach)
  if (age == null) return 0
  const clamped = Math.max(stopAge, Math.min(eindAge, age))
  return ((clamped - stopAge) / (eindAge - stopAge)) * 100
}

/** Posities (0–100 %) op de as stop→eind; `null` zonder bruikbare as. */
export function dekkingsbalkPosities(d: DekkingsasData): { basisPct: number; scenarioPct: number | null; verkendPct: number | null } | null {
  if (d.stopAge == null || d.eindAge == null || !(d.eindAge > d.stopAge)) return null
  return {
    basisPct: posOf(d.basisReach, d.stopAge, d.eindAge),
    scenarioPct: d.scenarioReach ? posOf(d.scenarioReach, d.stopAge, d.eindAge) : null,
    verkendPct: d.verkendReach ? posOf(d.verkendReach, d.stopAge, d.eindAge) : null,
  }
}

function reachLabel(reach: AnkerReach | null, eindAge: number | null): string {
  if (!reach) return '—'
  switch (reach.kind) {
    case 'gedekt': return eindAge != null ? `voorbij ${leeftijdJaar(eindAge)}` : 'einde plan'
    case 'reikt-tot': return String(leeftijdJaar(reach.age))
    case 'nu-op': return 'nu'
    case 'onbekend': return '—'
  }
}

function pctLabel(pct: number | null): string {
  if (pct == null) return '—'
  return `${pct >= 100 ? 100 : Math.min(99, Math.round(pct))}%`
}

function Tegel({ kicker, value, testId }: { kicker: string; value: string; testId: string }) {
  return (
    <div>
      <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">{kicker}</div>
      <div data-testid={testId} className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">{value}</div>
    </div>
  )
}

export function Dekkingsbalk({ data, masked = false }: { data: DekkingsasData; masked?: boolean }) {
  const pos = dekkingsbalkPosities(data)
  const gedekt = data.basisReach.kind === 'gedekt'
  const vulling = gedekt ? 'bg-positive' : 'bg-warning'
  const basisPctNum = data.basisPct == null ? 0 : Math.max(0, Math.min(100, Math.round(data.basisPct)))
  const arrow = (a: string, b: string | null) => (b != null && b !== a ? `${a} → ${b}` : a)

  return (
    <div>
      <div
        role="meter"
        aria-label="Dekking van je plan"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={basisPctNum}
        className="relative mt-6 h-2.5 overflow-hidden rounded-full bg-[var(--border-ed)]"
      >
        {pos && (
          <>
            <div data-testid="dekkingsbalk-vulling" className={`h-full ${vulling}`} style={{ width: `${pos.basisPct}%` }} />
            {pos.scenarioPct != null && (
              <div aria-hidden className="absolute -top-1 h-[18px] w-px -translate-x-1/2 bg-[var(--ink)]" style={{ left: `${pos.scenarioPct}%` }} />
            )}
            {pos.verkendPct != null && (
              <div aria-hidden className="absolute -top-1 h-[18px] w-px -translate-x-1/2 border-l border-dashed border-[var(--ink-3)]" style={{ left: `${pos.verkendPct}%` }} />
            )}
          </>
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)]">
        <span>{data.stopAge != null ? `stop ${leeftijdJaar(data.stopAge)}` : 'stop'}</span>
        <span>{data.eindAge != null ? `plan tot ${leeftijdJaar(data.eindAge)}` : 'eind'}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--border-ed)] pt-4">
        <Tegel kicker={DEKKINGSAS_COPY.tegelReikt} testId="dekkingsbalk-reikt" value={arrow(reachLabel(data.basisReach, data.eindAge), data.scenarioReach ? reachLabel(data.scenarioReach, data.eindAge) : null)} />
        <Tegel kicker={DEKKINGSAS_COPY.tegelPlan} testId="dekkingsbalk-plan" value={data.eindAge != null ? String(leeftijdJaar(data.eindAge)) : '—'} />
        <Tegel kicker={DEKKINGSAS_COPY.tegelGedekt} testId="dekkingsbalk-gedekt" value={masked ? '···' : arrow(pctLabel(data.basisPct), data.scenarioPct != null ? pctLabel(data.scenarioPct) : null)} />
      </div>
    </div>
  )
}
```

Controleer dat `leeftijdJaar` in `@/lib/horizon/hero-fire-age` bestaat (anker-copy.ts importeert 'm op regel 44 als `heroFireAgeYear`); gebruik anders diezelfde import-vorm. Controleer dat de tokens `bg-positive` / `bg-warning` bestaan in `app/globals.css` (`text-positive`/`bg-positive-bg` zijn zeker; zo niet, gebruik `bg-positive-bg`/`bg-warning-bg` en pas de test-substring aan).

- [ ] **Step 4: Draai — groen + commit**

Run: `npx vitest run components/app/horizon/dekkingsbalk.test.tsx lib/horizon/anker-copy.test.ts` → PASS. `npx tsc --noEmit` → schoon.

```bash
git add lib/horizon/anker-copy.ts lib/horizon/anker-copy.test.ts components/app/horizon/dekkingsbalk.tsx components/app/horizon/dekkingsbalk.test.tsx
git commit -m "feat(toekomst): dekkingsbalk — één as van stopmoment tot eindleeftijd met de drie tegels (spec §1)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Sectie 2 van de Vrijheidsas onder een vast anker + bedrading in horizon-client

**Files:**
- Modify: `components/app/horizon/vrijheidsas.tsx:198-292 (props), 508-792 (sectie 2 + cijferrij)`
- Modify: `components/app/horizon/vrijheidsas.test.tsx` (describe `— vast anker`, regel 358)
- Modify: `components/app/horizon/horizon-client.tsx:6979-7076` (+ nieuwe memo `dekkingsasData`)
- Modify: `components/app/horizon/horizon-client.lab-uitkomst.test.ts` (nieuwe `it`)

**Interfaces:**
- Consumes: `Dekkingsbalk`, `DekkingsasData`, `DEKKINGSAS_COPY` (Task 3); `labDekking: LabUitkomstDekking | null` (`horizon-client.tsx:2807`).
- Produces (vrijheidsas.tsx): nieuwe prop `dekking?: DekkingsasData | null` (default `null`). Gedrag: `ankerVast && dekking` ⇒ sectie 2 = dekkingsas; anders ongewijzigd.

- [ ] **Step 1: Tests (rood)**

Voeg toe aan `describe('Vrijheidsas — vast anker (ADR 0129 F3b, B-038, TPR-09)', …)` in `vrijheidsas.test.tsx`:

```tsx
  const dekking: DekkingsasData = {
    stopAge: 58.5, eindAge: 90,
    basisReach: { kind: 'reikt-tot', age: 82, endAge: 90 }, basisPct: 65,
    scenarioReach: null, scenarioPct: null, verkendReach: null, verkendStopAge: null,
  }

  it('sectie 2 wordt de dekkingsas: kop "Reikt je plan?", slider "Doorwerken tot", tegels Reikt tot · Plan tot · Gedekt', () => {
    render(<Vrijheidsas {...baseProps} ankerVast planStopAge={58.5} dekking={dekking} onMaakPlan={() => {}} />)
    expect(screen.getByText('Reikt je plan?')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Doorwerken tot' })).toBeInTheDocument()
    expect(screen.getByText('Reikt tot')).toBeInTheDocument()
    expect(screen.getByText('Plan tot')).toBeInTheDocument()
    expect(screen.getByText('Gedekt')).toBeInTheDocument()
  })

  it('onder een vast anker verdwijnen marge-band, verwacht-streep, koppel-checkbox en de FIRE-tegels', () => {
    const { container } = render(<Vrijheidsas {...baseProps} ankerVast planStopAge={58.5} dekking={dekking} />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText('verwacht')).toBeNull()
    expect(screen.queryByText(/^marge/)).toBeNull()
    expect(screen.queryByText('Basis-vrijheid')).toBeNull()
    expect(screen.queryByText('Verwacht vrij')).toBeNull()
    expect(screen.queryByText('Verkend stopmoment')).toBeNull()
    expect(container.querySelector('.bg-emerald-500')).toBeNull()
  })

  it('de knoppen "Maak dit mijn plan" en "Je plan-keuzes" blijven onder de dekkingsas', () => {
    const onMaakPlan = vi.fn()
    render(<Vrijheidsas {...baseProps} ankerVast planStopAge={58.5} dekking={dekking} onMaakPlan={onMaakPlan} onKeuzesOpenen={() => {}} stopAge={61} />)
    fireEvent.click(screen.getByRole('button', { name: 'Maak dit mijn plan' }))
    expect(onMaakPlan).toHaveBeenCalledWith(61)
    expect(screen.getByRole('button', { name: /plan-keuzes/ })).toBeInTheDocument()
  })

  it('onder het nu-anker: geen slider, wél de balk met alleen het plan', () => {
    render(<Vrijheidsas {...baseProps} ankerVast stopKeuzeVerborgen dekking={{ ...dekking, stopAge: 40 }} />)
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByRole('meter', { name: /dekking/i })).toBeInTheDocument()
  })

  it('solved zonder dekking-prop: sectie 2 is byte-identiek aan vandaag (marge-band + tegels)', () => {
    render(<Vrijheidsas {...baseProps} />)
    expect(screen.getByText('Hoe stevig is dat?')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByText('Basis-vrijheid')).toBeInTheDocument()
  })
```

(import `DekkingsasData` uit `./dekkingsbalk`, `vi`/`fireEvent` indien nog niet geïmporteerd.)

- [ ] **Step 2: Draai — rood**

Run: `npx vitest run components/app/horizon/vrijheidsas.test.tsx`
Expected: FAIL (prop `dekking` onbekend; kop/labels ontbreken).

- [ ] **Step 3: Vrijheidsas aanpassen**

Prop toevoegen aan `VrijheidsasProps` (na `uitkomstNotitie`, regel 253):

```ts
  /**
   * Spec lab-haalbaarheid §1 (15 sep 2026): onder een vast anker is sectie 2 de
   * DEKKINGSAS — schaal stop→eind, slider "Doorwerken tot", tegels Reikt tot · Plan tot ·
   * Gedekt. Geen marge-band/verwacht-streep/koppel-checkbox/FIRE-tegels: die meten een
   * grootheid die de gebruiker onder een vast anker niet gekozen heeft. `null` ⇒ het
   * solved-gezicht (ongewijzigd).
   */
  dekking?: DekkingsasData | null
```

Destructuring (regel 305-330): `dekking = null,`. Import: `import { Dekkingsbalk, type DekkingsasData } from './dekkingsbalk'` en `import { DEKKINGSAS_COPY, HEFBOOM_COPY } from '@/lib/horizon/anker-copy'`.

Afleiding (bij `toonMaakPlan`, regel 410): `const dekkingsas = ankerVast && dekking != null`.

Sectie 2 (regel 508-764) herstructureren:

```tsx
        {(!stopKeuzeVerborgen || dekkingsas) && (
        <section className="min-w-0">
          <PanelHeader
            num="2"
            title={dekkingsas ? DEKKINGSAS_COPY.kop : 'Hoe stevig is dat?'}
            tag={dekkingsas ? DEKKINGSAS_COPY.tag : 'de marge'}
          />

          {!stopKeuzeVerborgen && (
            <>
              {/* stopleeftijd-regel (bestaand blok :517-552), met onder de dekkingsas het
                  label "Doorwerken tot" en zónder "verwacht …"/delta */}
              <div className="mt-4 mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  {dekkingsas ? DEKKINGSAS_COPY.sliderLabel : 'Gewenste stopleeftijd'}
                </span>
                <span className="rounded-full border border-horizon-300 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-horizon-700">
                  verkenning
                </span>
                <span className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0.5">
                  <span className="font-mono text-sm tabular-nums text-[var(--ink)]">{formatAge(stopAge)}</span>
                  {!dekkingsas && verwachtFireAge !== null && ( /* bestaand */ )}
                  {!dekkingsas && showStopDelta && ( /* bestaand */ )}
                </span>
              </div>
              <input
                type="range" … (bestaand :554-569)
                aria-label={dekkingsas ? DEKKINGSAS_COPY.sliderLabel : 'Gewenste stopleeftijd'}
                aria-valuetext={dekkingsas ? `${formatAge(stopAge)} jaar` : `…bestaand…`}
              />
              {/* verkenning-vs-plan-blok + knoppen (:582-622) — ONGEWIJZIGD */}
            </>
          )}

          {dekkingsas ? (
            <Dekkingsbalk data={dekking} />
          ) : (
            <>
              {/* marge-band-container (:626-724), zone-zin (:727-731), onzekerheidszin
                  (:734-748), koppel-checkbox (:750-762) — ONGEWIJZIGD, letterlijk verplaatst
                  in deze else-tak */}
            </>
          )}
        </section>
        )}
```

De kopij "Later of eerder stoppen" (HEFBOOM_COPY.laterEerder) komt als tekst in het verkenning-vs-plan-blok onder de dekkingsas: vervang in dat blok (regel 588-598) de eerste zin door `{dekkingsas ? `${HEFBOOM_COPY.laterEerder}: dit is een verkenning — je plan verandert er niet van.` : 'Dit is een verkenning: de lijn verschuift alleen hier.'}`.

Cijferrij (regel 770-792): gate wordt `{!stopKeuzeVerborgen && !dekkingsas && (…)}` — de tegels zitten onder de dekkingsas in de balk zelf.

Update de module-doc bovenaan (regel 1-33) en de docstring bij `ankerVast` (regel 241-247) met één zin over de twee gezichten.

- [ ] **Step 4: Bedrading in horizon-client**

Na `labDekking` (`:2807`):

```ts
  // Spec lab-haalbaarheid §1 — de dekkingsas leest uitsluitend de lab-uitkomst (ADR 0145).
  const dekkingsasData = useMemo<DekkingsasData | null>(() => {
    if (labDekking == null) return null
    const stopAge = labDekking.stop == null ? null : labDekking.stop.kind === 'now' ? currentAge : labDekking.stop.stopAge
    return {
      stopAge,
      eindAge: labDekking.eind,
      basisReach: labDekking.basisReach,
      basisPct: labDekking.basisPct,
      scenarioReach: labDekking.scenarioReach,
      scenarioPct: labDekking.scenarioPct,
      verkendReach: labDekking.verkendReach,
      verkendStopAge: labDekking.verkendStopAge,
    }
  }, [labDekking, currentAge])
```

Import `type DekkingsasData` uit `./dekkingsbalk`. Op `<Vrijheidsas …>` (`:7004`, naast `ankerVast`): `dekking={dekkingsasData}`.

Bron-grendel in `horizon-client.lab-uitkomst.test.ts` — nieuwe `it`:

```ts
  it('de dekkingsas krijgt zijn data uit labDekking (geen eigen som)', () => {
    const src = bron()
    const start = src.indexOf('const dekkingsasData = useMemo')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, src.indexOf('}, [labDekking', start))
    expect(blok).toContain('basisReach: labDekking.basisReach')
    expect(blok).toContain('basisPct: labDekking.basisPct')
    expect(blok).not.toMatch(/\/ 12|eindMaand|computeRunwayCoveragePct/)
    expect(src).toContain('dekking={dekkingsasData}')
  })
```

- [ ] **Step 5: Verifiëren + commit**

Run: `npx tsc --noEmit` → schoon.
Run: `npx vitest run components/app/horizon/vrijheidsas.test.tsx components/app/horizon/horizon-client.lab-uitkomst.test.ts components/app/horizon/horizon-client.nu-stoppen.test.ts components/app/horizon/dekkingsbalk.test.tsx` → PASS.
Handmatig (chrome-devtools): **solved** → sectie 2 identiek aan vandaag. **age 60, plan tot 90** → sectie 2 "Reikt je plan? — de dekking", slider "Doorwerken tot", balk gevuld tot REIKT TOT, tegels; sliden verplaatst de gestippelde markering en de tegels tonen basis → wat-als; geen checkbox/marge-band. **now** → geen slider, wel balk. Screenshot per toestand in de scratchpad.

```bash
git add components/app/horizon/vrijheidsas.tsx components/app/horizon/vrijheidsas.test.tsx components/app/horizon/horizon-client.tsx components/app/horizon/horizon-client.lab-uitkomst.test.ts
git commit -m "feat(toekomst): sectie 2 van de Vrijheidsas is onder een vast anker de dekkingsas (spec §1)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Antwoordenblok "Wat maakt het haalbaar?" bij een tekort

**Files:**
- Modify: `lib/horizon/anker-copy.ts` (+ `.test.ts:270-306` vervangen)
- Create: `lib/horizon/lab-antwoorden.ts`, `lib/horizon/lab-antwoorden.test.ts`
- Modify: `components/app/horizon/horizon-client.tsx:2815-2840 (planTekortHint → antwoorden), 7088-7145 (render)`
- Modify: `components/app/horizon/horizon-client.lab-uitkomst.test.ts:102-125` (seed-/masked-grendels herschrijven)
- Modify: `components/app/horizon/horizon-client.wat-hoort-daarbij.test.ts` (stop-pad-blok alleen onder solved)

**Interfaces:**
- Consumes: `LabUitkomstDekking` (`lib/horizon/lab-uitkomst.ts:111-132`), `solvedRun.fireAge` (`horizon-client.tsx:695`), `computeSliderUiRange`, `savingsPpForMonthlyAmount` (Task 1), `WhatIfOverrides`.
- Produces (anker-copy.ts):

```ts
export const ANTWOORDEN_KOP = 'Wat maakt het haalbaar?'
export const ANTWOORD_KNOP = 'Reken hiermee'
export const ANTWOORD_BOVEN_BEREIK = 'Dat is meer dan de knop toelaat — de knop zet het hoogste bedrag.'
export function antwoordDoorwerken(stopAge: number): string          // "Doorwerken tot 61 dekt je plan."  (halve jaren: "61,5")
export function antwoordExtraOpzij(hint: number, masked?: boolean): string   // "Zo'n €2.100 per maand extra opzij dekt je plan."
export function antwoordMinderUitgeven(hint: number, masked?: boolean): string
```

- Produces (lab-antwoorden.ts):

```ts
export type LabAntwoordActie =
  | { readonly kind: 'stop'; readonly stopAge: number }
  | { readonly kind: 'slider'; readonly key: 'extra_inleg' | 'savings'; readonly value: number }
export interface LabAntwoord {
  readonly kind: 'doorwerken' | 'extra_opzij' | 'minder_uitgeven'
  readonly zin: string
  readonly bovenBereik: boolean
  readonly actie: LabAntwoordActie
}
export interface LabAntwoordenInput {
  dekking: LabUitkomstDekking | null
  solvedFireAge: number | null
  baseline: WhatIfOverrides | null
  masked?: boolean
}
export function resolveLabAntwoorden(input: LabAntwoordenInput): LabAntwoord[]
```

Regels: leeg tenzij `dekking && dekking.tekort && dekking.stop && dekking.stop.kind !== 'now'`. (1) `doorwerken` alleen als `solvedFireAge != null` én `solvedFireAge > stop.stopAge`: `stopAge = Math.ceil(solvedFireAge * 2) / 2`. (2) `extra_opzij` alleen als `dekking.maandHint != null && baseline`: `range = computeSliderUiRange('extra_inleg', baseline.monthlyIncome, 0)`, `value = Math.min(Math.round(hint), range.max)`, `bovenBereik = Math.round(hint) > range.max`. (3) `minder_uitgeven` alleen als `pp = savingsPpForMonthlyAmount(baseline, hint)` niet null: `range = computeSliderUiRange('savings', baseline.savingsRate, baseline.savingsRate)`, `value = Math.min(Math.round(pp), range.max)`, `bovenBereik = Math.round(pp) > range.max`.

- [ ] **Step 1: Tests kopij (vervang `anker-copy.test.ts:270-306`, de zin-11-tests van "Reken met € X extra inleg")**

```ts
  it('11 · antwoordenblok — drie beschrijvende zinnen, één knop, boven-bereik-zin (spec §3/§5)', () => {
    expect(ANTWOORDEN_KOP).toBe('Wat maakt het haalbaar?')
    expect(ANTWOORD_KNOP).toBe('Reken hiermee')
    expect(antwoordDoorwerken(61)).toBe('Doorwerken tot 61 dekt je plan.')
    expect(antwoordDoorwerken(61.5)).toBe('Doorwerken tot 61,5 dekt je plan.')
    expect(antwoordExtraOpzij(2100.4)).toBe('Zo’n €2.100 per maand extra opzij dekt je plan.')
    expect(antwoordMinderUitgeven(2100.4)).toBe('Zo’n €2.100 per maand minder uitgeven dekt je plan.')
    expect(ANTWOORD_BOVEN_BEREIK).toBe('Dat is meer dan de knop toelaat — de knop zet het hoogste bedrag.')
  })

  it('11 · privacy: de bedragen worden gemaskeerd, de zin blijft beschrijvend', () => {
    expect(antwoordExtraOpzij(2100, true)).toBe(`Zo’n ${MASKED_AMOUNT_PLACEHOLDER} per maand extra opzij dekt je plan.`)
    expect(antwoordMinderUitgeven(2100, true)).toContain(MASKED_AMOUNT_PLACEHOLDER)
  })

  it('11 · toon: geen instructie, geen AOW in de tekortzinnen', () => {
    for (const z of [antwoordDoorwerken(61), antwoordExtraOpzij(500), antwoordMinderUitgeven(500), ANTWOORD_BOVEN_BEREIK]) {
      expect(z).not.toMatch(/je moet|zet |verhoog|AOW/i)
    }
  })
```

Let op het apostrof-teken: de bestaande zinnen in `anker-copy.ts` gebruiken `’` (U+2019) in "Zo’n"? Controleer `dekkingTekortHintZin` (regel 524-538) en gebruik hetzelfde teken; pas de test daarop aan.

Verwijder de tests op `dekkingTekortHintZin`/`dekkingTekortHintKnop` (regel 270-306) én de functies zelf (`anker-copy.ts:509-546`) — het antwoordenblok vervangt de plan-hint (spec §5: onder solved blijft alleen het stop-pad-blok, dat zijn eigen inline zin heeft).

- [ ] **Step 2: Tests `lab-antwoorden.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { resolveLabAntwoorden } from './lab-antwoorden'
import type { LabUitkomstDekking } from './lab-uitkomst'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'

const baseline: WhatIfOverrides = { monthlyIncome: 4000, workDaysPerWeek: 5, savingsRate: 20, expectedReturn: 6, extraContribution: 0 }

const tekort: LabUitkomstDekking = {
  kind: 'dekking',
  stop: { kind: 'age', stopAge: 58 },
  eind: 90,
  basisPct: 65,
  basisReach: { kind: 'reikt-tot', age: 82, endAge: 90 },
  scenarioPct: null, scenarioReach: null,
  verkendPct: null, verkendReach: null, verkendStopAge: null,
  tekort: true,
  maandHint: 500,
  promotie: { kind: 'geen', reden: 'geen-verkenning' },
}

describe('resolveLabAntwoorden — de drie hefbomen als antwoorden (spec §3)', () => {
  it('geeft drie antwoorden bij een tekort met tweede run en hint', () => {
    const a = resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61.2, baseline })
    expect(a.map((x) => x.kind)).toEqual(['doorwerken', 'extra_opzij', 'minder_uitgeven'])
    expect(a[0].zin).toBe('Doorwerken tot 61,5 dekt je plan.')
    expect(a[0].actie).toEqual({ kind: 'stop', stopAge: 61.5 })
    expect(a[1].actie).toEqual({ kind: 'slider', key: 'extra_inleg', value: 500 })
    expect(a[1].bovenBereik).toBe(false)
    // €500 minder uitgeven op €4.000 = +12,5 pp → 32,5 → afgerond 33; range 16–24 → geklemd op 24
    expect(a[2].actie).toEqual({ kind: 'slider', key: 'savings', value: 24 })
    expect(a[2].bovenBereik).toBe(true)
  })

  it('"doorwerken" alleen als de tweede run een leeftijd ná het stopmoment vindt', () => {
    expect(resolveLabAntwoorden({ dekking: tekort, solvedFireAge: null, baseline }).map((x) => x.kind)).toEqual(['extra_opzij', 'minder_uitgeven'])
    expect(resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 55, baseline }).map((x) => x.kind)).toEqual(['extra_opzij', 'minder_uitgeven'])
  })

  it('boven het slider-bereik zegt het antwoord dat eerlijk en klemt de actie op het maximum', () => {
    const a = resolveLabAntwoorden({ dekking: { ...tekort, maandHint: 22_695 }, solvedFireAge: null, baseline })
    expect(a[0].bovenBereik).toBe(true)
    expect(a[0].actie).toEqual({ kind: 'slider', key: 'extra_inleg', value: 800 }) // 20% van 4000
  })

  it('geen antwoorden zonder tekort, onder now, of zonder stopmoment', () => {
    expect(resolveLabAntwoorden({ dekking: { ...tekort, tekort: false }, solvedFireAge: 61, baseline })).toEqual([])
    expect(resolveLabAntwoorden({ dekking: { ...tekort, stop: { kind: 'now' } }, solvedFireAge: 61, baseline })).toEqual([])
    expect(resolveLabAntwoorden({ dekking: null, solvedFireAge: 61, baseline })).toEqual([])
  })

  it('zonder baseline blijft alleen "doorwerken" over; masked maskeert de bedragen', () => {
    expect(resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61, baseline: null }).map((x) => x.kind)).toEqual(['doorwerken'])
    const m = resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61, baseline, masked: true })
    expect(m[1].zin).not.toContain('500')
  })
})
```

- [ ] **Step 3: Draai — rood**

Run: `npx vitest run lib/horizon/lab-antwoorden.test.ts lib/horizon/anker-copy.test.ts`
Expected: FAIL (module/exports ontbreken).

- [ ] **Step 4: Implementeer kopij**

`lib/horizon/anker-copy.ts` — vervang het blok zin 11 (`dekkingTekortHintZin`/`dekkingTekortHintKnop`, regel 509-546) door:

```ts
// ── Antwoordenblok "Wat maakt het haalbaar?" (spec lab-haalbaarheid §3/§5, 15 sep 2026) ──
// Beschrijvend ("dekt je plan"), nooit een instructie; geen "AOW" in een tekortzin.
// Vervangt de plan-hint ("Reken met € X extra inleg", ADR 0145 D7) onder een vast anker.

export const ANTWOORDEN_KOP = 'Wat maakt het haalbaar?'
export const ANTWOORD_KNOP = 'Reken hiermee'
export const ANTWOORD_BOVEN_BEREIK = 'Dat is meer dan de knop toelaat — de knop zet het hoogste bedrag.'

/** Antwoord 1 — de opgeloste leeftijd zonder anker (tweede run, ADR 0129 D7), op halve jaren. */
export function antwoordDoorwerken(stopAge: number): string {
  return `Doorwerken tot ${formatStopAge(stopAge)} dekt je plan.`
}

function maandBedrag(hint: number, masked: boolean): string {
  return masked ? MASKED_AMOUNT_PLACEHOLDER : `€${fmtHint(hint)}`
}

/** Antwoord 2 — `maandHint` (P!B96) als extra inleg. */
export function antwoordExtraOpzij(hint: number, masked = false): string {
  return `Zo’n ${maandBedrag(hint, masked)} per maand extra opzij dekt je plan.`
}

/** Antwoord 3 — hetzelfde bedrag als minder uitgeven (dezelfde maandelijkse stroom). */
export function antwoordMinderUitgeven(hint: number, masked = false): string {
  return `Zo’n ${maandBedrag(hint, masked)} per maand minder uitgeven dekt je plan.`
}
```

Controleer of `formatStopAge(61)` `"61"` en `formatStopAge(61.5)` `"61,5"` geeft (regel 182-184); zo niet, gebruik `formatAge`-logica uit vrijheidsas (kopieer niet: exporteer `formatStopAge` gedrag dat halve jaren toont).

- [ ] **Step 5: Implementeer `lib/horizon/lab-antwoorden.ts`**

```ts
// lib/horizon/lab-antwoorden.ts
//
// HET ANTWOORDENBLOK ONDER EEN VAST ANKER (spec lab-haalbaarheid §3, 15 sep 2026)
// ───────────────────────────────────────────────────────────────────────────
// Bij een tekort (dekking < 100%) geeft het lab de drie hefbomen als antwoord, elk met
// een getal dat al bestaat: "doorwerken tot X" = de opgeloste leeftijd zonder anker
// (tweede run, ADR 0129 D7); "€X extra opzij" en "€X minder uitgeven" = `maandHint`
// (P!B96) — één bedrag, twee hefbomen, want beide zijn dezelfde maandelijkse stroom.
// Elke regel is één klik die de betreffende hefboom als VERKENNING zet, nooit als plan.
// Puur: geen kernel-run, geen eigen som — alleen klemmen op het slider-bereik.

import { computeSliderUiRange, savingsPpForMonthlyAmount } from '@/lib/scenario-events'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import type { LabUitkomstDekking } from './lab-uitkomst'
import { antwoordDoorwerken, antwoordExtraOpzij, antwoordMinderUitgeven } from './anker-copy'

export type LabAntwoordActie =
  | { readonly kind: 'stop'; readonly stopAge: number }
  | { readonly kind: 'slider'; readonly key: 'extra_inleg' | 'savings'; readonly value: number }

export interface LabAntwoord {
  readonly kind: 'doorwerken' | 'extra_opzij' | 'minder_uitgeven'
  readonly zin: string
  /** Het bedrag ligt boven het slider-bereik; de actie zet het maximum (spec §3). */
  readonly bovenBereik: boolean
  readonly actie: LabAntwoordActie
}

export interface LabAntwoordenInput {
  dekking: LabUitkomstDekking | null
  /** `solvedRun.fireAge` — de tweede run; `null` = niet gevonden/nog niet gedraaid. */
  solvedFireAge: number | null
  baseline: WhatIfOverrides | null
  masked?: boolean
}

export function resolveLabAntwoorden(input: LabAntwoordenInput): LabAntwoord[] {
  const { dekking, solvedFireAge, baseline, masked = false } = input
  if (!dekking || !dekking.tekort || !dekking.stop || dekking.stop.kind === 'now') return []
  const stopAge = dekking.stop.stopAge
  const out: LabAntwoord[] = []

  if (solvedFireAge != null && Number.isFinite(solvedFireAge) && solvedFireAge > stopAge) {
    const tot = Math.ceil(solvedFireAge * 2) / 2
    out.push({ kind: 'doorwerken', zin: antwoordDoorwerken(tot), bovenBereik: false, actie: { kind: 'stop', stopAge: tot } })
  }

  const hint = dekking.maandHint
  if (hint != null && Number.isFinite(hint) && hint > 0 && baseline) {
    const extraRange = computeSliderUiRange('extra_inleg', baseline.monthlyIncome, 0)
    const extra = Math.round(hint)
    out.push({
      kind: 'extra_opzij',
      zin: antwoordExtraOpzij(hint, masked),
      bovenBereik: extra > extraRange.max,
      actie: { kind: 'slider', key: 'extra_inleg', value: Math.min(extra, extraRange.max) },
    })

    const pp = savingsPpForMonthlyAmount(baseline, hint)
    if (pp != null) {
      const savingsRange = computeSliderUiRange('savings', baseline.savingsRate, baseline.savingsRate)
      const ppRound = Math.round(pp)
      out.push({
        kind: 'minder_uitgeven',
        zin: antwoordMinderUitgeven(hint, masked),
        bovenBereik: ppRound > savingsRange.max,
        actie: { kind: 'slider', key: 'savings', value: Math.min(ppRound, savingsRange.max) },
      })
    }
  }
  return out
}
```

- [ ] **Step 6: Draai — groen**

Run: `npx vitest run lib/horizon/lab-antwoorden.test.ts lib/horizon/anker-copy.test.ts` → PASS.

- [ ] **Step 7: Bedrading in horizon-client**

Vervang `planTekortHint` + `handlePlanTekortHintSeed` (`:2815-2840`) door:

```ts
  // Spec lab-haalbaarheid §3 — de drie hefbomen als antwoorden bij een tekort. Consumeert
  // labDekking (ADR 0145) en de tweede run (solvedRun, ADR 0129 D7); klemt alleen.
  const labAntwoorden = useMemo(
    () => resolveLabAntwoorden({ dekking: labDekking, solvedFireAge: solvedRun?.fireAge ?? null, baseline: whatIfBaseline, masked }),
    [labDekking, solvedRun, whatIfBaseline, masked],
  )
  // "Reken hiermee": zet de hefboom als VERKENNING — nooit het plan (ADR 0145 D7: alleen op klik).
  const handleLabAntwoord = useCallback(
    (actie: LabAntwoordActie) => {
      if (actie.kind === 'stop') { handleStopAgeChange(actie.stopAge); return }
      if (!whatIfBaseline || currentAge === null) return
      const ev = buildSliderEvent(actie.key, actie.value, whatIfBaseline, currentAge)
      setScenarioSliderEvents((prev) => applySliderEvent(prev, actie.key, ev))
    },
    [whatIfBaseline, currentAge, handleStopAgeChange],
  )
```

(`handleStopAgeChange` staat op `:3487` — ná dit punt; verplaats de `useCallback` van `handleLabAntwoord` tot ná `handleStopAgeChange`, of gebruik `setScenarioStopAge` direct als `handleStopAgeChange` niets extra's doet dan de state zetten — lees `:3487-3495` en kies.) Imports: `resolveLabAntwoorden, type LabAntwoordActie` uit `@/lib/horizon/lab-antwoorden`; `ANTWOORDEN_KOP, ANTWOORD_KNOP, ANTWOORD_BOVEN_BEREIK` uit `@/lib/horizon/anker-copy`; verwijder de imports `dekkingTekortHintZin`, `dekkingTekortHintKnop`.

Render: stop-pad-blok (`:7088-7105`) krijgt de gate `stopPadTekortHint !== null && !isNuStoppenMode && !isFixedAnchorMode` (onder een vast anker vervangt het antwoordenblok beide hints, spec §7.3). Vervang het plan-variant-blok (`:7106-7145`) door:

```tsx
                {/* ── Wat maakt het haalbaar? — antwoordenblok (spec §3) ───────────────
                    Onder aow/age met een tekort: de drie hefbomen mét getal. Elke regel
                    zet de hefboom als verkenning (nooit het plan). Onder `now` en zonder
                    tekort leeg. Kopij uit anker-copy.ts (merkstem/compliance). */}
                {labAntwoorden.length > 0 && !isNuStoppenMode && (
                  <div
                    data-testid="lab-antwoorden"
                    className="mt-4 border border-[var(--ink-2)] border-l-4 border-l-horizon-500 bg-[var(--paper)] px-3 py-2.5"
                  >
                    <p className="mb-1 label-editorial text-[var(--ink-3)]">{ANTWOORDEN_KOP}</p>
                    <ul className="space-y-1.5">
                      {labAntwoorden.map((a) => (
                        <li key={a.kind} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-sans text-[12px] leading-snug text-[var(--ink-2)]">
                          <span>
                            {a.zin}
                            {a.bovenBereik && <span className="text-[var(--ink-3)]"> {ANTWOORD_BOVEN_BEREIK}</span>}
                          </span>
                          {!masked && (
                            <button
                              type="button"
                              onClick={() => handleLabAntwoord(a.actie)}
                              className="inline-flex min-h-[44px] items-center font-sans text-[11px] font-semibold text-horizon-700 underline underline-offset-2 transition-colors hover:text-horizon-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                            >
                              {ANTWOORD_KNOP}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 font-sans text-[11px] leading-snug text-[var(--ink-3)]">
                      Indicatie, geen advies — een rekenuitkomst bij je huidige aannames, uitgesmeerd over de maanden tot je eindleeftijd.
                    </p>
                  </div>
                )}
```

- [ ] **Step 8: Bron-grendels bijwerken**

`horizon-client.lab-uitkomst.test.ts:102-125` (seed-op-klik + masked): vervang door

```ts
  it('het antwoordenblok consumeert resolveLabAntwoorden op labDekking + solvedRun; acties alleen op klik', () => {
    const src = bron()
    const start = src.indexOf('resolveLabAntwoorden({')
    expect(start).toBeGreaterThan(-1)
    const call = src.slice(start, src.indexOf('})', start))
    expect(call).toContain('dekking: labDekking')
    expect(call).toContain('solvedFireAge: solvedRun?.fireAge ?? null')
    expect(call).toContain('masked')
    const code = codeRegels().join('\n')
    expect(code).toContain('onClick={() => handleLabAntwoord(a.actie)}')
    // nooit auto-seeden: geen useEffect dat handleLabAntwoord aanroept
    expect(code).not.toMatch(/useEffect\([^)]*handleLabAntwoord/s)
    // in privacymodus geen knop
    expect(code).toContain('{!masked && (')
  })

  it('het stop-pad-blok "Wat hoort daarbij?" blijft alleen onder solved', () => {
    const code = codeRegels().join('\n')
    expect(code).toContain('stopPadTekortHint !== null && !isNuStoppenMode && !isFixedAnchorMode')
  })
```

`horizon-client.wat-hoort-daarbij.test.ts`: controleer of een assert het plan-blok (`lab-plan-tekort-hint`) of `dekkingTekortHintZin` verwacht; verwijder/hernoem die naar `lab-antwoorden`.

- [ ] **Step 9: Verifiëren + commit**

Run: `npx tsc --noEmit` → schoon.
Run: `npx vitest run lib/horizon components/app/horizon` → PASS.
Handmatig (chrome-devtools; jochen@ is te vermogend voor een tekort — maak het tekort met een tijdelijk hoog `retirement_expense_custom_amount` via plan-keuzes of PUT `/api/fire-settings` `{ retirement_expense_method: 'custom_amount', retirement_expense_custom_amount: 200000 }` vanaf `/mijn`, herstel daarna `essential_budgets`): onder age-tekort verschijnt "Wat maakt het haalbaar?" met (max) drie regels; "Reken hiermee" op regel 1 zet de stop-slider, op regel 2 de Meer-opzij-knop, op regel 3 Minder uitgeven; het plan verandert niet (GET `/api/fire-settings` ongewijzigd); "Maak dit mijn doel" verschijnt daarna. Onder solved: alleen het bestaande stop-pad-blok bij een stopkeuze met tekort.

```bash
git add lib/horizon/anker-copy.ts lib/horizon/anker-copy.test.ts lib/horizon/lab-antwoorden.ts lib/horizon/lab-antwoorden.test.ts components/app/horizon/horizon-client.tsx components/app/horizon/horizon-client.lab-uitkomst.test.ts components/app/horizon/horizon-client.wat-hoort-daarbij.test.ts
git commit -m "feat(toekomst): \"Wat maakt het haalbaar?\" — de drie hefbomen als antwoorden bij een tekort (spec §3)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Doelen die de plankeuze volgen (live naam/subregel + één melding)

**Files:**
- Modify: `lib/horizon/toekomst-doel.ts` (`planCoverageGoalName`), `.test.ts`
- Create: `lib/goals/lab-doelen-buiten-plan.ts`, `lib/goals/lab-doelen-buiten-plan.test.ts`
- Modify: `lib/horizon/anker-copy.ts` (+test): `doelenPlanGewijzigdMelding(n)`, `DOELEN_MELDING_ACTIES`
- Modify: `lib/fin-data-loader.ts:90-161, 414-437`
- Modify: `app/(app)/toekomst/doelen/page.tsx:41-51`
- Modify: `components/future/doelen-view.tsx:190-343 (ParameterGoalCard), 581-635 (props), 775-839 (melding)`
- Modify: `components/future/doelen-view.test.tsx` (describe `plan_coverage-doel`, regel 918)
- Modify: `components/future/doel-loslaten-confirm.tsx:42-47`

**Interfaces:**
- Produces (toekomst-doel.ts): `export function planCoverageGoalName(eindleeftijd: number | null): string` → `Plan gedekt tot ${fmtNum1(eind)} jaar` / `'Plan gedekt'`; `buildRow('dekking')` gebruikt 'm.
- Produces (fin-data-loader.ts):

```ts
export interface LabPlanContext {
  stopAnker: 'solved' | 'aow' | 'now' | 'age'
  stopLeeftijd: number | null
  eindleeftijd: number | null
}
// FinPageData.labPlan: LabPlanContext | null  — uit fireSnapshot (stopAnchor/stopAge/endAge); null zonder snapshot
```

- Produces (lab-doelen-buiten-plan.ts): `export function selectLabDoelenBuitenPlan<T extends { metadata?: unknown; notApplicableReason?: string | null }>(goals: readonly T[]): T[]` — lab-doelen (`metadata.bron === 'parameter'`) mét `notApplicableReason`.
- Produces (anker-copy.ts): `doelenPlanGewijzigdMelding(n)` → `Je plan is veranderd. ${n} ${n === 1 ? 'doel' : 'doelen'} uit het lab ${n === 1 ? 'past' : 'passen'} er niet meer bij.`; `DOELEN_MELDING_ACTIES = { bijwerken: 'Bijwerken', loslaten: 'Loslaten' } as const`.
- DoelenView nieuwe prop: `labPlan?: LabPlanContext | null`.

- [ ] **Step 1: Pure tests (rood)**

`lib/goals/lab-doelen-buiten-plan.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { selectLabDoelenBuitenPlan } from './lab-doelen-buiten-plan'

describe('selectLabDoelenBuitenPlan — telt alleen lab-doelen die n.v.t. zijn (spec §4.2)', () => {
  it('lab-doel met n.v.t.-reden telt; knop-doel zonder reden en handmatig doel met reden tellen niet', () => {
    const goals = [
      { id: 'a', metadata: { bron: 'parameter' }, notApplicableReason: 'Je stopmoment ligt vast…' },
      { id: 'b', metadata: { bron: 'parameter' }, notApplicableReason: null },
      { id: 'c', metadata: {}, notApplicableReason: 'vrijheidsgetal n.v.t.' },
      { id: 'd', metadata: { bron: 'parameter' } },
    ]
    expect(selectLabDoelenBuitenPlan(goals).map((g) => g.id)).toEqual(['a'])
  })
})
```

`lib/horizon/anker-copy.test.ts` — nieuw:

```ts
  it('doelen-melding: enkelvoud/meervoud, acties Bijwerken · Loslaten (spec §4/§5)', () => {
    expect(doelenPlanGewijzigdMelding(1)).toBe('Je plan is veranderd. 1 doel uit het lab past er niet meer bij.')
    expect(doelenPlanGewijzigdMelding(2)).toBe('Je plan is veranderd. 2 doelen uit het lab passen er niet meer bij.')
    expect(DOELEN_MELDING_ACTIES).toEqual({ bijwerken: 'Bijwerken', loslaten: 'Loslaten' })
  })
```

`lib/horizon/toekomst-doel.test.ts` — nieuw in het dekking-describe (regel 188):

```ts
  it('planCoverageGoalName is de ene bron voor de kaartnaam (rij én live)', () => {
    expect(planCoverageGoalName(90)).toBe('Plan gedekt tot 90 jaar')
    expect(planCoverageGoalName(92.5)).toBe('Plan gedekt tot 92,5 jaar')
    expect(planCoverageGoalName(null)).toBe('Plan gedekt')
  })
```

- [ ] **Step 2: Draai — rood; implementeer de pure delen**

Run: `npx vitest run lib/goals/lab-doelen-buiten-plan.test.ts lib/horizon/anker-copy.test.ts lib/horizon/toekomst-doel.test.ts` → FAIL.

`lib/goals/lab-doelen-buiten-plan.ts`:

```ts
/**
 * Lab-doelen die niet meer bij het plan passen (spec lab-haalbaarheid §4.2): een doel uit
 * het lab (`metadata.bron === 'parameter'`) dat de sync een n.v.t.-reden gaf
 * (fire_age onder een vast anker, plan_coverage onder solved — lib/goal-current-value.ts).
 * Knop-doelen (spaarquote, rendement) krijgen nooit een reden (§4.3) en tellen dus nooit.
 * Het vrijheidsgetal-doel is geen lab-doel en telt hier niet, ook al draagt het een reden.
 */
export function selectLabDoelenBuitenPlan<T extends { metadata?: unknown; notApplicableReason?: string | null }>(
  goals: readonly T[],
): T[] {
  return goals.filter((g) => {
    const m = g.metadata
    const lab = typeof m === 'object' && m !== null && (m as Record<string, unknown>).bron === 'parameter'
    return lab && typeof g.notApplicableReason === 'string' && g.notApplicableReason.length > 0
  })
}
```

`lib/horizon/anker-copy.ts` (onder het antwoordenblok):

```ts
/** Doelenpagina: één regel wanneer lab-doelen niet meer bij het plan passen (spec §4.2). */
export function doelenPlanGewijzigdMelding(n: number): string {
  return `Je plan is veranderd. ${n} ${n === 1 ? 'doel' : 'doelen'} uit het lab ${n === 1 ? 'past' : 'passen'} er niet meer bij.`
}
export const DOELEN_MELDING_ACTIES = { bijwerken: 'Bijwerken', loslaten: 'Loslaten' } as const
```

`lib/horizon/toekomst-doel.ts` — exporteer

```ts
/** De naam van het "Plan gedekt"-doel — één bron voor de DB-rij én de live kaart (spec §4.1). */
export function planCoverageGoalName(eindleeftijd: number | null): string {
  return isFiniteNumber(eindleeftijd) ? `Plan gedekt tot ${fmtNum1(eindleeftijd)} jaar` : 'Plan gedekt'
}
```

en gebruik 'm in `buildRow('dekking')` (regel 273): `name: planCoverageGoalName(eindleeftijd),`.

Run dezelfde tests → PASS.

- [ ] **Step 3: Loader + page**

`lib/fin-data-loader.ts` — voeg het type `LabPlanContext` toe (boven `FinPageData`) en het veld:

```ts
  /**
   * Het HUIDIGE plan-anker voor de lab-doelkaarten (spec lab-haalbaarheid §4.1): naam en
   * subregel van "Plan gedekt" volgen het plan, niet de metadata van het moment van
   * vastleggen. Puur doorgegeven uit `VrijheidsgetalSnapshot` (dezelfde run als de
   * meting); `null` zonder snapshot — dan valt de kaart terug op zijn metadata.
   */
  labPlan: LabPlanContext | null
```

Return (regel 414-437):

```ts
    labPlan: fireSnapshot?.stopAnchor
      ? { stopAnker: fireSnapshot.stopAnchor, stopLeeftijd: fireSnapshot.stopAge ?? null, eindleeftijd: fireSnapshot.endAge ?? null }
      : null,
```

Controleer dat `VrijheidsgetalSnapshot` de velden `stopAnchor`/`stopAge`/`endAge` draagt (`lib/goals/vrijheidsgetal-goal.ts:66+`, de bouwer zet ze vanuit `VrijheidsgetalSnapshotInput:198-202`); zo niet: voeg ze toe aan de snapshot-interface + `buildVrijheidsgetalSnapshot`.

`app/(app)/toekomst/doelen/page.tsx:41-51`: `labPlan={finData.labPlan}`.

Grep alle andere `FinPageData`-constructies/`loadFinData`-mocks in tests (`lib/fin-data-loader*.test.ts`, `components/**/*.test.tsx`) en voeg `labPlan: null` toe waar het type dat vereist (tsc wijst ze aan).

- [ ] **Step 4: DoelenView-tests (rood)**

In `components/future/doelen-view.test.tsx`, describe `plan_coverage-doel (ADR 0145)` (regel 918):

```tsx
  it('naam en subregel volgen het HUIDIGE plan, niet de metadata van het vastleggen (spec §4.1)', () => {
    render(<DoelenView goals={[coverageGoal /* metadata eindleeftijd 90, stopAnker age, stopLeeftijd 62 */]} goalProgresses={[coverageProgress]} labPlan={{ stopAnker: 'age', stopLeeftijd: 62, eindleeftijd: 95 }} />)
    expect(screen.getByText('Plan gedekt tot 95 jaar')).toBeInTheDocument()
    expect(screen.getByTestId('plan-coverage-subregel')).toHaveTextContent('tot je 95e · stopmoment 62')
  })

  it('zonder labPlan valt de kaart terug op de metadata (historie)', () => {
    render(<DoelenView goals={[coverageGoal]} goalProgresses={[coverageProgress]} />)
    expect(screen.getByText('Plan gedekt tot 90 jaar')).toBeInTheDocument()
  })
```

Nieuw describe:

```tsx
describe('DoelenView — melding wanneer lab-doelen niet meer bij het plan passen (spec §4.2)', () => {
  it('toont één regel met de telling en de acties Bijwerken · Loslaten; Loslaten opent de bestaande confirm', () => {
    const nvt = { ...fireAgeGoal, notApplicableReason: 'Je stopmoment ligt vast op 62.' }
    render(<DoelenView goals={[nvt, savingsRateGoal]} goalProgresses={[fireAgeProgress, savingsProgress]} />)
    expect(screen.getByRole('status')).toHaveTextContent('Je plan is veranderd. 1 doel uit het lab past er niet meer bij.')
    expect(screen.getByRole('link', { name: 'Bijwerken' })).toHaveAttribute('href', '/toekomst#verken-je-aannames')
    fireEvent.click(screen.getByRole('button', { name: 'Loslaten' }))
    expect(screen.getByText('Doelsituatie loslaten')).toBeInTheDocument()
  })

  it('geen melding zonder n.v.t.-lab-doelen; het vrijheidsgetal-doel met reden telt niet', () => {
    const vg = { ...vrijheidsgetalGoal, notApplicableReason: 'n.v.t.' }
    render(<DoelenView goals={[savingsRateGoal, vg]} goalProgresses={[savingsProgress, vgProgress]} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
```

Gebruik de fixtures die het bestand al heeft (regel 843-1000: `fireAgeGoal`-achtige objecten met `metadata: { bron: 'parameter' }`); hernoem naar de bestaande namen.

- [ ] **Step 5: DoelenView implementeren**

Props (regel 581-635): `labPlan = null,` + type `labPlan?: LabPlanContext | null` (import `type LabPlanContext` uit `@/lib/fin-data-loader` — dat is een type-import, trekt geen server-code de client in; controleer met `npm run check:client-reads`).

`ParameterGoalCard({ goal, progress, labPlan }: GoalDisplay & { labPlan: LabPlanContext | null })` — vervang regel 201-207 door:

```tsx
  // Spec §4.1: naam en subregel van "Plan gedekt" volgen het huidige plan; de metadata
  // is de historie van het vastleggen (terugval zonder plan-context of onder solved).
  const livePlan = isCoverage && labPlan && labPlan.stopAnker !== 'solved' ? labPlan : null
  const coverageNaam = isCoverage
    ? planCoverageGoalName(livePlan ? livePlan.eindleeftijd : metaNumber(goal.metadata?.eindleeftijd))
    : goal.name
  const coverageSubregel = isCoverage
    ? planCoverageKaartSubregel(
        livePlan ? livePlan.eindleeftijd : metaNumber(goal.metadata?.eindleeftijd),
        livePlan ? livePlan.stopAnker : metaStopAnker(goal.metadata?.stopAnker),
        livePlan ? livePlan.stopLeeftijd : metaNumber(goal.metadata?.stopLeeftijd),
      )
    : null
```

en render `coverageNaam` in de `<h3>` (regel 226-232) i.p.v. `goal.name` (voor niet-coverage-kaarten is dat gelijk). `planCoverageKaartSubregel` accepteert `'aow'|'age'|'now'|null` — geef `livePlan.stopAnker` alleen door als die ≠ `'solved'` (dat garandeert de gate).

Import `planCoverageGoalName` uit `@/lib/horizon/toekomst-doel` (pure module, geen server-imports — controleer de import-graaf van dat bestand: het importeert `@/lib/goal-data` en `@/lib/horizon/toekomst-scenario`; beide client-veilig).

Kaart-aanroep (regel 836): `<ParameterGoalCard key={d.goal.id} goal={d.goal} progress={d.progress} labPlan={labPlan} />`.

Melding — direct onder de `<header>` van de doelsituatie-groep (ná regel 828, vóór de italic-regel):

```tsx
          {labDoelenBuitenPlan.length > 0 && (
            <div
              role="status"
              className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 border border-[var(--ink-2)] border-l-4 border-l-warning bg-[var(--paper)] px-3 py-2 font-sans text-[12px] text-[var(--ink-2)]"
            >
              <span>{doelenPlanGewijzigdMelding(labDoelenBuitenPlan.length)}</span>
              <span className="flex items-center gap-x-4">
                <Link href="/toekomst#verken-je-aannames" className="inline-flex min-h-[44px] items-center font-semibold text-horizon-700 underline underline-offset-2">
                  {DOELEN_MELDING_ACTIES.bijwerken}
                </Link>
                <button type="button" onClick={() => setConfirmOpen(true)} className="inline-flex min-h-[44px] items-center font-semibold text-negative underline underline-offset-2">
                  {DOELEN_MELDING_ACTIES.loslaten}
                </button>
              </span>
            </div>
          )}
```

met, bij `parameterDisplay` (regel 704): `const labDoelenBuitenPlan = selectLabDoelenBuitenPlan(parameterDisplay.map((d) => d.goal))`. Imports: `selectLabDoelenBuitenPlan`, `doelenPlanGewijzigdMelding`, `DOELEN_MELDING_ACTIES`. Controleer dat `border-l-warning` bestaat (anders `border-l-[var(--color-warning)]` volgens de bestaande warning-token in globals.css). De melding rendert alleen in modus Volledig (binnen de bestaande `!simple && parameterDisplay.length > 0`-gate) — dat is de plek waar de lab-doelen staan.

`components/future/doel-loslaten-confirm.tsx:43-44`: "(spaarquote, rendement, je vrijheidsleeftijd en "Plan gedekt")" — verwijder "salaris".

- [ ] **Step 6: Verifiëren + commit**

Run: `npx tsc --noEmit` → schoon. `npm run check:client-reads` en `npm run check:headings` → groen.
Run: `npx vitest run components/future lib/goals lib/fin-data-loader lib/horizon/toekomst-doel.test.ts lib/horizon/anker-copy.test.ts` → PASS.
Handmatig: leg onder age/90 een "Plan gedekt"-doel vast; zet de eindleeftijd naar 95 → kaart heet "Plan gedekt tot 95 jaar", subregel "tot je 95e"; zet het anker op solved → kaart n.v.t. + melding "1 doel uit het lab past er niet meer bij" met Bijwerken (landt in het lab) en Loslaten (bestaande confirm); zet terug naar age → melding weg, kaart meet weer.

```bash
git add lib/horizon/toekomst-doel.ts lib/horizon/toekomst-doel.test.ts lib/goals/lab-doelen-buiten-plan.ts lib/goals/lab-doelen-buiten-plan.test.ts lib/horizon/anker-copy.ts lib/horizon/anker-copy.test.ts lib/fin-data-loader.ts "app/(app)/toekomst/doelen/page.tsx" components/future/doelen-view.tsx components/future/doelen-view.test.tsx components/future/doel-loslaten-confirm.tsx
git commit -m "feat(toekomst): lab-doelen volgen het plan — live naam/subregel van \"Plan gedekt\" en één melding bij een planwijziging (spec §4)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: UAT-definities, page-info en curatie

**Files:**
- Modify: `lib/uat/acceptance/toek.ts:746-765, 784-788`
- Modify: `lib/uat/acceptance/toek-checks.ts:495-…` (WF-TOEK-49) + nieuw WF-TOEK-50
- Modify: `lib/uat/catalog.ts:373` (+ UAT-TOEK-50)
- Modify: `lib/uat/flows/toek.ts:116` (+ node `doelenmelding`)
- Modify: `lib/page-info-content.ts:504-507, 536-537`
- Modify: `lib/architecture/calculations.ts:1420-1449` (lab-uitkomst) + doelscenario-note (~`:1418`)
- Modify: `lib/architecture/hld-model.ts` (Toekomst-capability: één zin)
- Modify: `docs/adr/0145-het-doelscenario-volgt-het-anker.md` (D8–D11 ná D7, regel 122)

- [ ] **Step 1: WF-TOEK-49 uitbreiden (dekkingsas + antwoordenblok)**

`toek.ts:754-757`: `when` aanvullen met "…; op toestand (2) wordt `resolveLabAntwoorden` aangeroepen met de tweede run (solvedFireAge 70) en maandHint €500 op een basis van €4.000/mnd." `then` aanvullen: "Het antwoordenblok geeft drie regels in de volgorde doorwerken · extra opzij · minder uitgeven; 'doorwerken tot' is de opgeloste leeftijd op halve jaren (70); de acties zetten een verkenning, nooit het plan." `assertion.expected` uitbreiden met `; antwoorden=doorwerken,extra_opzij,minder_uitgeven; doorwerkenTot=70; extraOpzijActie=slider:extra_inleg:500`; `source` uitbreiden met `lib/horizon/lab-antwoorden.ts#resolveLabAntwoorden`.

`toek-checks.ts` WF-TOEK-49 `run`: ná de bestaande berekening

```ts
      const antwoorden = resolveLabAntwoorden({
        dekking: aowTekortMetScenario.kind === 'dekking' ? { ...aowTekortMetScenario, maandHint: 500 } : null,
        solvedFireAge: 70,
        baseline: { monthlyIncome: 4000, workDaysPerWeek: 5, savingsRate: 20, expectedReturn: 6, extraContribution: 0 },
      })
      const antwoordKinds = antwoorden.map((a) => a.kind).join(',')
      const doorwerkenTot = antwoorden[0]?.actie.kind === 'stop' ? antwoorden[0].actie.stopAge : null
      const extraActie = antwoorden[1]?.actie.kind === 'slider' ? `slider:${antwoorden[1].actie.key}:${antwoorden[1].actie.value}` : null
```

en de drie waarden in `expected`/`actual` opnemen. Let op: onder `aow` heeft `dekking.stop` kind `'aow'` met `stopAge: 67`; `solvedFireAge: 70 > 67` ⇒ doorwerken aanwezig.

- [ ] **Step 2: WF-TOEK-50 (doelen-melding) nieuw**

`toek.ts` — criterium ná WF-TOEK-49:

```ts
  {
    workflow: 'WF-TOEK-50',
    scenarioId: 'UAT-TOEK-50',
    titel: 'Doelen volgen het plan: één melding wanneer lab-doelen niet meer bij het plan passen; knop-doelen blijven altijd geldig (spec lab-haalbaarheid §4)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Willem heeft uit het lab drie doelen: een vrijheidsleeftijd-doel (fire_age), een spaarquote-doel (savings_rate) en het vrijheidsgetal-doel (handmatig, geen lab-doel). Hij zet zijn stopmoment van "zo vroeg als het kan" naar leeftijd 62; de sync geeft het fire_age-doel en het vrijheidsgetal-doel een n.v.t.-reden.',
    when: 'De doelenpagina bepaalt met `selectLabDoelenBuitenPlan` welke LAB-doelen niet meer passen en toont de melding met de telling.',
    then: 'Precies één lab-doel telt (fire_age); het spaarquote-doel (knop-doel, nooit n.v.t.) en het vrijheidsgetal-doel (geen lab-doel) tellen niet. De melding luidt "Je plan is veranderd. 1 doel uit het lab past er niet meer bij." met de acties Bijwerken · Loslaten; niets wordt automatisch verwijderd — het plan terugdraaien brengt het doel terug.',
    assertion: {
      kind: 'exact',
      expected: 'buitenPlan=fire; melding=Je plan is veranderd. 1 doel uit het lab past er niet meer bij.',
      source: 'lib/goals/lab-doelen-buiten-plan.ts#selectLabDoelenBuitenPlan + lib/horizon/anker-copy.ts#doelenPlanGewijzigdMelding — zie toek-checks.ts',
    },
  },
```

`TOEK_EXPECTED_WORKFLOW_NUMBERS`: `…, 49, 50` + doc-comment ("WF-TOEK-50 (15 sep 2026, spec lab-haalbaarheid §4)").

`toek-checks.ts` — nieuw check-object (patroon WF-TOEK-40):

```ts
  {
    workflow: 'WF-TOEK-50',
    scenarioId: 'UAT-TOEK-50',
    label: 'Lab-doelen buiten het plan (selectLabDoelenBuitenPlan) + melding (spec lab-haalbaarheid §4)',
    run: () => {
      criterion('WF-TOEK-50')
      const goals = [
        { id: 'fire', metadata: { bron: 'parameter' }, notApplicableReason: 'Je stopmoment ligt vast op 62, dus dit doel heeft geen uitkomst om naar te kijken.' },
        { id: 'spaarquote', metadata: { bron: 'parameter' }, notApplicableReason: null },
        { id: 'vrijheidsgetal', metadata: {}, notApplicableReason: 'Je stopmoment ligt vast op 62, dus er is geen doelvermogen om naartoe te sparen.' },
      ]
      const buiten = selectLabDoelenBuitenPlan(goals)
      return {
        expected: 'buitenPlan=fire; melding=Je plan is veranderd. 1 doel uit het lab past er niet meer bij.',
        actual: `buitenPlan=${buiten.map((g) => g.id).join(',')}; melding=${doelenPlanGewijzigdMelding(buiten.length)}`,
      }
    },
  },
```

`catalog.ts` ná regel 373:

```ts
  { id: 'UAT-TOEK-50', wf: 'WF-TOEK-50', zone: 'TOEK', band: 'vooruitkijken', naam: 'Doelen volgen het plan: melding bij lab-doelen die niet meer passen; knop-doelen blijven geldig (spec lab-haalbaarheid §4)', kriticiteit: 'KERN', rooktest: false, platforms: ['webapp', 'mobiel'], subscenarios: ['a', 'b', 'c'], volgorde: 50, duurMin: 5 },
```

`flows/toek.ts` ná regel 116:

```ts
    { id: 'doelenmelding', scenarioId: 'UAT-TOEK-50', label: 'WF-TOEK-50 · Doelen volgen het plan: melding bij lab-doelen buiten het plan', kind: 'screen', stage: 4, lane: 'doelen', subOf: 'doelen' },
```

plus een edge `labuitkomst → doelenmelding` in de edges-lijst van dat bestand (volg het formaat van de bestaande edges).

Run: `npx vitest run lib/uat test/uat-toek-suite-check.test.ts` → PASS (de engine-test telt de nummers; `npm run uat:stale` → alleen de bewust geraakte criteria).

- [ ] **Step 3: Page-info**

`lib/page-info-content.ts:506` — vervang de zin "…ligt je stopmoment vast, dan zie je hoeveel van je plan gedekt is." door "…ligt je stopmoment vast, dan zie je op de dekkingsas of je plan tot je eindleeftijd reikt, en bij een tekort wat het haalbaar maakt: doorwerken tot een leeftijd, meer opzij, of minder uitgeven." `:537` (doelen): voeg toe "Verandert je plan zó dat een doel uit het lab er niet meer bij past, dan zie je dat bovenaan in één regel — bijwerken of loslaten, niets verdwijnt vanzelf." Run `npm run page-info:check`.

- [ ] **Step 4: Curatie**

`lib/architecture/calculations.ts` — entry `lab-uitkomst` (regel 1420-1449): `files` + `'lib/horizon/lab-antwoorden.ts'`, `functions` + `'resolveLabAntwoorden'`, `formula` aanvullen met: "ANTWOORDENBLOK (spec lab-haalbaarheid §3, 15 sep 2026): bij tekort drie antwoorden — doorwerken tot ceil(solvedFireAge×2)/2 (tweede run, ADR 0129 D7), €maandHint extra opzij (geklemd op computeSliderUiRange('extra_inleg')), €maandHint minder uitgeven als savingsPpForMonthlyAmount (geklemd op de spaarquote-range); boven bereik gemeld, nooit stil geklemd. De dekkingsas (components/app/horizon/dekkingsbalk.tsx) tekent alleen: schaal stop→eind, posities uit ankerReachesAge." Voeg in de `scenario-presets`-/`doelscenario`-note (~`:1418`) de zin toe: "DE TWEEDE RUN DRAAIT OP DE GEÏNJECTEERDE RIJ (15 sep 2026): horizon-client geeft de preset-batch `withResolvedKernelBedragen(kernelRawProfile, effectiveInput)` mee — dezelfde ADR 0103-injectie als de hoofdrun; met de rauwe rij was 'vrij mogelijk vanaf' onder een budget-/transactiegrondslag null." Voeg een `constants`-entry toe: `{ label: 'Hefbomen (spec §2)', value: "Maandinkomen vervalt als knop (zelfde hefboom als extra inleg); Minder uitgeven = de spaarquote-knop in euro (savingsEuroForPp: basisinkomen × pp/100, basisinkomen = maandinkomen × werkdagen/5); Minder werken = werkdagen, ingeklapt." }`.

`lib/architecture/hld-model.ts` — in de Toekomst-capabilitygroep de desc van het lab/verken-item (grep `lab` of `stopmoment`) één zin: "Ligt je stopmoment vast, dan laat het lab zien of je plan reikt en wat het haalbaar maakt: doorwerken, meer opzij of minder uitgeven."

`docs/adr/0145-het-doelscenario-volgt-het-anker.md` — ná D7 (regel 122):

```markdown
**D8 — Sectie 2 van de Vrijheidsas is onder een vast anker de dekkingsas** (15 sep 2026,
spec lab-haalbaarheid §1). Schaal van stopmoment tot eindleeftijd, slider "Doorwerken tot",
tegels Reikt tot · Plan tot · Gedekt. Marge-band, verwacht-streep, koppel-checkbox en de
FIRE-tegels verdwijnen daar: ze meten een grootheid die de gebruiker niet gekozen heeft.

**D9 — Drie hefbomen in beide invalshoeken** (§2). Meer opzij (`extra_inleg`), Minder
uitgeven (de spaarquote-knop, weergave in euro, event-shape ongewijzigd), Later of eerder
stoppen (de stop-slider). Maandinkomen vervalt als knop en als `DOEL_PARAMETERS`-lid;
bestaande `salary`-rijen blijven (`LEGACY_PARAMETER_GOAL_TYPES`). Werkdagen wordt de
ingeklapte knop "Minder werken".

**D10 — Bij een tekort: de drie hefbomen als antwoorden** (§3). `resolveLabAntwoorden`
geeft "doorwerken tot X" (tweede run), "€X extra opzij" en "€X minder uitgeven"
(`maandHint`); elke regel zet een verkenning, nooit het plan (D7 blijft: alleen op klik).
Boven het slider-bereik zegt de regel dat; de knop zet het maximum. Vervangt de plan-hint
"Reken met € X extra inleg" en, onder een vast anker, het stop-pad-blok.

**D11 — Doelen volgen het plan** (§4). De "Plan gedekt"-kaart leest naam en subregel uit
het huidige plan (`FinPageData.labPlan`); de metadata blijft historie. Eén melding op de
doelenpagina telt lab-doelen met een n.v.t.-reden (`selectLabDoelenBuitenPlan`) met de
acties Bijwerken · Loslaten; niets verdwijnt automatisch. Knop-doelen krijgen nooit een
n.v.t.-reden.
```

Run: `npm run arch:diagram` en `npx vitest run lib/architecture` → PASS.

- [ ] **Step 5: Merkstem/compliance-spoor**

Alle nieuwe zinnen staan in `lib/horizon/anker-copy.ts` en zijn gepind in `anker-copy.test.ts` (toon-invarianten: geen "je moet", geen "AOW" in tekortzinnen). Draai `npm run merkstem:scan` als dat script bestaat; noteer de uitkomst in de commit-body. De compliance-check van 14 sep dekte de plan-hint; de antwoorden zijn beschrijvend ("dekt je plan") en dragen de bestaande sluitregel — leg in de Notion-toetskaart (3dbf9e8d-568a-818a-884f-f2e7d80815a4) één regel vast dat §3-zinnen langs dezelfde meetlat zijn gelegd (doet de orchestrator, niet de subagent).

- [ ] **Step 6: Commit**

```bash
git add lib/uat/acceptance/toek.ts lib/uat/acceptance/toek-checks.ts lib/uat/catalog.ts lib/uat/flows/toek.ts lib/page-info-content.ts lib/architecture/calculations.ts lib/architecture/hld-model.ts docs/adr/0145-het-doelscenario-volgt-het-anker.md docs/architecture/architecture.json
git commit -m "docs(toekomst): UAT WF-TOEK-49/50, page-info en curatie voor het lab onder een vaste stopleeftijd (ADR 0145 D8–D11)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(`architecture.json` alleen meecommitten als de diff uitsluitend de nieuwe ADR-/calc-feiten draagt; anders weglaten — precedent 31 aug.)

---

### Task 8: Eind-verificatie, review en overdracht

- [ ] **Step 1: Volledige poorten**

Run (PowerShell): `npx tsc --noEmit`; `npm run test:run` (verwacht: alles groen behalve de bekende Node-versie-test); `npm run check:client-reads`; `npm run check:headings`; `npm run check:overlays`; `npm run page-info:check`; `npm run uat:stale`; `npm run arch:check`; `npx eslint` op de geraakte paden.

- [ ] **Step 2: Handmatige matrix (chrome-devtools, dev-server, jochen@)**

Per toestand screenshots in de scratchpad en de checks uit de spec §Verificatie:
1. **solved**: lab met drie hefbomen; sectie 2 byte-identiek (marge-band, checkbox, tegels); stop-pad-hint bij een verkende stop met tekort; geen antwoordenblok; sheet zonder Salaris.
2. **age-gedekt**: dekkingsas gevuld (positive), geen antwoordenblok, geen "Maak dit mijn doel"; "Doel loslaten" als er een doel ligt.
3. **age-tekort** (uitgaven tijdelijk hoog): dekkingsas warning, antwoordenblok met (max) 3 regels; elke "Reken hiermee" zet een verkenning; het plan (GET `/api/fire-settings`) blijft gelijk; "Maak dit mijn doel" → sheet met vaste rij "Plan gedekt"; `/toekomst/doelen` toont "Plan gedekt tot 90 jaar".
4. **aow**: als 3; geen "AOW" in de antwoordzinnen; kaart-subregel "stopmoment je AOW-leeftijd".
5. **now**: geen slider, wel balk; geen antwoordenblok; geen promotie.
6. **anker-wissel** met bestaand lab-doel: melding op de doelenpagina, Bijwerken → lab, Loslaten → confirm; terug naar het oude anker → melding weg.
7. **VRIJ MOGELIJK VANAF** toont onder 2–4 een getal.

Herstel het testaccount (anker solved, `retirement_expense_method: 'essential_budgets'`, lab "Terug naar basis").

- [ ] **Step 3: Gebundelde eindreview**

Eén `general-purpose`-review (`subagent_type: "fork"` bestaat niet in deze omgeving) op `git diff cb741b659...HEAD`: correctheid, UI-consistentie (tokens, koppen, 44px-tapdoelen), security-lens (geen nieuwe datatoegang — `labPlan` komt uit de bestaande snapshot; `/api/toekomst-doel` alleen strenger). Geen aparte `security-specialist`-run nodig tenzij de review een route-/RLS-raakvlak vindt. Bevindingen 🔴 fixen + herdraai-regel (tsc + geraakte tests).

- [ ] **Step 4: Push naar preview + overdracht**

`git push origin HEAD:preview` (nooit master). Deploy-status via `npx vercel inspect <deploy-url>`; de preview-alias zit achter Vercel-SSO — smoke via de ingelogde eigenaar-browser. Werk de Notion-nazorgkaart (3dbf9e8d-568a-8166-876b-e05d60761966) en het geheugen bij: wat er op preview staat, de "—"-fix (hotfix-kandidaat voor master, apart cherry-picken zoals `1e1ae15b2`), open punten (fase 2: uitgaven-ná-stop-hint; "gedekt" vs nalatenschap).

---

## Zelfreview (uitgevoerd bij het schrijven)

- **Spec-dekking:** §1 → Task 3+4 · §2 → Task 1+2 · §3 → Task 5 · §4.1/§4.2 → Task 6 · §4.3 → WF-TOEK-50 (Task 7) · §5 kopij → anker-copy in Task 2/3/5/6 · §6 (geen motor/migratie) → geen task, bewaakt door de bron-grendels · §7.1 → Task 0 · §7.2 → Task 4 (band weg) · §7.3 → Task 5 (beide hints vervangen onder vast anker) · Verificatie/UAT/curatie → Task 7+8.
- **Placeholders:** geen "TBD"; twee bewust open keuzes staan mét instructie (Task 3 Step 3 token-naam `bg-positive` vs `bg-positive-bg`; Task 5 Step 7 plaats van `handleLabAntwoord` t.o.v. `handleStopAgeChange`).
- **Typeconsistentie:** `DekkingsasData` (Task 3) = de prop `dekking` (Task 4) = `dekkingsasData` (Task 4); `LabAntwoordActie`/`resolveLabAntwoorden` (Task 5) = WF-TOEK-49 (Task 7); `LabPlanContext` (Task 6) = `labPlan` op page + view; `savingsPpForMonthlyAmount`/`savingsEuroForPp`/`computeSliderUiRange` (Task 1) = consumenten in Task 2 en 5; `planCoverageGoalName` (Task 6) = `buildRow` + kaart; `LEGACY_PARAMETER_GOAL_TYPES` (Task 1) = route.
