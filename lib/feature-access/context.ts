'use client'

// ── Feature-access context + hooks ───────────────────────────
// De React-context + de consumer-hooks wonen hier (lib) zodat lib-modules
// (bv. lib/hooks/use-feature-toggle.ts) ze kunnen importeren zonder terug naar
// components te reiken (import-richting UI→lib). De Provider-COMPONENT blijft in
// components/app/feature-access-provider.tsx en consumeert deze context.
//
// HARDE INVARIANT: precies ÉÉN createContext-instantie (deze). Zowel de Provider
// als useFeatureAccess importeren FeatureAccessContext hiervandaan — een tweede
// createContext zou een stille default-fallback (provider/consumer-mismatch)
// veroorzaken.

import { createContext, useContext } from 'react'
import type { FeatureAccessData } from '@/lib/compute-feature-access'
import { ALL_MODULES, isModuleActive, type ModuleId } from '@/lib/module-registry'
import { hasSubscription } from '@/lib/feature-registry'

export type FeatureAccessContextValue = FeatureAccessData & {
  /** Refresh feature prefs after user toggle */
  refreshFeaturePrefs: (prefs: Record<string, boolean>) => void
  /** Active module IDs for the current user */
  activeModules: ModuleId[]
  /** Update active modules client-side without page reload */
  refreshModules: (modules: ModuleId[]) => void
}

export const FeatureAccessContext = createContext<FeatureAccessContextValue | null>(null)

export function useFeatureAccess(): FeatureAccessContextValue {
  const ctx = useContext(FeatureAccessContext)
  if (!ctx) return {
    features: {},
    phase: 'recovery',
    level: 0,
    tier: 'gratis',
    subscriptions: [],
    netWorth: 0,
    monthlyExpenses: 0,
    freedomPct: 0,
    refreshFeaturePrefs: () => {},
    activeModules: [...ALL_MODULES],
    refreshModules: () => {},
  }
  return ctx
}

/**
 * Focused hook for module access. Returns only module-related data,
 * abstracting away legacy sovereignty fields.
 */
export function useModuleAccess() {
  const ctx = useFeatureAccess()
  return {
    activeModules: ctx.activeModules,
    subscriptions: ctx.subscriptions,
    isModuleActive: (id: ModuleId) => isModuleActive(ctx.activeModules, id),
    refreshModules: ctx.refreshModules,
  }
}

/**
 * Heeft de gebruiker het AI-abonnement? (V-002 — pre-check vóór een AI-actie.)
 *
 * Bron = `profiles.active_subscriptions`, server-side geladen in
 * `app/(app)/layout.tsx` → `computeFeatureAccess` → deze context. Dat is exact
 * dezelfde kolom + dezelfde `hasSubscription`-regel als de server-gate
 * `checkTierGate` (lib/require-tier.ts); er is geen admin-/beta-override.
 *
 * Driewaardig: `null` = onbekend (geen provider gemount, bv. de onboarding of
 * een losse test). Dan blokkeert de aanroeper níét vooraf maar leunt op de
 * server-403 (`code: 'ai_subscription'`) → dezelfde upsell. Zo kan een
 * ontbrekende provider nooit een betalende gebruiker buitensluiten.
 */
export function useHasAiSubscription(): boolean | null {
  const ctx = useContext(FeatureAccessContext)
  if (!ctx) return null
  return hasSubscription(ctx.subscriptions, 'ai')
}
