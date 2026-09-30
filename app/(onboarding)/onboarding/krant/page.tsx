import type { CSSProperties } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/supabase/cached-user'
import { DEFAULT_MODULE_COLORS, generateModuleColorVars, type ModuleColorConfig } from '@/lib/color-palette'
import { moduleActiveVars } from '@/components/editorial/katern-accent-scope'
import { KRANT_HOME_HREF } from '@/lib/modules/krant-grens'
import { GEWONE_ONBOARDING_PAD } from '@/lib/krant/aanmelden-pad'
import { krantOnboardingToegang } from '@/lib/krant/aanmelden'
import { leesEigenProfiel, rijNaarV1Profiel } from '@/lib/krant/v1-profiel'
import { KrantOnboarding } from '@/components/krant/krant-onboarding'

/**
 * /onboarding/krant — de onboarding van de Krant (Krant 2C, ADR 0192).
 *
 * Bewust onder /onboarding en niet onder /krant: /krant is de publieke ingang
 * (2E) en /krant/meer de weg omhoog (2D).
 *
 * Toegang (achter de gesloten vlag): alleen een Krant-account dat de tijdlijn
 * leest (`krantOnboardingToegang`, dezelfde toets als de omleidingen in de
 * app-layout en /onboarding — dus nooit een lus):
 *   'geen'      → de gewone onboarding (die zelf weer doorstuurt als je al klaar bent)
 *   'afgerond'  → /nieuws
 *   'open'      → de vijf schermen
 *
 * Lezen via de server (ADR 0058): het profiel komt hier uit de eigen rij
 * (sessie-client, expliciete kolommen) en gaat als prop naar de client.
 */

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Je Krant instellen' }

export default async function KrantOnboardingPage() {
  const supabase = await createClient()
  const user = await getVerifiedUser(supabase)
  if (!user) redirect('/login')

  const toegang = await krantOnboardingToegang(supabase, user.id)
  if (toegang === 'geen') redirect(GEWONE_ONBOARDING_PAD)
  if (toegang === 'afgerond') redirect(KRANT_HOME_HREF)

  const [rij, kleurRes] = await Promise.all([
    leesEigenProfiel(supabase, user.id),
    supabase.from('profiles').select('module_colors').eq('id', user.id).maybeSingle(),
  ])
  const { profiel, herkomst } = rijNaarV1Profiel(rij)

  // De accenten van de gebruiker (of de standaard), en de Krant in het
  // Fin-accent — zoals /nieuws in de app (CLAUDE.md, kleurconventie).
  const mc = (kleurRes.data?.module_colors ?? null) as Partial<ModuleColorConfig> | null
  const kleuren: ModuleColorConfig = { ...DEFAULT_MODULE_COLORS, ...(mc ?? {}) }
  const stijl = { ...generateModuleColorVars(kleuren), ...moduleActiveVars('fin') } as CSSProperties

  return (
    <div style={stijl} className="pt-8 sm:pt-12">
      <KrantOnboarding start={profiel} herkomst={herkomst} />
    </div>
  )
}
