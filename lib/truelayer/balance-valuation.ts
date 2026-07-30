import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertSingleBalanceSnapshot } from '@/lib/balance-snapshot'

/**
 * HET HERWAARDERINGSSPOOR VAN DE BANKSYNC (fase 8, FR8).
 *
 * `syncAccountBalance` overschreef `bank_accounts.balance` en
 * `assets.current_value` zonder spoor: het netto vermogen verspringt, de
 * verloop-banden (ADR 0046 leest uitsluitend `balance_snapshots`) en de
 * herwaarderingshistorie weten niet waarom. Bank-saldi bewogen dus buiten het
 * pad om dat élke andere herwaardering in deze app volgt.
 *
 * Dat pad is: **een `valuations`-rij + een mirror naar `balance_snapshots`** —
 * exact wat `components/core/assets-client.tsx` (live herwaardering) en
 * `app/api/snapshots/entity-backfill/route.ts` (historische invoer) doen. Deze
 * module maakt de banksync de derde afnemer van datzelfde pad; ze definieert er
 * géén variant op.
 *
 * ## Laatste-van-de-dag wint — BESTAANDE semantiek, hier alleen vastgelegd
 *
 * Beide schrijfacties zijn upserts op een dagsleutel:
 * `valuations` op `unique (entity_id, valuation_date)` en `balance_snapshots` op
 * `unique (user_id, snapshot_date, entity_type, entity_id)`. Draaien een sync en
 * de snapshot-cron op dezelfde dag, dan komen ze op één rij samen en wint de
 * laatste schrijver. Dat is precies wat de handmatige herwaardering al deed
 * (twee keer op één dag een waarde invoeren levert ook één rij) en het is hier
 * niet opnieuw bedacht: één waarde per entiteit per dag is het contract van de
 * verloop-banden.
 *
 * ## Waarom de vorige waarde in `notes` staat
 *
 * `POST /api/bank-connect/relink` — het correctiemoment — moet een verkeerd
 * gelande koppeling kunnen terugdraaien. Sinds fase 1 schrijft de callback het
 * saldo al vóór dat moment, dus "relink is gratis want er is nog niets
 * geschreven" gaat niet meer op. De compensatie heeft de waarde nodig die de
 * banksync verving, en die is op dat moment nergens meer te vinden: de
 * dag-upsert kan een handmatige waardering van diezelfde dag hebben vervangen,
 * dus de rij ervóór in het grootboek is géén betrouwbare val-terug.
 *
 * De banksync-waardering legt daarom vast wát ze verving. Dat is geen truc maar
 * precies wat de bestaande live-herwaardering ook al in haar notitie zet
 * (`'Waarde bijgewerkt van X naar Y'`). Het verschil: dit formaat is machine-
 * leesbaar en het wordt door één module geschreven én gelezen, met een
 * heen-en-weer-test eroverheen. Wie het formaat wijzigt, breekt die test.
 *
 * ## Append-only
 *
 * De compensatie **verwijdert nooit** een waardering. Ze schrijft een nieuwe rij
 * met {@link BANK_SYNC_CORRECTION_NOTE} die de vorige waarde terugzet. Valt die
 * op dezelfde dag als de banksync-rij, dan vervangt de dag-upsert die rij — dat
 * is dezelfde laatste-van-de-dag-regel als hierboven, geen uitzondering.
 */

/** Markeert een waardering die door de banksync is geschreven. */
export const BANK_SYNC_VALUATION_NOTE = 'bank-sync'

/** Markeert de compenserende waardering van het correctiemoment. */
export const BANK_SYNC_CORRECTION_NOTE = 'bank-sync-correctie'

/** Scheidingsteken tussen de marker en de waarde in een notitie. */
const NOTE_SEPARATOR = ' · '

