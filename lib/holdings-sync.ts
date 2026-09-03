import { createClient } from '@/lib/supabase/server'
import { getEURRateSync } from '@/lib/forex'
import {
  computePositionFromTransactions,
  HOLDINGS_TX_AGG_LIMIT,
  type PositionAggregate,
  type PositionTransaction,
} from '@/lib/holdings-aggregation'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export interface HoldingAggregatesSync {
  /** False als de holding-update faalde (best-effort). */
  synced: boolean
  /** Het WEGGESCHREVEN aantal eenheden — geklemd op 0 (zie `historyIncomplete`). */
  units: number
  /** Herberekende gemiddelde kostprijs (= engine avgCost). */
  avgPurchasePrice: number
  /**
   * True wanneer de engine een negatieve positie afleidde: er is méér verkocht
   * dan volgens de bekende historie ooit is gekocht. Dat is geen short-positie
   * maar een gat in de historie — meestal een transactie-export waarvan het
   * venster niet tot de oorspronkelijke aankoop terugreikt.
   */
  historyIncomplete: boolean
  /** De volledige engine-aggregatie, ONGEklemd (`aggregate.netUnits` kan negatief zijn). */
  aggregate: PositionAggregate
}

/**
 * Herbereken units + avg_purchase_price van een holding uit de VOLLEDIGE
 * transactiehistorie via de canonieke engine (computePositionFromTransactions)
 * en schrijf ze terug op de holding-rij. DE bron voor de opgeslagen aggregaten
 * na elke transactie-mutatie (create/update/delete van een `*_transactions`-rij),
 * zodat het opgeslagen veld nooit kan afwijken van de transactie-afgeleide
 * waarde die de detail-pane toont (fix: holding-detail toonde inconsistente
 * kostenbasis — ingelegd + koerswinst ≠ marktwaarde).
 *
 * Consume, don't recompute: geen eigen average-cost-loop hier — we consumeren
 * exact dezelfde engine die de detail-pane en de full-page-detail gebruiken,
 * zodat elke surface hetzelfde gewogen gemiddelde ziet. Fees worden bewust NIET
 * meegestuurd (net als de detail-fetch): ze beïnvloeden alleen het gerealiseerde
 * resultaat, niet de op te slaan units/avgCost.
 *
 * Precisie: `avg_purchase_price` is een ongescaalde NUMERIC-kolom, dus de
 * volledige engine-waarde blijft exact behouden — geen afronding die opnieuw een
 * (sub-cent) afwijking t.o.v. de detail-pane introduceert.
 */
export async function syncHoldingAggregatesFromTransactions(
  supabase: SupabaseLike,
  tables: { holdings: string; transactions: string },
  holdingId: string,
  userId: string,
): Promise<HoldingAggregatesSync> {
  const { data: txRows } = await supabase
    .from(tables.transactions)
    .select('type, units, price_per_unit, total_amount, date, created_at')
    .eq('holding_id', holdingId)
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(HOLDINGS_TX_AGG_LIMIT)

  // NUMERIC-kolommen komen via PostgREST als string terug; de engine's interne
  // `num()`-cast normaliseert dat, dus we geven de rauwe waarden ongewijzigd door.
  const txs: PositionTransaction[] = (txRows ?? []).map((t) => {
    const row = t as {
      type: unknown
      units: number | string | null
      price_per_unit: number | string | null
      total_amount: number | string | null
      date: string | null
    }
    return {
      type: String(row.type ?? ''),
      units: row.units ?? 0,
      price_per_unit: row.price_per_unit ?? 0,
      total_amount: row.total_amount ?? null,
      date: row.date ?? null,
    }
  })

  const agg = computePositionFromTransactions(txs)

  // Een negatieve netto-positie is geen bezit maar een gat in de historie: er
  // is meer verkocht dan volgens de bekende transacties ooit is gekocht (het
  // klassieke geval: een transactie-export waarvan het venster niet tot de
  // oorspronkelijke aankoop terugreikt). `investment_holdings.units` draagt een
  // gehouden aantal, en alles wat erop rekent — de waarde-rollup naar
  // `assets.current_value`, portefeuillegewichten, Box 3 — zou zo'n getal als
  // negatieve waarde meenemen. We klemmen daarom op 0 en melden het apart.
  // Verliesloos: de transacties blijven staan, dus zodra de ontbrekende aankoop
  // alsnog geïmporteerd wordt, herleidt dezelfde engine de juiste positie.
  const historyIncomplete = agg.netUnits < 0
  const storedUnits = historyIncomplete ? 0 : agg.netUnits

  const { error } = await supabase
    .from(tables.holdings)
    .update({
      units: storedUnits,
      avg_purchase_price: agg.avgCost,
      updated_at: new Date().toISOString(),
    })
    .eq('id', holdingId)
    .eq('user_id', userId)

  return {
    synced: !error,
    units: storedUnits,
    avgPurchasePrice: agg.avgCost,
    historyIncomplete,
    aggregate: agg,
  }
}

