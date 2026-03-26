# What-If Scenario Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the what-if page with IncomeExpenseChart + AI suggestions, and add ghost overlay support on the horizon page for saved scenarios.

**Architecture:** Re-compute on demand — saved scenarios store only overrides + events, simulation is re-run when overlay is selected. Override logic is extracted to a shared pure function (`applyWhatIfOverrides`) used by both the what-if page and horizon overlay. AI suggestions are debounced and triggered by significant FIRE-age deltas.

**Tech Stack:** Next.js 16, React 19, Supabase, Vercel AI SDK (`streamObject`), Tailwind CSS v4, SVG charts

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `lib/whatif-overrides.ts` | Pure function to apply WhatIfOverrides to FinancialInput — shared by what-if page and horizon overlay |
| `lib/whatif-suggestions.ts` | Delta detection (`isSignificantDelta`) + suggestion prompt builder |
| `lib/hooks/use-whatif-suggestions.ts` | Custom hook: debounce → detect → fetch → manage suggestion state |
| `app/api/whatif/suggest/route.ts` | POST endpoint: AI generates 1-3 life event suggestions from scenario context |
| `components/app/horizon/whatif-suggestion-cards.tsx` | Renders AI suggestion cards with add/dismiss actions |
| `components/app/horizon/scenario-overlay-picker.tsx` | Dropdown on horizon page to select saved scenario as ghost overlay |
| `lib/regression-tests/suites/whatif-scenarios.ts` | Regression tests for scenario CRUD, isolation, delta detection |

### Modified Files
| File | Changes |
|---|---|
| `app/api/scenarios/route.ts` | Add `colorIndex` to SavedScenario, add `WHATIF_SCENARIO_COLORS` constant |
| `components/app/horizon/income-expense-chart.tsx` | Add `baselineRows` and `ghostOverlayRows`/`ghostColor` optional props for ghost-line rendering |
| `components/app/horizon/events-timeline.tsx` | Add `scenarioEvents`/`scenarioColor` optional props for scenario event markers |
| `components/app/horizon/whatif-events.tsx` | Accept `suggestions` prop, render suggestion cards above event list |
| `app/(app)/horizon/whatif/page.tsx` | Add IncomeExpenseChart, integrate AI suggestions via hook, extract override logic |
| `components/app/horizon/horizon-client.tsx` | Fetch saved scenarios, add picker, re-compute overlay simulation, pass to charts |
| `app/(app)/identity/gids/page.tsx` | Update existing "Droomscenario" topic card text |
| `lib/test-personas.ts` | Add sample saved scenarios for Lisa and Willem personas |
| `lib/seed-persona.ts` | Seed `app_settings` for personas with saved scenarios |

---

## Task 1: Scenario colors + colorIndex (Foundation)

**Files:**
- Modify: `app/api/scenarios/route.ts`

- [ ] **Step 1: Add color palette constant and update SavedScenario type**

```ts
// Add at top of file, after imports:

export const WHATIF_SCENARIO_COLORS = [
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#10b981', label: 'Smaragd' },
  { hex: '#ef4444', label: 'Robijn' },
  { hex: '#8b5cf6', label: 'Violet' },
] as const

// Add to SavedScenario interface, after fireAge:
//   colorIndex: number
```

In the `SavedScenario` interface, add `colorIndex: number` after `fireAge: number | null`.

- [ ] **Step 2: Auto-assign colorIndex in POST handler**

In the POST handler, before creating `newScenario`, add logic to find the first unused color index:

```ts
  // Find first unused colorIndex (0-4)
  const usedIndices = new Set(existing.map(s => s.colorIndex ?? 0))
  let colorIndex = 0
  for (let i = 0; i < WHATIF_SCENARIO_COLORS.length; i++) {
    if (!usedIndices.has(i)) { colorIndex = i; break }
  }

  const newScenario: SavedScenario = {
    // ... existing fields ...
    colorIndex,
  }
```

- [ ] **Step 3: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `SavedScenario` or `colorIndex`

- [ ] **Step 4: Commit**

```bash
git add app/api/scenarios/route.ts
git commit -m "feat(whatif): add scenario color palette and colorIndex to SavedScenario"
```

---

## Task 2: Extract override logic to shared utility

**Files:**
- Create: `lib/whatif-overrides.ts`
- Modify: `app/(app)/horizon/whatif/page.tsx`

- [ ] **Step 1: Create the shared override utility**

Create `lib/whatif-overrides.ts`:

```ts
import type { FinancialInput } from '@/lib/horizon-data'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'

/**
 * Apply what-if overrides to a financial input to produce adjusted values.
 * Pure function — no side effects, no DB access.
 *
 * Used by:
 * - What-if page (whatif/page.tsx) for the what-if simulation
 * - Horizon page (horizon-client.tsx) for scenario overlay re-computation
 */
export function applyWhatIfOverrides(
  input: FinancialInput,
  overrides: WhatIfOverrides,
  baseline: WhatIfOverrides,
): { adjustedInput: FinancialInput; annualSavings: number } {
  // Apply income from slider, adjusted proportionally by work days (5 = full-time)
  const effectiveIncome = overrides.monthlyIncome * (overrides.workDaysPerWeek / 5)
  const baselineEffectiveIncome = baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)

  // Savings rate changes adjust expenses on BASELINE income (lifestyle adjustment)
  // Income changes do NOT affect expenses — all extra income goes 1:1 to savings
  const savingsRateExpenseDelta = baselineEffectiveIncome * ((overrides.savingsRate - baseline.savingsRate) / 100)
  const adjustedExpenses = Math.max(0, input.monthlyExpenses - savingsRateExpenseDelta)

  // Monthly contributions = base + extra
  const adjustedContributions = input.monthlyContributions + overrides.extraContribution

  const adjustedInput: FinancialInput = {
    ...input,
    monthlyIncome: effectiveIncome,
    monthlyExpenses: adjustedExpenses,
    monthlyContributions: adjustedContributions,
    expectedReturn: overrides.expectedReturn / 100,
  }

  // Delta-based annual savings
  const baseAnnualSavings = (input.monthlyContributions ?? 0) * 12
  const incomeDelta = effectiveIncome - baselineEffectiveIncome
  const savingsRateDelta = baselineEffectiveIncome * ((overrides.savingsRate - baseline.savingsRate) / 100)
  const extraDelta = overrides.extraContribution ?? 0
  const annualSavings = Math.max(0, baseAnnualSavings + (incomeDelta + savingsRateDelta + extraDelta) * 12)

  return { adjustedInput, annualSavings }
}

/**
 * Build a baseline WhatIfOverrides snapshot from real financial data.
 */
export function buildBaselineOverrides(
  input: FinancialInput,
  grossReturn: number,
): WhatIfOverrides {
  const savingsRate = input.monthlyIncome > 0
    ? Math.round(((input.monthlyIncome - input.monthlyExpenses) / input.monthlyIncome) * 100)
    : 0
  return {
    monthlyIncome: Math.round(input.monthlyIncome),
    workDaysPerWeek: 5,
    savingsRate: Math.max(0, Math.min(80, savingsRate)),
    expectedReturn: grossReturn * 100,
    extraContribution: 0,
  }
}
```