/**
 * Beide notities hebben dezelfde vorm — `<marker> · vorige waarde <bedrag>` —
 * en verschillen ALLEEN in hun marker. Dat is bewust: elke waardering legt vast
 * wát ze verving, en de marker is daarmee het enige onderscheid dat de parser
 * hoeft te maken.
 *
 * Daarom een geankerde marker en géén `startsWith('bank-sync')`:
 * `bank-sync-correctie` begint óók met `bank-sync`, en een compensatie die
 * zichzelf als banksync leest zou zichzelf compenseren — en dat oneindig vaak,
 * want elke ronde schrijft weer een nieuwe laatste waardering.
 */
const BANK_SYNC_NOTE_RE = /^bank-sync · vorige waarde (-?\d+(?:\.\d+)?)$/

/** Bedragen in hele centen — zelfde reden als in `lib/parsers/cross-source-dedup.ts`. */
function cents(value: number): number {
  return Math.round(value * 100)
}

/** Op de cent afgeronde waarde, zodat de notitie geen `1234.5000000001` draagt. */
function roundCents(value: number): number {
  return cents(value) / 100
}

/**
 * Zijn dit hetzelfde saldo? Vergelijking in hele centen, niet als double —
 * `2543.67 !== 2543.6700000000001` zou anders elke sync een waardering laten
 * schrijven en de herwaarderingshistorie vervuilen.
 */
export function isSameBalance(a: number, b: number): boolean {
  return cents(a) === cents(b)
}

/** `<marker> · vorige waarde <bedrag>` — de ene vorm, twee markers. */
function formatNote(marker: string, previous: number): string {
  return `${marker}${NOTE_SEPARATOR}vorige waarde ${roundCents(previous)}`
}

/** Notitie bij een banksync-waardering, mét de waarde die ze vervangt. */
export function formatBankSyncNote(previous: number): string {
  return formatNote(BANK_SYNC_VALUATION_NOTE, previous)
}

/**
 * Notitie bij de compenserende waardering van het correctiemoment. `replaced`
 * is het banksaldo dat wordt teruggedraaid — ook hier dus "de waarde die deze
 * waardering vervangt", zodat beide notities dezelfde vorm houden.
 */
export function formatBankSyncCorrectionNote(replaced: number): string {
  return formatNote(BANK_SYNC_CORRECTION_NOTE, replaced)
}

/**
 * De waarde die deze banksync-waardering verving, of `null` als de notitie geen
 * banksync-waardering is (handmatige herwaardering, historische invoer, een
 * eerdere compensatie, of een door de gebruiker overschreven notitie).
 *
 * `null` betekent hier "geen compensatie mogelijk", nooit "compenseer naar 0" —
 * gokken op een vermogenswaarde is erger dan niets doen.
 */
