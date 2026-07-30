import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * De DOELREKENING van een bankkoppeling: welke `bank_accounts`-rij mag er één
 * dragen, volgt die rekening vandaag de budgetten, en draagt ze er al één?
 *
 * Eén plek voor die drie regels, want ze worden door vier kanten gelezen die
 * niet mogen uiteenlopen:
 *
 *  - `GET /api/bank-connect/accounts` — de keuzelijst in de wizard én in het
 *    correctiemoment op de success-pagina;
 *  - `POST /api/bank-connect/auth-link` — de grens die een client-geleverd id
 *    accepteert of afwijst;
 *  - `POST /api/bank-connect/relink` — het correctiemoment;
 *  - `GET /api/bank-connect/callback` — de her-toetsing op terugkomstmoment.
 *
 * Stond een regel op twee plekken, dan zou de lijst ooit iets tonen dat de route
 * weigert (of erger: omgekeerd).
 *
 * Zie `specs/bank-connect-doelrekening/plan.md`, fase 4 (geschiktheid) en fase 6
 * (FR5 — één actieve koppeling per rekening).
 */

/** De `bank_accounts`-velden waarop de geschiktheidsregel beslist. */
export type TargetAccountRow = {
  id: string
  name: string
  bank_name: string | null
  /**
   * De VERSLEUTELDE IBAN (`bank_accounts.iban_encrypted`), niet de plaintext
   * kolom — die verdwijnt in Stage B. Ontsleutel 'm met `decryptIbanForLabel`
   * en gebruik de uitkomst alleen voor het staartje (`ibanTail`): méér dan vier
   * tekens verlaat de server niet.
   */
  iban_encrypted: string | null
  is_active: boolean
  linked_asset_id: string | null
}

/** Het cash-bezit achter de rekening, als er één is. */
export type TargetAssetRow = {
  id: string
  /** Bestaat de bezitting nog? (`assets.is_active`) */
  is_active: boolean
  /** Volgt ze de budgetten? (`assets.has_budget_tracking`; `null` = nooit gezet) */
  has_budget_tracking: boolean | null
}

/**
 * Wat `GET /api/bank-connect/accounts` per kandidaat-rekening teruggeeft — de
 * wire-vorm die de wizard consumeert.
 *
 * Woont hier en niet in het route-bestand: een `'use client'`-component mag geen
 * module uit `app/api/**` importeren, ook niet type-only.
 */
export type TargetAccountOption = {
  id: string
  name: string
  bank_name: string | null
  /** Laatste vier tekens van de IBAN — méér verlaat de server niet. */
  iban_tail: string | null
  transaction_count: number
  oldest_transaction_date: string | null
  newest_transaction_date: string | null
  /**
   * Volgt deze rekening vandaag de budgetten/transacties? `false` → de wizard
   * toont het voorgevinkte "neem deze rekening mee in mijn budgetten" (B2).
   */
  budget_tracking: boolean
  /**
   * De bank van de ACTIEVE koppeling die er al op zit, of `null` als de rekening
   * vrij is. Sinds fase 6 (FR5) is dit géén losse toelichting meer maar HET
   * kiesbaarheidsfeit: niet-`null` = niet kiesbaar, in de wizard uitgeschakeld en
   * op `auth-link`/`relink` een 409. Bewust geen tweede boolean ernaast — dat
   * zou een tweede bron voor hetzelfde feit zijn; lees het via
   * {@link isSelectableTargetOption}.
   *
   * `null` betekent ook "vrij" wanneer de koppeling zacht ontkoppeld is
   * (`is_active = false`): zo'n rekening mág weer gekozen worden, en dat is
   * precies het reconnect-pad dat de callback hergebruikt.
   */
  linked_provider_name: string | null
  /**
   * Wat de eerste ophaal gaat doen als de koppeling hier landt — berekend met
   * `planInitialFetch`, de eigenaar van het startpunt-contract (fase 1). De UI
   * bouwt hier GÉÉN tweede "−3 dagen" mee.
   */
  fetch_plan: { mode: 'incremental' | 'historical'; start_date: string }
}

/**
 * Kolommen die {@link loadTargetAccount} en de keuzelijst-route nodig hebben.
 *
 * `iban_encrypted` en NIET de plaintext `iban`-kolom: die wordt in Stage B
 * gedropt (aangekondigd in de scope-noot van
 * `20260713142000_drop_plaintext_bank_tokens.sql`). Zou deze SELECT de
 * plaintext-kolom houden, dan zou de drop de keuzelijst laten 500'en en
 * degradeerde de wizard stil naar "alleen een nieuwe rekening aanmaken" —
 * dezelfde doctrine die de callback en `cash-asset-backfill.ts` al volgen.
 */