- [ ] **Step 2: Refactor what-if page to use shared utility**

In `app/(app)/horizon/whatif/page.tsx`, replace the inline `whatIfInput` and `whatIfAnnualSavings_sim` useMemo blocks with calls to `applyWhatIfOverrides`:

```ts
import { applyWhatIfOverrides } from '@/lib/whatif-overrides'

// Replace the whatIfInput + whatIfAnnualSavings_sim useMemos with:
const { adjustedInput: whatIfInput, annualSavings: whatIfAnnualSavings_sim } = useMemo(() => {
  if (!input || !overrides || !baseline) return { adjustedInput: null, annualSavings: 0 }
  return applyWhatIfOverrides(input, overrides, baseline)
}, [input, overrides, baseline])
```

Also replace the `baseline` useMemo:

```ts
import { buildBaselineOverrides } from '@/lib/whatif-overrides'

const baseline = useMemo<WhatIfOverrides | null>(() => {
  if (!input) return null
  return buildBaselineOverrides(input, userGrossReturn)
}, [input, userGrossReturn])
```

- [ ] **Step 3: Verify the what-if page still works**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add lib/whatif-overrides.ts app/\(app\)/horizon/whatif/page.tsx
git commit -m "refactor(whatif): extract override logic to shared lib/whatif-overrides.ts"
```

---

## Task 3: IncomeExpenseChart ghost-line support

**Files:**
- Modify: `components/app/horizon/income-expense-chart.tsx`

- [ ] **Step 1: Add ghost-line props to IncomeExpenseChart**

Add three new optional props to the main component signature (after `breakdownResult`):

```ts
  baselineRows?: SimRow[]
  ghostOverlayRows?: SimRow[]
  ghostColor?: string
```

- [ ] **Step 2: Pass ghost props through to LinesView**

In the main component, pass the new props to `LinesView`:

```ts
<LinesView
  rows={rows}
  // ... existing props ...
  baselineRows={baselineRows}
  ghostOverlayRows={ghostOverlayRows}
  ghostColor={ghostColor}
/>
```

Add the same three props to the `LinesView` function signature.

- [ ] **Step 3: Render ghost lines in LinesView**

Inside the `LinesView` function, after the existing income/expense paths (around line 278), add ghost-line rendering:

```tsx
{/* Baseline ghost lines (what-if page: dashed, low opacity, ink-4) */}
{baselineRows && baselineRows.length > 1 && (() => {
  const ghostVisible = baselineRows.filter(r => r.age >= minAge && r.age < maxAge)
  const ghostIncome = ghostVisible.map(r => [r.age, r.flowIn] as [number, number])
  const ghostExpense = ghostVisible.map(r => [r.age, r.flowOut] as [number, number])
  return (
    <>
      {ghostIncome.length > 1 && (
        <path d={pointsToPath(ghostIncome)} fill="none" stroke="var(--ink-4)" strokeWidth={1.5}
          strokeDasharray="6 4" opacity={0.35}
          strokeLinecap="round" strokeLinejoin="round" />
      )}
      {ghostExpense.length > 1 && (
        <path d={pointsToPath(ghostExpense)} fill="none" stroke="var(--ink-4)" strokeWidth={1.5}
          strokeDasharray="6 4" opacity={0.35}
          strokeLinecap="round" strokeLinejoin="round" />
      )}
    </>
  )
})()}

{/* Scenario overlay ghost lines (horizon page: scenario color) */}
{ghostOverlayRows && ghostColor && ghostOverlayRows.length > 1 && (() => {
  const ghostVisible = ghostOverlayRows.filter(r => r.age >= minAge && r.age < maxAge)
  const ghostIncome = ghostVisible.map(r => [r.age, r.flowIn] as [number, number])
  const ghostExpense = ghostVisible.map(r => [r.age, r.flowOut] as [number, number])
  return (
    <>
      {ghostIncome.length > 1 && (
        <path d={pointsToPath(ghostIncome)} fill="none" stroke={ghostColor} strokeWidth={1.5}
          strokeDasharray="6 4" opacity={0.4}
          strokeLinecap="round" strokeLinejoin="round" />
      )}
      {ghostExpense.length > 1 && (
        <path d={pointsToPath(ghostExpense)} fill="none" stroke={ghostColor} strokeWidth={1.5}
          strokeDasharray="6 4" opacity={0.4}
          strokeLinecap="round" strokeLinejoin="round" />
      )}
    </>
  )
})()}
```

Note: ghost lines must be rendered BEFORE the primary lines so they appear behind them. Move these blocks before the existing `<path>` elements for `incomePts` and `expensePts`.

- [ ] **Step 4: Ensure ghost rows use the same yScale**

The `yScale` in LinesView uses `maxVal` computed from only the primary rows. Update `allVals` to include ghost rows so the scale encompasses both:

```ts
const ghostInVals = (baselineRows ?? ghostOverlayRows ?? [])
  .filter(r => r.age >= minAge && r.age < maxAge)
  .flatMap(r => [r.flowIn, r.flowOut])
const allVals = [
  ...incomePts.map(([, v]) => v),
  ...expensePts.map(([, v]) => v),
  ...ghostInVals,
]
```

- [ ] **Step 5: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add components/app/horizon/income-expense-chart.tsx
git commit -m "feat(charts): add ghost-line support to IncomeExpenseChart"
```

---

## Task 4: Add IncomeExpenseChart to what-if page

**Files:**
- Modify: `app/(app)/horizon/whatif/page.tsx`

- [ ] **Step 1: Add imports**

Add at top of the file:

```ts
import { IncomeExpenseChart } from '@/components/app/horizon/income-expense-chart'
```

- [ ] **Step 2: Add expand/collapse state**

Add after existing state declarations:

```ts
const [ieExpanded, setIeExpanded] = useState(typeof window !== 'undefined' && window.innerWidth >= 768)
```

- [ ] **Step 3: Add IncomeExpenseChart after SimChart inside ZoomableChartContainer**

Inside the `ZoomableChartContainer` render callback, after the `EventsTimeline` component and before the closing `</>`, add:

```tsx
{/* Vermogensstromen toggle + chart */}
<div className="border-t border-[var(--border-ed)]">
  <button
    type="button"
    onClick={() => setIeExpanded(prev => !prev)}
    className="flex w-full items-center justify-center gap-2 py-2.5 text-[12px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors cursor-pointer select-none"
    style={{ minHeight: 44 }}
    aria-expanded={ieExpanded}
    aria-label={ieExpanded ? 'Vermogensstromen verbergen' : 'Vermogensstromen tonen'}
  >
    <span>Vermogensstromen</span>
    {ieExpanded
      ? <ChevronUp size={14} />
      : <ChevronDown size={14} />
    }
  </button>
  <div
    style={{
      maxHeight: ieExpanded ? 200 : 0,
      overflow: 'hidden',
      opacity: ieExpanded ? 1 : 0,
      transition: 'max-height 0.3s ease, opacity 0.2s ease',
    }}
  >
    <IncomeExpenseChart
      rows={simResult.rows}
      baselineRows={baselineSim?.result.rows}
      currentAge={currentAge ?? 30}
      endAge={simResult.displayEndAge}
      visibleMinAge={visibleMin}
      visibleMaxAge={visibleMax}
      fireAge={simResult.fireAge}
      viewMode="lines"
    />
  </div>
</div>
```

