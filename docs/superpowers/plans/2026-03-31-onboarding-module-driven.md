# Onboarding Module-Driven Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the onboarding to dynamically show/hide steps based on the user's module selection, making module choice the central pivot point instead of a secondary concern.

**Architecture:** Replace the fixed 8-step flow with a dynamic step system driven by `computeStepOrder(selectedModules)`. The identity step is simplified (FIRE params move to a new horizon step), the persona step becomes a module selection page where modules are always togglable, and conditional steps (bezittingen, budgets, horizon, preferences, nieuws-only) appear/disappear based on module state. A new "news-only" path strips the app down to just the Trifinity Post.

**Tech Stack:** Next.js 16, React 19, Supabase, Tailwind CSS v4, Zod, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-31-onboarding-module-driven-design.md`

---

## Task 1: Update Module Registry — Relax Validation & Update getHomePath

**Files:**
- Modify: `lib/module-registry.ts:105-110,204-238,267-270`
- Test: `lib/regression-tests/suites/module-access.ts`

- [ ] **Step 1: Update PERSONA_MODULE_PRESETS**

In `lib/module-registry.ts`, update the presets to add `inzicht_acties` to vermogensverdeler and pensioenplanner:

```typescript
export const PERSONA_MODULE_PRESETS: Record<PersonaId, ModuleId[]> = {
  budgetteerder: ['budgetteren'],
  vermogensverdeler: ['vermogensregistratie', 'inzicht_acties'],
  pensioenplanner: ['vermogensregistratie', 'toekomstplannen', 'inzicht_acties'],
  fire_fighter: [...ALL_MODULES],
}
```

- [ ] **Step 2: Relax validateModules — allow news-only**

Replace the `validateModules` function (lines 204-238). Remove Rule 1 ("Kies minstens Budgetteren of Vermogensregistratie als basismodule") and replace with: if `modules.length === 0` then error "Kies minstens een module." Keep Rules 2-4 (dependency checks) unchanged.

- [ ] **Step 3: Update getHomePath**

Replace `getHomePath` (lines 267-270):

```typescript
export function getHomePath(activeModules: ModuleId[]): string {
  const isNewsOnly = activeModules.length === 1 && activeModules[0] === 'nieuws'
  if (isNewsOnly) return '/berichten'
  if (activeModules.includes('inzicht_acties')) return '/will'
  return '/core'
}
```

- [ ] **Step 4: Add getHomePath test for news-only**

In `lib/regression-tests/suites/module-access.ts`, add a test:

```typescript
{
  id: 'mod-home-nieuws-only',
  name: 'getHomePath: alleen nieuws → /berichten',
  category: CAT,
  priority: 'high',
  estimatedDurationMs: 50,
  fn() {
    assertEqual(getHomePath(['nieuws']), '/berichten', 'Nieuws-only → berichten')
  },
},
```

- [ ] **Step 5: Run module-access tests**

Run: `npx tsx lib/regression-tests/run.ts --suite module-access`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/module-registry.ts lib/regression-tests/suites/module-access.ts
git commit -m "feat(onboarding): relax module validation, update persona presets, add news-only home path"
```

---

## Task 2: Database Migration — Add news_description Column

**Files:**
- Create: `supabase/migrations/20260331000001_add_news_description.sql`

- [ ] **Step 1: Create migration file**

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS news_description TEXT;
COMMENT ON COLUMN profiles.news_description IS 'Free-text financial situation description for news-only users';
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260331000001_add_news_description.sql
git commit -m "feat(db): add profiles.news_description column for news-only onboarding"
```

---

## Task 3: Redesign Step Progress Component — Phase-Based Indicator

**Files:**
- Modify: `components/onboarding/step-progress.tsx`

- [ ] **Step 1: Rewrite step-progress.tsx**

Replace the entire file. New design: 4 fixed phases (Gegevens, Modules, Instellen, Klaar) with sub-step support for phase 3.

```typescript
const PHASES = [
  { key: 'gegevens', label: 'Gegevens' },
  { key: 'modules', label: 'Modules' },
  { key: 'instellen', label: 'Instellen' },
  { key: 'klaar', label: 'Klaar' },
] as const

export type PhaseKey = (typeof PHASES)[number]['key']

export interface StepProgressProps {
  currentPhase: PhaseKey
  subStep?: { current: number; total: number }
}