export const TARGET_ACCOUNT_SELECT = 'id, name, bank_name, iban_encrypted, is_active, linked_asset_id'
export const TARGET_ASSET_SELECT = 'id, is_active, has_budget_tracking'

/**
 * Mag deze rekening een bankkoppeling dragen?
 *
 * Twee gevallen mogen wél, en dat is minder streng dan "`is_active`" alleen:
 *
 *  - **actief** — het normale geval;
 *  - **inactief mét een nog bestaand cash-bezit** — dat is precies hoe
 *    `syncBankAccountCompanion` "budgetteren staat uit" uitdrukt. Die rekeningen
 *    afwijzen zou het voorgevinkte "neem deze rekening mee in mijn budgetten"
 *    (besluit B2) onbereikbaar maken: het vinkje bestáát juist voor deze groep.
 *
 * Wat niet mag:
 *
 *  - een rekening waarvan het cash-bezit is gedeactiveerd — die is nergens in de
 *    app zichtbaar, dus saldo en transacties zouden stil binnenkomen (SC-13). Het
 *    herstelpad van fase 7 reactiveert zo'n bezitting bewust; dat is een ander
 *    pad met een eigen afweging, geen vrije keuze in de wizard;
 *  - een inactieve rekening zónder cash-bezit — er is geen bezitting om te
 *    heractiveren en geen canoniek pad om haar in de cash-oppervlakken terug te
 *    brengen.
 */
export function isEligibleTargetAccount(
  account: Pick<TargetAccountRow, 'is_active' | 'linked_asset_id'>,
  asset: TargetAssetRow | undefined | null,
): boolean {
  if (asset && !asset.is_active) return false
  return account.is_active || !!asset
}

/**
 * Volgt deze rekening vandaag de budgetten/transacties?
 *
 * `false` betekent: de wizard toont het voorgevinkte budget-vinkje (B2). Met een
 * cash-bezit wint `assets.has_budget_tracking`, want dát is de kolom die
 * `syncBankAccountCompanion` als bron gebruikt; zonder bezit ís
 * `bank_accounts.is_active` de vlag.
 *
 * Beide voorwaarden staan er bewust naast elkaar: liepen de twee vlaggen ooit
 * uit elkaar (bekend terugkerend defect), dan leest dit als "nee" en herstelt het
 * vinkje ze allebei — in plaats van de drift te verbergen.
 */
export function accountFollowsBudgets(
  account: Pick<TargetAccountRow, 'is_active'>,
  asset: TargetAssetRow | undefined | null,
): boolean {
  if (!account.is_active) return false
  return asset ? asset.has_budget_tracking !== false : true
}

/** Normaliseert een `assets`-rij naar {@link TargetAssetRow}. */
export function toTargetAssetRow(row: {
  id: string
  is_active: boolean | null
  has_budget_tracking: boolean | null
}): TargetAssetRow {
  return {
    id: row.id,
    // `is_active` is NOT NULL op `assets`; de coalesce is er voor de
    // PostgREST-typering, en "onbekend" hoort hier als "bestaat nog" te lezen —
    // een bezitting verbergen op grond van een ontbrekende vlag zou erger zijn.
    is_active: row.is_active !== false,
    has_budget_tracking: row.has_budget_tracking,
  }
}

/**
 * Haal één kandidaat-doelrekening op, of `null` als hij niet bestaat, niet van
 * deze gebruiker is, of niet geschikt is.
 *
 * **`user_id` staat er expliciet bij en dat is géén dubbelop.** De SELECT-policy
 * op `bank_accounts` is bréder dan eigen-rij: ze laat óók huishoud-gedeelde
 * partnerrijen door (`ownership = 'shared' AND household_id =
 * user_household_id()`). RLS is hier dus geen vangnet. Een koppeling op een
 * partnerrekening zou (a) transacties op de `user_id` van de koppelaar zetten
 * terwijl dedup en unieke index per gebruiker sleutelen — duplicaten die geen
 * enkele laag vangt, (b) de partner blokkeren zodra fase 6 één actieve koppeling
 * per rekening op databaseniveau afdwingt, en (c) via de historie-tellers in de
 * wizard andermans uitgavenvolume prijsgeven. Zelfde redenering als
 * `ExistingHashScope` in `lib/truelayer/existing-hashes.ts`.
 *
 * Het antwoord maakt bewust géén verschil tussen "bestaat niet", "niet van jou"
 * en "niet geschikt": de aanroeper hoort er één client-veilige 400 van te maken,
 * zonder existentie-orakel op andermans id's.
 */
