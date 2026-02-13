import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app/app-header'
import { ChatProvider } from '@/components/app/chat/chat-provider'
import { ChatPanel } from '@/components/app/chat/chat-panel'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'
import { computeFeatureAccess } from '@/lib/compute-feature-access'
import { PHASES } from '@/lib/feature-phases'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const dateStr = threeMonthsAgo.toISOString().split('T')[0]

  const [profileRes, assetsRes, debtsRes, txRes, matrixRes] = await Promise.all([
    supabase.from('profiles').select('role, onboarding_completed, last_known_phase').eq('id', user.id).single(),
    supabase.from('assets').select('current_value').eq('is_active', true),
    supabase.from('debts').select('current_balance, debt_type').eq('is_active', true),
    supabase.from('transactions').select('amount, is_income').gte('date', dateStr),
    supabase.from('app_settings').select('value').eq('key', 'feature_phase_matrix').single(),
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

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader email={user.email ?? ''} role={profile?.role ?? 'user'} />
      <FeatureAccessProvider data={featureAccess} phaseTransition={phaseTransition} needsActivation={needsActivation}>
        <main>{children}</main>
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      </FeatureAccessProvider>
    </div>
  )
}
