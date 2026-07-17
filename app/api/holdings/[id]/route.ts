import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { resolveHolding } from '@/lib/holdings-table-resolver'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * GET /api/holdings/[id] — Fetch a single holding by its UUID.
 *
 * Polymorf na de tabel-split (migratie 20260502000003): kijkt parallel in
 * `investment_holdings` en `crypto_holdings`. Returns 200 + bucket-info,
 * 404 als de id in geen van beide bestaat, 401 zonder auth.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const { id } = await params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Ongeldig ID' }, { status: 400 })
  }

  try {
    const resolved = await resolveHolding(supabase, id, user.id)
    if (!resolved) {
      return NextResponse.json(
        { error: 'Holding niet gevonden', notFound: true },
        { status: 404 }
      )
    }

    return NextResponse.json({
      holding: resolved.holding,
      bucket: resolved.bucket,
      source: `${resolved.tables.holdings}_table`,
    })
  } catch {
    return NextResponse.json({ error: 'Er is een fout opgetreden' }, { status: 500 })
  }
}

/**
 * PATCH /api/holdings/[id] — Update holding fields.
 *
 * Past de update toe op de juiste typed-tabel via de resolver — de tabel
 * wordt afgeleid uit de bestaande rij, niet uit een prop in de body, zodat
 * misbruik (proberen een investment-veld op een crypto-holding te zetten)
 * stilzwijgend wordt afgewezen door de PostgREST-laag.
 *
 * Geaccepteerde velden:
 *   - `is_favorite: boolean`   — altijd toegestaan (UI-toggle)
 *   - `units: number`          — alleen voor manual holdings (niet auto-synced)
 *   - `avg_purchase_price`     — idem
 *   - `notes: string`          — altijd toegestaan, ook voor auto-synced
 *
 * Auto-sync guard: voor een crypto-holding met `source_exchange_connection_id`
 * of `source_wallet_address_id` (en voor een investment-holding met
 * `external_source` ≠ NULL) zijn `units` en `avg_purchase_price` server-side
 * geblokkeerd — een poging om die te wijzigen krijgt 409 Conflict. Reden:
 * deze waarden worden door de exchange-sync of CSV-import overschreven, dus
 * een handmatige edit zou bij de volgende sync stilzwijgend verloren gaan.
 * `notes` blijft altijd bewerkbaar — dat is een gebruiker-eigen veld dat
 * geen sync-conflict heeft.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const { id } = await params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Ongeldig ID' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const updates: Record<string, unknown> = {}

    // Boolean / scalar velden die ALTIJD toegestaan zijn.
    if (typeof body.is_favorite === 'boolean') {
      updates.is_favorite = body.is_favorite
    }
    if (typeof body.notes === 'string' || body.notes === null) {
      // Lege string (gebruiker leegt het veld) → NULL in DB; we laten een
      // expliciete null door zodat de gebruiker een leegmaak-actie kan doen.
      const trimmed = typeof body.notes === 'string' ? body.notes.trim() : ''
      updates.notes = trimmed.length > 0 ? trimmed : null
    }

    // Numerieke velden — alleen verzamelen, server-side validatie volgt zo.
    let unitsRequested: number | undefined
    let avgPriceRequested: number | undefined
    if (body.units !== undefined && body.units !== null) {
      const n = Number(body.units)
      if (!Number.isFinite(n)) {
        return NextResponse.json(
          { error: 'units moet een geldig getal zijn' },
          { status: 400 },
        )
      }
      if (n < 0) {
        return NextResponse.json(
          { error: 'units mag niet negatief zijn' },
          { status: 400 },
        )
      }
      unitsRequested = n
    }
    if (body.avg_purchase_price !== undefined && body.avg_purchase_price !== null) {
      const n = Number(body.avg_purchase_price)
      if (!Number.isFinite(n)) {
        return NextResponse.json(
          { error: 'avg_purchase_price moet een geldig getal zijn' },
          { status: 400 },
        )
      }
      if (n < 0) {
        return NextResponse.json(
          { error: 'avg_purchase_price mag niet negatief zijn' },
          { status: 400 },
        )
      }
      avgPriceRequested = n
    }

    // Resolver vertelt ons welke typed-tabel de bron is — de update gaat
    // dáár naartoe. We selecteren alleen `id` om de lookup compatibel te
    // houden met beide typed-tabellen (investment- en crypto-holdings hebben
    // verschillende auto-sync-kolommen). De auto-sync probe doen we daarna
    // gericht in de juiste tabel.
    const resolved = await resolveHolding(supabase, id, user.id, 'id')
    if (!resolved) {
      return NextResponse.json({ error: 'Holding niet gevonden' }, { status: 404 })
    }

    // Auto-sync detectie per bucket. Crypto: één van de FK-bron-kolommen is
    // niet-null. Investment: `external_source` is niet-null (CSV-broker /
    // exchange-import). Een manual rij heeft beide leeg — dan mogen we vrij
    // muteren. We doen alleen een aparte probe-query als de gebruiker
    // numerieke velden wil wijzigen — voor een notes-only update is de check
    // niet nodig.
    let isAutoSynced = false
    if (unitsRequested !== undefined || avgPriceRequested !== undefined) {
      if (resolved.bucket === 'crypto') {
        const { data: probe } = await supabase
          .from('crypto_holdings')
          .select('source_exchange_connection_id, source_wallet_address_id')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle()
        isAutoSynced = Boolean(
          probe?.source_exchange_connection_id || probe?.source_wallet_address_id,
        )
      } else {
        const { data: probe } = await supabase
          .from('investment_holdings')
          .select('external_source')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle()
        isAutoSynced = Boolean(probe?.external_source)
      }
    }

    if (isAutoSynced && (unitsRequested !== undefined || avgPriceRequested !== undefined)) {
      return NextResponse.json(
        {
          error: 'auto_synced',
          message:
            'Aantal en gemiddelde inkoopprijs worden automatisch gesynchroniseerd vanuit de koppeling.',
        },
        { status: 409 },
      )
    }

    if (unitsRequested !== undefined) updates.units = unitsRequested
    if (avgPriceRequested !== undefined) updates.avg_purchase_price = avgPriceRequested

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Geen geldige velden om bij te werken' }, { status: 400 })
    }

    const { data: holding, error } = await supabase
      .from(resolved.tables.holdings)
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .maybeSingle()

    if (error) {
      return serverError(error, 'holdings-id:PATCH')
    }

    if (!holding) {
      return NextResponse.json({ error: 'Holding niet gevonden' }, { status: 404 })
    }

    return NextResponse.json({ holding, bucket: resolved.bucket })
  } catch {
    return NextResponse.json({ error: 'Er is een fout opgetreden' }, { status: 500 })
  }
}
