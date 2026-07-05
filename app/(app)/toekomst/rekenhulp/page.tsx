import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { ToekomstSubpageShell } from '@/components/future/toekomst-subpage-shell'
import { RekenhulpView } from '@/components/future/rekenhulp-view'
import { buildPrefillValues } from '@/lib/calculator/user-data-keys'
import type { CustomCalculatorRow } from '@/lib/calculator/types'

export const metadata: Metadata = {
  title: 'Rekenhulp — TriFinity',
  description: 'Will-ondersteunde rekenhulpen — vergelijk financiële keuzes en bewaar je eigen berekeningen.',
}

/**
 * /toekomst/rekenhulp — eigen subroute voor de Rekenhulp-view.
 *
 * Server component die exact dezelfde data laadt als de voormalige
 * Rekenhulp-tab in ToekomstPage: prefill-waarden uit de horizon-data +
 * de opgeslagen calculators van de gebruiker. Zie het ontwerp
 * docs/superpowers/specs/2026-06-01-toekomst-tijdas-landing-navkaarten-design.md.
 */
export default async function ToekomstRekenhulpPage() {
  const supabase = await createClient()
  const horizonData = await loadHorizonData(supabase)

  // Rekenhulp (Will-assisted calculators): prefill-waarden uit de
  // horizon-data + opgeslagen calculators van de gebruiker.
  const prefill = buildPrefillValues({
    effectiveInput: horizonData.effectiveInput,
    unlinkedCash: horizonData.unlinkedCash,
    assets: horizonData.assets,
    housingContext: horizonData.housingContext,
    fireParams: horizonData.fireParams,
  })
  const { data: { user } } = await supabase.auth.getUser()
  let savedCalculators: CustomCalculatorRow[] = []
  if (user) {
    const { data: calcRows } = await supabase
      .from('custom_calculators')
      .select(
        'id, name, description, definition, created_by_ai, sort_order, created_at, is_public, published_at, forked_from, like_count, duplicate_count',
      )
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    savedCalculators = (calcRows ?? []) as CustomCalculatorRow[]
  }

  return (
    <>
      <ToekomstSubpageShell
        kicker="Toekomst · Rekenhulp"
        titleBefore="Wat kost een keuze je aan "
        emphasis="tijd"
        titleAfter="?"
        deck="Will-ondersteunde rekenhulpen — vergelijk financiële keuzes en bewaar je eigen berekeningen."
      />
      <RekenhulpView saved={savedCalculators} prefill={prefill} />
    </>
  )
}
