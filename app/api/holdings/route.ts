import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { syncAssetValueFromHoldings } from '@/lib/holdings-sync'
import { getEURRateSync } from '@/lib/forex'
import { resolveHolding } from '@/lib/holdings-table-resolver'
import { loadHoldingsPnL, attachPnLToHoldings } from '@/lib/holdings-pnl-enrichment'
import { sumHoldingTotals, type HoldingTotalsRow } from '@/lib/holdings-totals'
import { PURCHASE_DATE_FUTURE_ERROR, isPurchaseDateInFuture } from '@/lib/asset-parameter-bands'
import { deriveHoldingTicker } from '@/lib/holdings-ticker'

/**
 * GET /api/holdings — List user's investment holdings.
 *
 * Na de tabel-split (migratie 20260502000003): leest uit `investment_holdings`.
 * Effecten dus, en uitsluitend effecten — crypto heeft een eigen app met eigen
 * transacties en koershistorie (`lib/crypto-holdings-data.ts`). Deze route en
 * `lib/holdings-data-loader.ts` leveren daarom dezelfde set: die loader vult de
 * eerste render van de holdings-pagina, deze route elke herlading dáárna, en
 * twee bronnen voor één lijst horen niet uiteen te lopen.
 *
 * Query params:
 *   ?asset_id=<uuid> — beperk tot de holdings van één bezitting
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return unauthorized()
  }

  const { searchParams } = new URL(request.url)
  const assetIdFilter = searchParams.get('asset_id')

  try {
    let query = supabase
      .from('investment_holdings')
      .select('*, asset:assets!asset_id(id, name, has_holdings_tracking)')
      .eq('user_id', claims.sub)
      .eq('is_active', true)
      .eq('assets.has_holdings_tracking', true)
      .order('created_at', { ascending: false })

    if (assetIdFilter) {
      query = query.eq('asset_id', assetIdFilter)
    }

    const { data: rawHoldings, error } = await query

    if (error) {
      // Een DB-fout NIET maskeren als lege 200 — anders toont de UI "geen
      // holdings" bij een storing. Geef 500 zodat de consumer een foutstate toont.
      return serverError(error, 'holdings:GET')
    }

    const baseHoldings = (rawHoldings ?? [])
      .filter((h: Record<string, unknown>) => h.asset != null)
      .map((h: Record<string, unknown>) => {
        const asset = h.asset as { id: string; name: string } | null
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { asset: _nested, ...rest } = h
        return { ...rest, asset_name: asset?.name ?? null }
      })

    // Verrijk met opbrengst per rij via de canonieke aggregatie-engine — zelfde
    // helper als de server-loader (lib/holdings-data-loader.ts) zodat initial-
    // render en client-hydratie identieke getallen tonen. Eén batch-query op
    // investment_transactions.holding_id (geen N+1).
    const pnlMap = await loadHoldingsPnL(
      supabase,
      baseHoldings.map((h: Record<string, unknown>) => ({
        id: h.id as string,
        current_price: h.current_price as number | string | null | undefined,
      })),
      claims.sub,
    )
    const enrichedInvestment = attachPnLToHoldings(
      baseHoldings as unknown as Array<Record<string, unknown> & { id: string }>,
      pnlMap,
    ).map((h) => ({ ...h, bucket: 'investment' as const }))

    const holdings = enrichedInvestment

    // Totalen via de gedeelde helper — dezelfde die de server-loader gebruikt.
    // Losse reduces hier en dáár lieten de twee bronnen uiteenlopen, waardoor
    // een bedrag kon veranderen door alleen op "Prijzen vernieuwen" te klikken.
    const { totalValue, totalCost, totalPnL, totalInvested } = sumHoldingTotals(
      holdings as unknown as HoldingTotalsRow[],
      getEURRateSync,
    )

    return NextResponse.json({
      holdings,
      total_value: totalValue,
      total_cost: totalCost,
      total_pnl: totalPnL,
      total_invested: totalInvested,
      source: 'investment_holdings_table',
    })
  } catch (err) {
    return serverError(err, 'holdings:GET')
  }
}

/**
 * POST /api/holdings — Create a new holding.
 *
 * Inserts into the dedicated `holdings` table.
 *
 * Expected body: { name, ticker?, isin?, units?, avg_purchase_price?, current_price?, purchase_date?, notes?, asset_type? }
 */
