import type { SupabaseClient } from '@supabase/supabase-js'
import { blindIndex, decryptField, encryptField } from '@/lib/crypto/field-encryption'
import { accountTypeToCashSubtype } from '@/lib/account-types'
import { setBudgetTracking } from '@/lib/budget-tracking'

/**
 * CASH-AS-ASSET BACKFILL: zorg dat een `bank_accounts`-rij een gekoppeld
 * cash-bezit (`assets`) heeft.
 *
 * Waarom dit een eigen module is en niet inline in de callback blijft: er zijn
 * sinds fase 5 twee paden die een bestaande bankrekening tot drager van een
 * koppeling maken — de OAuth-callback (`external_account_id` / voorkeur /
 * `iban_hash`) en het correctiemoment (`POST /api/bank-connect/relink`). Landt de
 * koppeling op een rekening zónder bezit, dan schrijft de saldo-sync alleen
 * `bank_accounts.balance` en blijft de rekening onzichtbaar in élke
 * vermogens-/cash-oppervlak: die surfaces lezen `assets`. Twee kopieën van deze
 * stap zouden dus twee kansen op precies dat gat betekenen.
 *
 * Fase 7 (herkoppelen, SC-13) heeft hier het HERSTEL van een gedeactiveerd bezit
 * op gebouwd — dit is de plek waar dat hoort, niet een derde kopie. Sinds het
 * eigenaarsbesluit van 30 juli zet dat herstel béide assen terug: zichtbaarheid
 * (`assets.is_active`) én budgettracking (via `setBudgetTracking`, de ene
 * schrijver van die as). Zie {@link ensureCashAssetForBankAccount}.
 */

/**
 * De IBAN van een hergebruikte bankrekening dient hier één cosmetisch doel: de
 * laatste vier tekens in de assetnaam. `decryptField` gooit bij een ciphertext
 * zonder versie-prefix (niet-gebackfillde legacy-rij), en dát mag een
 * OAuth-callback nooit laten stranden — dan degradeert de naam liever naar
 * alleen de providernaam.
 */
export function decryptIbanForLabel(ciphertext: string | null): string | null {
  if (!ciphertext) return null
  try {
    return decryptField(ciphertext)
  } catch {
    return null
  }
}

export type CashAssetBackfillResult = {
  /** Het (bestaande of net aangemaakte) cash-bezit, of `null` als er niets te doen/te vinden was. */
  assetId: string | null
  /** `true` als deze aanroep het bezit heeft aangemaakt. */
  created: boolean
  /**
   * `true` als deze aanroep een BESTAAND, gedeactiveerd cash-bezit heeft HERSTELD
   * (SC-13): `assets.is_active` weer op `true` én — sinds het eigenaarsbesluit van
   * 30 juli — de budgettracking terug via `setBudgetTracking`. Additief veld, zodat
   * de aanroeper het kan melden zonder de bestaande twee velden anders te lezen.
   *
   * De naam is bewust niet meeverhuisd naar `restored`: dit veld is de wire-vorm
   * die de callback en `relink` al lezen, en een rename zou een puur cosmetische
   * wijziging in twee routes zijn. Wat het BETEKENT staat hier.
   */
  reactivated: boolean
}

/**
 * De ene reden waarom deze module bestaat, en het incident waar ze uit voortkomt:
 * de eigenaar "verwijderde" een rekening in de UI — functioneel `assets.is_active
 * = false` op het cash-bezit — en koppelde daarna opnieuw. De koppeling werkte,
 * het saldo klopte, en de rekening was **onzichtbaar**: `cash-overview.tsx`
 * filtert cash-bezittingen op `is_active !== false` vóórdat het de koppelstatus
 * bepaalt. Transacties en saldo kwamen dus binnen op een rij die nergens in de app
 * te zien was.
 *
 * Invariant sinds fase 7: **élk pad dat een bestaand cash-bezit hergebruikt
 * herstelt dat bezit.** Beide hergebruik-paden (de OAuth-callback stap 2b en
 * `POST /api/bank-connect/relink`) lopen via deze functie, dus hier staat de regel
 * één keer.
 *
 * ## Herstel = béide vlaggen (eigenaarsbesluit 30 juli)
 *
 * De "verwijder"-actie zet twee dingen uit: de bezitting (`assets.is_active`) én
 * de budgettering (`assets.has_budget_tracking` + de companion-rij). Fase 7 zette
 * alleen de eerste terug, met de motivatie "budgetteren is een eigen, zichtbare
 * keuze". In de praktijk leest dat als **half hersteld**: de rekening is weer
 * zichtbaar, de transacties komen binnen, maar ze doen in geen enkel budget mee —
 * en niets vertelt de gebruiker waarom. De eigenaar heeft daarom besloten dat
 * herstel béide assen terugzet, passend bij de invariant "hergebruik =
 * heractivatie".
 *
 * **De budget-as gaat via `setBudgetTracking`** (`lib/budget-tracking.ts`) en
 * nergens anders: dat is de ENE schrijver van dat drieluik
 * (`assets.has_budget_tracking` → companion-rij → de module-gate
 * `profiles.budgeting_active`). Hier met de hand `has_budget_tracking = true`
 * zetten zou de companion en de gate laten achterlopen — precies hoe die vlaggen
 * eerder uiteen zijn gelopen (bekend terugkerend defect). Als gevolg beweegt
 * `bank_accounts.is_active` nu wél mee: dát is hoe `syncBankAccountCompanion`
 * "budgetteren staat aan" uitdrukt, en dat is sinds dit besluit de bedoeling.
 *
 * **De volgorde is het punt.** Eerst de zichtbaarheid (`assets.is_active`), dan de
 * budget-as. Faalt de tweede, dan is de rekening in het ergste geval zíchtbaar
 * zonder budgettering — de toestand van vóór dit besluit, zelf-herstelbaar via de
 * bestaande toggle. Omgekeerd zou budgetteren aanstaan op een bezitting die nergens
 * te zien is. En deze hele functie draait pas ná de geslaagde koppelwrite (zie de
 * aanroepers), zodat een mislukte koppelpoging geen stille wijziging achterlaat.
 *
 * Gooit niet (zelfde contract als de rest van deze module): een gefaalde lezing of
 * write wordt gelézen en gelogd, en levert `false` — niet geslikt, en niet als
 * succes gemeld.
 */