export function StepProgress({ currentPhase, subStep }: StepProgressProps) {
  const currentIdx = PHASES.findIndex((p) => p.key === currentPhase)
  const progressPct = Math.round((currentIdx / (PHASES.length - 1)) * 100)

  return (
    <div className="w-full">
      <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
        <div
          className="h-full rounded-full bg-[var(--ink)] transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        {PHASES.map((phase, i) => {
          const isDone = i < currentIdx
          const isActive = i === currentIdx
          return (
            <div key={phase.key} className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isDone
                    ? 'bg-[var(--ink)] text-white'
                    : isActive
                      ? 'border-2 border-[var(--ink)] text-[var(--ink)]'
                      : 'border border-[var(--border-ed)] text-[var(--ink-4)]'
                }`}
              >
                {isDone ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`hidden text-[10px] font-medium sm:block ${
                  isActive ? 'text-[var(--ink)]' : isDone ? 'text-[var(--ink-2)]' : 'text-[var(--ink-4)]'
                }`}
              >
                {phase.label}
              </span>
            </div>
          )
        })}
      </div>
      {currentPhase === 'instellen' && subStep && (
        <p className="mt-2 text-center text-[10px] font-medium text-[var(--ink-4)]">
          Stap {subStep.current} van {subStep.total}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/onboarding/step-progress.tsx
git commit -m "feat(onboarding): redesign step-progress to 4 fixed phases with sub-step support"
```

---

## Task 4: Simplify Identity Component — Strip FIRE Params

**Files:**
- Modify: `components/onboarding/onboarding-identity.tsx`

- [ ] **Step 1: Update IdentityData interface (lines 14-31)**

```typescript
export interface IdentityData {
  full_name: string
  date_of_birth: string
  household_type: HouseholdType
  number_of_children: number
  net_monthly_income: string
  estimated_monthly_expenses: string
}
```

Remove imports: `temporalLevels` from identity-constants, `RetirementExpenseMethod`, `FireEndStrategy`.

- [ ] **Step 2: Simplify FieldKey and FIELD_IDS (lines 33-44)**

```typescript
type FieldKey = 'full_name' | 'date_of_birth' | 'net_monthly_income' | 'number_of_children'

const FIELD_IDS: Record<FieldKey, string> = {
  full_name: 'ob-name',
  date_of_birth: 'ob-dob',
  net_monthly_income: 'ob-income',
  number_of_children: 'ob-children',
}
```

- [ ] **Step 3: Simplify getFieldErrors — remove FIRE field validation**

Keep only: full_name (min 2), date_of_birth (18-100), net_monthly_income (>0, <=1M), number_of_children (1-20 if gezin).

- [ ] **Step 4: Remove hideBudgets prop, update StepProgress**

Remove `hideBudgets` from props. Replace `<StepProgress current="profiel" ... />` with `<StepProgress currentPhase="gegevens" />`.

- [ ] **Step 5: Delete FIRE parameters section (lines ~429-660)**

Remove: retirement expense method cards, fire end strategy cards, legacy amount input, end age input, temporal balance slider.

- [ ] **Step 6: Delete budgettering_mode toggle (lines ~365-425)**

- [ ] **Step 7: Make estimated_monthly_expenses always visible**

Remove conditional wrapper. Show as optional field after income.

- [ ] **Step 8: Update section heading to "Jouw gegevens"**

- [ ] **Step 9: Commit**

```bash
git add components/onboarding/onboarding-identity.tsx
git commit -m "feat(onboarding): simplify identity step — strip FIRE params and budget mode"
```

---

## Task 5: Redesign Persona to Modules Page

**Files:**
- Modify: `components/onboarding/onboarding-persona.tsx`

- [ ] **Step 1: Remove 'custom' from types and PERSONAS array**

Update `OnboardingModulesProps` — remove `'custom'` from `selectedPersona` type. Remove the 5th persona entry. Update speech text map.

- [ ] **Step 2: Make modules always togglable**

Remove the `if (!isCustom)` gate (lines 221-239). All modules render as toggleable buttons regardless of persona selection.

- [ ] **Step 3: Add module descriptions as cards instead of pills**

Replace the pill layout with a card grid showing: toggle indicator, module name, description, dependency info.

- [ ] **Step 4: Add dynamic step count indicator**

Below the module section, show text like "Na deze stap volgen nog N instapstappen op basis van jouw keuze." Calculate N from selected modules.

- [ ] **Step 5: Update StepProgress to phase-based**

Replace `<StepProgress current="persona" />` with `<StepProgress currentPhase="modules" />`.

- [ ] **Step 6: Export as OnboardingModules (alias)**

Add: `export { OnboardingModules }` or rename the function. Keep file name as `onboarding-persona.tsx` for git history.

- [ ] **Step 7: Commit**

```bash
git add components/onboarding/onboarding-persona.tsx
git commit -m "feat(onboarding): redesign persona page — always-togglable modules, dynamic step indicator"
```

---

## Task 6: Update Extras (Bezittingen) — Module-Driven Enforcement

**Files:**
- Modify: `components/onboarding/onboarding-extras.tsx`

- [ ] **Step 1: Replace budgetteringMode/hideBudgets props with activeModules**

```typescript
export function OnboardingExtras({
  bankAccounts, assets, debts,
  onBankChange, onAssetChange, onDebtChange,
  onNext, onBack, saving = false,
  activeModules = [],
  subStep,
}: {
  // ...existing bank/asset/debt props...
  activeModules?: ModuleId[]
  subStep?: { current: number; total: number }
})
```

- [ ] **Step 2: Update handleNext — derive budget enforcement from modules**

Replace `budgetteringMode !== 'none'` check with `activeModules.includes('budgetteren')`.

- [ ] **Step 3: Add holdings tracking enforcement**

If `activeModules.includes('aandelenregistratie')`, check for at least 1 investment asset with `has_holdings_tracking = true`. Show modal to auto-create "Beleggingsrekening" if missing.

- [ ] **Step 4: Update StepProgress**

Replace with `<StepProgress currentPhase="instellen" subStep={subStep} />`.

- [ ] **Step 5: Commit**

```bash
git add components/onboarding/onboarding-extras.tsx
git commit -m "feat(onboarding): module-driven enforcement for budget-tracking and holdings-tracking"
```

---

## Task 7: Update Budgets — Phase-Based Progress

**Files:**
- Modify: `components/onboarding/onboarding-budgets.tsx`

- [ ] **Step 1: Update StepProgress to phase-based**

Replace `<StepProgress current="budgetten" ... />` with `<StepProgress currentPhase="instellen" subStep={subStep} />`. Accept `subStep` as optional prop.

- [ ] **Step 2: Verify existing skip works**

The "Nee, niet nu" option already allows skipping. Verify it produces empty budgetAmounts.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/onboarding-budgets.tsx
git commit -m "feat(onboarding): update budgets step progress to phase-based indicator"
```

---

## Task 8: Create Horizon Step Component (NEW)

**Files:**
- Create: `components/onboarding/onboarding-horizon.tsx`

- [ ] **Step 1: Create the component**

Full component with 4 sections:
- **A. Eindstrategie:** 3 cards (deplete/legacy/perpetual) with conditional end-age and legacy-amount inputs
- **B. Pensioenuitgaven:** 3 cards (essential_budgets/custom_amount/current_income), essential_budgets disabled if budgetteren not active
- **C. Levensgebeurtenissen:** Pre-filled AOW and pensioen events, editable, option to add more
- **D. Temporaal evenwicht:** Dropdown using `temporalLevels` from `lib/identity-constants.ts`, with description card

Export types: `HorizonData`, `LifeEventEntry`, `INITIAL_HORIZON_DATA`.

Uses horizon-colored accents (`border-horizon-500`, `bg-horizon-50/60`, etc.).

- [ ] **Step 2: Commit**

```bash
git add components/onboarding/onboarding-horizon.tsx
git commit -m "feat(onboarding): create horizon step — fire strategy, retirement method, life events, temporal balance"
```

---

## Task 9: Create Nieuws-Only Step Component (NEW)

**Files:**
- Create: `components/onboarding/onboarding-nieuws-only.tsx`

- [ ] **Step 1: Create the component**

Simple component with:
- Speech bubble explaining news personalization
- Textarea (max 500 chars) for free-text financial description
- Character counter
- Tips section with 4 bullet points
- "Verder" or "Overslaan" button depending on whether text is entered

- [ ] **Step 2: Commit**

```bash
git add components/onboarding/onboarding-nieuws-only.tsx
git commit -m "feat(onboarding): create nieuws-only step with free-text financial description"
```

---

## Task 10: Update Preferences — Conditional & Module-Filtered

**Files:**
- Modify: `components/onboarding/onboarding-preferences.tsx`

- [ ] **Step 1: Add activeModules prop, filter focus options**

Filter `FOCUS_OPTIONS` based on active modules:
- `budget_cashflow` → only if `budgetteren` active
- `assets_investments` → only if `vermogensregistratie` active
- `fire_freedom` → only if `toekomstplannen` active
- `goals_actions` and `overview` → always

- [ ] **Step 2: Update StepProgress to phase-based**

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/onboarding-preferences.tsx
git commit -m "feat(onboarding): filter focus options based on active modules"
```

---

## Task 11: Update Success Page — Dynamic Content

**Files:**
- Modify: `components/onboarding/onboarding-success.tsx`

- [ ] **Step 1: Add activeModules prop, dynamic card rendering**

- Filter MODULE_CARDS based on `getActiveNavModules(activeModules)`
- For news-only: show only a Trifinity Post card
- Dynamic CTA button text and color-bar based on active nav modules

- [ ] **Step 2: Commit**

```bash
git add components/onboarding/onboarding-success.tsx
git commit -m "feat(onboarding): dynamic success page based on active modules"
```

---

## Task 12: Rewrite Orchestrator — Dynamic Step Machine

**Files:**
- Modify: `app/(onboarding)/onboarding/page.tsx`

This is the largest task. Key changes:

- [ ] **Step 1: Update imports — add new components**

Add imports for `OnboardingModules`, `OnboardingHorizon`, `OnboardingNieuwsOnly`, `INITIAL_HORIZON_DATA`, `HorizonData`, `getHomePath`.

- [ ] **Step 2: Replace Step type with new union**

```typescript
type Step = 'intro' | 'identity' | 'modules' | 'bezittingen' | 'budgets' | 'horizon' | 'preferences' | 'nieuws_only' | 'saving' | 'success'
```

- [ ] **Step 3: Add computeStepOrder and getSubStep functions**

`computeStepOrder(selectedModules)` builds dynamic step array. `getSubStep(step, stepOrder)` computes sub-step info for the "instellen" phase.

- [ ] **Step 4: Update State interface**

Add `horizon: HorizonData`, `newsDescription: string`. Remove FIRE params from `identity`. Change `persona` type to `PersonaId | null` (no `'custom'`).

- [ ] **Step 5: Update initialState**

Simplified identity (6 fields), add `horizon: INITIAL_HORIZON_DATA`, `newsDescription: ''`.

- [ ] **Step 6: Update reducer**

- `SET_PERSONA`: always preloads from `PERSONA_MODULE_PRESETS`
- `TOGGLE_MODULE`: always works, clears `persona` to `null`
- Add `SET_HORIZON` and `SET_NEWS_DESCRIPTION` actions
- Remove `budgettering_mode` coupling from `SET_IDENTITY`

- [ ] **Step 7: Add generic goToNext/goToBack navigation**

```typescript
const activeStepOrder = useMemo(() => computeStepOrder(state.selectedModules), [state.selectedModules])
const goToNext = useCallback(() => { ... }, [activeStepOrder, state.step])
const goToBack = useCallback(() => { ... }, [activeStepOrder, state.step])
const currentSubStep = useMemo(() => getSubStep(state.step, activeStepOrder), [state.step, activeStepOrder])
```

- [ ] **Step 8: Update step rendering — wire all new components**

Add cases for `modules`, `bezittingen`, `horizon`, `nieuws_only`. Remove old `persona`, `extras` cases. Pass `activeModules`, `subStep` to relevant components.

- [ ] **Step 9: Update handleSaveOwnData — new payload shape**

Send `horizonData` (from `state.horizon`), `newsDescription`, derive `budgetteringMode` from modules.

- [ ] **Step 10: Update success redirect**

Use `getHomePath(state.selectedModules)` instead of hardcoded `/core`.

- [ ] **Step 11: Update localStorage save/load with migration**

Save new fields. Load function detects old format (presence of `identity.budgettering_mode`) and migrates: extracts FIRE params to `horizon`, strips identity to 6 fields.

- [ ] **Step 12: Commit**

```bash
git add app/(onboarding)/onboarding/page.tsx
git commit -m "feat(onboarding): rewrite orchestrator — dynamic step machine, generic navigation, new state shape"
```

---

## Task 13: Update Save Endpoint

**Files:**
- Modify: `app/api/onboarding/save-own-data/route.ts`

- [ ] **Step 1: Add horizonData and newsDescription to bodySchema**

Add `horizonData` (optional object with fire strategy, retirement method, temporal balance, life events) and `newsDescription` (optional string, max 500).

- [ ] **Step 2: Update buildRpcPayload — source FIRE params from horizonData**

The `profile` object in the RPC payload reads FIRE params from `horizonData` instead of `identity`. Add `news_description` to profile. Keep `identity.expected_return` and `identity.inflation_rate` as-is (they stay optional with defaults).

- [ ] **Step 3: Derive budgetteringMode from activeModules**

Replace `budgetteringMode` from request body with: `activeModules?.includes('budgetteren') ? 'manual' : 'none'`.

- [ ] **Step 4: Add life events insertion from horizonData**

After existing AOW event creation, insert any additional user-created life events from `horizonData.life_events`.

- [ ] **Step 5: Commit**

```bash
git add app/api/onboarding/save-own-data/route.ts
git commit -m "feat(onboarding): update save endpoint — horizonData, newsDescription, derived budgetteringMode"
```

---

## Task 14: Verify Navigation Stripping for News-Only Users

**Files:**
- Verify: `components/app/app-header.tsx`, `components/app/bottom-nav.tsx`

- [ ] **Step 1: Verify bottom-nav hides**

`getActiveNavModules(['nieuws'])` returns `[]`. Bottom nav hides when `visibleTabs.length <= 1`. No change needed.

- [ ] **Step 2: Verify app-header hides nav tabs**

Desktop header also hides tab bar when no nav modules. Verify profile dropdown still shows Identiteit link for settings access.

- [ ] **Step 3: Commit if changes needed**

---

## Task 15: Check Gids for Onboarding References

**Files:**
- Verify/Modify: `app/(app)/identity/gids/page.tsx`

- [ ] **Step 1: Search for step number references**

Search for "Stap 1", "Stap 2", "onboarding" in the gids. Update to be module-aware.

- [ ] **Step 2: Verify module-aware section rendering**

Check if sections are conditionally shown based on active modules. Add gating if missing.

- [ ] **Step 3: Commit if changes made**

---

## Task 16: Update Regression Tests

**Files:**
- Modify: `lib/regression-tests/suites/onboarding-flow.ts`
- Modify: `lib/regression-tests/suites/onboarding-identity.ts`
- Modify: `lib/regression-tests/suites/onboarding-extras.ts`
- Modify: `lib/regression-tests/suites/onboarding-preferences.ts`
- Modify: `lib/regression-tests/suites/onboarding-save.ts`
- Modify: `lib/regression-tests/suites/onboarding-persona-seed.ts`

- [ ] **Step 1: Update onboarding-flow.ts**

Replace `FULL_STEP_ORDER` and `getStepOrder` with `computeStepOrder`. Add test cases for each persona preset, news-only, and edge cases.

- [ ] **Step 2: Update onboarding-identity.ts**

Remove FIRE param and budgettering_mode tests. Keep basic field validation tests.

- [ ] **Step 3: Update onboarding-extras.ts**

Replace `budgetteringMode` with module-based enforcement. Add holdings tracking tests.

- [ ] **Step 4: Update remaining suites**

Update onboarding-preferences.ts, onboarding-save.ts, onboarding-persona-seed.ts for new data structures.

- [ ] **Step 5: Run all onboarding tests**

Run: `npx tsx lib/regression-tests/run.ts --suite onboarding`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add lib/regression-tests/suites/onboarding-*.ts
git commit -m "test(onboarding): update all regression tests for module-driven flow"
```

---

## Task 17: End-to-End Verification

- [ ] **Step 1: Test Fire Fighter flow** — all steps visible, redirect to `/will`
- [ ] **Step 2: Test Budgetteerder flow** — bezittingen + budgets only, budget tracking modal
- [ ] **Step 3: Test Nieuws-only flow** — textarea step, redirect to `/berichten`, no nav tabs
- [ ] **Step 4: Test back-navigation** — data preserved across all steps
- [ ] **Step 5: Test localStorage restore** — including migration from old format
- [ ] **Step 6: Test mobile (375px)** — sticky nav, touch targets, no overflow
