import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  syncAssetValueFromInvestmentHoldings,
  syncHoldingAggregatesFromTransactions,
} from '@/lib/holdings-sync'
import { fingerprintHeaders, diffHeaders, type FormatId } from '@/lib/parsers/format-contracts'
import { recordContractEvent } from '@/lib/contract-events'
import { getServiceClient } from '@/lib/supabase/service'
import { unauthorized, badRequest, serverError } from '@/lib/api/respond'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportHolding {
  name: string
  ticker: string | null
  isin: string | null
  units: number
  avg_purchase_price: number
  current_price: number | null
  purchase_date: string | null
  exchange: string | null
  asset_id: string | null
  external_trade_id?: string | null
}

interface ImportTransaction {
  holding_index: number
  type: 'buy' | 'sell' | 'dividend'
  units: number
  price_per_unit: number
  total_amount: number
  date: string | null
  fees: number
  notes: string | null
  external_trade_id?: string | null
}

// Import mode — welke van de twee hangt af van WAT er geüpload wordt:
// - 'snapshot': het bestand is de VOLLEDIGE portefeuille van één bezitting (een
//   positie-export). Matches VERVANGEN aantal/prijs (geen optelling) en
//   posities van die bezitting die er niet in staan worden zacht gedeactiveerd
//   (verkocht) — hetzelfde bestand nogmaals uploaden verandert dus niets.
// - 'append': het bestand is ONVOLLEDIG — een transactiehistorie over een
//   gekozen periode. Aantallen worden opgeteld en er wordt NOOIT gedeactiveerd,
//   want wat niet in de periode viel bezit je gewoon nog. Mét `targetAssetId`
//   blijft dat binnen één bezitting; zonder is het het legacy-pad over de hele
//   portefeuille (backward-compatible, niet meer gebruikt door de wizard).
type ImportMode = 'snapshot' | 'append'

interface ImportRequestBody {
  holdings: ImportHolding[]
  transactions: ImportTransaction[]
  broker: string
  // Optional; defaults to 'append'. Snapshot mode requires a target asset.
  mode?: ImportMode
  // The asset a snapshot import reconciles against. Required for 'snapshot',
  // unless `newAssetName` is given — then the asset is created here first.
  targetAssetId?: string
  /**
   * Naam voor een NIEUW aan te maken beleggings-bezitting (snapshot-modus).
   * Alternatief voor `targetAssetId`: de wizard laat de gebruiker een doel
   * kiezen, en "+ Nieuwe belegging" landt op dit veld. Precies één van beide.
   */
  newAssetName?: string
  /**
   * Wis eerst ALLE bestaande posities van de doel-bezitting (harde delete).
   * Alleen geldig in snapshot-modus. De FK's op `investment_transactions`,
   * `investment_holding_prices` en `holding_alerts` staan op ON DELETE CASCADE,
   * dus transactie-, koers- en alerthistorie van die posities verdwijnt mee.
   * Zonder deze vlag blijft het bestaande snapshot-gedrag: matches vervangen,
   * ontbrekende posities zacht deactiveren (als verkocht).
   */
  clearExisting?: boolean
  /**
   * Kolomnamen uit de header-rij van het geüploade CSV-bestand (Laag A-runtime).
   * Alleen NAMEN — nooit rij-data of financiële waarden.
   * Optioneel voor backward-compatibility; ontbrekend veld slaat drift-check over.
   */
  headerNames?: string[]
}

// ---------------------------------------------------------------------------
// Broker-id → FormatId mapping (Laag A-runtime contract-bewaking)
// ---------------------------------------------------------------------------
// Broker-id's in de import-route gebruiken underscores (legacy); FORMAT_CONTRACTS
// gebruikt hyphens. Alleen broker-CSV-formaten — bank-CSV valt buiten scope (ADR).
const BROKER_TO_FORMAT_ID: Partial<Record<string, FormatId>> = {
  degiro:       'degiro-portfolio',   // portfolio-export is de meest gebruikte
  saxo:         'saxo',
  ing_beleggen: 'ing-beleggen',
  trading212:   'trading212',
  etoro:        'etoro',
} as const

