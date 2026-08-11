import type { SupabaseClient } from '@supabase/supabase-js'
import { hasOwnAccountIdentifiers, type OwnAccountIdentifiers } from './own-accounts'
import { isOwnAccountTransfer } from './parsers/categorize'

/**
 * Zet bestaande transacties die matchen met de eigen-rekening-identifiers om naar
 * een verschuiving: het canonieke trio `transaction_type='transfer'`,
 * `category_source='transfer'` en het eigen-rekening-budget.
 *
 * ## Waarom dit een gedeelde helper is en niet in de route staat
 *
 * Er zijn twee aanroepers met exact dezelfde bedoeling: de bestaande
 * `POST /api/own-accounts/reclassify` (expliciete knop) en de nieuwe
 * `POST /api/own-accounts/rules` (opslaan in de instellingen-sheet zet de historie
 * meteen om). Twee kopieën van deze lus zouden onvermijdelijk uiteenlopen — en
 * een verschil hier is niet cosmetisch: de ene helft van de app zou een
 * overboeking als verschuiving boeken en de andere als échte uitgave, waarmee de
 * spaarquote afhangt van wélke knop je toevallig gebruikte.
 *
 * ## Twee dingen die deze functie bewust NIET doet
 *
 *  1. **Terugdraaien.** Een transactie die al `transfer` of `joint_transfer` is
 *     blijft ongemoeid. Dat dekt zowel de idempotentie (twee keer draaien is
 *     hetzelfde als één keer) als het handmatige pad: een overboeking die de
 *     gebruiker zelf via de sleepmodus of `manual-transfer-sheet` heeft gekoppeld
 *     mag niet stil van budget wisselen.
 *  2. **Scopen op `user_id` bij het lezen van de identifiers.** Dat gebeurt bij de
 *     aanroeper (`loadOwnAccountIdentifiers`), en dáár bewust NIET op
 *     `bank_accounts` — zie de uitleg in `app/api/own-accounts/ibans/route.ts`.
 *     Hier filteren we wél op `user_id`, en op ALLEBEI de kanten: de leesronde die
 *     de kandidaten bepaalt én de UPDATE die ze wegschrijft. Een SCHRIJF op de
 *     transacties van je partner is iets anders dan een LEES van de gedeelde
 *     rekening. Het filter op de UPDATE is vandaag redundant (RLS heeft
 *     `auth.uid() = user_id` in zowel `qual` als `with_check`, en de id's komen uit
 *     een gefilterde lees) — maar het stond er niet terwijl deze docblock beweerde
 *     van wel, en dat is de gevaarlijkste soort comment. Zie ook de teller-noot
 *     hieronder: zonder dit filter is "0 rijen geraakt" niet van "geslaagd" te
 *     onderscheiden.
 *
 * @param eigenRekeningBudgetId Doelbudget; `null` wanneer het plan geen
 *   eigen-rekening-post kent. De rijen worden dan alsnog als transfer gemarkeerd
 *   (dat is de grootheid die de spaarquote schoonhoudt) maar zonder budget.
 */
export async function reclassifyOwnAccountTransfers(
  supabase: SupabaseClient,
  userId: string,
  ids: OwnAccountIdentifiers,
  eigenRekeningBudgetId: string | null,
): Promise<{ reclassified: number }> {
  if (!hasOwnAccountIdentifiers(ids)) {
    return { reclassified: 0 }
  }

  // Kandidaten pagineren: PostgREST kapt elk antwoord stil af op `max_rows`
  // (1000), óók bij een hogere `.limit()`. Een enkele select zou dus bij een
  // gebruiker met veel historie geruisloos de helft laten staan — een halve
  // herclassificatie ziet er precies zo uit als een geslaagde.
  type Candidate = { id: string; counterparty_iban: string | null; counterparty_name: string | null }
  const candidates: Candidate[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, counterparty_iban, counterparty_name, transaction_type')
      .eq('user_id', userId)
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
    // `.select('id')` en tellen wat er TERUGKOMT — niet `+= batchIds.length`.
    //
    // Een UPDATE die door RLS nul rijen raakt geeft géén error. De oude teller
    // telde dus kandidaten en niet geschreven rijen, en dat getal gaat rechtstreeks
    // naar de gebruiker ("47 transacties omgezet naar Eigen rekening"). Zou iemand
    // ooit de "RLS is de scope"-redenering van `loadOwnAccountIdentifiers`
    // doortrekken naar de kandidaat-select hierboven, dan stromen partnerrijen
    // binnen, schrijft deze lus er nul van weg, en krijgt de gebruiker te horen dat
    // ze zijn omgezet. Herleiden i.p.v. ophogen — dezelfde importtoets die de
    // banksync toepast op `insertedRows`.
    const { data, error } = await supabase
      .from('transactions')
      .update({
        transaction_type: 'transfer',
        category_source: 'transfer',
        budget_id: eigenRekeningBudgetId,
      })
      .in('id', batchIds)
      .eq('user_id', userId)
      .select('id')
    if (!error) reclassified += (data ?? []).length
  }

  return { reclassified }
}
