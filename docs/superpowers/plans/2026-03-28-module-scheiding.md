# Module-gebaseerde Feature Scheiding — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sovereignty-level feature gating with user-selectable modules aligned to landing page personas, keeping the underlying architecture intact.

**Architecture:** The module system is a presentation-layer concern only. A new `lib/module-registry.ts` defines the 6 modules and their dependencies. `lib/compute-module-access.ts` replaces the 3-layer sovereignty check with a 2-layer check (module active? → tier check). A `ModuleAccessProvider` replaces `FeatureAccessProvider` throughout the app. All existing data models, calculations, and utilities remain unchanged.

**Tech Stack:** Next.js 16, React 19, Supabase (Postgres), Tailwind CSS v4, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-28-module-scheiding-design.md`

**Blast radius:** 85+ files across app pages (20), API routes (17), components (25), lib/utils (20+)

---

## Phase 1: Core Module System (sequential)

### Task 1: Module Registry & Types

**Files:**
- Create: `lib/module-registry.ts`

This is the foundation. All other tasks depend on this.

- [ ] **Step 1: Create module type definitions**

```typescript
// lib/module-registry.ts

export type ModuleId =
  | 'budgetteren'
  | 'vermogensregistratie'
  | 'aandelenregistratie'
  | 'inzicht_acties'
  | 'toekomstplannen'
  | 'nieuws'

export type PersonaId = 'budgetteerder' | 'vermogensverdeler' | 'pensioenplanner' | 'fire_fighter'

export interface ModuleDef {
  id: ModuleId
  label: string
  description: string
  standalone: boolean
  requires: ModuleId[]            // empty = standalone, OR-logic for multiple
  requiresOneOf?: ModuleId[]      // at least one of these must be active
  navModule?: 'kern' | 'wil' | 'horizon'  // which nav tab this maps to
  icon?: string
}

export const MODULE_CATALOG: ModuleDef[] = [
  {
    id: 'budgetteren',
    label: 'Budgetteren',
    description: 'Transacties, budgetten, categorieën, uitgavenpatronen',
    standalone: true,
    requires: [],
    navModule: 'kern',
  },
  {
    id: 'vermogensregistratie',
    label: 'Vermogensregistratie',
    description: 'Assets, schulden, netto vermogen, Box 3 belasting',
    standalone: true,
    requires: [],
    navModule: 'kern',
  },
  {
    id: 'aandelenregistratie',
    label: 'Aandelenregistratie',
    description: 'Holdings-detail, koersen, transacties, alerts',
    standalone: false,
    requires: ['vermogensregistratie'],
    navModule: 'kern',
  },
  {
    id: 'inzicht_acties',
    label: 'Inzicht & acties',
    description: 'Dashboard, voorstellen, acties, doelen, trends',
    standalone: false,
    requires: [],
    requiresOneOf: ['budgetteren', 'vermogensregistratie'],
    navModule: 'wil',
  },
  {
    id: 'toekomstplannen',
    label: 'Toekomstplannen',
    description: 'FIRE-prognose, scenario\'s, simulaties, levensgebeurtenissen',
    standalone: false,
    requires: [],
    requiresOneOf: ['budgetteren', 'vermogensregistratie'],
    navModule: 'horizon',
  },
  {
    id: 'nieuws',
    label: 'Nieuws',
    description: 'Briefing/nieuwspagina, contextueel gefilterd',
    standalone: true,
    requires: [],
  },
]

export const PERSONA_MODULE_PRESETS: Record<PersonaId, ModuleId[]> = {
  budgetteerder: ['budgetteren'],
  vermogensverdeler: ['vermogensregistratie'],
  pensioenplanner: ['vermogensregistratie', 'toekomstplannen'],
  fire_fighter: ['budgetteren', 'vermogensregistratie', 'aandelenregistratie', 'inzicht_acties', 'toekomstplannen', 'nieuws'],
}

// Default for existing users who have all features (migration)
export const ALL_MODULES: ModuleId[] = ['budgetteren', 'vermogensregistratie', 'aandelenregistratie', 'inzicht_acties', 'toekomstplannen', 'nieuws']
```

- [ ] **Step 2: Add dependency validation functions**

```typescript
// lib/module-registry.ts (continued)

