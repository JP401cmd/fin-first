import { createClient } from '@/lib/supabase/server'
import { decryptField } from '@/lib/crypto/field-encryption'
import { buildOwnAccountIdentifiers } from '@/lib/own-accounts'
import { isOwnAccountTransfer } from '@/lib/parsers/categorize'
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

    const [rulesRes, accountsRes, budgetsRes] = await Promise.all([
      supabase.from('user_own_ibans').select('match_type, match_value, iban').eq('user_id', user.id),
      // `iban_encrypted`, niet de plaintext kolom: Stage B dropt
      // `bank_accounts.iban`. `user_own_ibans.iban` is een handmatig ingevoerde
      // regel en valt buiten de veldencryptie — die blijft plaintext.
      supabase.from('bank_accounts').select('iban_encrypted').eq('user_id', user.id),
      supabase.from('budgets').select('id, slug').eq('user_id', user.id),
    ])

    // Per rij ontsleutelen mét twee tellers. Anders dan bij een cosmetisch
    // IBAN-staartje is een weggelaten rij hier géén schoonheidsfoutje: de IBAN is
    // hier een MATCH-identifier, dus een stil overgeslagen rekening betekent
    // transacties die eigen-rekening-verschuiving hadden moeten worden en dat niet
    // worden. Eén rommelige rij mag de hele herclassificatie niet laten vallen, dus
    // we slaan 'm over — maar wél zichtbaar in de serverlog.
    //
    // **Wat deze teller NIET kan zien** (securityreview 30 juli):
    // `decryptField(null)` gooit niet, hij geeft `null`. Een rij met een plaintext
    // IBAN maar een lege `iban_encrypted` valt dus stil uit de match zonder hier op
    // te vallen. Dat is hier bewust niet op te lossen: `iban_encrypted IS NULL` is
    // van deze kant niet te onderscheiden van "deze rekening heeft geen IBAN" (11
    // van de 28 rijen op remote hebben er geen), en een teller die daarop afgaat
    // zou bij normale data alarm slaan. De invariant hoort dus aan de SCHRIJFkant:
    // élke schrijver op `bank_accounts.iban` dual-writet `iban_encrypted` +
    // `iban_hash` (de OAuth-callback, `syncBankAccountCompanion`, `seed-persona`).
    // Na de Stage B-drop is de plaintext-kolom er niet meer en is dit verschil ook
    // niet langer denkbaar.
    let unreadableIbans = 0
    const accountIbans = ((accountsRes.data ?? []) as { iban_encrypted: string | null }[]).map((a) => {
      try {
        return decryptField(a.iban_encrypted)
      } catch {
        unreadableIbans++
        return null
      }
    })
    if (unreadableIbans > 0) {
      console.error(
        `[own-accounts:reclassify] ${unreadableIbans} bankrekening(en) met een onleesbare iban_encrypted overgeslagen — die matchen niet mee`,
      )
    }

    const ids = buildOwnAccountIdentifiers(rulesRes.data ?? [], accountIbans)
    if (ids.ibans.size === 0 && ids.namePatterns.length === 0) {
      return Response.json({ reclassified: 0, message: 'Geen eigen-rekening-regels ingesteld.' })
    }

    const eigenRekeningBudgetId = resolveEigenRekeningBudgetId(budgetsRes.data ?? [])

    // Kandidaten: alle transacties die nog géén transfer zijn (paginer i.v.m. 1000-cap).
    type Candidate = { id: string; counterparty_iban: string | null; counterparty_name: string | null }
    const candidates: Candidate[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, counterparty_iban, counterparty_name, transaction_type')
        .eq('user_id', user.id)
        .range(from, from + 999)
      if (error) break
      const rows = (data ?? []) as (Candidate & { transaction_type: string | null })[]
      for (const r of rows) {
        if (r.transaction_type === 'transfer' || r.transaction_type === 'joint_transfer') continue
        candidates.push({ id: r.id, counterparty_iban: r.counterparty_iban, counterparty_name: r.counterparty_name })
      }
      if (rows.length < 1000) break
    }

    const toReclassify = candidates.filter((c) =>
      isOwnAccountTransfer(c.counterparty_iban, ids.ibans, c.counterparty_name, ids.namePatterns),
    )

    let reclassified = 0
    const BATCH = 200
    for (let i = 0; i < toReclassify.length; i += BATCH) {
      const batchIds = toReclassify.slice(i, i + BATCH).map((t) => t.id)
      const { error } = await supabase
        .from('transactions')
        .update({
          transaction_type: 'transfer',
          category_source: 'transfer',
          budget_id: eigenRekeningBudgetId,
        })
        .in('id', batchIds)
      if (!error) reclassified += batchIds.length
    }

    return Response.json({ reclassified })
  } catch (error) {
    console.error('Reclassify own-account transfers error:', error)
    return Response.json({ error: 'Herclassificeren mislukt.' }, { status: 500 })
  }
}
