import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { computeFireProjection, type FinancialInput } from '@/lib/horizon-data'
import { resolveFireParams } from '@/lib/fire-params'
import { ChatProvider } from '@/components/app/chat/chat-provider'
import { ChatPanel } from '@/components/app/chat/chat-panel'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'
import { MobilePreviewProvider } from '@/components/app/beheer/mobile-preview-provider'
import { MobilePreviewFrame } from '@/components/app/beheer/mobile-preview-frame'
import { ToastProvider } from '@/components/app/toast-provider'
import { GlobalSyncProvider } from '@/components/sync/global-sync-provider'
import { PrivacyProvider } from '@/lib/hooks/use-privacy'
import { SessionMonitor } from '@/components/app/session-monitor'
import { AutoSnapshotTrigger } from '@/components/app/auto-snapshot-trigger'
import { PerspectiveProvider } from '@/components/app/perspective-provider'
import { NotificationProvider } from '@/components/app/notifications/notification-provider'
import { NotificationModal } from '@/components/app/notifications/notification-panel'
import { ResponsiveShell } from '@/components/app/shell/responsive-shell'
import { CommandPaletteProvider } from '@/components/command-palette/command-palette-provider'
import { computeFeatureAccess } from '@/lib/compute-feature-access'
import { PHASES } from '@/lib/feature-phases'
import { ALL_MODULES } from '@/lib/module-registry'
import type { ModuleId } from '@/lib/module-registry'
import { getActiveAppKeys } from '@/components/core/category-deepening-registry'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import { DashboardTypeProvider } from '@/components/app/dashboard-type-provider'
import {
  generateAllColorVars,
  DEFAULT_MODULE_COLORS,
  DEFAULT_BUDGET_COLORS,
  DEFAULT_PHASE_COLORS,
} from '@/lib/color-palette'
import type { ModuleColorConfig, BudgetColorConfig, PhaseColorConfig } from '@/lib/color-palette'
import type { FontTheme } from '@/components/app/module-color-provider'

