/**
 * Laadt de gedeelde context voor automatische categorisatie: gebruikersregels,
 * frequentie-historie en eigen-rekening-identifiers. Geëxtraheerd uit de
 * AICategorizeSheet zodat ook de Sleepmodus-overlay (suggestie-gloed +
 * ringslot-frequentie) dezelfde bron gebruikt.
 */

import { buildFrequencyMap, type CategoryCorrection } from '@/lib/parsers/categorize'
import { buildOwnAccountIdentifiers } from '@/lib/own-accounts'
import { resolveEigenRekeningBudgetId, type Budget } from '@/lib/budget-data'
import type { AutoCatContext } from '@/lib/auto-categorize'

// Bewust losjes getypeerd: werkt met zowel de browser- als de server-client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export async function loadAutoCatContext(
  supabase: SupabaseLike,
  budgets: Budget[],
): Promise<AutoCatContext> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Je bent niet (meer) ingelogd.')

  const [corrRes, ownRes, bankRes, freqMap] = await Promise.all([
    supabase.from('category_corrections').select('match_field, match_value, budget_id'),
    supabase.from('user_own_ibans').select('match_type, match_value, iban').eq('user_id', user.id),
    supabase.from('bank_accounts').select('iban').eq('is_active', true),
    buildFrequencyMap(user.id, supabase),
  ])

  const ids = buildOwnAccountIdentifiers(
    (ownRes.data ?? []) as { match_type?: string | null; match_value?: string | null; iban?: string | null }[],
    ((bankRes.data ?? []) as { iban: string | null }[]).map((b) => b.iban),
  )

  return {
    budgets,
    corrections: (corrRes.data ?? []) as CategoryCorrection[],
    freqMap,
    ownIbans: ids.ibans,
    ownNamePatterns: ids.namePatterns,
    eigenRekeningBudgetId: resolveEigenRekeningBudgetId(budgets),
  }
}