/**
 * Notitietekst op de synthetische openingstransactie. Bewust herkenbaar in de
 * UI-transactielijst: de gebruiker moet kunnen zien dat deze rij is afgeleid en
 * niet door hemzelf is gelogd (en hem desgewenst kunnen corrigeren/verwijderen).
 */
export const OPENING_TRANSACTION_NOTE =
  'Openingspositie — automatisch afgeleid uit het aantal en de gemiddelde aankoopprijs die bij het aanmaken van deze positie zijn ingevoerd.'

export interface OpeningTransactionResult {
  /** True als er daadwerkelijk een openingsrij is weggeschreven. */
  created: boolean
  /**
   * Waarom er wel/niet is aangemaakt:
   *   - `created`      — openingsrij weggeschreven
   *   - `has_history`  — er stonden al transacties; niets te herstellen
   *   - `no_position`  — holding heeft geen positief aantal eenheden
   *   - `read_failed`  — bestaande historie/holding niet leesbaar (bewust NIET
   *                      aanmaken: een niet-verifieerbare staat mag geen
   *                      dubbele openingspositie opleveren)
   *   - `insert_failed`— insert geweigerd door DB
   */
  reason:
    | 'created'
    | 'has_history'
    | 'no_position'
    | 'read_failed'
    | 'insert_failed'
  /** Aantal eenheden op de aangemaakte openingsrij (0 wanneer niets is gemaakt). */
  units: number
  /** Prijs per eenheid op de aangemaakte openingsrij. */
  pricePerUnit: number
  /** ISO-datum van de aangemaakte openingsrij, of null. */
  date: string | null
}

/** `YYYY-MM-DD` uit een ISO-timestamp of date-string; null bij onbruikbare invoer. */
function isoDatePart(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 10) return null
  const head = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null
}

/**
 * Herstel de ontbrekende openingspositie van een holding die via quick-add is
 * aangemaakt (WF-BEZIT-15-bug1).
 *
 * Het probleem: `POST /api/holdings` schrijft `units`/`avg_purchase_price` als
 * statische kolommen ZONDER bijbehorende transactierij. Zodra de gebruiker
 * daarna zijn eerste transactie logt, herleidt
 * `syncHoldingAggregatesFromTransactions` de positie uitsluitend uit
 * `*_transactions` en overschrijft die statische velden — de oorspronkelijke
 * stukken verdampen stil (100 @ €10 + koop 50 @ €14 gaf 50 eenheden i.p.v.
 * 150). De aggregatie-engine is niet fout: hij is per ontwerp de single source
 * of truth. De quick-add-route brak die invariant door bezit vast te leggen
 * zonder onderliggende transactie.
 *
 * Deze helper dicht dat gat op het moment dat het ertoe doet: vlak vóór de
 * eerste transactie-log wordt de bestaande statische positie omgezet in een
 * echte `buy`-rij. Dat is bewust de gekozen richting (optie B) en niet "altijd
 * een openingsrij schrijven bij quick-add" (optie A), omdat B óók de holdings
 * repareert die vandaag al zonder historie in de database staan — zonder
 * aparte backfill.
 *
 * Idempotent op de enige manier die telt: er wordt alleen geschreven wanneer de
 * transactietabel voor deze holding aantoonbaar leeg is. Kan dat niet gelezen
 * worden, dan doen we niets (`read_failed`) — liever de bestaande bug dan een
 * verdubbelde positie.
 *
 * @param notLaterThan Datum van de transactie die de gebruiker nu logt. De
 *   openingsrij wordt hierop geklemd zodat hij nooit ná de nieuwe transactie
 *   sorteert. Dat is essentieel bij een eerste log van type `sell`: een verkoop
 *   die vóór zijn eigen aankoop valt levert een negatieve tussenstand op, en
 *   `syncHoldingAggregatesFromTransactions` klemt zo'n historie op 0 eenheden.
 */
