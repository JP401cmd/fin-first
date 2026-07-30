import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, badRequest, notFound, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { upsertSingleBalanceSnapshot } from '@/lib/balance-snapshot'
import { localMonthStartMonthsAgo } from '@/lib/month-range'
import { WEALTH_GROUPS } from '@/lib/wealth-composition'
import type { AssetType } from '@/lib/asset-data'
import { getDebtGroup } from '@/lib/debt-data'
import type { DebtType } from '@/lib/debt-data'
import { VALUATIONS_CONFLICT_KEY } from '@/lib/valuations'

/**
 * /api/snapshots/entity-backfill — per-entiteit historische saldo-backfill.
 *
 * Onderdeel van "Netto vermogen — verloop" (brok B4a). Laat de gebruiker per
 * bezitting/schuld handmatig maandsaldi invullen tot 24 maanden terug, zodat de
 * per-groep verloopbanden (lib/load-category-history.ts leest balance_snapshots)
 * ook zonder dagelijkse cron-historie gevuld raken.
 *
 * SCHRIJFPAD (identiek aan de LIVE herwaardering, alleen op een historische
 * datum `<month>-01`):
 *   1. Een `valuations`-rij  (spiegel van components/core/assets-client.tsx en
 *      components/app/core/debts/debt-valuation-modal.tsx) — valuation_date =
 *      `<month>-01`, onConflict `VALUATIONS_CONFLICT_KEY`.
 *   2. Een mirror naar `balance_snapshots` via upsertSingleBalanceSnapshot uit
 *      lib/balance-snapshot.ts — snapshot_date `<month>-01`. entity_name /
 *      entity_subtype / net_worth_inclusion_pct komen uit de ACTUELE assets/
 *      debts-rij van de gebruiker (huidige pct is correct voor nieuwe rijen).
 *
 * STRIKT GESCHEIDEN: `net_worth_snapshots` wordt hier NOOIT geraakt — dat is de
 * aggregaat-totaalhistorie (/api/snapshots/history) en blijft een apart domein.
 *
 * TOEGANG: alleen eigen rijen, via de gebruiker-gebonden server-client (geen
 * service-role). RLS op assets/debts/valuations/balance_snapshots dwingt own-row
 * af; we filteren bovendien expliciet op user_id. Eén 404 voor "bestaat niet" én
 * "niet van jou" (geen informatie-lek over andermans entiteiten).
 *
 * LOCF/"doortrekken" gebeurt CLIENT-side (de editor stuurt expliciete entries) —
 * deze API interpoleert of genereert NOOIT zelf waardes.
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_MONTHS = 24

// ── Maand-ordinaal-rekenkunde (lokale tijd — nooit toISOString voor grenzen) ──

/** Maanden-index sinds jaar 0 (year*12 + monthIndex0). */
function monthOrdinal(year: number, month1to12: number): number {
  return year * 12 + (month1to12 - 1)
}

/** Huidige maand-ordinaal in lokale tijd (server). */
function currentMonthOrdinal(now = new Date()): number {
  return monthOrdinal(now.getFullYear(), now.getMonth() + 1)
}

/** Parse een reeds gevalideerde 'YYYY-MM' naar zijn ordinaal. */
function parseMonthOrdinal(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return monthOrdinal(y, m)
}

/** Lokale 'YYYY-MM' voor de maand-Date (tijdzone-onafhankelijk). */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 24 kalendermaanden oud→nieuw, eindigend op de huidige maand (lokale tijd). */
function buildMonthAxis(now: Date): string[] {
  const axis: string[] = []
  for (let i = MAX_MONTHS - 1; i >= 0; i--) {
    axis.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  }
  return axis
}

/** Groep-label voor een entiteit — WealthGroup (asset) of DebtGroup (debt). */
function groupFor(entityType: 'asset' | 'debt', subtype: string): string {
  if (entityType === 'asset') {
    return WEALTH_GROUPS[subtype as AssetType] ?? 'overig'
  }
  return getDebtGroup(subtype as DebtType)
}

// ── GET ──────────────────────────────────────────────────────

type EntityListRow = { id: string; name: string; subtype: string; current: number }

