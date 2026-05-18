import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadIdentityData } from '@/lib/identity-data-loader'
import IdentityClient from '@/components/identity/identity-client'

export const metadata: Metadata = {
  title: 'Mijn — TriFinity',
  description: 'Profiel, partner, privacy, koppelingen, voorkeuren en rapportages.',
}

/**
 * /mijn — canonieke profiel/instellingen-pagina (nieuwe navigatie-architectuur).
 *
 * Vervangt /identity. Voor nu rendert IdentityClient zodat preview-functionaliteit
 * meteen werkt onder de nieuwe URL. In komende fases wordt Mijn opgesplitst in:
 *  - /mijn/profiel  · /mijn/partner  · /mijn/privacy
 *  - /mijn/koppelingen (PSD2, UPO, brokerage)
 *  - /mijn/notificaties  · /mijn/uiterlijk
 *  - /mijn/personalisatie (widgets-configurator voor Overzicht-hero)
 *  - /mijn/rapportages (4 types index)
 *  - /mijn/geavanceerd (exports, debug)
 *
 * Dit vervangt het 2459-regel /identity/instellingen monster.
 */
export default async function MijnPage() {
  const supabase = await createClient()
  const data = await loadIdentityData(supabase)
  return <IdentityClient initialData={data} />
}