export function parseBankSyncPrevious(notes: string | null | undefined): number | null {
  if (!notes) return null
  const match = BANK_SYNC_NOTE_RE.exec(notes)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * De waarderingsdatum van een banksync: vandaag in `yyyy-mm-dd`.
 *
 * Zelfde afleiding als de live herwaardering in `assets-client.tsx`
 * (`new Date().toISOString().split('T')[0]`), zodat een banksync en een
 * handmatige herwaardering op dezelfde dag ook echt op dezelfde dagsleutel
 * landen. Consequentie, bewust aanvaard: de dag is UTC, dus tussen 00:00 en
 * 02:00 Nederlandse tijd hoort een sync bij de kalenderdag ervoor. Dat verschuift
 * een punt in de verloop-band, niet een bedrag.
 */
export function bankSyncValuationDate(now: Date = new Date()): string {
  return now.toISOString().split('T')[0]
}

/** De velden die een `balance_snapshots`-mirror van een bezitting nodig heeft. */
export type BankSyncAsset = {
  id: string
  name: string
  /** `assets.asset_type` — het subtype in de snapshot-mirror. */
  subtype: string
  netWorthInclusionPct: number | null
}

/**
 * Schrijf het herwaarderingsspoor van één banksaldo-wijziging.
 *
 * **Gooit bij een gefaalde `valuations`-write**, gelijk aan het contract van
 * `syncAccountBalance`: een saldo dat wél in `assets` staat maar niet in het
 * grootboek is precies de stille overschrijving die deze fase wegneemt.
 *
 * **De snapshot-mirror faalt zacht** (log, geen throw) — gelijk aan de live
 * herwaardering in `assets-client.tsx`, waar de mirror ook een bijwerking is van
 * de waardering en niet het doel. Anders dan in
 * `app/api/snapshots/entity-backfill/route.ts`, waar de mirror juist het
 * primaire doel is en een fout dus een 500 verdient.
 */
export async function recordBankBalanceRevaluation(
  supabase: SupabaseClient,
  opts: {
    userId: string
    asset: BankSyncAsset
    /** De waarde die het banksaldo vervangt. */
    previous: number
    /** Het nieuwe banksaldo. */
    value: number
    date: string
  },
): Promise<void> {
  const { error } = await supabase.from('valuations').upsert(
    {
      user_id: opts.userId,
      entity_type: 'asset',
      entity_id: opts.asset.id,
      valuation_date: opts.date,
      value: opts.value,
      notes: formatBankSyncNote(opts.previous),
    },
    { onConflict: 'entity_id,valuation_date' },
  )

  if (error) {
    throw new Error(`Herwaardering van het banksaldo wegschrijven mislukt: ${error.message}`)
  }

  const mirror = await upsertSingleBalanceSnapshot(supabase, opts.userId, opts.date, {
    type: 'asset',
    id: opts.asset.id,
    name: opts.asset.name,
    subtype: opts.asset.subtype,
    balance: opts.value,
    netWorthInclusionPct: opts.asset.netWorthInclusionPct,
  })

  if (!mirror.ok) {
    console.error('[truelayer:balance-valuation] snapshot-mirror van het banksaldo mislukt:', mirror.error)
  }
}

/** Uitkomst van {@link revertBankBalanceRevaluation}. */
export type BankBalanceRevertResult = {
  /** `true` als er een compenserende waardering is weggeschreven. */
  reverted: boolean
  /** Het banksaldo dat is teruggedraaid — alleen gevuld bij `reverted`. */
  from?: number
  /** De herstelde waarde — alleen gevuld bij `reverted`. */
  to?: number
}

type CarrierRow = { linked_asset_id: string | null }
type AssetRow = {
  id: string
  name: string
  asset_type: string
  current_value: number
  net_worth_inclusion_pct: number | null
}

/**
 * DE COMPENSERENDE WAARDERING — het correctiemoment maakt de banksync ongedaan.
 *
 * Verhangt de gebruiker een verkeerd gelande koppeling naar een andere rekening,
 * dan draagt de oude rekening nog het saldo dat de callback erop schreef. Deze
 * functie zet dat terug: **append-only**, met een nieuwe waardering die de vorige
 * waarde herstelt — nooit met een `delete` op het grootboek.
 *
 * Draait alleen als de LAATSTE waardering op de bezitting van de banksync is.
 * Staat er een nieuwere handmatige herwaardering overheen, dan heeft de gebruiker
 * de waarde zelf al vastgesteld en zou terugdraaien zíjn actie ongedaan maken.
 * Daarmee is de functie ook idempotent: na een geslaagde compensatie is de
 * laatste waardering de correctie, en een tweede aanroep doet niets.
 *
 * **Gooit niet.** Ze wordt aangeroepen nádat het verhangen zelf al is geslaagd
 * (zelfde volgorde en zelfde reden als `ensureCashAssetForBankAccount` in die
 * route): een gefaalde compensatie mag een geslaagde correctie niet in een 500
 * veranderen. Ze wordt gelogd, en het saldo is zelf te corrigeren met een
 * handmatige herwaardering. `reverted: true` betekent dat `assets.current_value`
 * écht terugstaat — niet dat alle drie de schrijfacties slaagden.
 */
export async function revertBankBalanceRevaluation(
  supabase: SupabaseClient,
  opts: { userId: string; bankAccountId: string; date?: string },
): Promise<BankBalanceRevertResult> {
  const date = opts.date ?? bankSyncValuationDate()

  // `user_id` expliciet: de SELECT-policy op `bank_accounts` is bréder dan
  // eigen-rij (huishoud-gedeelde partnerrijen komen erdoor), dus RLS is hier geen
  // vangnet — zelfde noot als bij `loadTargetAccount`.
  const { data: carrierData, error: carrierError } = await supabase
    .from('bank_accounts')
    .select('linked_asset_id')
    .eq('id', opts.bankAccountId)
    .eq('user_id', opts.userId)
    .maybeSingle()

  if (carrierError) {
    console.error('[truelayer:balance-valuation] drager niet te lezen voor compensatie:', carrierError)
    return { reverted: false }
  }

  const assetId = (carrierData as CarrierRow | null)?.linked_asset_id ?? null
  // Geen cash-bezit = de banksync heeft nooit `assets.current_value` geraakt en
  // er is dus geen herwaardering om te compenseren.
  if (!assetId) return { reverted: false }

  const { data: valuationData, error: valuationError } = await supabase
    .from('valuations')
    .select('valuation_date, value, notes')
    .eq('user_id', opts.userId)
    .eq('entity_type', 'asset')
    .eq('entity_id', assetId)
    .order('valuation_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (valuationError) {
    console.error('[truelayer:balance-valuation] grootboek niet te lezen voor compensatie:', valuationError)
    return { reverted: false }
  }

  const latest = valuationData as { valuation_date: string; value: number; notes: string | null } | null
  const previous = parseBankSyncPrevious(latest?.notes)
  if (latest === null || previous === null) return { reverted: false }

  const replaced = Number(latest.value)

  const { data: assetData, error: assetError } = await supabase
    .from('assets')
    .select('id, name, asset_type, current_value, net_worth_inclusion_pct')
    .eq('id', assetId)
    .eq('user_id', opts.userId)
    .maybeSingle()

  if (assetError || !assetData) {
    console.error('[truelayer:balance-valuation] bezitting niet te lezen voor compensatie:', assetError)
    return { reverted: false }
  }

  const asset = assetData as AssetRow

  // ── Volgorde: bezitting eerst, de markering LAATST ──────────────────────────
  // Dit is bewust de omgekeerde volgorde van `recordBankBalanceRevaluation` (en
  // van de live herwaardering), omdat de correctie-notitie hier dubbel werk doet:
  // ze is óók de idempotentie-poort. Zou ze eerst geschreven worden en de
  // bezitting-write dáárna falen, dan leest de volgende aanroep de correctie als
  // laatste waardering, geeft `parseBankSyncPrevious` null, en is de toestand —
  // grootboek hersteld, `assets.current_value` nog op het banksaldo van een bank
  // die de rekening niet meer draagt — niet meer zelf te herstellen.
  //
  // Met de bezitting eerst convergeert elke herhaling: mislukt zij, dan staat de
  // markering er nog en probeert een volgende aanroep exact hetzelfde opnieuw.
  const { data: updatedAsset, error: assetWriteError } = await supabase
    .from('assets')
    .update({ current_value: previous, updated_at: new Date().toISOString() })
    .eq('id', assetId)
    .eq('user_id', opts.userId)
    // `.select()`: een nul-rijen-update is stil in PostgREST. Zonder de
    // teruggegeven rij zou deze functie `reverted: true` melden over een
    // bezitting die het banksaldo gewoon houdt.
    .select('id')
    .maybeSingle()

  if (assetWriteError || !updatedAsset) {
    console.error(
      '[truelayer:balance-valuation] bezitting terugzetten mislukt — niets teruggedraaid:',
      assetWriteError ?? 'update raakte 0 rijen',
    )
    return { reverted: false }
  }

  // `bank_accounts.balance` gaat mee terug omdat `syncAccountBalance` hetzelfde
  // getal naar béide schrijft; de inverse van die schrijfactie raakt dus ook
  // beide. Eén van de twee terugzetten zou de drift creëren die deze module
  // juist hoort te voorkomen. Niet-fataal: de bezitting — de vermogensgrootheid
  // — staat al goed, en een volgende aanroep herstelt dit alsnog.
  const { error: carrierWriteError } = await supabase
    .from('bank_accounts')
    .update({ balance: previous, updated_at: new Date().toISOString() })
    .eq('id', opts.bankAccountId)
    .eq('user_id', opts.userId)

  if (carrierWriteError) {
    console.error('[truelayer:balance-valuation] banksaldo op de drager terugzetten mislukt:', carrierWriteError)
  }

  const mirror = await upsertSingleBalanceSnapshot(supabase, opts.userId, date, {
    type: 'asset',
    id: asset.id,
    name: asset.name,
    subtype: asset.asset_type,
    balance: previous,
    netWorthInclusionPct: asset.net_worth_inclusion_pct,
  })

  if (!mirror.ok) {
    console.error('[truelayer:balance-valuation] snapshot-mirror van de compensatie mislukt:', mirror.error)
  }

  // De markering sluit de rij: vanaf hier leest een volgende aanroep de
  // correctie als laatste waardering en doet niets meer.
  const { error: writeError } = await supabase.from('valuations').upsert(
    {
      user_id: opts.userId,
      entity_type: 'asset',
      entity_id: assetId,
      valuation_date: date,
      value: previous,
      notes: formatBankSyncCorrectionNote(replaced),
    },
    { onConflict: 'entity_id,valuation_date' },
  )

  if (writeError) {
    // Niet-fataal en niet `reverted: false`: het saldo ís teruggedraaid. Alleen
    // de markering ontbreekt, dus een volgende aanroep doet hetzelfde nog eens
    // — met dezelfde uitkomst.
    console.error('[truelayer:balance-valuation] compenserende waardering mislukt:', writeError)
  }

  return { reverted: true, from: replaced, to: previous }
}

/** Wat er op één dag door de banksync is overgenomen, per bezitting. */
export type BankSyncBalanceChange = { previous: number; current: number }

/**
 * De banksync-waarderingen van één dag, per `assets.id` — de bron van de melding
 * "saldo overgenomen van de bank" op de success-pagina.
 *
 * Server-afgeleid en niet via de redirect-URL: bedragen in een querystring
 * belanden in browserhistorie en serverlogs, en een door de client aangeleverd
 * "vorige saldo" zou een feit zijn dat de database al draagt (het patroon dat
 * fase 7, besluit 7 als ADR-kandidaat noteerde).
 *
 * Faalt zacht met een lege map: de melding is bevestiging, geen voorwaarde.
 */
export async function loadBankSyncBalanceChanges(
  supabase: SupabaseClient,
  opts: { userId: string; assetIds: string[]; date?: string },
): Promise<Map<string, BankSyncBalanceChange>> {
  const changes = new Map<string, BankSyncBalanceChange>()
  if (opts.assetIds.length === 0) return changes

  const date = opts.date ?? bankSyncValuationDate()

  const { data, error } = await supabase
    .from('valuations')
    .select('entity_id, value, notes')
    .eq('user_id', opts.userId)
    .eq('entity_type', 'asset')
    .eq('valuation_date', date)
    .in('entity_id', opts.assetIds)

  if (error) {
    console.error('[truelayer:balance-valuation] banksync-waarderingen niet te lezen:', error)
    return changes
  }

  for (const row of (data ?? []) as Array<{ entity_id: string; value: number; notes: string | null }>) {
    const previous = parseBankSyncPrevious(row.notes)
    if (previous === null) continue
    const current = Number(row.value)
    // Een waardering die niets veranderde wordt niet geschreven, maar een
    // gelijke waarde uit een ándere bron mag hier nooit als "overgenomen" lezen.
    if (isSameBalance(previous, current)) continue
    changes.set(String(row.entity_id), { previous, current })
  }

  return changes
}