/**
 * GET /api/snapshots/entity-backfill?entityType=asset|debt
 * → { entities: Array<{ id, name, group, subtype, isActive: true, currentValue,
 *     months: { month: 'YYYY-MM', balance: number|null }[] }> }
 *
 * Alleen ACTIEVE eigen entiteiten. `months` is de vaste 24-maands-as oud→nieuw;
 * `balance` = laatste balance_snapshots-rij in die kalendermaand (dedupe: laatste
 * snapshot_date wint), of null wanneer er geen rij is.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return unauthorized()
  }

  const entityType = new URL(request.url).searchParams.get('entityType')
  if (entityType !== 'asset' && entityType !== 'debt') {
    return badRequest("entityType moet 'asset' of 'debt' zijn")
  }

  // Alias asset_type/debt_type → subtype en current_value/current_balance →
  // current, zodat de rest van de handler uniform is voor beide types.
  const table = entityType === 'asset' ? 'assets' : 'debts'
  const selectCols = entityType === 'asset'
    ? 'id, name, subtype:asset_type, current:current_value'
    : 'id, name, subtype:debt_type, current:current_balance'

  const { data: entityData, error: entityError } = await supabase
    .from(table)
    .select(selectCols)
    .eq('user_id', claims.sub)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (entityError) {
    return serverError(entityError, 'entity-backfill:GET')
  }

  const now = new Date()
  const fromIso = localMonthStartMonthsAgo(now, MAX_MONTHS - 1) // '<YYYY-MM>-01'

  const { data: snapData, error: snapError } = await supabase
    .from('balance_snapshots')
    .select('entity_id, snapshot_date, balance')
    .eq('user_id', claims.sub)
    .eq('entity_type', entityType)
    .gte('snapshot_date', fromIso)
    .order('snapshot_date', { ascending: true })

  if (snapError) {
    return serverError(snapError, 'entity-backfill:GET')
  }

  // entity_id → maand('YYYY-MM') → balance. Rijen zijn oplopend gesorteerd, dus
  // de laatste snapshot_date in een maand overschrijft eerdere (byMonth-dedupe,
  // identiek aan de aggregaat-historie).
  const byEntityMonth = new Map<string, Map<string, number>>()
  for (const row of (snapData ?? []) as Array<{ entity_id: string; snapshot_date: string; balance: number }>) {
    const eid = String(row.entity_id)
    const month = String(row.snapshot_date).slice(0, 7)
    let months = byEntityMonth.get(eid)
    if (!months) {
      months = new Map<string, number>()
      byEntityMonth.set(eid, months)
    }
    months.set(month, Number(row.balance))
  }

  const axis = buildMonthAxis(now)

  const entities = ((entityData ?? []) as unknown as EntityListRow[]).map((row) => {
    const monthMap = byEntityMonth.get(String(row.id))
    const months = axis.map((month) => ({
      month,
      balance: monthMap?.has(month) ? monthMap.get(month)! : null,
    }))
    return {
      id: String(row.id),
      name: String(row.name),
      group: groupFor(entityType, String(row.subtype)),
      subtype: String(row.subtype),
      isActive: true as const,
      currentValue: Number(row.current),
      months,
    }
  })

  return NextResponse.json({ entities })
}

// ── POST ─────────────────────────────────────────────────────

const bodySchema = z.object({
  entityType: z.enum(['asset', 'debt']),
  entityId: z.string().uuid('entityId moet een geldige uuid zijn'),
  entries: z
    .array(
      z.object({
        // Regex borgt het formaat; geldig maandnummer (01-12) zit in de regex.
        month: z.string().regex(MONTH_RE, 'month moet formaat YYYY-MM hebben'),
        // Eindig getal; negatief toegestaan (parseAmount-semantiek van de sheet).
        balance: z.number().finite('balance moet een eindig getal zijn'),
      }),
    )
    .min(1, 'entries moet 1..24 items bevatten')
    .max(MAX_MONTHS, 'entries moet 1..24 items bevatten'),
  dryRun: z.boolean().optional(),
})

type EntityDetailRow = {
  name: string
  subtype: string
  net_worth_inclusion_pct: number | null
  is_active: boolean
}

/**
 * POST /api/snapshots/entity-backfill
 * body { entityType, entityId, entries: { month, balance }[] (1..24), dryRun? }
 *
 * dryRun=true  → { preview: { month, oldBalance: number|null, newBalance,
 *                  action: 'insert'|'update' }[] } — GEEN writes.
 * dryRun=false → schrijft per entry (valuations + balance_snapshots-mirror op
 *                `<month>-01`) → { count }.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  const parsed = await parseBody(bodySchema, request)
  if (!parsed.ok) {
    return parsed.response
  }
  const { entityType, entityId, entries, dryRun } = parsed.data

  // ── Logische maand-validatie (na zod-formaatcheck) ──
  // Grenzen puur uit lokale datum-componenten (ordinaal-rekenkunde) — geen
  // toISOString, dus tijdzone-onafhankelijk.
  const nowOrdinal = currentMonthOrdinal()
  const minOrdinal = nowOrdinal - (MAX_MONTHS - 1) // laatste 24 maanden, incl. nu
  const seen = new Set<string>()
  for (const entry of entries) {
    const ord = parseMonthOrdinal(entry.month)
    if (ord > nowOrdinal) {
      return badRequest(`Maand ligt in de toekomst: ${entry.month}`)
    }
    if (ord < minOrdinal) {
      return badRequest(`Maand valt buiten de laatste ${MAX_MONTHS} maanden: ${entry.month}`)
    }
    if (seen.has(entry.month)) {
      return badRequest(`Dubbele maand in invoer: ${entry.month}`)
    }
    seen.add(entry.month)
  }

  // ── Eigenaarschap + is_active ──
  // De user_id-filter maakt "bestaat niet" en "niet van jou" ononderscheidbaar:
  // beide leveren 0 rijen → dezelfde 404 (geen informatie-lek).
  const table = entityType === 'asset' ? 'assets' : 'debts'
  const selectCols = entityType === 'asset'
    ? 'name, subtype:asset_type, net_worth_inclusion_pct, is_active'
    : 'name, subtype:debt_type, net_worth_inclusion_pct, is_active'

  const { data: entityData, error: entityError } = await supabase
    .from(table)
    .select(selectCols)
    .eq('id', entityId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (entityError) {
    return serverError(entityError, 'entity-backfill:POST')
  }
  const entity = entityData as EntityDetailRow | null
  if (!entity || entity.is_active !== true) {
    return notFound()
  }

  // ── dryRun: preview zonder writes ──
  if (dryRun) {
    const dates = entries.map((e) => `${e.month}-01`)
    const { data: existingData, error: existingError } = await supabase
      .from('balance_snapshots')
      .select('snapshot_date, balance')
      .eq('user_id', user.id)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .in('snapshot_date', dates)

    if (existingError) {
      return serverError(existingError, 'entity-backfill:POST')
    }

    // Bestaande rij PER exacte `<month>-01`-datum bepaalt insert vs update
    // (dat is precies de onConflict-doelsleutel van de mirror-upsert).
    const existingByDate = new Map<string, number>()
    for (const row of (existingData ?? []) as Array<{ snapshot_date: string; balance: number }>) {
      existingByDate.set(String(row.snapshot_date).slice(0, 10), Number(row.balance))
    }

    const preview = entries.map((e) => {
      const date = `${e.month}-01`
      const has = existingByDate.has(date)
      return {
        month: e.month,
        oldBalance: has ? existingByDate.get(date)! : null,
        newBalance: e.balance,
        action: (has ? 'update' : 'insert') as 'insert' | 'update',
      }
    })

    return NextResponse.json({ preview })
  }

  // ── Echte write: per entry valuations + balance_snapshots-mirror ──
  for (const entry of entries) {
    const date = `${entry.month}-01`

    // 1. valuations-rij op de historische datum (spiegel LIVE-herwaardering:
    //    zelfde kolommen + dezelfde `VALUATIONS_CONFLICT_KEY`).
    const { error: valError } = await supabase.from('valuations').upsert(
      {
        user_id: user.id,
        entity_type: entityType,
        entity_id: entityId,
        valuation_date: date,
        value: entry.balance,
        notes: 'Historische invoer via verloop-editor',
      },
      { onConflict: VALUATIONS_CONFLICT_KEY },
    )
    if (valError) {
      return serverError(valError, 'entity-backfill:POST')
    }

    // 2. Mirror naar balance_snapshots (de bron van de verloop-banden). Anders
    //    dan de LIVE fire-and-forget-mirror is dit hier het PRIMAIRE doel, dus
    //    een gefaalde mirror is een echte 500 (niet stil negeren).
    const mirror = await upsertSingleBalanceSnapshot(supabase, user.id, date, {
      type: entityType,
      id: entityId,
      name: entity.name,
      subtype: entity.subtype,
      balance: entry.balance,
      netWorthInclusionPct: entity.net_worth_inclusion_pct,
    })
    if (!mirror.ok) {
      return serverError(mirror.error, 'entity-backfill:POST')
    }
  }

  return NextResponse.json({ count: entries.length })
}
