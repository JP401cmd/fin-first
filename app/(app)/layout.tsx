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
import { BadgeNotifier } from '@/components/app/badge-notifier'
import { SessionMonitor } from '@/components/app/session-monitor'
import { AutoSnapshotTrigger } from '@/components/app/auto-snapshot-trigger'
import { DailyExpenseProvider } from '@/components/app/freedom-time-label'
import { PerspectiveProvider } from '@/components/app/perspective-provider'
import { NotificationProvider } from '@/components/app/notifications/notification-provider'
import { NotificationModal } from '@/components/app/notifications/notification-panel'
import { computeFeatureAccess } from '@/lib/compute-feature-access'
import { PHASES } from '@/lib/feature-phases'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import { generateModuleColorVars, DEFAULT_MODULE_COLORS } from '@/lib/color-palette'
import type { ModuleColorConfig } from '@/lib/color-palette'

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

  const [profileRes, assetsRes, debtsRes, txRes, matrixRes] = await Promise.all([
    supabase.from('profiles').select('role, onboarding_completed, last_known_phase, module_colors').eq('id', user.id).single(),
    supabase.from('assets').select('current_value').eq('is_active', true),
    supabase.from('debts').select('current_balance, debt_type').eq('is_active', true),
    supabase.from('transactions').select('amount, is_income').gte('date', dateStr),
    supabase.from('app_settings').select('value').eq('key', 'feature_phase_matrix').maybeSingle(),
  ])

  const profile = profileRes.data

  if (profile && !profile.onboarding_completed) {
    redirect('/onboarding')
  }

  const featureAccess = computeFeatureAccess({
    assets: assetsRes.data ?? [],
    debts: debtsRes.data ?? [],
    transactions: txRes.data ?? [],
    matrixJson: matrixRes.data?.value ?? null,
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

  // ── Module colors (SSR) ────────────────────────────────
  const moduleColors: ModuleColorConfig = {
    kern: (profile?.module_colors as Record<string, string> | null)?.kern || DEFAULT_MODULE_COLORS.kern,
    wil: (profile?.module_colors as Record<string, string> | null)?.wil || DEFAULT_MODULE_COLORS.wil,
    horizon: (profile?.module_colors as Record<string, string> | null)?.horizon || DEFAULT_MODULE_COLORS.horizon,
  }
  const colorVars = generateModuleColorVars(moduleColors)

  return (
    <MobilePreviewProvider>
      <MobilePreviewFrame>
        <ToastProvider>
          <SessionMonitor />
          <AutoSnapshotTrigger />
          <BadgeNotifier />
          <PerspectiveProvider>
            <ChatProvider>
              <NotificationProvider>
                <ModuleColorProvider initialConfig={moduleColors}>
                  <div className="min-h-screen bg-[var(--bg)]" style={colorVars as React.CSSProperties}>
                    <ChatLayoutWrapper>
                      <AppHeader email={user.email ?? ''} role={profile?.role ?? 'user'} />
                      <FeatureAccessProvider data={featureAccess} phaseTransition={phaseTransition} needsActivation={needsActivation}>
                        <DailyExpenseProvider>
                          <main className="pb-20 md:pb-0">{children}</main>
                          <BottomNav />
                        </DailyExpenseProvider>
                      </FeatureAccessProvider>
                    </ChatLayoutWrapper>
                    <ChatPanel />
                  </div>
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