export async function ensureOpeningTransaction(
  supabase: SupabaseLike,
  tables: { holdings: string; transactions: string },
  holdingId: string,
  userId: string,
  notLaterThan?: string | null,
): Promise<OpeningTransactionResult> {
  const none: OpeningTransactionResult = {
    created: false,
    reason: 'has_history',
    units: 0,
    pricePerUnit: 0,
    date: null,
  }

  // 1. Bestaat er al historie? Eén rij is genoeg om te weten dat de holding
  //    transactie-gedreven is en er niets te herstellen valt.
  const { data: existing, error: existingError } = await supabase
    .from(tables.transactions)
    .select('id')
    .eq('holding_id', holdingId)
    .eq('user_id', userId)
    .limit(1)

  if (existingError) return { ...none, reason: 'read_failed' }
  if (existing && existing.length > 0) return none

  // 2. Lees de statische positie. Kolomlijst is bucket-afhankelijk:
  //    `crypto_holdings` heeft geen `purchase_date`, en een select op een
  //    niet-bestaande kolom laat de hele query falen.
  const columns =
    tables.holdings === 'investment_holdings'
      ? 'units, avg_purchase_price, purchase_date, created_at'
      : 'units, avg_purchase_price, created_at'

  const { data: holdingRow, error: holdingError } = await supabase
    .from(tables.holdings)
    .select(columns)
    .eq('id', holdingId)
    .eq('user_id', userId)
    .maybeSingle()

  if (holdingError || !holdingRow) return { ...none, reason: 'read_failed' }

  const row = holdingRow as unknown as {
    units: number | string | null
    avg_purchase_price: number | string | null
    purchase_date?: string | null
    created_at?: string | null
  }

  const units = Number(row.units)
  if (!Number.isFinite(units) || units <= 0) {
    return { ...none, reason: 'no_position' }
  }

  // Een ontbrekende aankoopprijs wordt €0: de EENHEDEN zijn wat verloren gaat,
  // en die redden we hoe dan ook. De kostenbasis is dan even onvolledig als de
  // invoer was, en de gebruiker kan de openingsrij zelf bijstellen.
  const rawPrice = Number(row.avg_purchase_price)
  const pricePerUnit = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 0

  // Datum: aankoopdatum → aanmaakdatum van de holding → vandaag; daarna
  // geklemd op de datum van de transactie die nu gelogd wordt.
  const today = new Date().toISOString().slice(0, 10)
  let date =
    isoDatePart(row.purchase_date) ?? isoDatePart(row.created_at) ?? today
  const clamp = isoDatePart(notLaterThan)
  if (clamp && date > clamp) date = clamp

  const { error: insertError } = await supabase
    .from(tables.transactions)
    .insert({
      holding_id: holdingId,
      user_id: userId,
      type: 'buy',
      units,
      price_per_unit: pricePerUnit,
      total_amount: units * pricePerUnit,
      date,
      notes: OPENING_TRANSACTION_NOTE,
    })

  if (insertError) {
    return { ...none, reason: 'insert_failed' }
  }

  return { created: true, reason: 'created', units, pricePerUnit, date }
}

/**
 * Aggregate all active investment_holdings for a given asset and write the
 * EUR-converted total back onto `assets.current_value`. Foreign-currency
 * positions are converted via cached/fallback FX rates. Errors are swallowed:
 * the rollup is a best-effort side-effect of writes from sync paths and CSV
 * imports — it must never fail the calling operation.
 */