// In-memory idempotency cache: maps idempotency key → { response, timestamp }
// Keys expire after 5 minutes to prevent unbounded memory growth.
const idempotencyCache = new Map<string, { response: { body: Record<string, unknown>; status: number }; timestamp: number }>()
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000 // 5 minutes

function cleanExpiredIdempotencyKeys() {
  const now = Date.now()
  for (const [key, entry] of idempotencyCache.entries()) {
    if (now - entry.timestamp > IDEMPOTENCY_TTL_MS) {
      idempotencyCache.delete(key)
    }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  // Idempotency key check: if the same key is submitted twice,
  // return the cached response instead of creating a duplicate holding
  const idempotencyKey = request.headers.get('X-Idempotency-Key')
  if (idempotencyKey) {
    const cacheKey = `${user.id}:${idempotencyKey}`
    cleanExpiredIdempotencyKeys()
    const cached = idempotencyCache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached.response.body, { status: cached.response.status })
    }
  }

  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ongeldig JSON-formaat in request body' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body moet een JSON-object zijn' }, { status: 400 })
    }

    const { name, ticker, isin, units, avg_purchase_price, current_price, purchase_date, notes, asset_type, currency, ter, ter_source } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Naam is verplicht en moet een niet-lege string zijn' }, { status: 400 })
    }

    // Validate numeric fields when provided
    // `<= 0` en niet `< 0` (bevinding H8). Nul was hier toegestaan, maar de
    // client stuurde 'm nooit: `Number(formUnits) || 1` maakte van een ingetypte
    // 0 stilzwijgend één stuk. Wie 0 bedoelde kreeg dus een positie van 1, en
    // wie de client omzeilde kreeg een positie zonder stukken die elke
    // waardeberekening op 0 zet. Beide kanten dicht: de client stuurt de 0 nu
    // door, en hier is het een expliciete 400.
    if (units !== undefined && units !== null) {
      const n = Number(units)
      if (isNaN(n) || n <= 0) {
        return NextResponse.json({ error: 'Aantal stuks moet groter dan 0 zijn' }, { status: 400 })
      }
    }

    if (avg_purchase_price !== undefined && avg_purchase_price !== null) {
      const n = Number(avg_purchase_price)
      if (isNaN(n) || n < 0) {
        return NextResponse.json({ error: 'Gemiddelde aankoopprijs moet een positief getal zijn' }, { status: 400 })
      }
    }

    if (current_price !== undefined && current_price !== null) {
      const n = Number(current_price)
      if (isNaN(n) || n < 0) {
        return NextResponse.json({ error: 'Huidige prijs moet een positief getal zijn' }, { status: 400 })
      }
    }

    // Validate optional string fields
    if (ticker !== undefined && ticker !== null && typeof ticker !== 'string') {
      return NextResponse.json({ error: 'Ticker moet een string zijn' }, { status: 400 })
    }

    if (isin !== undefined && isin !== null && typeof isin !== 'string') {
      return NextResponse.json({ error: 'ISIN moet een string zijn' }, { status: 400 })
    }

    if (asset_type !== undefined && asset_type !== null && typeof asset_type !== 'string') {
      return NextResponse.json({ error: 'Asset type moet een string zijn' }, { status: 400 })
    }

    // Validate TER field when provided
    if (ter !== undefined && ter !== null) {
      const n = Number(ter)
      if (isNaN(n) || n < 0 || n > 0.10) {
        return NextResponse.json({ error: 'TER moet een getal zijn tussen 0 en 0.10 (0% - 10%)' }, { status: 400 })
      }
    }

    // Een aankoopdatum in de toekomst bestaat niet (bevinding H8). Het
    // `max`-attribuut op het datumveld is een suggestie die een geplakte of
    // getypte waarde niet tegenhoudt; dit is de grens.
    if (typeof purchase_date === 'string' && purchase_date !== '' && isPurchaseDateInFuture(purchase_date)) {
      return NextResponse.json({ error: PURCHASE_DATE_FUTURE_ERROR }, { status: 400 })
    }

    // Validate ter_source field when provided
    if (ter_source !== undefined && ter_source !== null) {
      if (typeof ter_source !== 'string' || !['manual', 'lookup'].includes(ter_source)) {
        return NextResponse.json({ error: 'TER bron moet "manual" of "lookup" zijn' }, { status: 400 })
      }
    }

    // Check if user wants to force-create despite duplicate warning
    const forceDuplicate = body.force_duplicate === true

    // Resolve het doel-asset. Primair: het `asset_id` dat de UI meestuurt vanuit
    // de asset-context (WF-BEZIT-14-bug2). Ontbreekt dat, dan een DEFENSIEVE
    // fallback i.p.v. stilzwijgend "de eerste" asset te pakken:
    //   - `.eq('is_active', true)` — kies NOOIT een soft-deleted asset (anders
    //     belandt de holding op een verwijderd bezit en is 'ie permanent
    //     onzichtbaar, want GET joint op has_holdings_tracking).
    //   - deterministische `order()` — voorkeur voor een asset dat holdings
    //     trackt (anders is de holding sowieso onzichtbaar), met `created_at`
    //     als stabiele tiebreak, zodat de keuze reproduceerbaar is i.p.v.
    //     afhankelijk van de DB-scanvolgorde.
    // Crypto blijft in de kandidatenset zodat de crypto-guard hieronder
    // (WF-BEZIT-21) desnoods een duidelijke 400 kan geven i.p.v. hier al
    // stilzwijgend te filteren.
    let assetId = body.asset_id || null
    if (!assetId) {
      const { data: investmentAsset } = await supabase
        .from('assets')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .in('asset_type', ['investment', 'crypto', 'savings'])
        .order('has_holdings_tracking', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      assetId = investmentAsset?.id || null
    }

    // Doel-asset valideren + routeren (één user-scoped lookup):
    //   1. Eigenaarscheck (WF-BEZIT-14-bug2): een expliciet meegestuurd
    //      `asset_id` moet van deze gebruiker zijn en actief. `.eq('user_id', …)`
    //      voorkomt dat een holding aan een vreemd/onbekend of soft-deleted asset
    //      wordt gekoppeld. (De fallback hierboven levert per definitie een eigen,
    //      actief asset; deze check dekt vooral het door de UI meegestuurde id.)
    //   2. Crypto-routing (WF-BEZIT-21): dit endpoint schrijft ALTIJD naar
    //      `investment_holdings` (effectenposities). Een crypto-asset hoort in
    //      `crypto_holdings` (via de exchange-sync). Zonder deze check belandde
    //      een crypto-holding stilzwijgend in de verkeerde tabel — onzichtbaar op
    //      de crypto-pagina, én de navolgende asset-sync (die crypto_holdings
    //      bevraagt) vond 0 rijen en nulde de bestaande asset-waarde.
    if (assetId) {
      const { data: targetAsset } = await supabase
        .from('assets')
        .select('asset_type, is_active')
        .eq('id', assetId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!targetAsset) {
        return NextResponse.json(
          { error: 'Onbekend vermogensobject voor deze holding.' },
          { status: 400 },
        )
      }
      if ((targetAsset.is_active as boolean | null) === false) {
        return NextResponse.json(
          { error: 'Dit vermogensobject is gearchiveerd; kies een actief object voor deze holding.' },
          { status: 400 },
        )
      }
      if ((targetAsset.asset_type as string | undefined) === 'crypto') {
        return NextResponse.json(
          { error: 'Crypto-posities kunnen niet via dit endpoint worden toegevoegd; die lopen via de exchange-synchronisatie (crypto_holdings).' },
          { status: 400 },
        )
      }
    }

    // Check for duplicate ticker within the same asset (if ticker is provided).
    // Investment-only — crypto duplicates worden via de exchange-sync afgehandeld
    // (unique index op external_source + external_trade_id).
    if (ticker && typeof ticker === 'string' && ticker.trim().length > 0 && !forceDuplicate) {
      const tickerNorm = ticker.trim().toUpperCase()

      let dupeQuery = supabase
        .from('investment_holdings')
        .select('id, name, ticker, asset_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .ilike('ticker', tickerNorm)

      // If we have an asset_id, also check within the same asset
      if (assetId) {
        dupeQuery = dupeQuery.eq('asset_id', assetId)
      }

      const { data: duplicates } = await dupeQuery

      if (duplicates && duplicates.length > 0) {
        return NextResponse.json({
          warning: true,
          message: `Er bestaat al een actieve holding met ticker "${tickerNorm}"${assetId ? ' voor dit vermogensobject' : ''}. Wil je toch doorgaan?`,
          existing_holdings: duplicates.map((d) => ({
            id: d.id,
            name: d.name,
            ticker: d.ticker,
          })),
        }, { status: 409 })
      }
    }

    const baseRow = {
      user_id: user.id,
      asset_id: assetId,
      name,
      // `ticker` is NOT NULL in investment_holdings (WF-BEZIT-14-bug4): een leeg
      // formulierveld werd hier `null` en de insert faalde met een generieke 500.
      // Val terug op de naam, precies zoals de backfill in migratie
      // 20260502000003 (`COALESCE(h.ticker, h.name)`) en de CSV-import doen.
      ticker: deriveHoldingTicker(ticker, name),
      isin: isin || null,
      // `|| 1` vangt nu alléén nog `units === undefined` (= veld niet ingevuld):
      // 0 en negatief zijn hierboven al met een 400 afgewezen. Dat die default
      // 1 is en niet 0 is een bestaande keuze — een positie zonder stukken is
      // voor elke waardeberekening nul.
      units: Number(units) || 1,
      avg_purchase_price: Number(avg_purchase_price) || 0,
      current_price: current_price != null ? Number(current_price) : null,
      currency: typeof currency === 'string' && currency.trim().length > 0 ? currency.trim().toUpperCase() : 'EUR',
      purchase_date: purchase_date || null,
      notes: notes || null,
      is_active: true,
    }

    const terFields = {
      ...(ter != null ? { ter: Number(ter), ter_source: (ter_source as string) || 'manual' } : {}),
      ...(ter_source != null && ter == null ? { ter_source: ter_source as string } : {}),
    }

    // Insert in investment_holdings. Crypto-rijen verwachten we via de
    // exchange-sync; handmatige POST naar deze endpoint is bedoeld voor
    // effectenposities (CSV-import / manual entry op de Holdings-pagina).
    let { data: holding, error } = await supabase
      .from('investment_holdings')
      .insert({ ...baseRow, ...terFields })
      .select()
      .single()

    if (error && error.message?.includes("'ter'")) {
      // TER column missing in schema — retry without TER fields
      ;({ data: holding, error } = await supabase
        .from('investment_holdings')
        .insert(baseRow)
        .select()
        .single())
    }

    if (error) {
      return serverError(error, 'holdings:POST')
    }

    // Sync parent asset's current_value from all holdings
    if (holding && holding.asset_id) {
      await syncAssetValueFromHoldings(supabase, holding.asset_id, user.id)
    }

    const responseBody = { holding, source: 'investment_holdings_table' }
    // Cache the successful response for idempotency
    if (idempotencyKey) {
      const cacheKey = `${user.id}:${idempotencyKey}`
      idempotencyCache.set(cacheKey, { response: { body: responseBody, status: 201 }, timestamp: Date.now() })
    }
    return NextResponse.json(responseBody, { status: 201 })
  } catch (err) {
    return serverError(err, 'holdings:POST')
  }
}

