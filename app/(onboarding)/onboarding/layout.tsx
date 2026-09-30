import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PATHNAME_HEADER } from '@/lib/modules/krant-grens'
import { GEWONE_ONBOARDING_PAD, KRANT_ONBOARDING_PAD } from '@/lib/krant/aanmelden-pad'
import { onboardingPadVoor } from '@/lib/krant/aanmelden'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Krant 2C (ADR 0192): een Krant-account zonder afgeronde onboarding hoort in
  // /onboarding/krant, niet in de onboarding van het Geheel. Alleen op het
  // kale /onboarding (het pad komt van de proxy, PATHNAME_HEADER); de
  // Krant-onboarding bewaakt zijn eigen toegang in zijn page. De toets is
  // dezelfde als die van de app-layout (`onboardingPadVoor`), dus geen lus.
  if ((await headers()).get(PATHNAME_HEADER) === GEWONE_ONBOARDING_PAD) {
    const { data: profiel } = await supabase
      .from('profiles')
      .select('role, active_modules, onboarding_completed, blocked_at')
      .eq('id', user.id)
      .maybeSingle()
    if (profiel && !profiel.onboarding_completed && onboardingPadVoor(profiel) === KRANT_ONBOARDING_PAD) {
      redirect(KRANT_ONBOARDING_PAD)
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--subtle)]">
      {children}
    </div>
  )
}