async function restoreCashAssetIfDeactivated(
  supabase: SupabaseClient,
  userId: string,
  assetId: string,
): Promise<boolean> {
  const { data: asset, error: readError } = await supabase
    .from('assets')
    .select('id, is_active')
    .eq('id', assetId)
    .eq('user_id', userId)
    .maybeSingle()

  if (readError) {
    console.error('[truelayer:cash-asset-backfill] cash-bezit niet te lezen voor herstel:', readError)
    return false
  }

  // `is_active` is NOT NULL op `assets`; alleen een expliciete `false` is een
  // gedeactiveerd bezit. "Onbekend" (geen rij, of een null uit de
  // PostgREST-typering) is bewust géén reden om te schrijven.
  if (!asset || asset.is_active !== false) return false

  const { error: updateError } = await supabase
    .from('assets')
    // Alleen de zichtbaarheidsvlag; de budget-as hieronder heeft zijn eigen ENE
    // schrijver — zie de docstring.
    .update({ is_active: true })
    .eq('id', assetId)
    .eq('user_id', userId)

  if (updateError) {
    console.error('[truelayer:cash-asset-backfill] cash-bezit herstellen mislukt:', updateError)
    return false
  }

  // Pas hierna: de bezitting is nu zichtbaar, dus een gefaalde budget-write laat
  // een toestand achter die de gebruiker zelf ziet en met de bestaande toggle kan
  // rechtzetten.
  const tracking = await setBudgetTracking(supabase, userId, assetId, true)
  if (!tracking.ok) {
    // Wél loggen en niet slikken: de rekening is hersteld maar doet niet mee in de
    // budgetten, en dat is precies het "half herstelde" beeld dat dit besluit
    // wegneemt. De reactivatie zelf is geslaagd, dus het antwoord blijft `true`.
    console.error(
      '[truelayer:cash-asset-backfill] budgettracking terugzetten bij herstel mislukt:',
      tracking.error,
    )
  }

  return true
}

/**
 * Maak het cash-bezit bij als de bankrekening er nog geen heeft, en **herstel het
 * als het gedeactiveerd was** (SC-13, zie
 * {@link restoreCashAssetIfDeactivated} voor het waarom, de twee assen en de
 * volgorde).
 *
 * Idempotent en niet-destructief: een rekening die al een `linked_asset_id` heeft
 * houdt dat bezit — er komt nooit een tweede bij. `linked_asset_id` wordt nooit
 * genuld en de bestaande asset nooit overschreven; alleen haar `is_active` (van
 * `false` naar `true`) en haar `has_budget_tracking` (via `setBudgetTracking`)
 * bewegen bij een herstel — zie de invarianten in `lib/bank-account-companion.ts`.
 *
 * `user_id` staat expliciet in de lookup en dat is géén dubbelop: de
 * SELECT-policy op `bank_accounts` laat huishoud-gedeelde partnerrijen door
 * (zelfde redenering als `loadTargetAccount`). Zonder die filter zou dit pad een
 * cash-bezit op de eigen `user_id` kunnen hangen aan de bankrekening van een
 * partner.
 *
 * **Gooit niet.** Alle aanroepers zitten in een pad waar een half geslaagde
 * backfill erger is dan een uitgebleven backfill (de bestaande toggle en de
 * volgende koppelpoging herstellen 'm), dus fouten worden aan de aanroeper
 * teruggegeven als `assetId: null` — behalve harde programmeerfouten.
 */