Note: `ChevronUp` and `ChevronDown` are already imported in this file via `lucide-react`. If `ChevronUp` is not imported, add it to the existing import.

- [ ] **Step 4: Add ChevronUp import if missing**

Check the existing lucide-react import line. If `ChevronUp` is not present, add it:

```ts
import { Loader2, AlertTriangle, ArrowRight, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'
```

(`ChevronDown` may also need to be added if not already imported.)

- [ ] **Step 5: Update legenda to include vermogensstromen labels**

In the legend section (after the chart), add entries for the flowIn/flowOut lines:

```tsx
{ieExpanded && (
  <>
    <span className="flex items-center gap-1.5">
      <svg width="20" height="2" aria-hidden="true">
        <line x1="0" y1="1" x2="20" y2="1" stroke="var(--horizon-500, #8b5cf6)" strokeWidth="2" />
      </svg>
      Instroom
    </span>
    <span className="flex items-center gap-1.5">
      <svg width="20" height="2" aria-hidden="true">
        <line x1="0" y1="1" x2="20" y2="1" stroke="var(--kern-500, #f59e0b)" strokeWidth="2" />
      </svg>
      Uitstroom
    </span>
  </>
)}
```

- [ ] **Step 6: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/horizon/whatif/page.tsx
git commit -m "feat(whatif): add IncomeExpenseChart with baseline ghost lines"
```

---

## Task 5: Significant-delta detection utility

**Files:**
- Create: `lib/whatif-suggestions.ts`

- [ ] **Step 1: Create the utility**

Create `lib/whatif-suggestions.ts`:

```ts
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'

/**
 * Detect if slider changes are significant enough to trigger AI suggestions.
 * Returns true when any threshold is exceeded.
 */
export function isSignificantDelta(
  overrides: WhatIfOverrides,
  baseline: WhatIfOverrides,
  fireAgeDelta: number | null,
): boolean {
  // Primary: FIRE age shifted by 1+ years (measures *effect*)
  if (fireAgeDelta !== null && Math.abs(fireAgeDelta) >= 1.0) return true

  // Income changed >10%
  if (baseline.monthlyIncome > 0) {
    const incomePct = Math.abs(overrides.monthlyIncome - baseline.monthlyIncome) / baseline.monthlyIncome
    if (incomePct > 0.10) return true
  }

  // Work days changed by 1+
  if (Math.abs(overrides.workDaysPerWeek - baseline.workDaysPerWeek) >= 1) return true

  // Savings rate changed by 5+ percentage points
  if (Math.abs(overrides.savingsRate - baseline.savingsRate) >= 5) return true

  // Extra contribution >= 200/month
  if (overrides.extraContribution >= 200) return true

  return false
}

/**
 * Build prompt context for AI suggestion generation.
 */
export function buildSuggestionPrompt(context: {
  overrides: WhatIfOverrides
  baseline: WhatIfOverrides
  fireAgeDelta: number | null
  activeEventNames: string[]
}): string {
  const { overrides, baseline, fireAgeDelta, activeEventNames } = context

  const changes: string[] = []

  const incomeDelta = overrides.monthlyIncome - baseline.monthlyIncome
  if (Math.abs(incomeDelta) > 50) {
    changes.push(`Inkomen: ${incomeDelta > 0 ? '+' : ''}€${Math.round(incomeDelta)}/mnd`)
  }

  if (overrides.workDaysPerWeek !== baseline.workDaysPerWeek) {
    changes.push(`Werkdagen: ${baseline.workDaysPerWeek} → ${overrides.workDaysPerWeek} dagen/week`)
  }

  const savingsRateDelta = overrides.savingsRate - baseline.savingsRate
  if (Math.abs(savingsRateDelta) > 1) {
    changes.push(`Spaarquote: ${savingsRateDelta > 0 ? '+' : ''}${Math.round(savingsRateDelta)}pp`)
  }

  if (overrides.extraContribution > 0) {
    changes.push(`Extra inleg: €${Math.round(overrides.extraContribution)}/mnd`)
  }

  const returnDelta = overrides.expectedReturn - baseline.expectedReturn
  if (Math.abs(returnDelta) > 0.5) {
    changes.push(`Rendement: ${returnDelta > 0 ? '+' : ''}${returnDelta.toFixed(1)}%`)
  }

  if (fireAgeDelta !== null) {
    const months = Math.round(fireAgeDelta * 12)
    changes.push(`FIRE-leeftijd effect: ${months > 0 ? '+' : ''}${months} maanden`)
  }

  return [
    'De gebruiker past een wat-als scenario aan met de volgende wijzigingen:',
    ...changes.map(c => `- ${c}`),
    '',
    activeEventNames.length > 0
      ? `Al actieve events: ${activeEventNames.join(', ')}`
      : 'Geen levensgebeurtenissen actief.',
    '',
    'Suggereer 1-3 levensgebeurtenissen die logisch passen bij deze wijzigingen.',
    'Denk aan: consequenties van de wijzigingen (minder werken → meer vrije tijd → hobby/reizen?),',
    'of events die de gebruiker misschien vergeet mee te nemen.',
    'Gebruik ALLEEN types uit: sabbatical, world_trip, children, renovation, study, career_change,',
    'part_time, early_retirement, house_purchase, house_sale, wedding, move, car_purchase,',
    'inheritance, side_hustle, werkloosheid, schenking, custom.',
    'Geef realistische bedragen in euro voor Nederlandse context.',
  ].join('\n')
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/whatif-suggestions.ts
git commit -m "feat(whatif): add significant-delta detection and suggestion prompt builder"
```

---

## Task 6: AI suggestion API endpoint

**Files:**
- Create: `app/api/whatif/suggest/route.ts`

- [ ] **Step 1: Create the suggestion endpoint**

Create `app/api/whatif/suggest/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

const SuggestedEventSchema = z.object({
  event_type: z.string(),
  name: z.string(),
  target_age: z.number().nullable(),
  one_time_cost: z.number(),
  monthly_cost_change: z.number(),
  monthly_income_change: z.number(),
  duration_months: z.number(),
  explanation: z.string(),
})

const SuggestionsResponseSchema = z.object({
  suggestions: z.array(SuggestedEventSchema).min(1).max(3),
})

export type SuggestedEvent = z.infer<typeof SuggestedEventSchema>

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.prompt) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  try {
    const result = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: SuggestionsResponseSchema,
      prompt: body.prompt,
      system: [
        'Je bent een financieel assistent voor een Nederlandse personal finance app.',
        'Je suggereert levensgebeurtenissen die passen bij scenario-wijzigingen.',
        'Geef realistische bedragen in euro. Wees bondig in je uitleg (max 1 zin).',
        'Suggereer geen events die al actief zijn.',
      ].join(' '),
    })

    return NextResponse.json({ suggestions: result.object.suggestions })
  } catch (err) {
    console.error('AI suggestion error:', err)
    return NextResponse.json({ suggestions: [] })
  }
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/api/whatif/suggest/route.ts
git commit -m "feat(whatif): add AI suggestion API endpoint"
```

---

## Task 7: Suggestion hook

**Files:**
- Create: `lib/hooks/use-whatif-suggestions.ts`

- [ ] **Step 1: Create the custom hook**

Create `lib/hooks/use-whatif-suggestions.ts`:

```ts
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import type { SuggestedEvent } from '@/app/api/whatif/suggest/route'
import { isSignificantDelta, buildSuggestionPrompt } from '@/lib/whatif-suggestions'

