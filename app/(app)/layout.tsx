import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app/app-header'
import { ChatProvider } from '@/components/app/chat/chat-provider'
import { ChatPanel } from '@/components/app/chat/chat-panel'
import { ChatLayoutWrapper } from '@/components/app/chat/chat-layout-wrapper'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'
import { BottomNav } from '@/components/app/bottom-nav'
import { MobilePreviewProvider } from '@/components/app/beheer/mobile-preview-provider'
import { MobilePreviewFrame } from '@/components/app/beheer/mobile-preview-frame'
import { ToastProvider } from '@/components/app/toast-provider'
import { SessionMonitor } from '@/components/app/session-monitor'
import { AutoSnapshotTrigger } from '@/components/app/auto-snapshot-trigger'
import { DailyExpenseProvider } from '@/components/app/freedom-time-label'
import { PerspectiveProvider } from '@/components/app/perspective-provider'
import { NotificationProvider } from '@/components/app/notifications/notification-provider'
import { NotificationModal } from '@/components/app/notifications/notification-panel'
import { computeFeatureAccess } from '@/lib/compute-feature-access'
import { PHASES } from '@/lib/feature-phases'
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
    supabase.from('profiles').select('role, onboarding_completed, last_known_phase, module_colors, budget_colors, phase_colors, typography_theme, active_subscriptions, feature_preferences').eq('id', user.id).single(),
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
  const needsActivation = lastKnownPhase === null
  let phaseTransition: { oldPhase: string; newPhase: string } | null = null

  if (!needsActivation && lastKnownPhase !== featureAccess.phase) {
    const phaseIds = PHASES.map(p => p.id)
    const oldIndex = phaseIds.indexOf(lastKnownPhase)
    const newIndex = phaseIds.indexOf(featureAccess.phase)

    if (newIndex > oldIndex) {
      // Upward transition — show celebration modal
      phaseTransition = { oldPhase: lastKnownPhase, newPhase: featureAccess.phase }
    }
    // Update DB regardless (upward or downward)
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

  // ── Invulfase detection ───────────────────────────────
  const featurePrefs = (profile?.feature_preferences as Record<string, unknown>) ?? {}
  const invulfaseActive = featurePrefs._invulfase_active === true

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
        <ToastProvider>
          <SessionMonitor />
          <AutoSnapshotTrigger />
          <PerspectiveProvider>
            <ChatProvider>
              <NotificationProvider>
                <ModuleColorProvider initialConfig={moduleColors} initialBudgetConfig={budgetColors} initialPhaseConfig={phaseColors} initialFontTheme={(profile?.typography_theme as FontTheme) ?? 'editorial'}>
                  <DashboardTypeProvider>
                    <div className="min-h-screen bg-[var(--bg)]" data-app-root style={allVars as React.CSSProperties}>
                      <FeatureAccessProvider data={featureAccess} phaseTransition={phaseTransition} needsActivation={needsActivation}>
                        <ChatLayoutWrapper>
                          <AppHeader email={user.email ?? ''} role={profile?.role ?? 'user'} />
                          <DailyExpenseProvider>
                            <main className="pb-20 md:pb-0">{children}</main>
                          </DailyExpenseProvider>
                        </ChatLayoutWrapper>
                        <BottomNav />
                      </FeatureAccessProvider>
                      <ChatPanel />
                    </div>
                  </DashboardTypeProvider>
                </ModuleColorProvider>
                <NotificationModal />
              </NotificationProvider>
            </ChatProvider>
          </PerspectiveProvider>
        </ToastProvider>
      </MobilePreviewFrame>
    </MobilePreviewProvider>
  )
}
