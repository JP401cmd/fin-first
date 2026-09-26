/**
 * Een levensgebeurtenis op de tijdas verplaatsen (sleep op de grafiek of de tijdlijn)
 * en eerlijk zeggen of dat lukte.
 *
 * De update loopt via de anon-client onder RLS: "Users can update own life events"
 * (`auth.uid() = user_id`). Een gebeurtenis die niet van jou is, zoals een gedeelde
 * gebeurtenis die je partner toevoegde, geeft daarom geen fout maar raakt stil nul
 * rijen. Zonder `.select('id')` is dat niet te zien, en meldde de sleep "verplaatst"
 * terwijl er niets was opgeslagen. De uitkomst telt dus de geraakte rijen: alleen
 * precies één is "verplaatst".
 *
 * Bewust nog een client-write (geen API-route): die verhuizing is een aparte kaart.
 */

import { createClient } from '@/lib/supabase/client'

export interface LevensgebeurtenisVerplaatsing {
  target_age: number | null
  target_date?: string | null
}

/** `verplaatst` = precies één rij geraakt; `niet-geraakt` = nul (niet van jou of weg). */
export type VerplaatsUitkomst = 'verplaatst' | 'niet-geraakt' | 'fout'

export async function verplaatsLevensgebeurtenis(
  eventId: string,
  patch: LevensgebeurtenisVerplaatsing,
): Promise<VerplaatsUitkomst> {
  const { data, error } = await createClient()
    .from('life_events')
    .update(patch)
    .eq('id', eventId)
    .select('id')
  if (error) {
    console.error('[levensgebeurtenis] verplaatsen faalde:', error)
    return 'fout'
  }
  return data?.length === 1 ? 'verplaatst' : 'niet-geraakt'
}
