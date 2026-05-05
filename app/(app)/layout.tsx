import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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
import { computeFeatureAccess } from '@/lib/compute-feature-access'
import { PHASES } from '@/lib/feature-phases'
import { ALL_MODULES } from '@/lib/module-registry'
import type { ModuleId } from '@/lib/module-registry'
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

  const [profileRes, assetsRes, debtsRes, txRes, matrixRes, lastLevelRes] = await Promise.all([
    supabase.from('profiles').select('role, onboarding_completed, last_known_phase, module_colors, budget_colors, phase_colors, typography_theme, active_subscriptions, feature_preferences, active_modules').eq('id', user.id).single(),
    supabase.from('assets').select('current_value').eq('user_id', user.id).eq('is_active', true),
    supabase.from('debts').select('current_balance, debt_type').eq('user_id', user.id).eq('is_active', true),
    supabase.from('transactions').select('amount, is_income').eq('user_id', user.id).gte('date', dateStr),
    supabase.from('app_settings').select('value').eq('key', 'unified_feature_matrix').maybeSingle(),
    // Sovereignty level change detection (was sequential — moved into batch)
    supabase.from('app_settings').select('value').eq('key', `last_sovereignty_level_${user.id}`).maybeSingle(),
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
  const activeModules: ModuleId[] = (profile?.active_modules as ModuleId[]) ?? [...ALL_MODULES]

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
                        <ResponsiveShell email={user.email ?? ''} role={profile?.role ?? 'user'}>
                          {children}
                        </ResponsiveShell>
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