function generateFontVars(theme: string): Record<string, string> {
  if (theme === 'andada') {
    return { '--font-playfair': 'var(--font-andada)', '--font-source-serif': 'var(--font-andada)' }
  }
  if (theme === 'digital') {
    return { '--font-playfair': 'var(--font-inter)', '--font-source-serif': 'var(--font-inter)' }
  }
  return {}
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // The proxy middleware normally handles auth redirects with redirectTo param.
    // This is a fallback for edge cases (e.g., session expiry between proxy and layout).
    redirect('/login')
  }

  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const dateStr = threeMonthsAgo.toISOString().split('T')[0]

  const [
    profileRes,
    assetsRes,
    debtsRes,
    txRes,
    matrixRes,
    lastLevelRes,
    actionsCountRes,
    essentialBudgetsRes,
  ] = await Promise.all([
    // profile-select uitgebreid met FIRE/dob-velden zodat we hier hetzelfde
    // server-side `computeFireProjection` kunnen draaien als
    // `app/api/snapshots/auto/route.ts`. Daardoor toont de sidebar dezelfde
    // vrijheidsleeftijd als /horizon (en als de auto-snapshot in
    // net_worth_snapshots) zonder afhankelijk te zijn van eerder snapshot-
    // bezoek.
    supabase.from('profiles').select('role, onboarding_completed, last_known_phase, module_colors, budget_colors, phase_colors, typography_theme, active_subscriptions, feature_preferences, active_modules, date_of_birth, expected_return, inflation_rate, net_monthly_income, estimated_monthly_expenses').eq('id', user.id).single(),
    // assets: `asset_type, net_worth_inclusion_pct, monthly_contribution` voor
    // sidebar netWorth (weighted) én FIRE-projection (monthly contributions).
    // De tracking-flags voeden `getActiveAppKeys()` voor de sidebar apps-strip:
    // een app verschijnt alleen als minstens één gekoppeld asset/debt de vlag
    // aan heeft staan (zie components/core/category-deepening-registry.ts).
    supabase.from('assets').select('current_value, asset_type, net_worth_inclusion_pct, monthly_contribution, has_budget_tracking, has_holdings_tracking, has_woonbalans_tracking, has_rental_tracking').eq('user_id', user.id).eq('is_active', true),
    // debts: `net_worth_inclusion_pct` voor netto-vermogen-weging,
    // `has_strategy_tracking` voor de Aflosstrategie/Hypotheekplanner-apps.
    supabase.from('debts').select('current_balance, debt_type, net_worth_inclusion_pct, has_strategy_tracking').eq('user_id', user.id).eq('is_active', true),
    supabase.from('transactions').select('amount, is_income').eq('user_id', user.id).gte('date', dateStr),
    supabase.from('app_settings').select('value').eq('key', 'unified_feature_matrix').maybeSingle(),
    // Sovereignty level change detection (was sequential — moved into batch)
    supabase.from('app_settings').select('value').eq('key', `last_sovereignty_level_${user.id}`).maybeSingle(),
    // Sidebar-metric: openstaande acties (Wil-module). Status-filter spiegelt
    // `openActions` uit will-data-loader.ts (open + postponed). Head-only +
    // count: 'exact' = geen rows-payload, alleen totaal.
    supabase.from('actions').select('id', { count: 'exact', head: true }).in('status', ['open', 'postponed']),
    // Essentiële budgets voor `yearlyMustExpenses` in de FIRE-projection —
    // zelfde subset als `app/api/snapshots/auto/route.ts`. Bij geen
    // essentials valt `computeEffectiveExpenses` automatisch terug op
    // monthlyExpenses * 12.
    supabase.from('budgets').select('default_limit, interval').eq('user_id', user.id).eq('is_essential', true).eq('budget_type', 'expense').is('parent_id', null),
  ])

  const profile = profileRes.data

  if (profile && !profile.onboarding_completed) {
    redirect('/onboarding')
  }

  const featureAccess = computeFeatureAccess({
    assets: assetsRes.data ?? [],
    debts: debtsRes.data ?? [],
    transactions: txRes.data ?? [],
    activeSubscriptions: (profile?.active_subscriptions as string[]) ?? [],
    matrixJson: matrixRes.data?.value ?? null,
    userFeaturePrefs: (profile?.feature_preferences as Record<string, boolean>) ?? null,
  })

  // ── Phase transition detection ──────────────────────────
  const lastKnownPhase = profile?.last_known_phase as string | null
  let phaseTransition: { oldPhase: string; newPhase: string } | null = null

  if (lastKnownPhase !== featureAccess.phase) {
    if (lastKnownPhase !== null) {
      // Genuine phase change (not first load) — check direction
      const phaseIds = PHASES.map(p => p.id)
      const oldIndex = phaseIds.indexOf(lastKnownPhase)
      const newIndex = phaseIds.indexOf(featureAccess.phase)

      if (newIndex > oldIndex) {
        // Upward transition — show celebration modal
        phaseTransition = { oldPhase: lastKnownPhase, newPhase: featureAccess.phase }
      }
    }
    // Update DB regardless (first store, upward, or downward)
    supabase.from('profiles').update({ last_known_phase: featureAccess.phase }).eq('id', user.id).then(() => {})
  }

  // ── Sovereignty level change detection ────────────────
  const lastLevel = lastLevelRes.data?.value ? Number(JSON.parse(lastLevelRes.data.value)) : null

  if (lastLevel !== null && featureAccess.level > lastLevel) {
    // Level went up — store the change for notification display
    supabase.from('app_settings').upsert({
      key: `sovereignty_level_change_${user.id}`,
      value: JSON.stringify({
        oldLevel: lastLevel,
        newLevel: featureAccess.level,
        timestamp: new Date().toISOString(),
      }),
    }, { onConflict: 'key' }).then(() => {})
  }

  // Always store current level
  supabase.from('app_settings').upsert({
    key: `last_sovereignty_level_${user.id}`,
    value: JSON.stringify(featureAccess.level),
  }, { onConflict: 'key' }).then(() => {})

  // ── Active modules ────────────────────────────────────
  // Module-toggle is verwijderd uit Trifinity (zie /identity/instellingen).
  // App-zichtbaarheid wordt voortaan per individuele app afgeleid van
  // tracking-flags op assets/debts (zie `sidebarActiveAppKeys` hieronder).
  // Op module-niveau zijn voortaan alle modules altijd beschikbaar; de DB-
  // kolom `profiles.active_modules` blijft staan voor migratie-doeleinden
  // maar wordt hier bewust genegeerd.
  const activeModules: ModuleId[] = [...ALL_MODULES]

  // ── Sidebar-metrics (Kern/Wil/Horizon kerncijfers) ─────
  // Net-worth: spiegelt lib/dashboard-data-loader.ts:217-229 (weighted via
  // `net_worth_inclusion_pct`, cash-only fallback bij inactieve
  // `vermogensregistratie`). Houdt het cijfer in de sidebar consistent met
  // dashboard-headers.
  const sidebarHasVermogen = activeModules.includes('vermogensregistratie')
  type AssetRow = { current_value: number | string; asset_type?: string | null; net_worth_inclusion_pct?: number | null; monthly_contribution?: number | string | null; has_budget_tracking?: boolean; has_holdings_tracking?: boolean; has_woonbalans_tracking?: boolean; has_rental_tracking?: boolean }
  type DebtRow = { current_balance: number | string; debt_type?: string | null; net_worth_inclusion_pct?: number | null; has_strategy_tracking?: boolean }
  const assetRows = (assetsRes.data ?? []) as AssetRow[]
  const debtRows = (debtsRes.data ?? []) as DebtRow[]
  // App-zichtbaarheid in sidebar: derived van tracking-flags. Een app
  // verschijnt enkel wanneer minstens één gekoppeld asset/debt de vlag
  // heeft staan — vervangt de oude `activeModules.includes(moduleId)` filter.
  const sidebarActiveAppKeys = getActiveAppKeys(
    assetRows as unknown as Asset[],
    debtRows as unknown as Debt[],
  )
  const sidebarTotalAssetsRaw = assetRows.reduce((s, a) => s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
  const sidebarTotalDebtsRaw = debtRows.reduce((s, d) => s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
  const sidebarCashOnlyAssets = assetRows
    .filter((a) => a.asset_type === 'cash')
    .reduce((s, a) => s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
  const sidebarNetWorth = sidebarHasVermogen
    ? sidebarTotalAssetsRaw - sidebarTotalDebtsRaw
    : sidebarCashOnlyAssets
  const sidebarActionCount = actionsCountRes.count ?? 0

  // FIRE-leeftijd: live server-side berekend met `computeFireProjection` —
  // dezelfde formule als app/api/snapshots/auto/route.ts. Zo zien gebruikers
  // direct hun vrijheidsleeftijd zonder eerst /horizon te bezoeken (de hook
  // `useHorizonFireSim` schrijft pas naar `net_worth_snapshots.fire_age`
  // nadat /horizon geopend wordt). Inputs:
  //  - totalAssets/totalDebts: weighted totals (zelfde als netto-vermogen)
  //  - monthlyIncome/monthlyExpenses: 3-maand-gemiddelde uit txRes, fallback
  //    naar profile-schattingen voor users zonder transacties
  //  - monthlyContributions: som van assets.monthly_contribution
  //  - yearlyMustExpenses: essentiële budgets, anders fallback via
  //    `computeEffectiveExpenses` op monthlyExpenses*12
  let sidebarFireAge: number | null = null
  const dob = (profile as { date_of_birth?: string | null } | null)?.date_of_birth ?? null
  if (dob) {
    const txRows = (txRes.data ?? []) as { amount: number | string; is_income: boolean }[]
    let income3mTotal = 0
    let expense3mTotal = 0
    for (const t of txRows) {
      const amt = Number(t.amount)
      if (t.is_income) income3mTotal += amt
      else expense3mTotal += Math.abs(amt)
    }
    const profileMonthlyIncome = Number((profile as { net_monthly_income?: number | string | null } | null)?.net_monthly_income ?? 0)
    const profileMonthlyExpenses = Number((profile as { estimated_monthly_expenses?: number | string | null } | null)?.estimated_monthly_expenses ?? 0)
    const monthlyIncome = income3mTotal > 0 ? income3mTotal / 3 : profileMonthlyIncome
    const monthlyExpenses = expense3mTotal > 0 ? expense3mTotal / 3 : profileMonthlyExpenses
    const monthlyContributions = assetRows.reduce((s, a) => s + Number(a.monthly_contribution ?? 0), 0)
    const yearlyMustExpenses = (essentialBudgetsRes.data ?? []).reduce((s, b) => {
      const limit = Number((b as { default_limit?: number | string | null }).default_limit ?? 0)
      return s + ((b as { interval?: string | null }).interval === 'yearly' ? limit : limit * 12)
    }, 0)
    const fireParams = resolveFireParams(profile ?? {})
    const fireInput: FinancialInput = {
      totalAssets: sidebarTotalAssetsRaw,
      totalDebts: sidebarTotalDebtsRaw,
      monthlyIncome,
      monthlyExpenses,
      monthlyContributions,
      yearlyMustExpenses,
      dateOfBirth: dob,
    }
    const projection = computeFireProjection(fireInput, fireParams.grossReturn, fireParams.effectiveSwr)
    sidebarFireAge = projection.fireAge != null ? Math.round(projection.fireAge) : null
  }

  // ── Module colors (SSR) ────────────────────────────────
  const mc = profile?.module_colors as Record<string, string> | null
  const moduleColors: ModuleColorConfig = {
    kern:    mc?.kern    || DEFAULT_MODULE_COLORS.kern,
    wil:     mc?.wil     || DEFAULT_MODULE_COLORS.wil,
    horizon: mc?.horizon || DEFAULT_MODULE_COLORS.horizon,
  }

  const bc = profile?.budget_colors as Record<string, string> | null
  const budgetColors: BudgetColorConfig = {
    income:  bc?.income  || DEFAULT_BUDGET_COLORS.income,
    expense: bc?.expense || DEFAULT_BUDGET_COLORS.expense,
    savings: bc?.savings || DEFAULT_BUDGET_COLORS.savings,
    debt:    bc?.debt    || DEFAULT_BUDGET_COLORS.debt,
    other:   bc?.other   || DEFAULT_BUDGET_COLORS.other,
  }

  const pc = profile?.phase_colors as Record<string, string> | null
  const phaseColors: PhaseColorConfig = {
    phase_recovery:  pc?.phase_recovery  || DEFAULT_PHASE_COLORS.phase_recovery,
    phase_stability: pc?.phase_stability || DEFAULT_PHASE_COLORS.phase_stability,
    phase_momentum:  pc?.phase_momentum  || DEFAULT_PHASE_COLORS.phase_momentum,
    phase_mastery:   pc?.phase_mastery   || DEFAULT_PHASE_COLORS.phase_mastery,
  }

  const colorVars = generateAllColorVars({ modules: moduleColors, budget: budgetColors, phase: phaseColors })
  const fontVars = generateFontVars(profile?.typography_theme ?? 'editorial')
  const allVars = { ...colorVars, ...fontVars }

  return (
    <MobilePreviewProvider>
      <MobilePreviewFrame>
        <PrivacyProvider>
        <ToastProvider>
          <SessionMonitor />
          <AutoSnapshotTrigger />
          <PerspectiveProvider>
            <ChatProvider>
              <NotificationProvider>
              <GlobalSyncProvider>
                <ModuleColorProvider initialConfig={moduleColors} initialBudgetConfig={budgetColors} initialPhaseConfig={phaseColors} initialFontTheme={(profile?.typography_theme as FontTheme) ?? 'editorial'}>
                  <DashboardTypeProvider>
                    <div className="min-h-screen bg-[var(--bg)]" data-app-root style={allVars as React.CSSProperties}>
                      {/* Skip-link — eerste tab-stop voor keyboard- en
                          screen-reader-gebruikers (WCAG 2.1 Bypass Blocks).
                          sr-only verbergt visueel; focus:not-sr-only maakt
                          zichtbaar wanneer geactiveerd. Target = #main-content,
                          gezet door beide shell-takken (LegacyShell main +
                          NewShell wrapper-div). */}
                      <a
                        href="#main-content"
                        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-[var(--paper)] focus:px-4 focus:py-2 focus:border-2 focus:border-[var(--ink)] focus:text-sm focus:font-medium focus:text-[var(--ink)] focus:no-underline"
                      >
                        Naar hoofdinhoud
                      </a>
                      <FeatureAccessProvider data={featureAccess} phaseTransition={phaseTransition} activeModules={activeModules}>
                        <CommandPaletteProvider role={profile?.role ?? 'user'}>
                          <ResponsiveShell
                            email={user.email ?? ''}
                            role={profile?.role ?? 'user'}
                            sidebarMetrics={{
                              netWorth: sidebarNetWorth,
                              actionCount: sidebarActionCount,
                              fireAge: sidebarFireAge,
                              activeAppKeys: sidebarActiveAppKeys,
                            }}
                          >
                            {children}
                          </ResponsiveShell>
                        </CommandPaletteProvider>
                      </FeatureAccessProvider>
                      <ChatPanel />
                    </div>
                  </DashboardTypeProvider>
                </ModuleColorProvider>
                <NotificationModal />
              </GlobalSyncProvider>
              </NotificationProvider>
            </ChatProvider>
          </PerspectiveProvider>
        </ToastProvider>
        </PrivacyProvider>
      </MobilePreviewFrame>
    </MobilePreviewProvider>
  )
}
