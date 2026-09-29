import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { KrantMeerArtikel } from '@/components/krant/krant-meer-artikel'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { isKrantProfile } from '@/lib/modules/krant-grens'

export const metadata: Metadata = {
  title: 'Meer TriFinity — TriFinity',
  description: 'Wat het volledige TriFinity naast je Krant laat zien.',
}

/**
 * /krant/meer — de weg omhoog van de Krant naar het volledige TriFinity
 * (Krant 2D fase 1, besluit B12). Staat binnen de Krant-grens
 * (`KRANT_ROUTES` in lib/modules/krant-grens.ts), dus een Krant-account komt
 * hier; de ingang is de kaart "Meer TriFinity" op /mijn/account.
 *
 * De server leest alleen de eigen `active_modules` om te bepalen of de knop
 * erbij hoort. Alles wat de knop doet, loopt via `PUT /api/modules`.
 */
export default async function KrantMeerPage() {
  const supabase = await createClient()
  const user = await getCachedUser(supabase)
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_modules')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <>
      <NavStackMeta title="Meer TriFinity" />
      <KrantMeerArtikel isKrant={isKrantProfile(profile)} />
    </>
  )
}
