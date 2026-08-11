import { createClient } from '@/lib/supabase/server'
import { loadOwnAccountIdentifiers, hasOwnAccountIdentifiers } from '@/lib/own-accounts-server'
import { reclassifyOwnAccountTransfers } from '@/lib/own-accounts-reclassify'
import { resolveEigenRekeningBudgetId } from '@/lib/budget-data'

/**
 * Herclassificeer bestaande transacties als eigen-rekening-verschuiving op basis
 * van de geregistreerde identifiers (user_own_ibans: IBAN + naam-patronen) en de
 * IBANs van de eigen bankrekeningen. Matches worden transaction_type='transfer'
 * en landen op de "Eigen rekening"-post — zo verdwijnt de historische dubbeltelling
 * (bv. een opwaardering die nu als uitgave telt).
 *
 * Matcht alleen op IBAN/naam. Wallet-regels op basis van het bron-Type (bv. PayPal
 * "Type"-kolom) zijn alleen tijdens import beschikbaar; zulke historische regels
 * moeten via her-import of handmatig markeren worden gecorrigeerd.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    // De identifier-set (regels + eigen/gedeelde bankrekening-IBANs) komt uit de
    // gedeelde helper: de ontsleuteling-per-rij mét teller en de bewuste
    // afwezigheid van een eigenaarsfilter op `bank_accounts` staan dáár
    // gemotiveerd, en de bank-sync gebruikt exact dezelfde set.
    const [{ ids }, budgetsRes] = await Promise.all([
      loadOwnAccountIdentifiers(supabase, user.id),
      supabase.from('budgets').select('id, slug').eq('user_id', user.id),
    ])

    if (!hasOwnAccountIdentifiers(ids)) {
      return Response.json({ reclassified: 0, message: 'Geen eigen-rekening-regels ingesteld.' })
    }

    const eigenRekeningBudgetId = resolveEigenRekeningBudgetId(budgetsRes.data ?? [])

    // De omzetlus zelf staat in `lib/own-accounts-reclassify.ts` — gedeeld met
    // `POST /api/own-accounts/rules`, waar opslaan in de instellingen-sheet
    // dezelfde historie bijwerkt. Twee kopieën zouden hier onvermijdelijk
    // uiteenlopen, en dan hangt het van de gebruikte knop af of een overboeking
    // als verschuiving of als uitgave telt.
    const { reclassified } = await reclassifyOwnAccountTransfers(
      supabase,
      user.id,
      ids,
      eigenRekeningBudgetId,
    )

    return Response.json({ reclassified })
  } catch (error) {
    console.error('Reclassify own-account transfers error:', error)
    return Response.json({ error: 'Herclassificeren mislukt.' }, { status: 500 })
  }
}
