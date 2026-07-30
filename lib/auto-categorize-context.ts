/**
 * Laadt de gedeelde context voor automatische categorisatie: gebruikersregels,
 * frequentie-historie en eigen-rekening-identifiers. Geëxtraheerd uit de
 * AICategorizeSheet zodat ook de Sleepmodus-overlay (suggestie-gloed +
 * ringslot-frequentie) dezelfde bron gebruikt.
 */

import { buildFrequencyMap, type CategoryCorrection } from '@/lib/parsers/categorize'
import { buildOwnAccountIdentifiers } from '@/lib/own-accounts'
import { fetchOwnAccountIbansStrict } from '@/lib/own-accounts-ibans'
import { resolveEigenRekeningBudgetId, type Budget } from '@/lib/budget-data'
import type { AutoCatContext } from '@/lib/auto-categorize'

// Bewust losjes getypeerd: werkt met zowel de browser- als de server-client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

/**
 * Laadt de categorisatiecontext voor de HUIDIGE gebruiker.
 *
 * **Client-only sinds de IBAN-encryptie.** De eigen rekening-IBANs komen niet
 * langer uit `bank_accounts.iban` (die kolom verdwijnt in Stage B) maar uit
 * `GET /api/own-accounts/ibans`, want ontsleutelen vraagt de server-only
 * sleutels. Een relatieve fetch werkt alleen in de browser; een serverpad dat
 * deze context ooit nodig heeft moet `decryptField` rechtstreeks gebruiken,
 * zoals `app/api/own-accounts/reclassify` doet. De guard hieronder maakt dat
 * expliciet in plaats van 'm als commentaar te laten verlopen.
 *
 * Gooit bij élke leesfout op de IBAN-set. Dat is bewust: `ownIbans` bepaalt of
 * een overboeking naar je eigen spaarrekening als verschuiving wordt herkend of
 * als uitgave wordt geboekt. Een stille lege set laat de app doorrekenen met
 * verkeerde cijfers; een throw laat de aanroeper kiezen wat hij toont.
 */
export async function loadAutoCatContext(
  supabase: SupabaseLike,
  budgets: Budget[],
): Promise<AutoCatContext> {
  if (typeof window === 'undefined') {
    throw new Error(
      'loadAutoCatContext draait alleen in de browser: de eigen rekening-IBANs komen ' +
      'via /api/own-accounts/ibans omdat de encryptiesleutels server-only zijn.',
    )
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Je bent niet (meer) ingelogd.')

  const [corrRes, ownRes, bankAccounts, freqMap] = await Promise.all([
    supabase.from('category_corrections').select('match_field, match_value, budget_id'),
    supabase.from('user_own_ibans').select('match_type, match_value, iban').eq('user_id', user.id),
    fetchOwnAccountIbansStrict(),
    buildFrequencyMap(user.id, supabase),
  ])

  const ids = buildOwnAccountIdentifiers(
    (ownRes.data ?? []) as { match_type?: string | null; match_value?: string | null; iban?: string | null }[],
    // Zelfde afbakening als vóór de omzetting: alleen ACTIEVE rekeningen tellen
    // mee als eigen-rekening-identifier. De route filtert bewust niet, zodat elke
    // consument zijn eigen (ongewijzigde) filter houdt.
    bankAccounts.filter((a) => a.is_active).map((a) => a.iban),
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