export async function syncAssetValueFromInvestmentHoldings(
  supabase: SupabaseLike,
  assetId: string,
  userId: string
): Promise<{ synced: boolean; totalValue: number }> {
  try {
    const { data: holdings } = await supabase
      .from('investment_holdings')
      .select('units, current_price, avg_purchase_price, currency')
      .eq('asset_id', assetId)
      .eq('user_id', userId)
      .eq('is_active', true)

    // Alleen overschrijven als er daadwerkelijk holdings-rijen zijn. Een lege
    // array (0 rijen) is GEEN geldige grond om `assets.current_value` op 0 te
    // zetten — dat wist een reeds ingevoerde, geldige waarde (S0-dataverlies,
    // WF-BEZIT-21: een crypto-holding die per abuis in de andere tabel belandde
    // liet deze query leeg terugkomen en nulde de bestaande €20.000). `null` =
    // query-fout, `[]` = geen rijen: in beide gevallen de waarde met rust laten.
    if (!holdings || holdings.length === 0) return { synced: false, totalValue: 0 }

    const totalValue = holdings.reduce((sum, h) => {
      const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
      const currency = (h.currency as string) || 'EUR'
      const eurRate = getEURRateSync(currency)
      const units = (h.units as number) ?? 0
      return sum + price * units * eurRate
    }, 0)

    await supabase
      .from('assets')
      .update({ current_value: totalValue })
      .eq('id', assetId)
      .eq('user_id', userId)

    return { synced: true, totalValue }
  } catch {
    return { synced: false, totalValue: 0 }
  }
}

/**
 * Aggregate all active crypto_holdings for a given asset and write the EUR
 * total onto the parent asset. crypto_holdings.current_price is already in EUR
 * by contract (the new schema dropped the polymorphic `currency` column for
 * crypto), so no FX conversion is needed. Fiat balances inside an exchange
 * (`is_fiat_balance = true`) ARE included so the asset reflects the user's
 * total exchange value, not just the crypto positions.
 */
export async function syncAssetValueFromCryptoHoldings(
  supabase: SupabaseLike,
  assetId: string,
  userId: string
): Promise<{ synced: boolean; totalValue: number }> {
  try {
    const { data: holdings } = await supabase
      .from('crypto_holdings')
      .select('units, current_price, avg_purchase_price')
      .eq('asset_id', assetId)
      .eq('user_id', userId)
      .eq('is_active', true)

    // Zie `syncAssetValueFromInvestmentHoldings`: 0 gevonden rijen mag NOOIT een
    // bestaande, geldige `assets.current_value` naar 0 overschrijven. `null` =
    // query-fout, `[]` = geen rijen — beide laten de waarde ongemoeid.
    if (!holdings || holdings.length === 0) return { synced: false, totalValue: 0 }

    const totalValue = holdings.reduce((sum, h) => {
      const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
      const units = (h.units as number) ?? 0
      return sum + price * units
    }, 0)

    await supabase
      .from('assets')
      .update({ current_value: totalValue })
      .eq('id', assetId)
      .eq('user_id', userId)

    return { synced: true, totalValue }
  } catch {
    return { synced: false, totalValue: 0 }
  }
}

/**
 * Dispatch to the correct rollup helper based on `assets.asset_type`. Use this
 * from sync code paths that don't already know whether the asset is investment-
 * or crypto-typed (e.g. CSV import which only has the asset_id). When the type
 * is already known statically, prefer the dedicated helper.
 */
export async function syncAssetValueByType(
  supabase: SupabaseLike,
  assetId: string,
  userId: string,
  assetType?: string | null
): Promise<{ synced: boolean; totalValue: number }> {
  let resolvedType = assetType
  if (!resolvedType) {
    const { data: asset } = await supabase
      .from('assets')
      .select('asset_type')
      .eq('id', assetId)
      .eq('user_id', userId)
      .maybeSingle()
    resolvedType = (asset?.asset_type as string | undefined) ?? null
  }

  if (resolvedType === 'crypto') {
    return syncAssetValueFromCryptoHoldings(supabase, assetId, userId)
  }
  return syncAssetValueFromInvestmentHoldings(supabase, assetId, userId)
}

/**
 * Back-compat shim. Existing callers that still call the old generic name get
 * routed to the dispatcher. New code should use the dedicated helpers.
 *
 * @deprecated Use `syncAssetValueByType`, `syncAssetValueFromInvestmentHoldings`,
 *             or `syncAssetValueFromCryptoHoldings` directly.
 */
export async function syncAssetValueFromHoldings(
  supabase: SupabaseLike,
  assetId: string,
  userId: string
): Promise<{ synced: boolean; totalValue: number }> {
  return syncAssetValueByType(supabase, assetId, userId)
}

