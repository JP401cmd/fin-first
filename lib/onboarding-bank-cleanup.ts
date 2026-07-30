import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * De onboarding-opruiming van lege `bank_accounts`-rijen — zónder de plaintext
 * kolom `bank_accounts.iban`.
 *
 * ## Waarom dit bestaat
 *
 * `POST /api/onboarding/save-own-data` ruimde vóór het herbouwen van de bezittingen
 * de placeholder-rekeningen van een eerdere onboarding-poging op met
 * `.delete().eq('user_id', me).eq('iban', '')`. Dat is een filter ÓP de kolom die
 * Stage B laat vallen: na de drop errort de hele delete en blijft de opruiming
 * geruisloos achterwege. Er moest dus een andere sleutel komen voor dezelfde rijen.
 *
 * ## Waarom "geen `iban_encrypted`" niet als sleutel op zichzelf kan
 *
 * De voor de hand liggende vertaling is `iban_encrypted IS NULL`: lege
 * rekeningnummers worden bewust nooit versleuteld (`ibanWriteColumns` geeft alle
 * drie de kolommen `null` terug, want `blindIndex('')` levert voor élke lege
 * rekening dezelfde hash). Dat klopt als *definitie* van "deze rekening heeft geen
 * IBAN", maar het is géén equivalent van `iban = ''`, en dat verschil is hier
 * levensgevaarlijk:
 *
 *  - `''` is een LEGACY-vorm. Elke moderne schrijver gaat via `ibanWriteColumns`
 *    en schrijft `iban: null`, nooit `''`. Op remote (30 juli) staan 28 rijen:
 *    2 met `iban = ''` — de rijen die het oude filter raakte — en 11 met
 *    `iban IS NULL`. `iban_encrypted IS NULL` matcht ze alle 13.
 *  - Van die 11 extra rijen dragen er vijf transacties: 8.758, 8.125, 7.975,
 *    1.980 en 172 stuks. `transactions.account_id` heeft ON DELETE **CASCADE**,
 *    dus de naïeve vertaling zou bij een herhaalde onboarding ruim 27.000
 *    transacties meesleuren. Stil, want de delete-fout wordt niet gelezen.
 *  - Eén van die rijen hangt aan een `bank_connection_accounts`-rij. Die FK heeft
 *    géén ON DELETE-clausule (= NO ACTION), dus de delete zou er hard op
 *    stuklopen — en omdat een `DELETE` één statement is, zou dan óók geen enkele
 *    échte placeholder meer opgeruimd worden.
 *
 * ## De sleutel die het wél is
 *
 * Exacte equivalentie is na de drop onmogelijk: `''` en `null` zijn dan
 * simpelweg niet meer uit elkaar te houden. We kiezen daarom de nauwste veilige
 * bovengrens — "leeg" in de volle betekenis van het woord:
 *
 *   geen IBAN  ∧  geen transacties  ∧  geen bankkoppeling
 *
 * Dat is per definitie een placeholder: er zit geen enkel gegeven in dat verloren
 * kan gaan. Op remote levert dat 6 rijen in plaats van 2; de vier extra zijn lege
 * companion-rijen van cash-bezittingen die de volgende regel in de onboarding-route
 * (`assets.delete().eq('asset_type','cash')`) tóch al weggooit — zonder deze
 * opruiming zouden ze als ontkoppelde wees achterblijven (`linked_asset_id` is
 * ON DELETE SET NULL).
 *
 * ## Waarom hier wél `.eq('user_id', ...)` staat
 *
 * De SELECT-policy op `bank_accounts` is huishoud-verbreed (eigen rijen ÓF
 * `ownership='shared'` binnen hetzelfde huishouden). Voor een LEES-pad is dat
 * precies goed (zie `/api/own-accounts/ibans`), maar dit is een destructief pad:
 * zonder eigenaarsfilter zou de kandidaatlijst de gedeelde rekening van de partner
 * bevatten. De DELETE-policy is eigen-rij en zou 'm weigeren, dus er lekt niets —
 * maar de opruiming zou dan wél stil minder doen dan ze rapporteert. Eigenaarschap
 * hoort hier expliciet in de query.
 */

/** De velden die de kandidaat-selectie nodig heeft. */
export interface BankAccountCleanupCandidate {
  id: string
  /** `null` = deze rekening heeft geen rekeningnummer (lege invoer wordt nooit versleuteld). */
  iban_encrypted: string | null
}