export async function loadTargetAccount(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<{ account: TargetAccountRow; asset: TargetAssetRow | null } | null> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select(TARGET_ACCOUNT_SELECT)
    .eq('id', accountId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const account = data as unknown as TargetAccountRow
  let asset: TargetAssetRow | null = null

  if (account.linked_asset_id) {
    const { data: assetRow, error: assetError } = await supabase
      .from('assets')
      .select(TARGET_ASSET_SELECT)
      .eq('id', account.linked_asset_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (assetError) throw assetError
    if (assetRow) {
      asset = toTargetAssetRow(assetRow as unknown as { id: string; is_active: boolean | null; has_budget_tracking: boolean | null })
    }
  }

  if (!isEligibleTargetAccount(account, asset)) return null

  return { account, asset }
}

// ─────────────────────────────────────────────────────────────────────────────
// FR5 (fase 6) — één ACTIEVE koppeling per TriFinity-rekening
// ─────────────────────────────────────────────────────────────────────────────

/** De actieve koppeling die al op een rekening zit. */
export type OccupyingLink = {
  /** `bank_connection_accounts.id` */
  id: string
  /** De TriFinity-rekening die hij draagt. */
  bankAccountId: string
  /** `bank_connections.provider_name`, of `null` als die ontbreekt. */
  providerName: string | null
}

/** Kolommen waarmee een bezette rekening te benoemen is (bank erbij, voor de melding). */
const OCCUPYING_LINK_SELECT = 'id, bank_account_id, bank_connections(provider_name)'

type OccupyingLinkRow = {
  id: string
  bank_account_id: string | null
  bank_connections:
    | { provider_name: string | null }
    | { provider_name: string | null }[]
    | null
}

function toOccupyingLink(row: OccupyingLinkRow): OccupyingLink | null {
  if (!row.bank_account_id) return null
  // PostgREST levert een ingebedde 1-relatie soms als object, soms als array.
  const conn = Array.isArray(row.bank_connections) ? row.bank_connections[0] : row.bank_connections
  return {
    id: row.id,
    bankAccountId: row.bank_account_id,
    providerName: conn?.provider_name ?? null,
  }
}

/**
 * Alle rekeningen van deze gebruiker die al een ACTIEVE bankkoppeling dragen,
 * gesleuteld op `bank_accounts.id`.
 *
 * **`is_active` is de hele regel.** Een zacht ontkoppelde rij bezet niets — dat
 * is precies de rij die de callback bij een reconnect hergebruikt in plaats van
 * dupliceert, en dezelfde grens die de partiële unieke index
 * `bank_connection_accounts_one_active_per_bank_account` hanteert. Wie hier ooit
 * `is_active` weghaalt, blokkeert het herstelpad van fase 7.
 *
 * `user_id` expliciet: de policy op deze tabel is eigen-rij, dus dubbelop — maar
 * het houdt de eigenaarschapseis leesbaar naast de tabellen waar RLS bréder is.
 * Zie de noot bij {@link loadTargetAccount}.
 */
export async function loadOccupyingLinks(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, OccupyingLink>> {
  const { data, error } = await supabase
    .from('bank_connection_accounts')
    .select(OCCUPYING_LINK_SELECT)
    .eq('user_id', userId)
    .eq('is_active', true)
    .not('bank_account_id', 'is', null)

  if (error) throw error

  const byAccount = new Map<string, OccupyingLink>()
  for (const row of (data ?? []) as unknown as OccupyingLinkRow[]) {
    const link = toOccupyingLink(row)
    if (link) byAccount.set(link.bankAccountId, link)
  }
  return byAccount
}

/**
 * Draagt déze rekening al een actieve koppeling? `null` = vrij.
 *
 * `exceptConnectionAccountId` is er voor het correctiemoment: de koppeling die
 * zelf verhuisd wordt bezet haar eigen huidige rekening niet — anders zou
 * "opslaan zonder te wijzigen" een 409 opleveren.
 */
export async function loadOccupyingLink(
  supabase: SupabaseClient,
  userId: string,
  bankAccountId: string,
  options: { exceptConnectionAccountId?: string } = {},
): Promise<OccupyingLink | null> {
  let query = supabase
    .from('bank_connection_accounts')
    .select(OCCUPYING_LINK_SELECT)
    .eq('user_id', userId)
    .eq('bank_account_id', bankAccountId)
    .eq('is_active', true)

  if (options.exceptConnectionAccountId) {
    query = query.neq('id', options.exceptConnectionAccountId)
  }

  const { data, error } = await query.limit(1).maybeSingle()

  if (error) throw error
  if (!data) return null

  return toOccupyingLink(data as unknown as OccupyingLinkRow)
}

/**
 * Eén NL-tekst voor "deze rekening is al bezet", op alle oppervlakken gelijk:
 * de 409 van `auth-link`, de 409 van `relink` en de uitleg onder de
 * uitgeschakelde optie in de wizard.
 *
 * De melding noemt de uitweg, want zonder die regel is de blokkade een dood
 * eind: wie van bron wil wisselen moet éérst de oude koppeling verbreken.
 */
export function occupiedTargetAccountMessage(providerName: string | null): string {
  return providerName
    ? `Deze rekening is al gekoppeld aan ${providerName}. Verbreek die koppeling eerst bij de rekening; daarna kun je hem aan een andere bank koppelen.`
    : 'Deze rekening draagt al een bankkoppeling. Verbreek die eerst bij de rekening; daarna kun je hem aan een andere bank koppelen.'
}

/**
 * Val-terug-label voor een bezette rekening waarvan de bank niet te lezen is.
 *
 * Klein maar niet cosmetisch: `TargetAccountOption.linked_provider_name` IS het
 * kiesbaarheidsfeit, dus `null` betekent daar "vrij". Zou een bezette rekening
 * met een onbekende banknaam `null` opleveren, dan werd ze in de wizard weer
 * kiesbaar en liep de gebruiker alsnog tegen de 409 van `auth-link` aan.
 * `bank_connections.provider_name` is vandaag NOT NULL — dit is de belofte dat
 * dat geen stille voorwaarde is.
 */
export const UNKNOWN_OCCUPYING_PROVIDER_LABEL = 'een andere bank'

/**
 * De wire-waarde van `linked_provider_name`: de banknaam als de rekening bezet
 * is, `null` als ze vrij is — en nooit `null` bij een bezette rekening.
 */
export function occupyingProviderLabel(link: OccupyingLink | undefined | null): string | null {
  if (!link) return null
  return link.providerName ?? UNKNOWN_OCCUPYING_PROVIDER_LABEL
}

/** De vaste 400-tekst: één antwoord voor "bestaat niet", "niet van jou" en "niet geschikt". */
export const TARGET_ACCOUNT_UNAVAILABLE_MESSAGE = 'Deze rekening bestaat niet of is niet van jou'

/**
 * De VOLLEDIGE toets op een client-geleverde doelrekening — eigenaarschap,
 * geschiktheid én FR5 in één aanroep, zodat geen aanroeper er de helft van kan
 * vergeten.
 *
 * Twee afwijzingen met een eigen betekenis, en daarom een eigen HTTP-status:
 *
 *  - `unavailable` → **400**. Bestaat niet, is niet van jou, of is niet geschikt.
 *    Bewust één antwoord voor die drie: geen existentie-orakel op andermans id's.
 *  - `occupied` → **409**. De rekening bestáát en is van jou, maar draagt al een
 *    actieve koppeling. Dat is een toestand die de gebruiker zelf kan opheffen,
 *    dus die verdient een eigen melding mét uitweg in plaats van dezelfde
 *    onbruikbare 400.
 */
export type TargetAccountResolution =
  | { ok: true; account: TargetAccountRow; asset: TargetAssetRow | null }
  | { ok: false; reason: 'unavailable'; message: string }
  | { ok: false; reason: 'occupied'; message: string }

export async function resolveTargetAccount(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  options: { exceptConnectionAccountId?: string } = {},
): Promise<TargetAccountResolution> {
  const target = await loadTargetAccount(supabase, userId, accountId)
  if (!target) {
    return { ok: false, reason: 'unavailable', message: TARGET_ACCOUNT_UNAVAILABLE_MESSAGE }
  }

  // Pas ná eigenaarschap: een bezet-melding op andermans rekening zou verklappen
  // dat die rekening bestaat én gekoppeld is.
  const occupying = await loadOccupyingLink(supabase, userId, target.account.id, options)
  if (occupying) {
    return {
      ok: false,
      reason: 'occupied',
      message: occupiedTargetAccountMessage(occupying.providerName),
    }
  }

  return { ok: true, account: target.account, asset: target.asset }
}

/**
 * Is deze kandidaat kiesbaar als doelrekening? (FR5)
 *
 * Puur, want beide UI's lezen hem: de wizardstap (`target-account-choice.tsx`) en
 * het correctiemoment (`carrier-correction.tsx`). Zonder deze ene predikaat zou
 * de ene lijst iets aanbieden dat de route met een 409 weigert.
 *
 * @param currentCarrierId De rekening die de te verhangen koppeling NÚ draagt.
 *   Die blijft kiesbaar — anders zou het correctiemoment zijn eigen
 *   voorselectie uitschakelen en "opslaan zonder wijziging" onmogelijk maken.
 */
export function isSelectableTargetOption(
  option: Pick<TargetAccountOption, 'id' | 'linked_provider_name'>,
  currentCarrierId?: string | null,
): boolean {
  if (currentCarrierId && option.id === currentCarrierId) return true
  return option.linked_provider_name === null
}
