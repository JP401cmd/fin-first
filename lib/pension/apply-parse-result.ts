/**
 * Zet een geparst pensioenoverzicht (UPO van mijnpensioenoverzicht.nl) om naar
 * persistente `life_events`-rijen + een AOW-update.
 *
 * Gedeeld door de PDF-upload in de pensioen-strategie-editor zodat upload en
 * handmatige invoer EXACT dezelfde life_events-conventie volgen als
 * `eventFromPot`/`potFromEvent` (components/future/strategie/pensioen-strategie-editor.tsx).
 *
 * - Alleen `type: 'ouderdomspensioen'`-regelingen worden omgezet naar potten
 *   (nabestaanden-/AO-pensioen vallen bewust buiten de FIRE-tijdas).
 * - Het canonieke pensioentype komt uit `normalizePensionType(regeling.type)`
 *   (een onbekende parse-string als 'ouderdomspensioen' → 'bedrijf' = werknemerspensioen).
 * - AOW wordt alleen bijgewerkt als er al een `event_type:'aow'`-rij bestaat;
 *   we maken er bewust geen aan (consistent met de bestaande importflow).
 *
 * De Supabase-client wordt als argument doorgegeven (niet zelf geïmporteerd),
 * zodat de helper testbaar en herbruikbaar blijft.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePensionType } from '@/lib/horizon-data'
import type { PensionParseResult } from '@/app/api/pension/parse/route'

interface ApplyPensionParseResultArgs {
  supabase: SupabaseClient
  userId: string
  parseResult: PensionParseResult
  /** Aantal bestaande pensioenpotten — bepaalt de start van sort_order. */
  existingPensionCount: number
}

interface ApplyPensionParseResultOutcome {
  insertedCount: number
  aowUpdated: boolean
  error: string | null
}

export async function applyPensionParseResult({
  supabase,
  userId,
  parseResult,
  existingPensionCount,
}: ApplyPensionParseResultArgs): Promise<ApplyPensionParseResultOutcome> {
  const ouderdomsregelingen = parseResult.regelingen.filter(
    (r) => r.type === 'ouderdomspensioen',
  )

  let insertedCount = 0

  if (ouderdomsregelingen.length > 0) {
    const inserts = ouderdomsregelingen.map((regeling, index) => {
      const canonicalType = normalizePensionType(regeling.type)
      return {
        user_id: userId,
        name: regeling.fondsNaam || 'Aanvullend pensioen',
        event_type: 'pension',
        target_age: regeling.ingangLeeftijd,
        target_date: null,
        one_time_cost: 0,
        monthly_cost_change: 0,
        monthly_income_change: regeling.brutoBedrag,
        // Ouderdomspensioen = levenslang (consistent met de bedrijf-default in de editor).
        duration_months: 0,
        icon: canonicalType === 'bedrijf' ? 'Landmark' : 'PiggyBank',
        is_active: true,
        is_indexed: regeling.isGeindexeerd,
        sort_order: existingPensionCount + index + 1,
        metadata: {
          pensioenType: canonicalType,
          ingangLeeftijd: regeling.ingangLeeftijd,
          brutoBedrag: regeling.brutoBedrag,
          inlegBedrag: 0,
          uitkeringsduur: 'levenslang',
          isGeindexeerd: regeling.isGeindexeerd,
          partnerUitkeringPct: 70,
          source: 'upo_upload',
        },
      }
    })

    const { error: insertError } = await supabase.from('life_events').insert(inserts)
    if (insertError) {
      return { insertedCount: 0, aowUpdated: false, error: insertError.message }
    }
    insertedCount = inserts.length
  }

  // ── AOW-update: alleen bijwerken als er al een AOW-event bestaat. ──
  let aowUpdated = false
  if (parseResult.aowBedrag && parseResult.aowBedrag > 0) {
    const { data: aowEvent, error: aowFetchError } = await supabase
      .from('life_events')
      .select('id')
      .eq('user_id', userId)
      .eq('event_type', 'aow')
      .maybeSingle()

    if (aowFetchError) {
      // Potten zijn al ingevoegd; meld de AOW-fout maar verlies de inserts niet.
      return {
        insertedCount,
        aowUpdated: false,
        error: `AOW bijwerken mislukt: ${aowFetchError.message}`,
      }
    }

    if (aowEvent?.id) {
      const { error: aowUpdateError } = await supabase
        .from('life_events')
        .update({ monthly_income_change: parseResult.aowBedrag })
        .eq('id', aowEvent.id)

      if (aowUpdateError) {
        return {
          insertedCount,
          aowUpdated: false,
          error: `AOW bijwerken mislukt: ${aowUpdateError.message}`,
        }
      }
      aowUpdated = true
    }
  }

  return { insertedCount, aowUpdated, error: null }
}