/**
 * Returns whether the asset currently has any active holdings (investment or
 * crypto) plus the EUR-equivalent total value. Used by the asset-edit UI to
 * warn that manual current_value edits will be overwritten on the next sync.
 */
export async function assetHasActiveHoldings(
  supabase: SupabaseLike,
  assetId: string,
  userId: string
): Promise<{ hasHoldings: boolean; holdingsCount: number; totalValue: number }> {
  try {
    const { data: asset } = await supabase
      .from('assets')
      .select('asset_type')
      .eq('id', assetId)
      .eq('user_id', userId)
      .maybeSingle()

    const isCrypto = (asset?.asset_type as string | undefined) === 'crypto'

    if (isCrypto) {
      const { data: holdings } = await supabase
        .from('crypto_holdings')
        .select('units, current_price, avg_purchase_price')
        .eq('asset_id', assetId)
        .eq('user_id', userId)
        .eq('is_active', true)

      if (!holdings || holdings.length === 0) {
        return { hasHoldings: false, holdingsCount: 0, totalValue: 0 }
      }

      const totalValue = holdings.reduce((sum, h) => {
        const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
        const units = (h.units as number) ?? 0
        return sum + price * units
      }, 0)

      return { hasHoldings: true, holdingsCount: holdings.length, totalValue }
    }

    const { data: holdings } = await supabase
      .from('investment_holdings')
      .select('units, current_price, avg_purchase_price, currency')
      .eq('asset_id', assetId)
      .eq('user_id', userId)
      .eq('is_active', true)

    if (!holdings || holdings.length === 0) {
      return { hasHoldings: false, holdingsCount: 0, totalValue: 0 }
    }

    const totalValue = holdings.reduce((sum, h) => {
      const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
      const currency = (h.currency as string) || 'EUR'
      const eurRate = getEURRateSync(currency)
      const units = (h.units as number) ?? 0
      return sum + price * units * eurRate
    }, 0)

    return { hasHoldings: true, holdingsCount: holdings.length, totalValue }
  } catch {
    return { hasHoldings: false, holdingsCount: 0, totalValue: 0 }
  }
}

/**
 * Batch-variant van `assetHasActiveHoldings`: geeft de subset van `assetIds`
 * terug die minstens één actieve holding heeft (investment óf crypto). Doet
 * exact 2 queries ongeacht het aantal assets (i.p.v. 1 lookup + 1 query per
 * asset), zodat de check-in- en herwaardeer-pagina's niet langer N+1 fetchen.
 *
 * Een asset_id komt per definitie in maar één holdings-tabel voor, dus de union
 * van beide tabellen geeft precies dezelfde uitkomst als de asset_type-switch in
 * `assetHasActiveHoldings`. De `.eq('user_id', userId)`-filter blijft identiek,
 * dus geen cross-user-lek: holdings-RLS is own-row en een partner-asset levert
 * hier — net als in het single-asset-pad — géén treffer op.
 *
 * Ids worden gededupliceerd; een lege lijst geeft een lege Set zonder query.
 */
export async function assetsWithActiveHoldings(
  supabase: SupabaseLike,
  assetIds: string[],
  userId: string
): Promise<Set<string>> {
  const result = new Set<string>()

  const uniqueIds = Array.from(new Set(assetIds))
  if (uniqueIds.length === 0) return result

  try {
    const [investmentRes, cryptoRes] = await Promise.all([
      supabase
        .from('investment_holdings')
        .select('asset_id')
        .in('asset_id', uniqueIds)
        .eq('user_id', userId)
        .eq('is_active', true),
      supabase
        .from('crypto_holdings')
        .select('asset_id')
        .in('asset_id', uniqueIds)
        .eq('user_id', userId)
        .eq('is_active', true),
    ])

    for (const row of investmentRes.data ?? []) {
      const id = (row as { asset_id: string | null }).asset_id
      if (id) result.add(id)
    }
    for (const row of cryptoRes.data ?? []) {
      const id = (row as { asset_id: string | null }).asset_id
      if (id) result.add(id)
    }
  } catch {
    // Best-effort: bij een fout geeft de UI simpelweg geen lock aan, net als het
    // single-asset-pad dat bij een error has_holdings=false teruggeeft.
    return result
  }

  return result
}