interface UseWhatIfSuggestionsOptions {
  overrides: WhatIfOverrides | null
  baseline: WhatIfOverrides | null
  fireAgeDelta: number | null
  activeEventNames: string[]
  /** Debounce delay in ms (default 2000) */
  debounceMs?: number
}

interface UseWhatIfSuggestionsResult {
  suggestions: SuggestedEvent[]
  loading: boolean
  dismiss: (index: number) => void
  dismissAll: () => void
}

export function useWhatIfSuggestions({
  overrides,
  baseline,
  fireAgeDelta,
  activeEventNames,
  debounceMs = 2000,
}: UseWhatIfSuggestionsOptions): UseWhatIfSuggestionsResult {
  const [suggestions, setSuggestions] = useState<SuggestedEvent[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Dismiss on any slider change
  useEffect(() => {
    setSuggestions([])
  }, [overrides])

  // Debounced fetch
  useEffect(() => {
    if (!overrides || !baseline) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      if (!isSignificantDelta(overrides, baseline, fireAgeDelta)) return

      // Abort previous request
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      try {
        const prompt = buildSuggestionPrompt({
          overrides,
          baseline,
          fireAgeDelta,
          activeEventNames,
        })

        const res = await fetch('/api/whatif/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        })

        if (res.ok) {
          const data = await res.json()
          if (!controller.signal.aborted) {
            setSuggestions(data.suggestions ?? [])
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Silent degradation
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [overrides, baseline, fireAgeDelta, activeEventNames, debounceMs])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const dismiss = useCallback((index: number) => {
    setSuggestions(prev => prev.filter((_, i) => i !== index))
  }, [])

  const dismissAll = useCallback(() => {
    setSuggestions([])
  }, [])

  return { suggestions, loading, dismiss, dismissAll }
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/use-whatif-suggestions.ts
git commit -m "feat(whatif): add useWhatIfSuggestions hook with debounced AI fetch"
```

---

## Task 8: Suggestion cards component

**Files:**
- Create: `components/app/horizon/whatif-suggestion-cards.tsx`

- [ ] **Step 1: Create the component**

Create `components/app/horizon/whatif-suggestion-cards.tsx`:

```tsx
'use client'

import { formatCurrency } from '@/lib/format'
import { LIFE_EVENT_CATALOG } from '@/lib/horizon-data'
import { EVENT_ICONS } from '@/components/app/horizon/log-timeline'
import type { SuggestedEvent } from '@/app/api/whatif/suggest/route'
import { Plus, X, Sparkles } from 'lucide-react'

interface WhatIfSuggestionCardsProps {
  suggestions: SuggestedEvent[]
  loading: boolean
  onAdd: (suggestion: SuggestedEvent) => void
  onDismiss: (index: number) => void
}

export function WhatIfSuggestionCards({
  suggestions,
  loading,
  onAdd,
  onDismiss,
}: WhatIfSuggestionCardsProps) {
  if (!loading && suggestions.length === 0) return null

  return (
    <div className="border border-dashed border-wil-300 bg-wil-50/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className="text-wil-600" />
        <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-wil-600">
          Will suggereert
        </span>
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1].map(i => (
            <div key={i} className="animate-pulse bg-wil-50 h-14" />
          ))}
        </div>
      )}

      {suggestions.map((suggestion, index) => {
        const catalog = LIFE_EVENT_CATALOG[suggestion.event_type]
        const iconKey = catalog?.icon ?? 'Calendar'
        const IconComponent = EVENT_ICONS[iconKey] ?? EVENT_ICONS.Calendar

        const hasOnetime = suggestion.one_time_cost > 0
        const hasMonthly = suggestion.monthly_cost_change !== 0 || suggestion.monthly_income_change !== 0

        return (
          <div
            key={`${suggestion.event_type}-${index}`}
            className="flex items-start gap-3 bg-[var(--paper)] border border-[var(--border-ed)] p-3 transition-opacity duration-150"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center bg-wil-50 text-wil-600">
              <IconComponent size={16} />
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-serif text-sm font-semibold text-[var(--ink)] leading-tight">
                {suggestion.name}
              </p>
              <p className="mt-0.5 font-sans text-xs text-[var(--ink-3)] line-clamp-2">
                {suggestion.explanation}
              </p>
              <div className="mt-1 flex flex-wrap gap-2 font-mono tabular-nums text-xs text-[var(--ink-3)]">
                {hasOnetime && (
                  <span>-{formatCurrency(suggestion.one_time_cost)}</span>
                )}
                {suggestion.monthly_cost_change > 0 && (
                  <span>-{formatCurrency(suggestion.monthly_cost_change)}/mnd</span>
                )}
                {suggestion.monthly_income_change !== 0 && (
                  <span className={suggestion.monthly_income_change > 0 ? 'text-positive' : ''}>
                    {suggestion.monthly_income_change > 0 ? '+' : '-'}
                    {formatCurrency(Math.abs(suggestion.monthly_income_change))}/mnd
                  </span>
                )}
                {suggestion.duration_months > 0 && (
                  <span>{suggestion.duration_months} mnd</span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => onAdd(suggestion)}
                className="flex h-8 w-8 items-center justify-center text-wil-600 hover:text-wil-700 hover:bg-wil-50 transition-colors"
                aria-label={`${suggestion.name} toevoegen`}
              >
                <Plus size={16} />
              </button>
              <button
                type="button"
                onClick={() => onDismiss(index)}
                className="flex h-8 w-8 items-center justify-center text-[var(--ink-4)] hover:text-[var(--ink-3)] transition-colors"
                aria-label={`${suggestion.name} negeren`}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/app/horizon/whatif-suggestion-cards.tsx
git commit -m "feat(whatif): add AI suggestion cards component"
```

---

## Task 9: Integrate suggestions into what-if page

**Files:**
- Modify: `app/(app)/horizon/whatif/page.tsx`
- Modify: `components/app/horizon/whatif-events.tsx`

- [ ] **Step 1: Add suggestion hook to what-if page**

In `app/(app)/horizon/whatif/page.tsx`, add imports and hook:

```ts
import { useWhatIfSuggestions } from '@/lib/hooks/use-whatif-suggestions'
import type { SuggestedEvent } from '@/app/api/whatif/suggest/route'
```

After the existing `chatScenarioContext` useMemo, add:

```ts
const { suggestions, loading: suggestionsLoading, dismiss: dismissSuggestion, dismissAll: dismissAllSuggestions } =
  useWhatIfSuggestions({
    overrides,
    baseline,
    fireAgeDelta,
    activeEventNames: activeEvents.map(e => e.name),
  })

const handleAddSuggestion = useCallback((s: SuggestedEvent) => {
  handleAddEvent({
    id: crypto.randomUUID(),
    name: s.name,
    event_type: s.event_type,
    target_age: s.target_age,
    one_time_cost: s.one_time_cost,
    monthly_cost_change: s.monthly_cost_change,
    monthly_income_change: s.monthly_income_change,
    duration_months: s.duration_months,
    icon: LIFE_EVENT_CATALOG[s.event_type]?.icon ?? 'Calendar',
    is_active: true,
    sort_order: events.length,
    is_indexed: false,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: '',
  } as WhatIfEvent)
  dismissSuggestion(suggestions.indexOf(s))
}, [handleAddEvent, events.length, suggestions, dismissSuggestion])
```

Add the missing import if needed:

```ts
import { LIFE_EVENT_CATALOG } from '@/lib/horizon-data'
```

- [ ] **Step 2: Pass suggestions to WhatIfEventsPanel**

Update the `WhatIfEventsPanel` usage to include suggestion props:

```tsx
<WhatIfEventsPanel
  events={events}
  onToggleEvent={handleToggleEvent}
  onAddEvent={handleAddEvent}
  onRemoveEvent={handleRemoveEvent}
  onEditEvent={handleEditEvent}
  baselineFireAge={baselineFireAge}
  computeImpact={computeImpact}
  dailyExpenses={whatIfInput ? whatIfInput.monthlyExpenses / 30 : undefined}
  isHousehold={isHousehold}
  suggestions={suggestions}
  suggestionsLoading={suggestionsLoading}
  onAddSuggestion={handleAddSuggestion}
  onDismissSuggestion={dismissSuggestion}
/>
```

- [ ] **Step 3: Update WhatIfEventsPanel to accept and render suggestions**

In `components/app/horizon/whatif-events.tsx`, update the props interface:

```ts
import type { SuggestedEvent } from '@/app/api/whatif/suggest/route'
import { WhatIfSuggestionCards } from './whatif-suggestion-cards'
```

Add to `WhatIfEventsPanel` props:

```ts
  suggestions?: SuggestedEvent[]
  suggestionsLoading?: boolean
  onAddSuggestion?: (s: SuggestedEvent) => void
  onDismissSuggestion?: (index: number) => void
```

At the top of the component's JSX return (before the existing event list), render:

```tsx
{(suggestions?.length || suggestionsLoading) && onAddSuggestion && onDismissSuggestion && (
  <WhatIfSuggestionCards
    suggestions={suggestions ?? []}
    loading={suggestionsLoading ?? false}
    onAdd={onAddSuggestion}
    onDismiss={onDismissSuggestion}
  />
)}
```

- [ ] **Step 4: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/horizon/whatif/page.tsx components/app/horizon/whatif-events.tsx
git commit -m "feat(whatif): integrate AI suggestions into what-if page and events panel"
```

---

## Task 10: EventsTimeline scenario event support

**Files:**
- Modify: `components/app/horizon/events-timeline.tsx`

- [ ] **Step 1: Add scenario event props**

Add optional props to `EventsTimeline`:

```ts
export function EventsTimeline({
  events,
  currentAge,
  endAge,
  visibleMinAge,
  visibleMaxAge,
  scenarioEvents,
  scenarioColor,
}: {
  events: LifeEvent[]
  currentAge: number
  endAge: number
  visibleMinAge?: number
  visibleMaxAge?: number
  scenarioEvents?: Array<{ name: string; target_age: number | null; event_type: string }>
  scenarioColor?: string
}) {
```

- [ ] **Step 2: Render scenario event markers**

After the existing event markers rendering, add scenario event rendering:

```tsx
{/* Scenario overlay events (ghost markers) */}
{scenarioEvents && scenarioColor && scenarioEvents
  .filter(e => e.target_age != null && e.target_age >= rangeMin && e.target_age <= rangeMax)
  .map((ev, i) => {
    const cx = xScale(ev.target_age!)
    // Offset vertically if overlapping with a real event at same age
    const hasRealOverlap = visibleEvents.some(
      re => re.target_age != null && Math.abs(re.target_age - ev.target_age!) < 1
    )
    const cy = hasRealOverlap ? Y_LINE - 14 : Y_LINE

    return (
      <g key={`scenario-${i}`} opacity={0.6}>
        <circle
          cx={cx} cy={cy} r={6}
          fill={scenarioColor} fillOpacity={0.3}
          stroke={scenarioColor} strokeWidth={1.5}
          strokeDasharray="3 2"
        />
        {/* Small scenario indicator square */}
        <rect
          x={cx + 8} y={cy - 3} width={6} height={6}
          fill={scenarioColor}
        />
        <text
          x={cx} y={cy + 18}
          textAnchor="middle"
          fontSize={9}
          fill="var(--ink-4)"
          fontFamily="var(--font-inter, sans-serif)"
          fontStyle="italic"
        >
          {ev.name}
        </text>
      </g>
    )
  })
}
```

- [ ] **Step 3: Update the null-return check**

The component currently returns `null` if `visibleEvents.length === 0`. Update to also check scenario events:

```ts
const hasScenarioEvents = scenarioEvents?.some(
  e => e.target_age != null && e.target_age >= rangeMin && e.target_age <= rangeMax
) ?? false

if (visibleEvents.length === 0 && !hasScenarioEvents) return null
```

- [ ] **Step 4: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add components/app/horizon/events-timeline.tsx
git commit -m "feat(charts): add scenario event markers to EventsTimeline"
```

---

## Task 11: Scenario overlay picker for horizon page

**Files:**
- Create: `components/app/horizon/scenario-overlay-picker.tsx`

- [ ] **Step 1: Create the picker component**

Create `components/app/horizon/scenario-overlay-picker.tsx`:

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import type { SavedScenario } from '@/app/api/scenarios/route'
import { WHATIF_SCENARIO_COLORS } from '@/app/api/scenarios/route'
import { formatFireAgeShort } from '@/lib/horizon-data'
import { ChevronDown, Layers } from 'lucide-react'

interface ScenarioOverlayPickerProps {
  scenarios: SavedScenario[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function ScenarioOverlayPicker({
  scenarios,
  selectedId,
  onSelect,
}: ScenarioOverlayPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  if (scenarios.length === 0) return null

  const selected = selectedId ? scenarios.find(s => s.id === selectedId) : null
  const color = selected ? WHATIF_SCENARIO_COLORS[selected.colorIndex ?? 0] : null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="card-editorial flex items-center gap-2 px-3 py-2 text-left transition-all hover:shadow-sm"
        style={{ minHeight: 44 }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Layers size={14} className="text-[var(--ink-3)]" />
        <div className="flex-1 min-w-0">
          <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-4)]">
            Scenario overlay
          </span>
          <div className="flex items-center gap-1.5">
            {color && (
              <span
                className="inline-block h-2 w-2 shrink-0"
                style={{ backgroundColor: color.hex }}
              />
            )}
            <span className="font-sans text-xs text-[var(--ink)] truncate">
              {selected ? selected.name : 'Geen'}
            </span>
          </div>
        </div>
        <ChevronDown
          size={14}
          className={`text-[var(--ink-4)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-64 border border-[var(--border-ed)] bg-[var(--paper)] shadow-md"
          role="listbox"
          aria-label="Scenario overlay selectie"
        >
          {/* None option */}
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false) }}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)] ${
              !selectedId ? 'bg-[var(--subtle)]' : ''
            }`}
            style={{ minHeight: 44 }}
            role="option"
            aria-selected={!selectedId}
          >
            <span className="font-sans text-xs text-[var(--ink-2)]">Geen overlay</span>
          </button>

          {/* Scenario options */}
          {scenarios.map(scenario => {
            const c = WHATIF_SCENARIO_COLORS[scenario.colorIndex ?? 0]
            const isSelected = scenario.id === selectedId
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => { onSelect(scenario.id); setOpen(false) }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)] ${
                  isSelected ? 'bg-[var(--subtle)]' : ''
                }`}
                style={{ minHeight: 44 }}
                role="option"
                aria-selected={isSelected}
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0"
                  style={{ backgroundColor: c.hex }}
                />
                <div className="flex-1 min-w-0">
                  <span className="font-sans text-xs font-medium text-[var(--ink)] truncate block">
                    {scenario.name}
                  </span>
                  <span className="font-mono tabular-nums text-[10px] text-[var(--ink-4)]">
                    FIRE {formatFireAgeShort(scenario.fireAge)}
                  </span>
                </div>
              </button>
            )
          })}

          {/* Link to what-if page */}
          <div className="border-t border-[var(--border-ed)]">
            <Link
              href="/horizon/whatif"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-sans text-xs text-wil-600 hover:text-wil-700 hover:bg-wil-50/30 transition-colors"
              style={{ minHeight: 44 }}
              onClick={() => setOpen(false)}
            >
              Nieuw scenario maken &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/app/horizon/scenario-overlay-picker.tsx
git commit -m "feat(horizon): add scenario overlay picker dropdown component"
```

---

## Task 12: Integrate overlay system into horizon page

**Files:**
- Modify: `components/app/horizon/horizon-client.tsx`

- [ ] **Step 1: Add imports**

Add to the imports at top of file:

```ts
import { ScenarioOverlayPicker } from '@/components/app/horizon/scenario-overlay-picker'
import { WHATIF_SCENARIO_COLORS, type SavedScenario } from '@/app/api/scenarios/route'
import { applyWhatIfOverrides, buildBaselineOverrides } from '@/lib/whatif-overrides'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
```

Check which of these are already imported and skip duplicates. `lifeEventsToCashflows` is likely already imported via fire-simulation.

- [ ] **Step 2: Add state for saved scenarios**

Add state after the existing state declarations (around line 180):

```ts
const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([])
const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
```

- [ ] **Step 3: Fetch saved scenarios on mount**

Add a useEffect to fetch scenarios:

```ts
useEffect(() => {
  fetch('/api/scenarios')
    .then(r => r.ok ? r.json() : { scenarios: [] })
    .then(data => setSavedScenarios(data.scenarios ?? []))
    .catch(() => {})
}, [])
```

- [ ] **Step 4: Compute scenario overlay simulation**

Add a useMemo that re-runs simulation for the selected scenario:

```ts
const scenarioOverlayData = useMemo(() => {
  if (!selectedScenarioId) return null
  const scenario = savedScenarios.find(s => s.id === selectedScenarioId)
  if (!scenario) return null

  const { effectiveInput } = initialData
  const currentAgeVal = effectiveInput.dateOfBirth ? ageAtDate(effectiveInput.dateOfBirth) : null
  if (currentAgeVal === null) return null

  const baselineOvr = buildBaselineOverrides(effectiveInput, initialData.fireParams.grossReturn)
  const { adjustedInput, annualSavings } = applyWhatIfOverrides(effectiveInput, scenario.overrides, baselineOvr)

  const scenarioEvents = (scenario.events ?? [])
    .filter(e => !e.whatIfDisabled)
    .map(e => ({
      ...e,
      one_time_cost: Number(e.one_time_cost ?? 0),
      monthly_cost_change: Number(e.monthly_cost_change ?? 0),
      monthly_income_change: Number(e.monthly_income_change ?? 0),
      duration_months: Number(e.duration_months ?? 0),
      is_active: true,
      sort_order: 0,
      is_indexed: false,
      icon: '',
      created_at: '',
      updated_at: '',
      user_id: '',
    }))

  const cashflows = lifeEventsToCashflows(scenarioEvents)
  const currentPortfolio = Math.max(0, adjustedInput.totalAssets - adjustedInput.totalDebts)
  const yearlyExpenses = adjustedInput.yearlyMustExpenses > 0 ? adjustedInput.yearlyMustExpenses : 0
  if (yearlyExpenses <= 0) return null

  const strategyForSim = initialData.fireStrategy
  const grossReturn = adjustedInput.expectedReturn ?? initialData.fireParams.grossReturn

  const result = runSimulation(
    currentAgeVal,
    strategyForSim.endAge ?? 90,
    currentPortfolio,
    yearlyExpenses,
    annualSavings,
    grossReturn,
    'nl_box3',
    initialData.fireParams.inflationRate,
    cashflows,
    strategyForSim,
  )

  const color = WHATIF_SCENARIO_COLORS[scenario.colorIndex ?? 0]

  return {
    overlay: {
      name: scenario.name as 'pessimist' | 'optimist',
      label: scenario.name,
      color: color.hex,
      points: result.rows.map(r => [r.age, r.endPortfolio] as [number, number]),
    } satisfies ScenarioOverlay,
    rows: result.rows,
    events: scenarioEvents,
    color: color.hex,
  }
}, [selectedScenarioId, savedScenarios, initialData])
```

Note: `runSimulation` should be imported. Check if it's already imported from `@/lib/fire-simulation` or from `@/lib/unified-projection`. Use the same import as the existing simulation calls in this file. Looking at the file, it uses `runSimulationUnified as runSimAowStop` from `@/lib/unified-projection`. For the overlay, use the same function.

- [ ] **Step 5: Add picker to the UI**

Find the chart section in the JSX. Add the picker near the existing scenario variant toggles. Look for where `ScenariosModal` or scenario variant buttons are rendered and add nearby:

```tsx
<ScenarioOverlayPicker
  scenarios={savedScenarios}
  selectedId={selectedScenarioId}
  onSelect={setSelectedScenarioId}
/>
```

- [ ] **Step 6: Pass overlay data to charts**

Update the `SimChart` component call to include the scenario overlay:

```tsx
scenarioOverlays={[
  ...(showScenarioVariants ? scenarioVariants : []),
  ...(scenarioOverlayData ? [scenarioOverlayData.overlay] : []),
]}
```

Update the `IncomeExpenseChart` component call to include ghost overlay:

```tsx
ghostOverlayRows={scenarioOverlayData?.rows}
ghostColor={scenarioOverlayData?.color}
```

Update the `EventsTimeline` component call:

```tsx
scenarioEvents={scenarioOverlayData?.events}
scenarioColor={scenarioOverlayData?.color}
```

- [ ] **Step 7: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add components/app/horizon/horizon-client.tsx
git commit -m "feat(horizon): integrate saved scenario ghost overlay with picker"
```

---

## Task 13: Update guide (gids) content

**Files:**
- Modify: `app/(app)/identity/gids/page.tsx`

- [ ] **Step 1: Update existing "Droomscenario / What-If" topic card**

Find the topic card around line 1415. Update the description and howTo steps. Do NOT create a new card.

In the description (around lines 1419-1441), add these sentences:

After "Per event zie je hoeveel maanden het je FIRE-leeftijd verschuift":
```
Onder de projectiegrafiek zie je nu ook de vermogensstromen-grafiek: instroom vs. uitstroom van je vermogen per jaar.
```

After "Will-chat: open Will vanuit je scenario":
```
Will suggereert ook automatisch passende levensgebeurtenissen wanneer je grote wijzigingen maakt aan je scenario.
```

In the howTo.steps array (around lines 1448-1454), add:

```
"Bekijk de vermogensstromen onder de projectie — hier zie je waar je geld naartoe gaat per leeftijd",
"Let op Will's suggesties bij grote wijzigingen — automatisch verschijnen passende events die je met een klik toevoegt",
"Selecteer een opgeslagen scenario als overlay op de Horizon-pagina om direct visueel te vergelijken met je huidige pad",
```

- [ ] **Step 2: Verify no duplicate content in guide**

Search the guide for existing mentions of "vermogensstromen", "overlay", "ghost" to ensure no duplicates:

Run: `grep -n "vermogensstromen\|overlay\|ghost" app/\(app\)/identity/gids/page.tsx`
Expected: Only the newly added lines

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/identity/gids/page.tsx
git commit -m "docs(gids): update what-if topic card with vermogensstromen and AI suggestions"
```

---

## Task 14: Persona seed data for scenarios

**Files:**
- Modify: `lib/test-personas.ts`
- Modify: `lib/seed-persona.ts`

- [ ] **Step 1: Add appSettings to PersonaData interface**

In `lib/test-personas.ts`, find the `PersonaData` interface and add:

```ts
appSettings?: Record<string, unknown>
```

- [ ] **Step 2: Add sample scenarios for Lisa and Willem**

Find Lisa de Groot's persona definition. Add `appSettings`:

```ts
appSettings: {
  [`whatif_scenarios:PLACEHOLDER`]: {
    scenarios: [{
      id: 'sample-lisa-1',
      name: 'Tweede kind op 38',
      createdAt: '2026-02-15T10:00:00Z',
      overrides: {
        monthlyIncome: 4200,
        workDaysPerWeek: 4,
        savingsRate: 25,
        expectedReturn: 7,
        extraContribution: 0,
      },
      events: [{
        id: 'lisa-evt-1',
        name: 'Tweede kind',
        event_type: 'children',
        target_age: 38,
        one_time_cost: 3000,
        monthly_cost_change: 400,
        monthly_income_change: 0,
        duration_months: 216,
        whatIfDisabled: false,
        metadata: { aantalKinderen: 2 },
      }],
      fireAge: 58,
      colorIndex: 0,
    }],
  },
},
```

Find Willem Jansen's persona definition. Add `appSettings`:

```ts
appSettings: {
  [`whatif_scenarios:PLACEHOLDER`]: {
    scenarios: [{
      id: 'sample-willem-1',
      name: 'Vroeg stoppen op 50',
      createdAt: '2026-03-01T10:00:00Z',
      overrides: {
        monthlyIncome: 6500,
        workDaysPerWeek: 5,
        savingsRate: 55,
        expectedReturn: 6.5,
        extraContribution: 500,
      },
      events: [{
        id: 'willem-evt-1',
        name: 'Vroegpensioen',
        event_type: 'early_retirement',
        target_age: 50,
        one_time_cost: 0,
        monthly_cost_change: 0,
        monthly_income_change: -6500,
        duration_months: 0,
        whatIfDisabled: false,
        metadata: {},
      }],
      fireAge: 50,
      colorIndex: 1,
    }],
  },
},
```

Note: The `PLACEHOLDER` key will be replaced with the actual user ID during seeding.

- [ ] **Step 3: Update seed-persona.ts to handle appSettings**

In `lib/seed-persona.ts`, in Phase 4 (after holdings/allocations), add:

```ts
// Seed app_settings for personas with saved scenarios
if (persona.appSettings) {
  for (const [keyTemplate, value] of Object.entries(persona.appSettings)) {
    const key = keyTemplate.replace('PLACEHOLDER', userId)
    await supabase.from('app_settings').upsert(
      { key, value },
      { onConflict: 'key' },
    )
  }
}
```

- [ ] **Step 4: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add lib/test-personas.ts lib/seed-persona.ts
git commit -m "feat(personas): add sample what-if scenarios for Lisa and Willem"
```

---

## Task 15: Regression tests

**Files:**
- Create: `lib/regression-tests/suites/whatif-scenarios.ts`

- [ ] **Step 1: Create the test suite**

Create `lib/regression-tests/suites/whatif-scenarios.ts`:

```ts
import { registerCategory, registerTests } from '../test-registry'
import {
  assert, assertEqual, assertNotNull, assertGreaterThan,
  assertGreaterThanOrEqual, assertLessThan, assertType,
} from '../assert'
import type { TestCase } from '../test-types'
import { isSignificantDelta } from '@/lib/whatif-suggestions'
import { applyWhatIfOverrides, buildBaselineOverrides } from '@/lib/whatif-overrides'
import type { FinancialInput } from '@/lib/horizon-data'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import { runSimulation, lifeEventsToCashflows } from '@/lib/fire-simulation'

const CAT = 'whatif.scenarios'

const BASE_INPUT: FinancialInput = {
  totalAssets: 200_000, totalDebts: 0, monthlyIncome: 4_000,
  monthlyExpenses: 2_500, yearlyMustExpenses: 30_000, monthlyContributions: 1_500,
  dateOfBirth: '1991-03-18',
}

const BASE_OVERRIDES: WhatIfOverrides = {
  monthlyIncome: 4000, workDaysPerWeek: 5, savingsRate: 37,
  expectedReturn: 7, extraContribution: 0,
}

const tests: TestCase[] = [
  {
    id: 'whatif-delta-fire-age', name: 'Significant delta: FIRE leeftijd >= 1 jaar', category: CAT,
    description: 'isSignificantDelta triggert bij FIRE-leeftijd verschuiving >= 1 jaar',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      assert(isSignificantDelta(BASE_OVERRIDES, BASE_OVERRIDES, 1.5), 'delta 1.5 is significant')
      assert(isSignificantDelta(BASE_OVERRIDES, BASE_OVERRIDES, -1.0), 'delta -1.0 is significant')
      assert(!isSignificantDelta(BASE_OVERRIDES, BASE_OVERRIDES, 0.5), 'delta 0.5 is not significant')
      assert(!isSignificantDelta(BASE_OVERRIDES, BASE_OVERRIDES, null), 'null delta is not significant (alone)')
    },
  },
  {
    id: 'whatif-delta-income', name: 'Significant delta: inkomen > 10%', category: CAT,
    description: 'isSignificantDelta triggert bij inkomenswijziging > 10%',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const changed = { ...BASE_OVERRIDES, monthlyIncome: 4500 } // +12.5%
      assert(isSignificantDelta(changed, BASE_OVERRIDES, 0), '12.5% income change is significant')

      const small = { ...BASE_OVERRIDES, monthlyIncome: 4300 } // +7.5%
      assert(!isSignificantDelta(small, BASE_OVERRIDES, 0), '7.5% income change is not significant')
    },
  },
  {
    id: 'whatif-delta-workdays', name: 'Significant delta: werkdagen >= 1', category: CAT,
    description: 'isSignificantDelta triggert bij werkdagen wijziging >= 1',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const changed = { ...BASE_OVERRIDES, workDaysPerWeek: 4 }
      assert(isSignificantDelta(changed, BASE_OVERRIDES, 0), '1 day change is significant')

      const small = { ...BASE_OVERRIDES, workDaysPerWeek: 4.5 }
      assert(!isSignificantDelta(small, BASE_OVERRIDES, 0), '0.5 day change is not significant')
    },
  },
  {
    id: 'whatif-override-isolation', name: 'Override verandert geen originele input', category: CAT,
    description: 'applyWhatIfOverrides muteert de originele FinancialInput niet',
    priority: 'critical', estimatedDurationMs: 10,
    fn() {
      const inputCopy = { ...BASE_INPUT }
      const changed = { ...BASE_OVERRIDES, monthlyIncome: 6000, savingsRate: 50 }
      const { adjustedInput } = applyWhatIfOverrides(inputCopy, changed, BASE_OVERRIDES)

      // Original must be unchanged
      assertEqual(inputCopy.monthlyIncome, 4000, 'original income unchanged')
      assertEqual(inputCopy.monthlyExpenses, 2500, 'original expenses unchanged')

      // Adjusted should be different
      assertEqual(adjustedInput.monthlyIncome, 6000, 'adjusted income = 6000')
      assertGreaterThan(adjustedInput.monthlyIncome, inputCopy.monthlyIncome, 'adjusted > original')
    },
  },
  {
    id: 'whatif-override-savings', name: 'Override jaarlijks sparen berekening', category: CAT,
    description: 'applyWhatIfOverrides berekent correcte annualSavings',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const { annualSavings } = applyWhatIfOverrides(BASE_INPUT, BASE_OVERRIDES, BASE_OVERRIDES)
      // Base: 1500 * 12 = 18000 + 0 delta = 18000
      assertEqual(annualSavings, 18000, 'baseline savings = 18000')

      const extra = { ...BASE_OVERRIDES, extraContribution: 500 }
      const { annualSavings: withExtra } = applyWhatIfOverrides(BASE_INPUT, extra, BASE_OVERRIDES)
      // 18000 + 500*12 = 24000
      assertEqual(withExtra, 24000, 'with extra 500/mnd = 24000')
    },
  },
  {
    id: 'whatif-baseline-builder', name: 'buildBaselineOverrides bouwt correct', category: CAT,
    description: 'buildBaselineOverrides levert correcte snapshot van huidige data',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const b = buildBaselineOverrides(BASE_INPUT, 0.07)
      assertEqual(b.monthlyIncome, 4000, 'income')
      assertEqual(b.workDaysPerWeek, 5, 'workdays')
      assertEqual(b.expectedReturn, 7, 'return as percentage')
      assertEqual(b.extraContribution, 0, 'no extra')
      assertGreaterThanOrEqual(b.savingsRate, 0, 'savings rate >= 0')
    },
  },
  {
    id: 'whatif-sim-overlay', name: 'Scenario overlay produceert valide simulatie', category: CAT,
    description: 'Re-compute van opgeslagen scenario geeft valide SimRow[] voor overlay',
    priority: 'critical', estimatedDurationMs: 50,
    fn() {
      const overrides: WhatIfOverrides = {
        monthlyIncome: 5000, workDaysPerWeek: 4, savingsRate: 40,
        expectedReturn: 6, extraContribution: 200,
      }
      const { adjustedInput, annualSavings } = applyWhatIfOverrides(BASE_INPUT, overrides, BASE_OVERRIDES)
      const portfolio = Math.max(0, adjustedInput.totalAssets - adjustedInput.totalDebts)

      const result = runSimulation(
        35, 90, portfolio, 30000, annualSavings,
        (overrides.expectedReturn / 100), 'nl_box3', 0.02, [],
      )

      assertNotNull(result, 'result exists')
      assertGreaterThan(result.rows.length, 0, 'has rows')
      assertType(result.rows[0].endPortfolio, 'number', 'endPortfolio is number')
      assertType(result.rows[0].flowIn, 'number', 'flowIn is number')
      assertType(result.rows[0].flowOut, 'number', 'flowOut is number')
    },
  },
  {
    id: 'whatif-delta-combined', name: 'Gecombineerde delta met extra inleg', category: CAT,
    description: 'Extra inleg >= 200 triggert significant delta ook zonder andere wijzigingen',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      const changed = { ...BASE_OVERRIDES, extraContribution: 250 }
      assert(isSignificantDelta(changed, BASE_OVERRIDES, 0), 'extra 250 is significant')

      const small = { ...BASE_OVERRIDES, extraContribution: 100 }
      assert(!isSignificantDelta(small, BASE_OVERRIDES, 0), 'extra 100 is not significant')
    },
  },
]

export function register() {
  registerCategory({
    id: CAT,
    label: 'What-If Scenarios',
    description: 'Tests voor scenario opslag, override-berekening, delta-detectie en overlay simulatie',
    icon: 'FlaskConical',
    testCount: 0,
  })
  registerTests(tests)
}
```

- [ ] **Step 2: Register the test suite**

Find the file where test suites are imported and registered (likely `lib/regression-tests/test-registry.ts` or a central index). Add the import:

```ts
import { register as registerWhatifScenarios } from './suites/whatif-scenarios'
```

And call `registerWhatifScenarios()` alongside the other registrations.

- [ ] **Step 3: Verify tests compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/regression-tests/suites/whatif-scenarios.ts lib/regression-tests/test-registry.ts
git commit -m "test(whatif): add regression test suite for scenario CRUD, isolation, and delta detection"
```

---

## Verification Checklist

After all tasks are complete:

1. **What-if page**: Navigate to `/horizon/whatif` → adjust sliders → chart + vermogensstromen + timeline update live. Baseline ghost-lijn visible. After significant change, AI suggestions appear.
2. **Scenario save**: Save a scenario with a name → appears in list with color indicator
3. **Horizon overlay**: Navigate to `/horizon` → picker shows saved scenarios → select one → ghost line appears on all 3 charts in the correct color
4. **Isolation**: Verify that the what-if page does NO write operations to Supabase (only reads)
5. **Mobile**: Test on 360px viewport — all elements reachable, no horizontal overflow, touch targets correct
6. **Guide**: Open `/identity/gids` → what-if section shows vermogensstromen and AI suggestions, no duplicate content
7. **Regression tests**: Run whatif-scenarios suite — all tests green
8. **Type check**: `npx tsc --noEmit` passes with no errors