export function validateModules(modules: ModuleId[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const set = new Set(modules)

  // Rule: at least one base module
  if (!set.has('budgetteren') && !set.has('vermogensregistratie')) {
    errors.push('Minimaal één basismodule (budgetteren of vermogensregistratie) is vereist')
  }

  for (const mod of modules) {
    const def = MODULE_CATALOG.find(m => m.id === mod)
    if (!def) { errors.push(`Onbekende module: ${mod}`); continue }

    // Check hard dependencies
    for (const req of def.requires) {
      if (!set.has(req)) {
        errors.push(`${def.label} vereist ${MODULE_CATALOG.find(m => m.id === req)?.label}`)
      }
    }

    // Check one-of dependencies
    if (def.requiresOneOf && def.requiresOneOf.length > 0) {
      if (!def.requiresOneOf.some(r => set.has(r))) {
        const labels = def.requiresOneOf.map(r => MODULE_CATALOG.find(m => m.id === r)?.label).join(' of ')
        errors.push(`${def.label} vereist ${labels}`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

export function isModuleActive(activeModules: ModuleId[], moduleId: ModuleId): boolean {
  return activeModules.includes(moduleId)
}

export function getModuleDef(moduleId: ModuleId): ModuleDef | undefined {
  return MODULE_CATALOG.find(m => m.id === moduleId)
}

// Which nav tabs should be visible based on active modules
export function getActiveNavModules(activeModules: ModuleId[]): ('kern' | 'wil' | 'horizon')[] {
  const navModules = new Set<'kern' | 'wil' | 'horizon'>()
  for (const mod of activeModules) {
    const def = MODULE_CATALOG.find(m => m.id === mod)
    if (def?.navModule) navModules.add(def.navModule)
  }
  return ['kern', 'wil', 'horizon'].filter(n => navModules.has(n)) as ('kern' | 'wil' | 'horizon')[]
}

// Determine home page based on active modules
export function getHomePath(activeModules: ModuleId[]): string {
  if (activeModules.includes('inzicht_acties')) return '/dashboard'
  if (activeModules.includes('budgetteren')) return '/core/budgets'
  if (activeModules.includes('vermogensregistratie')) return '/core/assets'
  return '/core'
}
```

- [ ] **Step 3: Add widget-to-module mapping**

```typescript
// lib/module-registry.ts (continued)

// Maps each widget ID to the module that must be active for it to show.
// Widgets not in this map are always visible (foundation widgets like netto_vermogen, jouw_pad).
export const WIDGET_MODULE_MAP: Record<string, ModuleId> = {
  // Budgetteren
  budgetten: 'budgetteren',
  nibud_benchmark: 'budgetteren',
  spaarquote: 'budgetteren',
  noodfonds: 'budgetteren',
  cash_flow: 'budgetteren',
  maandoverzicht: 'budgetteren',
  vaste_lasten: 'budgetteren',

  // Vermogensregistratie
  assets: 'vermogensregistratie',
  belasting_box3: 'vermogensregistratie',
  box3_drag: 'vermogensregistratie',

  // Aandelenregistratie
  holdings: 'aandelenregistratie',

  // Inzicht & acties (Wil)
  doelen: 'inzicht_acties',
  voorstellen: 'inzicht_acties',
  volgende_stap: 'inzicht_acties',
  trend_inkomen: 'inzicht_acties',
  trend_uitgaven: 'inzicht_acties',
  trend_sparen: 'inzicht_acties',
  trend_schulden: 'inzicht_acties',
  beslissingspatronen: 'inzicht_acties',
  gezondheids_score: 'inzicht_acties',

  // Toekomstplannen (Horizon)
  fire_prognose: 'toekomstplannen',
  vrijheidsmijlpalen: 'toekomstplannen',
  vrijheidsscenarios: 'toekomstplannen',
  sim_vermogenspad: 'toekomstplannen',
  passief_inkomen: 'toekomstplannen',
  monte_carlo: 'toekomstplannen',
  backtesting_score: 'toekomstplannen',
  levensgebeurtenissen: 'toekomstplannen',

  // AI (tier-gated, not module-gated — but visible only with relevant module)
  ai_inzicht: 'inzicht_acties',
}
```

- [ ] **Step 4: Run existing tests to establish baseline**

Run: `npx vitest run --reporter=verbose 2>&1 | head -50`
Expected: Note current pass/fail counts before changes.

- [ ] **Step 5: Commit**

```bash
git add lib/module-registry.ts
git commit -m "feat: add module registry with types, validation, and widget mapping"
```

---

### Task 2: Compute Module Access

**Files:**
- Create: `lib/compute-module-access.ts`

Replaces the 3-layer sovereignty check with a simpler 2-layer check.

- [ ] **Step 1: Create compute module access function**

```typescript
// lib/compute-module-access.ts
import type { ModuleId } from './module-registry'
import { isModuleActive, WIDGET_MODULE_MAP } from './module-registry'
import type { CommercialTier, ActiveSubscriptions } from './feature-registry'
import { hasSubscription, UNIFIED_FEATURES, WIDGET_TO_FEATURE } from './feature-registry'

export interface ModuleAccessData {
  activeModules: ModuleId[]
  subscriptions: ActiveSubscriptions
  // Kept for backward compat during migration — derived values
  netWorth: number
  monthlyExpenses: number
  freedomPct: number
}

export interface WidgetAccessResult {
  visible: boolean
  reason: 'visible' | 'module_inactive' | 'tier_locked'
}

/**
 * Check if a widget should be visible based on active modules + subscription tier.
 * Two-layer check:
 * 1. Is the widget's required module active?
 * 2. Does the user have the required subscription tier?
 */
export function isWidgetVisible(
  widgetId: string,
  activeModules: ModuleId[],
  subscriptions: ActiveSubscriptions,
): WidgetAccessResult {
  // Layer 1: Module check
  const requiredModule = WIDGET_MODULE_MAP[widgetId]
  if (requiredModule && !isModuleActive(activeModules, requiredModule)) {
    return { visible: false, reason: 'module_inactive' }
  }

  // Layer 2: Tier check (for AI/Connected widgets)
  const featureId = WIDGET_TO_FEATURE[widgetId]
  if (featureId) {
    const feature = UNIFIED_FEATURES.find(f => f.id === featureId)
    if (feature && !hasSubscription(subscriptions, feature.requiredTier)) {
      return { visible: false, reason: 'tier_locked' }
    }
  }

  return { visible: true, reason: 'visible' }
}

/**
 * Check if a page/route should be accessible based on active modules.
 */
export function isRouteAccessible(pathname: string, activeModules: ModuleId[]): boolean {
  // Budget pages require budgetteren
  if (pathname.startsWith('/core/budgets')) return isModuleActive(activeModules, 'budgetteren')

  // Holdings pages require aandelenregistratie
  if (pathname.startsWith('/core/assets/holdings')) return isModuleActive(activeModules, 'aandelenregistratie')

  // Asset pages require vermogensregistratie
  if (pathname.startsWith('/core/assets')) return isModuleActive(activeModules, 'vermogensregistratie')
  if (pathname.startsWith('/core/debts')) return isModuleActive(activeModules, 'vermogensregistratie')
  if (pathname.startsWith('/core/belasting')) return isModuleActive(activeModules, 'vermogensregistratie')

  // Wil pages require inzicht_acties
  if (pathname.startsWith('/will')) return isModuleActive(activeModules, 'inzicht_acties')
  if (pathname === '/dashboard') return isModuleActive(activeModules, 'inzicht_acties')

  // Horizon pages require toekomstplannen
  if (pathname.startsWith('/horizon')) return isModuleActive(activeModules, 'toekomstplannen')

  // Rapportages: most require inzicht_acties, budget rapport requires budgetteren
  if (pathname.startsWith('/rapportages/budget')) return isModuleActive(activeModules, 'budgetteren')
  if (pathname.startsWith('/rapportages')) return isModuleActive(activeModules, 'inzicht_acties')

  // News requires nieuws
  if (pathname.startsWith('/nieuws') || pathname.startsWith('/briefing')) {
    return isModuleActive(activeModules, 'nieuws')
  }

  // Check-in, core overview, identity — always accessible
  return true
}

/**
 * Compute module access data from profile.
 * This is called server-side in layout.tsx.
 */
export function computeModuleAccess(input: {
  activeModules: ModuleId[]
  activeSubscriptions: ActiveSubscriptions
  assets: { current_value: number | string }[]
  debts: { current_balance: number | string; debt_type: string }[]
  transactions: { amount: number | string; is_income: boolean }[]
}): ModuleAccessData {
  const totalAssets = input.assets.reduce((s, a) => s + Number(a.current_value || 0), 0)
  const totalDebts = input.debts.reduce((s, d) => s + Number(d.current_balance || 0), 0)
  const netWorth = totalAssets - totalDebts

  const expenses = input.transactions.filter(t => !t.is_income)
  const totalExpenses = expenses.reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0)
  const monthlyExpenses = expenses.length > 0 ? totalExpenses / 3 : 0

  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / 0.04 : 0
  const freedomPct = fireTarget > 0 ? (netWorth / fireTarget) * 100 : 0

  return {
    activeModules: input.activeModules,
    subscriptions: input.activeSubscriptions,
    netWorth,
    monthlyExpenses,
    freedomPct,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/compute-module-access.ts
git commit -m "feat: add compute-module-access with widget visibility and route access checks"
```

---

### Task 3: Database Migration

**Files:**
- Create: `supabase/migrations/2026MMDD000001_add_active_modules.sql`

- [ ] **Step 1: Create migration**

```sql
-- Add active_modules column to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_modules text[]
  DEFAULT ARRAY['budgetteren','vermogensregistratie','aandelenregistratie','inzicht_acties','toekomstplannen','nieuws']::text[];

-- Migrate existing users: all current users get all modules (preserve current behavior)
UPDATE profiles
SET active_modules = ARRAY['budgetteren','vermogensregistratie','aandelenregistratie','inzicht_acties','toekomstplannen','nieuws']::text[]
WHERE active_modules IS NULL;

-- Users who had budgeting_active = false: remove budgetteren from their modules
UPDATE profiles
SET active_modules = array_remove(active_modules, 'budgetteren')
WHERE budgeting_active = false;

COMMENT ON COLUMN profiles.active_modules IS 'User-selected active modules. Replaces sovereignty-based feature gating.';
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` or apply via Supabase MCP tool.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add active_modules column to profiles with migration from existing data"
```

---

### Task 4: Module API Endpoint

**Files:**
- Create: `app/api/modules/route.ts`

- [ ] **Step 1: Create modules API route**

```typescript
// app/api/modules/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateModules, type ModuleId } from '@/lib/module-registry'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_modules')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ activeModules: profile?.active_modules ?? [] })
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { modules } = await req.json() as { modules: ModuleId[] }
  const validation = validateModules(modules)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors.join(', ') }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ active_modules: modules, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activeModules: modules })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/modules/route.ts
git commit -m "feat: add /api/modules GET/PUT endpoint with dependency validation"
```

---

### Task 5: ModuleAccessProvider

**Files:**
- Modify: `components/app/feature-access-provider.tsx`

Strategy: Modify existing provider to use module data instead of sovereignty data, keeping the same export name (`useFeatureAccess`) as a transitional alias to minimize blast radius. The provider reads `active_modules` from profile instead of computing sovereignty.

- [ ] **Step 1: Read current feature-access-provider.tsx**

Read the full file to understand the current context value shape.

- [ ] **Step 2: Add module access to context**

Add `activeModules: ModuleId[]` to the context value. Keep existing fields (`features`, `phase`, `level`) but make them derived from modules for backward compatibility during migration.

The key change: instead of checking `isFeatureAccessible(features, featureId)`, consumers will check `isModuleActive(activeModules, moduleId)` or `isWidgetVisible(widgetId, activeModules, subscriptions)`.

- [ ] **Step 3: Update provider to accept `activeModules` prop**

Add `activeModules: ModuleId[]` to the provider props. Pass through to context.

- [ ] **Step 4: Export `useModuleAccess()` hook as alias**

```typescript
export function useModuleAccess() {
  const ctx = useFeatureAccess()
  return {
    activeModules: ctx.activeModules,
    subscriptions: ctx.subscriptions,
    isModuleActive: (id: ModuleId) => ctx.activeModules.includes(id),
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add components/app/feature-access-provider.tsx
git commit -m "feat: extend FeatureAccessProvider with activeModules support"
```

---

### Task 6: App Layout Integration

**Files:**
- Modify: `app/(app)/layout.tsx`

- [ ] **Step 1: Read current layout.tsx**

- [ ] **Step 2: Replace sovereignty computation with module access**

Key changes:
- Fetch `active_modules` from profile instead of computing sovereignty level
- Remove `PHASES` import and phase transition detection (lines 84-100)
- Remove sovereignty level tracking (lines 102-121)
- Pass `activeModules` to provider instead of `phaseTransition`
- Remove `PhaseTransitionModal` rendering

- [ ] **Step 3: Update FeatureAccessProvider props**

```typescript
// Old:
<FeatureAccessProvider data={featureAccess} phaseTransition={phaseTransition} needsActivation={needsActivation}>

// New:
<FeatureAccessProvider data={moduleAccess} activeModules={profile.active_modules ?? ALL_MODULES}>
```

- [ ] **Step 4: Commit**

```bash
git add app/(app)/layout.tsx
git commit -m "feat: replace sovereignty computation with module access in app layout"
```

---

## Phase 2: Presentation Layer (parallel agents)

After Phase 1 is complete, these tasks can be executed in parallel by separate agents.

### Task 7: Widget Catalog & Renderer

**Files:**
- Modify: `lib/widget-catalog.ts`
- Modify: `components/widgets/widget-renderer.tsx`

- [ ] **Step 1: Read `lib/widget-catalog.ts`**

- [ ] **Step 2: Replace `minLevel` with `requiredModule` in WidgetDef type**

```typescript
interface WidgetDef {
  id: string
  name: string
  description: string
  module: WidgetModule
  sizes: WidgetSize[]
  defaultSize: WidgetSize
  requiredModule?: ModuleId    // NEW: replaces minLevel
  // Remove: minLevel: number
  // Remove: requiredPhase?: string
}
```

- [ ] **Step 3: Update all widget entries**

Replace `minLevel` and `requiredPhase` with `requiredModule` from `WIDGET_MODULE_MAP` in `lib/module-registry.ts`. Widgets without a required module are always visible.

- [ ] **Step 4: Remove `deriveMinLevel()` and `deriveRequiredPhase()` functions**

These are no longer needed — module mapping is explicit.

- [ ] **Step 5: Read `components/widgets/widget-renderer.tsx`**

- [ ] **Step 6: Replace feature-based gating with module-based gating**

```typescript
// Old:
const featureId = WIDGET_FEATURE_MAP[id]
if (featureId && !isFeatureAccessible(features, featureId)) return null

// New:
import { isWidgetVisible } from '@/lib/compute-module-access'
import { useModuleAccess } from '@/components/app/feature-access-provider'

const { activeModules, subscriptions } = useModuleAccess()
const access = isWidgetVisible(id, activeModules, subscriptions)
if (!access.visible) return null
```

- [ ] **Step 7: Remove BUDGET_WIDGETS check**

The `budgetingActive` check becomes `isModuleActive(activeModules, 'budgetteren')`.

- [ ] **Step 8: Commit**

```bash
git add lib/widget-catalog.ts components/widgets/widget-renderer.tsx
git commit -m "feat: replace sovereignty-based widget gating with module-based gating"
```

---

### Task 8: Navigation — Desktop & Mobile

**Files:**
- Modify: `components/app/app-header.tsx`
- Modify: `components/app/bottom-nav.tsx`
- Modify: `components/app/module-nav.tsx` (if exists)

**Requirement:** Must work well on both mobile (bottom-nav, < 768px) and desktop (app-header tabs, ≥ 768px). Use existing responsive patterns: `md:hidden` for mobile-only, `hidden md:flex` for desktop-only. Respect `safe-bottom` padding and `--bottom-nav-height` CSS variable.

- [ ] **Step 1: Read `components/app/app-header.tsx`**

- [ ] **Step 2: Replace static nav items with module-driven nav**

```typescript
// Old:
const staticNavItems = [
  { label: 'De Kern', href: '/core', color: 'amber', requiresActivation: false },
  { label: 'De Wil', href: '/will', color: 'teal', requiresActivation: true },
  { label: 'De Horizon', href: '/horizon', color: 'purple', requiresActivation: true },
]

// New:
import { getActiveNavModules } from '@/lib/module-registry'
import { useModuleAccess } from '@/components/app/feature-access-provider'

const { activeModules } = useModuleAccess()
const activeNavModules = getActiveNavModules(activeModules)

const navConfig = {
  kern:    { label: 'De Kern',    href: '/core',    color: 'amber' },
  wil:     { label: 'De Wil',     href: '/will',    color: 'teal' },
  horizon: { label: 'De Horizon', href: '/horizon', color: 'purple' },
}

const navItems = activeNavModules.map(m => navConfig[m])
```

- [ ] **Step 3: Read `components/app/bottom-nav.tsx`**

- [ ] **Step 4: Apply same module-driven nav to bottom-nav**

Same pattern: filter tabs based on `getActiveNavModules(activeModules)`. Keep existing responsive styling, `safe-bottom`, icons (Wallet/Zap/Compass), `--chat-sidebar-width` adjustment.

- [ ] **Step 5: Handle single-module case**

When only 1 nav module is active (e.g., just Kern), hide the tab bar entirely since there's nothing to switch between. The user lands directly on their home page.

```typescript
if (navItems.length <= 1) return null // No tab bar needed
```

- [ ] **Step 6: Read and update `components/app/module-nav.tsx`**

Update sub-navigation within modules to respect active modules. E.g., within Kern, only show "Budgetten" if budgetteren is active, only show "Assets" if vermogensregistratie is active.

- [ ] **Step 7: Check-in banner placement**

The check-in banner should appear in Kern when Wil (inzicht_acties) is off, and in Wil when it's on. Find the check-in banner component and add module-aware placement logic:

```typescript
const { activeModules } = useModuleAccess()
const showInKern = !activeModules.includes('inzicht_acties')
// Render in current module section based on showInKern
```

- [ ] **Step 8: Commit**

```bash
git add components/app/app-header.tsx components/app/bottom-nav.tsx components/app/module-nav.tsx
git commit -m "feat: dynamic navigation based on active modules (desktop + mobile)"
```

---

### Task 9: Settings Page — Module Toggles

**Files:**
- Modify: `app/(app)/identity/instellingen/page.tsx`
- Create: `lib/hooks/use-module-toggle.ts`

- [ ] **Step 1: Create `use-module-toggle` hook**

```typescript
// lib/hooks/use-module-toggle.ts
import { useState, useCallback } from 'react'
import type { ModuleId } from '@/lib/module-registry'
import { validateModules } from '@/lib/module-registry'

export function useModuleToggle(initialModules: ModuleId[]) {
  const [modules, setModules] = useState<ModuleId[]>(initialModules)
  const [saving, setSaving] = useState(false)

  const toggle = useCallback(async (moduleId: ModuleId, enabled: boolean) => {
    const updated = enabled
      ? [...modules, moduleId]
      : modules.filter(m => m !== moduleId)

    const validation = validateModules(updated)
    if (!validation.valid) return { success: false, errors: validation.errors }

    setSaving(true)
    setModules(updated) // Optimistic

    try {
      const res = await fetch('/api/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: updated }),
      })
      if (!res.ok) {
        setModules(modules) // Revert
        return { success: false, errors: ['Opslaan mislukt'] }
      }
      // Reload to recompute layout, nav, dashboard
      window.location.reload()
      return { success: true, errors: [] }
    } catch {
      setModules(modules) // Revert
      return { success: false, errors: ['Netwerkfout'] }
    } finally {
      setSaving(false)
    }
  }, [modules])

  return { modules, toggle, saving }
}
```

- [ ] **Step 2: Read `app/(app)/identity/instellingen/page.tsx`**

- [ ] **Step 3: Replace feature toggles section with module toggles**

Replace the section that shows UNIFIED_FEATURES with MODULE_CATALOG. Show each module as a card with toggle, description, and dependency info. Disable toggles that would violate dependencies (with tooltip explaining why).

Use the existing card pattern from the settings page. Respect mobile layout: `grid-cols-1 sm:grid-cols-2` for module cards.

- [ ] **Step 4: Add dependency validation feedback**

When a user tries to disable a required module (e.g., vermogensregistratie while aandelenregistratie is active), show an inline warning: "Schakel eerst Aandelenregistratie uit".

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/use-module-toggle.ts app/(app)/identity/instellingen/page.tsx
git commit -m "feat: replace feature toggles with module toggles in settings"
```

---

### Task 10: Gids Update

**Files:**
- Modify: `app/(app)/identity/gids/page.tsx` (2,125 lines)
- Modify: `app/api/guide-progress/route.ts`

**Attention:** Check for duplicate content — do not introduce text that already exists elsewhere in the gids. The gids already has sections about each module; sovereignty references need to be rewritten to reference modules.

- [ ] **Step 1: Read `app/(app)/identity/gids/page.tsx` lines 1540-2110** (Overal section with sovereignty refs)

- [ ] **Step 2: Replace sovereignty references with module language**

Key replacements (all in gids/page.tsx):

| Line(s) | Old text | New text |
|---------|----------|----------|
| ~1577 | "sovereignty-groeipad: van Recovery via Stability en Momentum naar Mastery" | "Je kunt je app uitbreiden met modules: van budgetteren naar vermogensregistratie, inzichten en toekomstplannen" |
| ~1703 | "soevereiniteitsniveau gestegen" | "nieuwe module ingeschakeld" |
| ~1803-1805 | "widgets ontgrendelen progressief naarmate je soevereiniteitsniveau stijgt" | "widgets worden zichtbaar op basis van je actieve modules. Schakel een module in via Instellingen om nieuwe widgets te ontgrendelen" |
| ~1812 | "hoger soevereiniteitsniveau" | "het inschakelen van extra modules" |
| ~1890-1902 | Entire sovereignty description | "Je actieve modules bepalen welke functies en widgets je ziet. Ga naar Instellingen om modules in of uit te schakelen. Je kunt starten met alleen budgetteren of vermogensregistratie en later uitbreiden." |
| ~1923 | "soevereiniteitsniveau groeit automatisch" | "Modules kun je zelf in- en uitschakelen" |
| ~1954 | "soevereiniteitsniveau stijgt" | "je modules uitbreidt" |
| ~1970 | "per soevereiniteitsfase" | "per module" |

- [ ] **Step 3: Update guide-progress API**

Read and modify `app/api/guide-progress/route.ts`:
- Remove `computeSovereigntyLevel` import and call (lines 135-148)
- Remove `sovereigntyLevel` from response (line 223)
- Add `activeModules` to response from profile data

- [ ] **Step 4: Update GuideProgress type in gids/page.tsx**

Replace `sovereigntyLevel: number` (line 69) with `activeModules: string[]`.

- [ ] **Step 5: Check for duplicate content**

Search the entire gids page for any text that now duplicates the module explanation. Each concept should appear once. Remove redundant explanations.

- [ ] **Step 6: Commit**

```bash
git add app/(app)/identity/gids/page.tsx app/api/guide-progress/route.ts
git commit -m "feat: replace sovereignty language with module language in gids"
```

---

### Task 11: Seed Personas Update

**Files:**
- Modify: `lib/test-personas.ts`
- Modify: `lib/seed-persona.ts`

- [ ] **Step 1: Read PersonaMeta and PersonaProfile types in `lib/test-personas.ts`**

- [ ] **Step 2: Add `active_modules` to PersonaProfile type**

```typescript
// In PersonaProfile interface:
active_modules: ModuleId[]
```

- [ ] **Step 3: Replace `sovereignty` field in PersonaMeta with module info**

```typescript
// Old:
sovereignty: SovereigntyPhase  // 'recovery' | 'stability' | 'momentum' | 'mastery'

// New — keep for backward compat but add modules:
sovereignty: SovereigntyPhase  // Keep for reference/display
modules: ModuleId[]            // Active modules for this persona
```

- [ ] **Step 4: Set appropriate modules per persona**

| Persona | Phase | Active Modules |
|---------|-------|---------------|
| roos (recovery) | recovery | `['budgetteren']` |
| daan (stability) | stability | `['budgetteren', 'vermogensregistratie']` |
| jochen (recovery) | recovery | `['budgetteren']` |
| lisa (momentum) | momentum | `['budgetteren', 'vermogensregistratie', 'inzicht_acties', 'toekomstplannen']` |
| rashid (momentum) | momentum | `['vermogensregistratie', 'aandelenregistratie', 'nieuws']` (no budgeting — check-in model) |
| leo (momentum) | momentum | `['budgetteren', 'vermogensregistratie', 'aandelenregistratie', 'inzicht_acties']` |
| willem (mastery) | mastery | ALL_MODULES |
| marijke (mastery) | mastery | ALL_MODULES |
| ronald (mastery) | mastery | ALL_MODULES |
| bas (mastery) | mastery | ALL_MODULES |

- [ ] **Step 5: Update PersonaProfile for each persona**

Add `active_modules` field to each persona's profile section.

- [ ] **Step 6: Read and update `lib/seed-persona.ts`**

Ensure `seedPersonaData()` includes `active_modules` in the profile update.

- [ ] **Step 7: Commit**

```bash
git add lib/test-personas.ts lib/seed-persona.ts
git commit -m "feat: add active_modules to test personas with persona-appropriate module sets"
```

---

### Task 12: Regression Tests

**Files:**
- Modify: `lib/regression-tests/suites/sovereignty-levels.ts`
- Modify: `lib/regression-tests/suites/feature-gating.ts`
- Create: `lib/regression-tests/suites/module-access.ts`

- [ ] **Step 1: Create new module-access test suite**

```typescript
// lib/regression-tests/suites/module-access.ts
import { registerCategory, registerTests } from '../test-registry'
import { validateModules, getActiveNavModules, getHomePath, isModuleActive, ALL_MODULES } from '@/lib/module-registry'
import { isWidgetVisible } from '@/lib/compute-module-access'
import { assert, assertEqual } from '../assert'

registerCategory({
  id: 'modules',
  label: 'Module Access',
  description: 'Module-gebaseerde feature scheiding',
})

registerTests([
  {
    id: 'mod-validate-empty',
    name: 'Validation rejects empty modules',
    description: 'At least one base module required',
    category: 'modules',
    priority: 'critical',
    fn: async () => {
      const result = validateModules([])
      assert(!result.valid, 'empty modules should be invalid')
    },
  },
  {
    id: 'mod-validate-dependency',
    name: 'Validation enforces dependencies',
    description: 'aandelenregistratie requires vermogensregistratie',
    category: 'modules',
    priority: 'critical',
    fn: async () => {
      const result = validateModules(['budgetteren', 'aandelenregistratie'])
      assert(!result.valid, 'aandelen without vermogen should be invalid')
    },
  },
  {
    id: 'mod-validate-requires-one-of',
    name: 'Validation enforces requiresOneOf',
    description: 'inzicht_acties requires budgetteren OR vermogensregistratie',
    category: 'modules',
    priority: 'critical',
    fn: async () => {
      const invalid = validateModules(['inzicht_acties'])
      assert(!invalid.valid, 'inzicht without base should be invalid')
      const valid = validateModules(['budgetteren', 'inzicht_acties'])
      assert(valid.valid, 'inzicht with budgetteren should be valid')
    },
  },
  {
    id: 'mod-nav-modules',
    name: 'Nav modules derived correctly',
    description: 'Only relevant nav tabs shown',
    category: 'modules',
    priority: 'high',
    fn: async () => {
      const onlyBudget = getActiveNavModules(['budgetteren'])
      assertEqual(onlyBudget.length, 1, 'only kern tab')
      assertEqual(onlyBudget[0], 'kern', 'kern tab')

      const all = getActiveNavModules(ALL_MODULES)
      assertEqual(all.length, 3, 'all three tabs')
    },
  },
  {
    id: 'mod-home-path',
    name: 'Home path based on modules',
    description: 'Dashboard if inzicht_acties, otherwise first base module',
    category: 'modules',
    priority: 'high',
    fn: async () => {
      assertEqual(getHomePath(['budgetteren']), '/core/budgets', 'budget home')
      assertEqual(getHomePath(['vermogensregistratie']), '/core/assets', 'assets home')
      assertEqual(getHomePath(['budgetteren', 'inzicht_acties']), '/dashboard', 'dashboard home')
    },
  },
  {
    id: 'mod-widget-visibility-module',
    name: 'Widget hidden when module inactive',
    description: 'Budget widgets hidden without budgetteren module',
    category: 'modules',
    priority: 'critical',
    fn: async () => {
      const result = isWidgetVisible('budgetten', ['vermogensregistratie'], [])
      assert(!result.visible, 'budgetten should be hidden')
      assertEqual(result.reason, 'module_inactive', 'reason should be module_inactive')
    },
  },
  {
    id: 'mod-widget-visibility-tier',
    name: 'Widget hidden when tier locked',
    description: 'AI widgets hidden without AI subscription',
    category: 'modules',
    priority: 'high',
    fn: async () => {
      const result = isWidgetVisible('ai_inzicht', ALL_MODULES, [])
      assert(!result.visible, 'ai widget should be hidden without sub')
      assertEqual(result.reason, 'tier_locked', 'reason should be tier_locked')
    },
  },
  {
    id: 'mod-widget-visibility-ok',
    name: 'Widget visible when module active and tier ok',
    description: 'Budget widget visible with budgetteren active',
    category: 'modules',
    priority: 'high',
    fn: async () => {
      const result = isWidgetVisible('budgetten', ['budgetteren'], [])
      assert(result.visible, 'budgetten should be visible')
    },
  },
  {
    id: 'mod-persona-presets',
    name: 'Persona presets are valid',
    description: 'All persona module presets pass validation',
    category: 'modules',
    priority: 'high',
    fn: async () => {
      const { PERSONA_MODULE_PRESETS } = await import('@/lib/module-registry')
      for (const [persona, modules] of Object.entries(PERSONA_MODULE_PRESETS)) {
        const result = validateModules(modules)
        assert(result.valid, `${persona} preset should be valid: ${result.errors.join(', ')}`)
      }
    },
  },
])
```

- [ ] **Step 2: Register new suite in test-registry.ts**

Add import of `./suites/module-access` to the `loadAllTests()` function.

- [ ] **Step 3: Update sovereignty-levels.ts**

Keep tests that validate financial calculations (net worth, freedom %, etc.) since those remain in the fundament. Remove or adapt tests that check sovereignty levels and phases — these concepts no longer exist.

Mark sovereignty-level-specific tests as `priority: 'low'` or remove them if they test removed functionality.

- [ ] **Step 4: Update feature-gating.ts**

Replace phase-based feature access tests with module-based tests. The 49 tests need to be reviewed:
- Keep: tier/subscription tests (Groups 6, 8)
- Adapt: feature registry tests (Group 2) — update to module registry
- Remove: phase-based access tests (Groups 1, 4, 5)
- Remove: widget min-level tests (Group 3)
- Remove: backward compatibility tests (Group 7) if no longer needed

- [ ] **Step 5: Commit**

```bash
git add lib/regression-tests/suites/module-access.ts lib/regression-tests/suites/sovereignty-levels.ts lib/regression-tests/suites/feature-gating.ts lib/regression-tests/test-registry.ts
git commit -m "feat: add module-access regression tests, update sovereignty and feature-gating tests"
```

---

### Task 13: Onboarding — Persona Selection Step

**Files:**
- Create: `components/onboarding/onboarding-persona.tsx`
- Modify: `app/(onboarding)/onboarding/page.tsx`
- Modify: `app/api/onboarding/save-own-data/route.ts`

- [ ] **Step 1: Create persona selection component**

```typescript
// components/onboarding/onboarding-persona.tsx
'use client'

import { type PersonaId, PERSONA_MODULE_PRESETS, MODULE_CATALOG, type ModuleId } from '@/lib/module-registry'

interface Props {
  selectedPersona: PersonaId | 'custom' | null
  selectedModules: ModuleId[]
  onSelectPersona: (persona: PersonaId | 'custom') => void
  onToggleModule: (moduleId: ModuleId, enabled: boolean) => void
}

const PERSONA_CARDS: { id: PersonaId | 'custom'; label: string; description: string; icon: string }[] = [
  { id: 'budgetteerder', label: 'De Budgetteerder', description: 'Grip op je uitgaven', icon: '💰' },
  { id: 'vermogensverdeler', label: 'De Vermogensverdeler', description: 'Overzicht over alles', icon: '📊' },
  { id: 'pensioenplanner', label: 'De Pensioenplanner', description: 'Zekerheid over later', icon: '🏖️' },
  { id: 'fire_fighter', label: 'De FIRE Fighter', description: 'De snelste route naar vrijheid', icon: '🔥' },
  { id: 'custom', label: 'Eigen selectie', description: 'Kies zelf je modules', icon: '⚙️' },
]
```

Build a card grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) with persona cards. When a persona is selected, show the preselected modules with toggles for customization. Respect mobile-first design.

- [ ] **Step 2: Add 'persona' step to onboarding flow**

In `app/(onboarding)/onboarding/page.tsx`:
- Add `'persona'` to `FULL_STEP_ORDER` after `'identity'`
- Add persona + modules to reducer state
- Render `OnboardingPersona` component for this step

- [ ] **Step 3: Update save endpoint to persist modules**

In `app/api/onboarding/save-own-data/route.ts`:
- Accept `activeModules: ModuleId[]` in request body
- Save to `profiles.active_modules`
- Replace `budgeting_active` logic: derive from `activeModules.includes('budgetteren')`

- [ ] **Step 4: Update step-progress.tsx**

Add persona step to the visual progress indicator (6 dots instead of 5).

- [ ] **Step 5: Commit**

```bash
git add components/onboarding/onboarding-persona.tsx app/(onboarding)/onboarding/page.tsx app/api/onboarding/save-own-data/route.ts components/onboarding/step-progress.tsx
git commit -m "feat: add persona selection step to onboarding with module preselection"
```

---

### Task 14: Health Score Adaptation

**Files:**
- Modify: `lib/financial-health.ts`

- [ ] **Step 1: Read `lib/financial-health.ts`**

- [ ] **Step 2: Add module-aware pillar filtering**

The health score has 6 pillars. Filter and reweight based on active modules:

```typescript
// Add to financial-health.ts
import type { ModuleId } from './module-registry'

const PILLAR_MODULE_REQUIREMENTS: Record<string, ModuleId | null> = {
  savings_rate: 'budgetteren',       // Needs transaction data
  debt_ratio: 'vermogensregistratie', // Needs debt data
  emergency_fund: null,              // Always available (from foundation)
  fire_progress: 'toekomstplannen',  // Needs FIRE data
  diversification: 'vermogensregistratie', // Needs asset data
  budget_discipline: 'budgetteren',   // Needs budget data
}

export function computeAdaptiveHealthScore(
  data: HealthScoreInput,
  activeModules: ModuleId[],
): HealthScoreResult {
  // Filter pillars based on active modules
  const activePillars = Object.entries(PILLAR_MODULE_REQUIREMENTS)
    .filter(([_, mod]) => mod === null || activeModules.includes(mod))
    .map(([pillar]) => pillar)

  // Redistribute weights evenly across active pillars
  const weight = 1 / activePillars.length

  // Compute score using only active pillars
  // ... use existing pillar computation logic with filtered set
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/financial-health.ts
git commit -m "feat: adaptive health score based on active modules"
```

---

## Phase 3: Cleanup & Integration

### Task 15: Sovereignty System Removal

**Files:**
- Modify: `lib/feature-phases.ts` (keep `computeSovereigntyLevel` for snapshot API backward compat, remove phase/matrix exports)
- Delete or empty: `components/app/phase-transition-modal.tsx`
- Delete or empty: `components/app/level-up-celebration.tsx`
- Modify: `components/app/feature-gate.tsx` (simplify to module-based)
- Modify: All remaining consumers (40+ files)

- [ ] **Step 1: Identify all remaining sovereignty imports**

Run grep for: `feature-phases`, `computeSovereigntyLevel`, `levelToPhaseId`, `PHASES`, `DEFAULT_MATRIX`, `LockedFeatureCard`, `NewFeatureSpotlight`, `PhaseTransitionModal`, `LevelUpCelebration`

- [ ] **Step 2: Update each consumer file**

For each file:
- Replace sovereignty checks with module checks
- Replace `isFeatureAccessible` with `isWidgetVisible` or `isModuleActive`
- Remove phase transition references
- Remove level-up celebration references

- [ ] **Step 3: Simplify feature-gate.tsx**

Replace `FeatureGate` with `ModuleGate`:

```typescript
export function ModuleGate({ moduleId, children, fallback = 'hidden' }: {
  moduleId: ModuleId
  children: ReactNode
  fallback?: 'hidden' | ReactNode
}) {
  const { activeModules } = useModuleAccess()
  if (!isModuleActive(activeModules, moduleId)) {
    return fallback === 'hidden' ? null : fallback
  }
  return <>{children}</>
}

// Keep FeatureGate as backward-compat alias during migration
export const FeatureGate = ModuleGate
```

- [ ] **Step 4: Remove phase-transition-modal.tsx and level-up-celebration.tsx**

Remove the components and all their imports from layout.tsx and feature-access-provider.tsx.

- [ ] **Step 5: Update snapshot API routes**

The snapshot routes (`api/snapshots/`) use `computeSovereigntyLevel` to store level in `net_worth_snapshots.sovereignty_level`. Keep this computation for historical data but make it independent of feature gating.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove sovereignty-based feature gating, replace with module system"
```

---

### Task 16: AI Chat Module Binding

**Files:**
- Modify: `components/app/chat/chat-panel.tsx`

- [ ] **Step 1: Read `components/app/chat/chat-panel.tsx`**

- [ ] **Step 2: Make AI domain route-aware and module-gated**

```typescript
// Old:
const transport = useMemo(
  () => new DefaultChatTransport({ api: '/api/ai/chat', body: { domain: 'wil' } }),
  [],
)

// New:
const pathname = usePathname()
const { activeModules } = useModuleAccess()

const domain = useMemo(() => {
  if (pathname.startsWith('/horizon') && activeModules.includes('toekomstplannen')) return 'horizon'
  if (pathname.startsWith('/will') && activeModules.includes('inzicht_acties')) return 'wil'
  // Default to kern for core pages, or wil if available
  if (activeModules.includes('inzicht_acties')) return 'wil'
  return 'kern'
}, [pathname, activeModules])

const transport = useMemo(
  () => new DefaultChatTransport({ api: '/api/ai/chat', body: { domain } }),
  [domain],
)
```

- [ ] **Step 3: Commit**

```bash
git add components/app/chat/chat-panel.tsx
git commit -m "feat: AI chat domain follows active module and current route"
```

---

### Task 17: Admin Page Update

**Files:**
- Modify: `app/(app)/beheer/toegang/page.tsx`

- [ ] **Step 1: Read current admin access page**

- [ ] **Step 2: Replace feature-phase matrix with module management**

Replace the phase × feature matrix UI with:
- Per-user module assignment (override user's own selection)
- Module catalog display
- Subscription tier management (keep as-is)

- [ ] **Step 3: Commit**

```bash
git add app/(app)/beheer/toegang/page.tsx
git commit -m "feat: update admin access page for module-based management"
```

---

## Phase 4: UI/UX Review

### Task 18: UI/UX Review

Use the `ux-review-expert` agent to review all changed UI components for:
- Mobile responsiveness (< 768px bottom nav, ≥ 768px top nav)
- Consistency with existing design tokens (`var(--ink)`, `var(--border-ed)`, module colors)
- Onboarding persona selection UX
- Settings module toggle UX
- Navigation behavior with 1, 2, or 3 active modules
- Gids content coherence after sovereignty text replacement

---

## Verification

After all tasks complete:

- [ ] **Run regression tests:** Navigate to `/beheer/regressietest` and run full suite
- [ ] **Test persona flows:** Seed each test persona and verify:
  - Roos (budgetteren only): no dashboard, lands on /core/budgets, only budget widgets
  - Lisa (budget + vermogen + inzicht + toekomst): dashboard with relevant widgets, Kern + Wil + Horizon tabs
  - Rashid (vermogen + aandelen + nieuws): no dashboard, lands on /core/assets, holdings accessible
  - Willem (all modules): full app experience
- [ ] **Test onboarding:** Create new account, select each persona, verify module preselection
- [ ] **Test settings:** Toggle modules on/off, verify navigation updates, verify dependency enforcement
- [ ] **Test mobile:** Verify bottom-nav, widget sizing, safe-area padding on mobile viewport
- [ ] **Test desktop:** Verify top-nav tabs, settings layout, gids readability