/**
 * PATCH /api/holdings — Update a holding (e.g. current price).
 *
 * Expected body: { id, current_price?, units?, avg_purchase_price?, name?, ticker?, notes?, expected_updated_at? }
 * When current_price changes and the holding has a linked asset_id, the asset's current_value
 * is recalculated as (current_price * units) to keep asset and holding in sync.
 *
 * Optimistic concurrency control:
 * If `expected_updated_at` is provided, the server checks if the row's updated_at matches.
 * If another edit happened since the client loaded the data, a 409 Conflict is returned
 * with the current server state so the client can resolve the conflict.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ongeldig JSON-formaat in request body' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body moet een JSON-object zijn' }, { status: 400 })
    }

    const { id } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'ID is verplicht en moet een string zijn' }, { status: 400 })
    }

    // Validate numeric fields when provided
    if (body.current_price !== undefined && body.current_price !== null && isNaN(Number(body.current_price))) {
      return NextResponse.json({ error: 'Huidige prijs moet een getal zijn' }, { status: 400 })
    }
    // BEWUST asymmetrisch met POST hierboven, die `units <= 0` weigert: bij
    // BIJWERKEN is 0 een legitieme eindstand (een uitverkochte positie — 95 van
    // de 115 geïmporteerde posities op productie staan zo). Trek deze twee niet
    // naar elkaar toe zonder dat af te wegen.
    if (body.units !== undefined && body.units !== null && isNaN(Number(body.units))) {
      return NextResponse.json({ error: 'Units moet een getal zijn' }, { status: 400 })
    }
    if (body.ter !== undefined && body.ter !== null) {
      const n = Number(body.ter)
      if (isNaN(n) || n < 0 || n > 0.10) {
        return NextResponse.json({ error: 'TER moet een getal zijn tussen 0 en 0.10 (0% - 10%)' }, { status: 400 })
      }
    }
    if (body.ter_source !== undefined && body.ter_source !== null) {
      if (typeof body.ter_source !== 'string' || !['manual', 'lookup'].includes(body.ter_source)) {
        return NextResponse.json({ error: 'TER bron moet "manual" of "lookup" zijn' }, { status: 400 })
      }
    }

    // Resolve welke typed-tabel deze id huisvest. Vóór de tabel-split
    // was dit een directe lookup; nu doen we eerst een resolver-roundtrip.
    const resolved = await resolveHolding(supabase, id, user.id, 'id, asset_id, updated_at, name, units, avg_purchase_price, current_price, ticker, notes')
    if (!resolved) {
      return NextResponse.json({ error: 'Holding niet gevonden' }, { status: 404 })
    }
    const tableName = resolved.tables.holdings

    // --- Optimistic concurrency check ---
    const expectedUpdatedAt = body.expected_updated_at as string | undefined
    if (expectedUpdatedAt) {
      const currentRow = resolved.holding as Record<string, unknown>

      const updatedAtRaw = currentRow.updated_at as string | number | undefined
      if (updatedAtRaw != null) {
        // Compare timestamps — normalize both to millisecond precision
        const serverTime = new Date(updatedAtRaw).getTime()
        const clientTime = new Date(expectedUpdatedAt).getTime()

        if (serverTime !== clientTime) {
          return NextResponse.json({
            error: 'conflict',
            message: 'Deze holding is ondertussen door een andere sessie gewijzigd. Herlaad de gegevens en probeer opnieuw.',
            conflict: true,
            server_state: currentRow,
            server_updated_at: updatedAtRaw,
            client_updated_at: expectedUpdatedAt,
          }, { status: 409 })
        }
      }
    }

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {}
    if (body.current_price !== undefined) updates.current_price = Number(body.current_price)
    if (body.units !== undefined) updates.units = Number(body.units)
    if (body.avg_purchase_price !== undefined) updates.avg_purchase_price = Number(body.avg_purchase_price)
    if (body.name !== undefined) updates.name = body.name
    // Zelfde NOT NULL-val als bij POST (WF-BEZIT-14-bug4): wie het tickerveld
    // leegmaakt in een bewerkformulier mag geen 500 krijgen. Val terug op de
    // meegestuurde naam, en anders op de naam die al op de rij staat.
    if (body.ticker !== undefined) {
      const currentName = (resolved.holding as Record<string, unknown>).name
      updates.ticker = deriveHoldingTicker(body.ticker, body.name ?? currentName)
    }
    if (body.isin !== undefined) updates.isin = body.isin || null
    if (body.notes !== undefined) updates.notes = body.notes || null
    if (body.currency !== undefined && typeof body.currency === 'string') updates.currency = body.currency.trim().toUpperCase() || 'EUR'
    if (body.ter !== undefined) updates.ter = body.ter != null ? Number(body.ter) : null
    if (body.ter_source !== undefined) updates.ter_source = body.ter_source || null
    if (body.current_price !== undefined) updates.last_price_update = new Date().toISOString()
    // Always bump updated_at on write so future conflict checks work
    updates.updated_at = new Date().toISOString()

    // Try update with all fields; retry without TER if crypto-tabel hem niet
    // heeft (crypto_holdings heeft geen ter/ter_source kolommen).
    let { data: holding, error } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error && (error.message?.includes("'ter'") || error.message?.includes("'currency'") || error.message?.includes("'isin'"))) {
      // Column missing in target schema (most likely crypto_holdings, that
      // doesn't carry ticker/isin/currency/ter columns). Retry with only the
      // fields the typed-tabel ondersteunt.
      const safeUpdates: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(updates)) {
        if (k === 'ter' || k === 'ter_source' || k === 'currency' || k === 'isin') continue
        safeUpdates[k] = v
      }
      ;({ data: holding, error } = await supabase
        .from(tableName)
        .update(safeUpdates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single())
    }

    if (error) {
      return serverError(error, 'holdings:PATCH')
    }

    // Sync linked asset's current_value from holdings (alleen voor investment;
    // crypto-aggregate komt via een eigen pad in de exchange-sync-laag).
    if (
      holding &&
      holding.asset_id &&
      resolved.bucket === 'investment' &&
      (body.current_price !== undefined || body.units !== undefined)
    ) {
      await syncAssetValueFromHoldings(supabase, holding.asset_id, user.id)
    }

    return NextResponse.json({ holding, source: `${tableName}_table`, bucket: resolved.bucket })
  } catch (err) {
    return serverError(err, 'holdings:PATCH')
  }
}

/**
 * DELETE /api/holdings — Delete a holding by id.
 *
 * Query param: ?id=<uuid>
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID is verplicht' }, { status: 400 })
  }

  try {
    const resolved = await resolveHolding(supabase, id, user.id, 'id, asset_id')
    if (!resolved) {
      return NextResponse.json({ success: true, already_deleted: true })
    }

    const { error } = await supabase
      .from(resolved.tables.holdings)
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return serverError(error, 'holdings:DELETE')
    }

    // Sync parent asset alleen voor investment — crypto loopt via de
    // exchange-sync.
    const assetId = (resolved.holding as { asset_id?: string }).asset_id
    if (assetId && resolved.bucket === 'investment') {
      await syncAssetValueFromHoldings(supabase, assetId, user.id)
    }

    return NextResponse.json({ success: true, bucket: resolved.bucket })
  } catch (err) {
    return serverError(err, 'holdings:DELETE')
  }
}