const VALID_BROKERS = ['degiro', 'saxo', 'ing_beleggen', 'trading212', 'etoro']
const VALID_TX_TYPES = ['buy', 'sell', 'dividend']
const VALID_MODES: ImportMode[] = ['snapshot', 'append']

// Simple RFC 4122 UUID shape check — targetAssetId must be a uuid.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Bovengrens voor de naam van een in de wizard aangemaakte bezitting. */
const MAX_ASSET_NAME_LENGTH = 80

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateHolding(h: unknown, index: number): string | null {
  if (!h || typeof h !== 'object') {
    return `Holding ${index}: moet een object zijn`
  }
  const obj = h as Record<string, unknown>

  if (!obj.name || typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    return `Holding ${index}: naam is verplicht`
  }
  if (typeof obj.units !== 'number' || isNaN(obj.units) || obj.units < 0) {
    return `Holding ${index}: units moet een positief getal zijn`
  }
  if (typeof obj.avg_purchase_price !== 'number' || isNaN(obj.avg_purchase_price) || obj.avg_purchase_price < 0) {
    return `Holding ${index}: avg_purchase_price moet een positief getal zijn`
  }
  if (obj.current_price !== null && obj.current_price !== undefined) {
    if (typeof obj.current_price !== 'number' || isNaN(obj.current_price) || obj.current_price < 0) {
      return `Holding ${index}: current_price moet een positief getal of null zijn`
    }
  }
  return null
}

function validateTransaction(tx: unknown, index: number, holdingsLength: number): string | null {
  if (!tx || typeof tx !== 'object') {
    return `Transactie ${index}: moet een object zijn`
  }
  const obj = tx as Record<string, unknown>

  if (typeof obj.holding_index !== 'number' || obj.holding_index < 0 || obj.holding_index >= holdingsLength) {
    return `Transactie ${index}: holding_index (${obj.holding_index}) valt buiten bereik (0-${holdingsLength - 1})`
  }
  if (!obj.type || !VALID_TX_TYPES.includes(obj.type as string)) {
    return `Transactie ${index}: type moet 'buy', 'sell' of 'dividend' zijn`
  }
  if (typeof obj.units !== 'number' || isNaN(obj.units) || obj.units < 0) {
    return `Transactie ${index}: units moet een positief getal zijn`
  }
  if (typeof obj.price_per_unit !== 'number' || isNaN(obj.price_per_unit) || obj.price_per_unit < 0) {
    return `Transactie ${index}: price_per_unit moet een positief getal zijn`
  }
  if (typeof obj.total_amount !== 'number' || isNaN(obj.total_amount)) {
    return `Transactie ${index}: total_amount moet een getal zijn`
  }
  if (typeof obj.fees !== 'number' || isNaN(obj.fees) || obj.fees < 0) {
    return `Transactie ${index}: fees moet een positief getal zijn`
  }
  return null
}