/**
 * Pure selectie: welke kandidaten zijn écht lege placeholders?
 *
 * @param candidates                 alle `bank_accounts`-rijen van de gebruiker.
 * @param accountIdsWithTransactions rekening-id's met minstens één transactie.
 * @param accountIdsWithConnection   rekening-id's waar een bankkoppeling aan hangt.
 */
export function selectEmptyBankAccountIds(
  candidates: readonly BankAccountCleanupCandidate[],
  accountIdsWithTransactions: ReadonlySet<string>,
  accountIdsWithConnection: ReadonlySet<string>,
): string[] {
  return candidates
    .filter((row) => row.iban_encrypted === null || row.iban_encrypted === undefined)
    .filter((row) => !accountIdsWithTransactions.has(row.id))
    .filter((row) => !accountIdsWithConnection.has(row.id))
    .map((row) => row.id)
}

/**
 * Verwijdert de lege placeholder-rekeningen van een eerdere onboarding-poging.
 *
 * Leest eerst, verwijdert daarna op id — bewust in twee stappen, omdat "geen
 * transacties" en "geen bankkoppeling" niet in één PostgREST-filter passen en de
 * blast radius van een blinde `delete()` op deze tabel te groot is (zie de
 * module-docstring).
 *
 * Faalt nooit hard: de onboarding-opslag mag niet stuklopen op de opruiming. Wél
 * altijd zichtbaar in de serverlog, zodat een stille no-op niet als succes leest.
 *
 * @returns het aantal daadwerkelijk verwijderde rijen (0 bij een fout).
 */
export async function deleteEmptyOnboardingBankAccounts(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, iban_encrypted')
    .eq('user_id', userId)

  if (error) {
    console.error('[onboarding-bank-cleanup] kandidaten niet te lezen — opruiming overgeslagen:', error)
    return 0
  }

  const withoutIban = ((data ?? []) as BankAccountCleanupCandidate[]).filter(
    (row) => row.iban_encrypted === null || row.iban_encrypted === undefined,
  )
  if (withoutIban.length === 0) return 0

  const ids = withoutIban.map((row) => row.id)

  // Per rekening tellen i.p.v. één `.in()`-select: een select zou op de
  // PostgREST-paginagrens (1000) afkappen en dan een rekening met duizenden
  // transacties als "leeg" kunnen aanmerken. Het aantal kandidaten is klein
  // (rekeningen zonder IBAN), dus dit is een handvol head-counts.
  const txCounts = await Promise.all(
    ids.map(async (id) => {
      const { count, error: txError } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', id)
      // Bij twijfel: behouden — en "twijfel" is hier NIET alleen een fout.
      // `count: 'exact', head: true` leidt het aantal af uit de Content-Range-
      // header; wordt die door een proxy gestript of verandert het Prefer-gedrag,
      // dan is `error` null én `count` null. Zou dat als 0 tellen, dan is een
      // rekening met duizenden transacties opeens "leeg" en neemt de delete ze
      // via ON DELETE CASCADE mee. Beide twijfelgevallen dus fail-closed.
      return [id, txError || count === null || count === undefined ? 1 : count] as const
    }),
  )
  const withTransactions = new Set(txCounts.filter(([, n]) => n > 0).map(([id]) => id))

  const { data: linked, error: linkError } = await supabase
    .from('bank_connection_accounts')
    .select('bank_account_id')
    .in('bank_account_id', ids)
  if (linkError) {
    console.error('[onboarding-bank-cleanup] bankkoppelingen niet te lezen — opruiming overgeslagen:', linkError)
    return 0
  }
  const withConnection = new Set(
    ((linked ?? []) as { bank_account_id: string | null }[])
      .map((row) => row.bank_account_id)
      .filter((id): id is string => typeof id === 'string'),
  )

  const deletable = selectEmptyBankAccountIds(withoutIban, withTransactions, withConnection)
  if (deletable.length === 0) return 0

  const { error: deleteError } = await supabase
    .from('bank_accounts')
    .delete()
    .eq('user_id', userId)
    .in('id', deletable)
  if (deleteError) {
    console.error('[onboarding-bank-cleanup] lege rekeningen niet te verwijderen:', deleteError)
    return 0
  }
  return deletable.length
}