export async function ensureCashAssetForBankAccount(
  supabase: SupabaseClient,
  opts: {
    userId: string
    bankAccountId: string
    /** Naam van de bank, voor de assetnaam en `institution`. */
    providerName: string
    /** IBAN uit de providerrespons, als die er is. Valt anders terug op de versleutelde kolom. */
    providerIban?: string | null
  },
): Promise<CashAssetBackfillResult> {
  // `iban_encrypted` i.p.v. de plaintext `iban`-kolom: Stage B dropt
  // `bank_accounts.iban` (aangekondigd in de scope-noot van
  // 20260713142000_drop_plaintext_bank_tokens.sql, dat zelf alleen de tokens
  // dropt); een plaintext-lezing hier zou dan hard breken, midden in de
  // OAuth-callback.
  const { data: reused } = await supabase
    .from('bank_accounts')
    .select('id, linked_asset_id, iban_encrypted, account_type')
    .eq('id', opts.bankAccountId)
    .eq('user_id', opts.userId)
    .maybeSingle()

  if (!reused) return { assetId: null, created: false, reactivated: false }

  // Hergebruik-tak: het bezit bestaat al. Niets aanmaken — maar wél garanderen dat
  // het zíchtbaar is én meedoet in de budgetten, want een koppeling op een
  // onzichtbare rij is precies het incident van SC-13 en een zichtbare rij zonder
  // budgettering leest als half hersteld.
  if (reused.linked_asset_id) {
    const assetId = reused.linked_asset_id as string
    const reactivated = await restoreCashAssetIfDeactivated(supabase, opts.userId, assetId)
    return { assetId, created: false, reactivated }
  }

  const assetIban = opts.providerIban ?? decryptIbanForLabel((reused.iban_encrypted as string | null) ?? null)
  const assetName = assetIban
    ? `${opts.providerName} ${assetIban.slice(-4)}`
    : opts.providerName

  // Het subtype komt uit het type dat op de bankrekening staat — dat is wat de
  // gebruiker (of B3, bij een via de bank aangemaakte rij) heeft vastgelegd. Een
  // hardgecodeerde 'checking' zou een spaarrekening als betaalrekening in het
  // vermogen zetten; precies de grondslagfout die B3 elders repareert.
  const subtype = accountTypeToCashSubtype(reused.account_type as string | null)

  const { data: backfillAsset, error: insertError } = await supabase
    .from('assets')
    .insert({
      user_id: opts.userId,
      name: assetName,
      asset_type: 'cash',
      current_value: 0,
      purchase_value: 0,
      expected_return: 0,
      monthly_contribution: 0,
      institution: opts.providerName,
      // Dual-write: plaintext for fallback + encrypted/hash for the
      // post-PR2 world where the plaintext column is gone.
      account_number: assetIban,
      account_number_encrypted: encryptField(assetIban),
      account_number_hash: assetIban ? blindIndex(assetIban) : null,
      // Een bestaande `bank_accounts`-rij bestaat alleen in de
      // gebruikersvocabulaire van ACCOUNT_TYPES, en dáár zit geen
      // krediet-/kaartrekening in — alle zes waarden zijn direct opneembaar
      // tegoed. De niet-liquide tak leeft dus bewust alleen in `mapAccountType`
      // (de bank-aanmaaktak), niet hier.
      is_liquid: true,
      subtype,
      has_budget_tracking: true,
      ownership: 'personal',
      net_worth_inclusion_pct: 100,
      is_active: true,
    })
    .select('id')
    .single()

  if (insertError || !backfillAsset) {
    console.error('[truelayer:cash-asset-backfill] cash-bezit aanmaken mislukt:', insertError)
    return { assetId: null, created: false, reactivated: false }
  }

  // De binding MOET slagen, anders staat er een zwevend €0-cash-bezit in de
  // vermogenslijst dat geen enkel pad opruimt — en meldt deze functie `created:
  // true` voor een backfill die niets heeft opgeleverd. De fout wordt daarom
  // gelezen en niet geslikt; het contract ("gooit niet") blijft intact omdat het
  // antwoord `assetId: null` is en de aanroeper daarop kan handelen.
  const { error: linkError } = await supabase
    .from('bank_accounts')
    .update({ linked_asset_id: backfillAsset.id })
    .eq('id', opts.bankAccountId)
    .eq('user_id', opts.userId)

  if (linkError) {
    console.error('[truelayer:cash-asset-backfill] koppelen van het cash-bezit mislukt:', linkError)
    return { assetId: null, created: false, reactivated: false }
  }

  // Een vers aangemaakt bezit staat per definitie op `is_active: true` (zie de
  // insert hierboven), dus `reactivated` is hier onwaar en niet "onbekend".
  return { assetId: backfillAsset.id as string, created: true, reactivated: false }
}