// ---------------------------------------------------------------------------
// POST /api/holdings/import — Bulk import investment_holdings + investment_transactions
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  try {
    let body: ImportRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ongeldig JSON-formaat in request body' }, { status: 400 })
    }

    // --- Top-level validation ---

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body moet een JSON-object zijn' }, { status: 400 })
    }

    if (!Array.isArray(body.holdings) || body.holdings.length === 0) {
      return NextResponse.json({ error: 'Holdings array is verplicht en mag niet leeg zijn' }, { status: 400 })
    }

    if (!Array.isArray(body.transactions)) {
      return NextResponse.json({ error: 'Transactions moet een array zijn' }, { status: 400 })
    }

    if (!body.broker || !VALID_BROKERS.includes(body.broker)) {
      return NextResponse.json({
        error: `Broker moet een van de volgende zijn: ${VALID_BROKERS.join(', ')}`,
      }, { status: 400 })
    }

    // --- Laag A-runtime: header-drift detectie op broker-CSV-uploads ---
    //
    // Alleen kolomNAMEN + hash bereiken de DB — nooit rij-data of financiële
    // waarden (privacy by construction). Bank-CSV-runtime-drift is bewust
    // overgeslagen: die wordt gedekt door de statische contracttest (format-
    // contracts.test.ts) en vereist extra plumbing in de cash-import-route.
    //
    // Defensief: mag de import NOOIT afbreken — try/catch slikt alle fouten.
    if (Array.isArray(body.headerNames) && body.headerNames.length > 0) {
      // Valideer dat headerNames alleen strings bevat (nooit waarden)
      const safeHeaderNames = body.headerNames.filter(
        (h): h is string => typeof h === 'string',
      )
      const formatId = BROKER_TO_FORMAT_ID[body.broker]
      if (formatId && safeHeaderNames.length > 0) {
        try {
          const [fingerprint, diff] = await Promise.all([
            fingerprintHeaders(safeHeaderNames),
            Promise.resolve(diffHeaders(safeHeaderNames, formatId)),
          ])
          const hasDrift = diff.missing.length > 0 || diff.unexpected.length > 0
          if (hasDrift) {
            // Severity: 'error' als verplichte kolommen ontbreken (missing),
            // anders 'warn' voor onverwachte extra kolommen (unexpected).
            const severity = diff.missing.length > 0 ? 'error' : 'warn'
            const service = getServiceClient()
            await recordContractEvent(service, {
              kind: 'format_drift',
              surface: body.broker,
              severity,
              fingerprint,
              // diff bevat uitsluitend kolomNAMEN — geen financiële waarden.
              diff: {
                missing:    diff.missing,
                unexpected: diff.unexpected,
              },
            })
          }
        } catch {
          // Logging mag de import NOOIT breken.
        }
      }
    }

    // --- Resolve import mode (default 'append' = backward-compatible) ---

    const mode: ImportMode = body.mode ?? 'append'
    if (!VALID_MODES.includes(mode)) {
      return NextResponse.json({
        error: `Mode moet een van de volgende zijn: ${VALID_MODES.join(', ')}`,
      }, { status: 400 })
    }

    // De doel-bezitting bakent de hele import af: matchen, aanmaken, wissen en
    // (alleen in snapshot) deactiveren gebeuren uitsluitend binnen dít asset.
    // Snapshot EIST een doel; append mag er één hebben (dat is het pad van de
    // wizard voor een transactie-export) en valt zonder terug op legacy-gedrag
    // over de hele portefeuille.
    let targetAssetId: string | null = null
    // Doel-bezitting toont pas posities als has_holdings_tracking aanstaat.
    let needsHoldingsTracking = false
    const newAssetName = typeof body.newAssetName === 'string' ? body.newAssetName.trim() : ''

    if (body.targetAssetId && newAssetName) {
      return badRequest('Kies één doel: een bestaande bezitting of een nieuwe naam, niet allebei')
    }
    if (mode === 'snapshot' && !body.targetAssetId && !newAssetName) {
      return badRequest('Snapshot-import vereist een doel-bezitting (targetAssetId of newAssetName)')
    }
    if (newAssetName && newAssetName.length > MAX_ASSET_NAME_LENGTH) {
      return badRequest(`Naam van de bezitting mag maximaal ${MAX_ASSET_NAME_LENGTH} tekens zijn`)
    }
    if (body.targetAssetId) {
      if (!UUID_RE.test(body.targetAssetId)) {
        return NextResponse.json({
          error: 'targetAssetId moet een geldige uuid zijn',
        }, { status: 400 })
      }
      // Ownership check: the target asset must belong to the current user.
      // `has_holdings_tracking` komt in dezelfde query mee — die vlag staat
      // standaard op false, en zonder aan filtert `loadHoldingsData` de
      // zojuist geïmporteerde posities weg (import "gelukt", overzicht leeg).
      const { data: targetAsset } = await supabase
        .from('assets')
        .select('id, has_holdings_tracking')
        .eq('id', body.targetAssetId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!targetAsset) {
        return NextResponse.json({
          error: 'Doel-asset niet gevonden',
        }, { status: 404 })
      }
      targetAssetId = targetAsset.id
      needsHoldingsTracking = targetAsset.has_holdings_tracking !== true
    }
    if (body.clearExisting && !body.targetAssetId && !newAssetName) {
      // Wissen bestaat alleen binnen één bezitting; zonder afgebakend doel zou
      // het de hele portefeuille raken.
      return badRequest('Wissen van bestaande posities kan alleen bij een import op één bezitting')
    }

    // --- Validate individual holdings ---

    for (let i = 0; i < body.holdings.length; i++) {
      const err = validateHolding(body.holdings[i], i)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }

    // --- Validate individual transactions ---

    for (let i = 0; i < body.transactions.length; i++) {
      const err = validateTransaction(body.transactions[i], i, body.holdings.length)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }

    // --- Maak de doel-bezitting aan wanneer de wizard om een nieuwe vroeg ---
    //
    // Deliberately AFTER all validation, so a rejected payload never leaves an
    // empty bezitting behind. has_holdings_tracking staat meteen aan: zonder die
    // vlag filtert `loadHoldingsData` de zojuist geïmporteerde posities weg.

    if (!targetAssetId && newAssetName) {
      const { data: createdAsset, error: createAssetError } = await supabase
        .from('assets')
        .insert({
          user_id: user.id,
          name: newAssetName,
          asset_type: 'investment',
          current_value: 0,
          purchase_value: 0,
          expected_return: 7,
          monthly_contribution: 0,
          institution: body.broker,
          has_holdings_tracking: true,
        })
        .select('id')
        .single()
      if (createAssetError || !createdAsset) {
        return serverError(createAssetError, 'holdings-import:POST')
      }
      targetAssetId = createdAsset.id
    }

    // --- clearExisting: wis eerst alle posities van deze bezitting ---
    //
    // Harde delete op verzoek van de gebruiker: de FK's op transacties, koersen
    // en alerts cascaden mee, dus dit is onomkeerbaar. Gebeurt vóór het ophalen
    // van de bestaande posities, zodat de import daarna op een schone bezitting
    // landt en alles als 'aangemaakt' telt.

    let holdingsDeleted = 0
    if (targetAssetId && body.clearExisting === true) {
      const { data: deletedRows, error: deleteError } = await supabase
        .from('investment_holdings')
        .delete()
        .eq('user_id', user.id)
        .eq('asset_id', targetAssetId)
        .select('id')
      if (deleteError) {
        return serverError(deleteError, 'holdings-import:POST')
      }
      holdingsDeleted = deletedRows?.length ?? 0
    }

    // --- Zet posities-weergave aan als die nog uitstond ---
    //
    // Alleen wanneer de vlag daadwerkelijk uitstond (nieuw aangemaakte
    // bezittingen krijgen 'm meteen mee) — anders een overbodige schrijfactie.

    if (targetAssetId && needsHoldingsTracking) {
      await supabase
        .from('assets')
        .update({ has_holdings_tracking: true })
        .eq('id', targetAssetId)
        .eq('user_id', user.id)
    }

    // --- Resolve a default asset_id for linking holdings ---

    let defaultAssetId: string | null = null
    const { data: investmentAsset } = await supabase
      .from('assets')
      .select('id')
      .eq('user_id', user.id)
      .in('asset_type', ['investment', 'savings'])
      .limit(1)
      .single()
    defaultAssetId = investmentAsset?.id || null

    // --- Fetch existing active investment_holdings for duplicate detection ---
    //
    // Met een doel-bezitting: strikt binnen dat asset, zodat matchen (en in
    // snapshot ook het deactiveren) nooit buiten de gekozen bezitting reikt.
    // Zonder doel: legacy append over ALLE actieve posities van de gebruiker.

    let existingQuery = supabase
      .from('investment_holdings')
      .select('id, ticker, isin, units, avg_purchase_price, asset_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
    if (targetAssetId) {
      existingQuery = existingQuery.eq('asset_id', targetAssetId)
    }
    const { data: existingHoldings } = await existingQuery

    type ExistingRow = {
      id: string
      ticker: string | null
      isin: string | null
      units: number
      avg_purchase_price: number | null
      asset_id: string | null
    }

    const existingByIsin = new Map<string, ExistingRow>()
    const existingByTicker = new Map<string, ExistingRow>()

    if (existingHoldings) {
      for (const h of existingHoldings as ExistingRow[]) {
        if (h.isin) existingByIsin.set(h.isin.toUpperCase(), h)
        if (h.ticker) existingByTicker.set(h.ticker.toUpperCase(), h)
      }
    }

    // --- Process holdings ---

    let holdingsCreated = 0
    let holdingsUpdated = 0
    let holdingsDeactivated = 0
    let transactionsCreated = 0
    // Rijen die we al hadden en dus zijn overgeslagen — het bewijs dat een
    // bewust overlappende upload geen dubbele historie oplevert.
    let transactionsDeduped = 0
    // Maps import index → created/updated holding ID
    const holdingIdMap = new Map<number, string>()
    // Track which asset_ids need syncing afterwards
    const assetIdsToSync = new Set<string>()
    // Snapshot reconciliation: IDs of existing holdings that the CSV matched.
    // Anything in the target asset NOT in this set has been sold → deactivate.
    const matchedExistingIds = new Set<string>()

    for (let i = 0; i < body.holdings.length; i++) {
      const h = body.holdings[i]
      const isinNorm = h.isin?.toUpperCase() || null
      const tickerNorm = h.ticker?.toUpperCase() || null

      // Check for existing duplicate by ISIN first, then by ticker.
      const existing = (isinNorm && existingByIsin.get(isinNorm))
        || (tickerNorm && existingByTicker.get(tickerNorm))
        || null

      if (existing) {
        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        }

        if (mode === 'snapshot') {
          // Snapshot: the CSV is the source of truth — REPLACE the position
          // (no accumulation) so a re-upload is idempotent. Re-activate in case
          // the holding was previously deactivated by an earlier snapshot.
          updates.units = h.units
          updates.avg_purchase_price = Math.round(h.avg_purchase_price * 100) / 100
          updates.is_active = true
        } else {
          // Append (legacy): add units, recalculate weighted average price.
          const oldUnits = existing.units
          const oldAvg = existing.avg_purchase_price ?? 0
          const newUnits = oldUnits + h.units
          // Weighted average purchase price.
          const newAvg = newUnits > 0
            ? ((oldAvg * oldUnits) + (h.avg_purchase_price * h.units)) / newUnits
            : 0
          updates.units = newUnits
          updates.avg_purchase_price = Math.round(newAvg * 100) / 100
        }

        // Update current_price if the import provides one.
        if (h.current_price !== null && h.current_price !== undefined) {
          updates.current_price = h.current_price
          updates.last_price_update = new Date().toISOString()
        }

        const { error: updateError } = await supabase
          .from('investment_holdings')
          .update(updates)
          .eq('id', existing.id)
          .eq('user_id', user.id)

        if (updateError) {
          return serverError(updateError, 'holdings-import:POST')
        }

        holdingIdMap.set(i, existing.id)
        holdingsUpdated++
        matchedExistingIds.add(existing.id)

        if (existing.asset_id) assetIdsToSync.add(existing.asset_id)
      } else {
        // Create new holding. asset_id is NOT NULL.
        // Met doel-bezitting: altijd daaraan vastpinnen (nooit de default/bucket).
        // Zonder: legacy-volgorde met broker-genoemde bak als terugval.
        let resolvedAssetId = targetAssetId ?? (h.asset_id || defaultAssetId)
        if (!resolvedAssetId) {
          const { data: newAsset } = await supabase
            .from('assets')
            .insert({
              user_id: user.id,
              name: `${body.broker.toUpperCase()} Beleggingen`,
              asset_type: 'investment',
              current_value: 0,
              purchase_value: 0,
              expected_return: 7,
              monthly_contribution: 0,
              institution: body.broker,
            })
            .select('id')
            .single()
          if (newAsset) {
            defaultAssetId = newAsset.id
            resolvedAssetId = newAsset.id
          }
        }

        const { data: created, error: insertError } = await supabase
          .from('investment_holdings')
          .insert({
            user_id: user.id,
            asset_id: resolvedAssetId,
            name: h.name.trim(),
            ticker: (h.ticker?.trim() || h.name.trim()),
            isin: h.isin || null,
            exchange: h.exchange || null,
            units: h.units,
            avg_purchase_price: h.avg_purchase_price,
            current_price: h.current_price ?? null,
            purchase_date: h.purchase_date || null,
            currency: 'EUR',
            external_source: body.broker,
            is_active: true,
          })
          .select('id, asset_id')
          .single()

        if (insertError || !created) {
          return serverError(insertError, 'holdings-import:POST')
        }

        holdingIdMap.set(i, created.id)
        holdingsCreated++

        if (created.asset_id) assetIdsToSync.add(created.asset_id)

        // Update lookup maps so subsequent imports in the same batch detect duplicates.
        const newRow: ExistingRow = {
          id: created.id,
          ticker: h.ticker || null,
          isin: h.isin || null,
          units: h.units,
          avg_purchase_price: h.avg_purchase_price,
          asset_id: created.asset_id,
        }
        if (isinNorm) existingByIsin.set(isinNorm, newRow)
        if (tickerNorm) existingByTicker.set(tickerNorm, newRow)
      }
    }

    // --- Snapshot reconciliation: soft-deactivate sold positions ---
    //
    // Any holding that lived in the target asset but did NOT appear in the CSV
    // has been sold. Zero it out and deactivate (kept for history, excluded from
    // the value rollup). Append mode never deactivates anything — dat is precies
    // waarom een transactie-export (die maar een periode beslaat) append gebruikt.
    if (mode === 'snapshot' && targetAssetId && existingHoldings) {
      const soldIds = (existingHoldings as ExistingRow[])
        .filter((row) => !matchedExistingIds.has(row.id))
        .map((row) => row.id)

      if (soldIds.length > 0) {
        const { error: deactivateError } = await supabase
          .from('investment_holdings')
          .update({ units: 0, is_active: false, updated_at: new Date().toISOString() })
          .in('id', soldIds)
          .eq('user_id', user.id)

        if (deactivateError) {
          return serverError(deactivateError, 'holdings-import:POST')
        }
        holdingsDeactivated = soldIds.length
        assetIdsToSync.add(targetAssetId)
      }
    }

    // --- Process transactions ---

    if (body.transactions.length > 0) {
      const txRows = body.transactions
        .filter((tx) => {
          // date is NOT NULL in the schema — skip transactions without a date.
          return tx.date && tx.date.trim().length > 0
        })
        .map((tx) => {
          const holdingId = holdingIdMap.get(tx.holding_index)
          if (!holdingId) {
            throw new Error(`Geen holding gevonden voor holding_index ${tx.holding_index}`)
          }
          // External_trade_id is optional; when absent we leave it NULL so the
          // partial-unique index still allows multiple rows from the same broker
          // for the same security.
          const externalTradeId = tx.external_trade_id || null
          return {
            user_id: user.id,
            holding_id: holdingId,
            type: tx.type,
            units: tx.units,
            price_per_unit: tx.price_per_unit,
            total_amount: tx.total_amount,
            currency: 'EUR',
            date: tx.date as string,
            notes: tx.notes || null,
            external_source: body.broker,
            external_trade_id: externalTradeId,
          }
        })

      // Split rows: those with an external_trade_id go through upsert (idempotent
      // re-imports), the rest through plain insert (no dedup possible).
      const upsertRows = txRows.filter((r) => r.external_trade_id != null)
      // Zonder dedup-sleutel is idempotentie onmogelijk: elke herhaalde upload zou
      // de rij nóg eens invoegen. De wizard levert sinds
      // `lib/holdings-import-key.ts` ALTIJD een sleutel, dus dit pad is de
      // terugval voor oudere/externe aanroepers — en blijft in snapshot dicht.
      const insertRows = mode === 'snapshot'
        ? []
        : txRows.filter((r) => r.external_trade_id == null)

      let transactionsSkipped = 0

      if (upsertRows.length > 0) {
        // `ignoreDuplicates` + RETURNING geeft alleen de rijen die ECHT nieuw
        // zijn. Precies het getal dat de gebruiker wil zien bij een bewust
        // overlappende upload: hoeveel was nieuw, hoeveel hadden we al.
        const { data: inserted, error: upsertErr } = await supabase
          .from('investment_transactions')
          .upsert(upsertRows, {
            onConflict: 'user_id,external_source,external_trade_id',
            ignoreDuplicates: true,
          })
          .select('id')
        if (upsertErr) {
          return serverError(upsertErr, 'holdings-import:POST')
        }
        const insertedCount = inserted?.length ?? upsertRows.length
        transactionsCreated += insertedCount
        transactionsSkipped += upsertRows.length - insertedCount
      }
      if (insertRows.length > 0) {
        const { error: insertErr } = await supabase
          .from('investment_transactions')
          .insert(insertRows)
        if (insertErr) {
          return serverError(insertErr, 'holdings-import:POST')
        }
        transactionsCreated += insertRows.length
      }

      transactionsDeduped = transactionsSkipped

      // --- Positie herleiden uit de PERSISTENTE transactieset ---
      //
      // Dit is de kern van een overlappende upload. De client stuurt een netto
      // positie mee die is afgeleid uit het BESTAND; die optellen bij wat er al
      // stond telt elke overlappende transactie een tweede keer mee in het
      // aantal — ook al is de transactierij zelf keurig ontdubbeld.
      //
      // Dus: na het wegschrijven de positie opnieuw afleiden uit álle transacties
      // die nu in de database staan. Dat doet `syncHoldingAggregatesFromTransactions`
      // al voor de transactie-mutatieroutes; de import gebruikt dezelfde helper
      // (consume, don't recompute) zodat er geen tweede afleiding ontstaat die
      // kan wegdrijven. Het opgeslagen aantal is daarmee een cache van de
      // engine-uitvoer, nooit een eigen waarheid — en de import wordt idempotent,
      // ongeacht hoeveel overlap de gebruiker aanlevert.
      const touchedHoldingIds = Array.from(
        new Set(txRows.map((r) => r.holding_id)),
      )
      for (const holdingId of touchedHoldingIds) {
        const synced = await syncHoldingAggregatesFromTransactions(
          supabase,
          { holdings: 'investment_holdings', transactions: 'investment_transactions' },
          holdingId,
          user.id,
        )
        // Bewust hard falen. De append-tak hierboven heeft het aantal al
        // incrementeel opgehoogd; blijft de herberekening dan uit, dan staat er
        // een te hoog aantal en zou een geslaagde import dat verzwijgen.
        if (!synced.synced) {
          return serverError(
            new Error(`herberekening van positie ${holdingId} mislukt`),
            'holdings-import:POST',
          )
        }
      }
    }

    // --- Sync asset values for all affected assets ---

    for (const assetId of Array.from(assetIdsToSync)) {
      await syncAssetValueFromInvestmentHoldings(supabase, assetId, user.id)
    }

    // --- Calculate total imported value ---

    const totalValue = body.holdings.reduce((sum, h) => {
      const price = h.current_price ?? h.avg_purchase_price
      return sum + (price * h.units)
    }, 0)

    return NextResponse.json({
      success: true,
      summary: {
        holdings_created: holdingsCreated,
        holdings_updated: holdingsUpdated,
        holdings_deactivated: holdingsDeactivated,
        holdings_deleted: holdingsDeleted,
        // De bezitting waarin dit terechtkwam — de wizard kan er een nieuwe
        // hebben laten aanmaken, dan kent de client het id nog niet.
        asset_id: targetAssetId,
        transactions_created: transactionsCreated,
        transactions_deduped: transactionsDeduped,
        total_value: Math.round(totalValue * 100) / 100,
        broker: body.broker,
      },
    }, { status: 201 })
  } catch (err) {
    return serverError(err, 'holdings-import:POST')
  }
}
