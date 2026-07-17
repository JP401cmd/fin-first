import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { dedupeNetWorthByMonth } from '../month-dedupe'

/**
 * /api/snapshots/history — handmatige historische netto-vermogen-invoer.
 *
 * Doel: de gebruiker voert per kalendermaand één totaalbedrag netto vermogen in
 * (tot 24 maanden terug). Die handmatige waarde is de GEZAGHEBBENDE stand voor
 * die maand in de chart-historie (dashboard-data-loader leest snapshot_date +
 * net_worth en dedupe't per kalendermaand: de laatste snapshot_date in de maand
 * wint). We schrijven daarom precies één rij per maand op '<month>-01' en
 * verwijderen eventuele andere rijen (bv. auto-snapshots) in diezelfde maand,
 * zodat de handmatige waarde de byMonth-dedupe wint en idempotent is.
 *
 * Toegang: ALLEEN de eigen rijen. RLS op net_worth_snapshots dwingt own-row
 * CRUD af via auth.uid() = user_id; we schrijven via de gebruiker-gebonden
 * server-client (geen service-role) en filteren bovendien expliciet op user_id.
 * Rijen blijven ownership='personal' (kolom-default) — geen huishoud-share.
 *
 * Schema-noot: total_assets/total_debts/net_worth zijn NOT NULL. Bij handmatige
 * invoer is er geen bezit/schuld-splitsing, dus total_assets = netWorth en
 * total_debts = 0 (net_worth = total_assets - total_debts blijft kloppen).
 * Geen migratie nodig: de unique-constraint (user_id, snapshot_date) draagt de
 * upsert op '<month>-01' al.
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_MONTHS = 24

type HistoryEntry = { month: string; netWorth: number }

/** Maanden-index sinds jaar 0 (year*12 + monthIndex0). Voor maand-rekenkunde. */
function monthOrdinal(year: number, month1to12: number): number {
  return year * 12 + (month1to12 - 1)
}

/** Huidige maand-ordinaal in lokale tijd (server). */
function currentMonthOrdinal(now = new Date()): number {
  return monthOrdinal(now.getFullYear(), now.getMonth() + 1)
}

/** Parse 'YYYY-MM' → ordinaal, of null bij ongeldig formaat. */
function parseMonthOrdinal(month: string): number | null {
  if (!MONTH_RE.test(month)) return null
  const [y, m] = month.split('-').map(Number)
  return monthOrdinal(y, m)
}

/**
 * GET /api/snapshots/history?months=24
 * → { entries: { month: 'YYYY-MM', netWorth: number }[] } oplopend (oudste eerst),
 * alleen eigen rijen, laatste `months` kalendermaanden (clamp 1..24, default 24).
 * Eén entry per kalendermaand: de rij met de laatste snapshot_date in die maand.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  const url = new URL(request.url)
  const monthsRaw = Number(url.searchParams.get('months'))
  // Afwezig/leeg/0/ongeldig → default 24 (Number(null)===0 is finite, dus expliciet
  // op >= 1 testen i.p.v. alleen Number.isFinite, anders klemt het stil naar 1 maand).
  const months = Number.isFinite(monthsRaw) && monthsRaw >= 1
    ? Math.min(MAX_MONTHS, Math.floor(monthsRaw))
    : MAX_MONTHS

  // Ondergrens: eerste dag van de maand `months - 1` terug (inclusief huidige).
  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  const fromIso = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-01`

  const { data, error } = await supabase
    .from('net_worth_snapshots')
    .select('snapshot_date, net_worth')
    .eq('user_id', user.id)
    .gte('snapshot_date', fromIso)
    .order('snapshot_date', { ascending: true })

  if (error) {
    return serverError(error, 'snapshots-history:GET')
  }

  // Dedupe per kalendermaand: laatste snapshot_date in de maand wint. Gedeeld
  // idioom (`dedupeNetWorthByMonth`) zodat /api/snapshots/group-history exact
  // dezelfde maandlogica gebruikt en er geen tweede maand-dedupe kan ontstaan.
  const byMonth = dedupeNetWorthByMonth(data ?? [])

  const entries: HistoryEntry[] = Array.from(byMonth.entries())
    .map(([month, winner]) => ({ month, netWorth: winner.netWorth }))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))

  return NextResponse.json({ entries })
}

/**
 * POST /api/snapshots/history
 * body { entries: { month: 'YYYY-MM', netWorth: number }[] } (1..24 entries).
 * Maakt elke handmatige waarde de gezaghebbende stand voor die maand.
 * → { ok: true, count }. 400 ongeldige input, 401 zonder sessie, 500 DB-fout.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const rawEntries = (body as { entries?: unknown })?.entries
  if (!Array.isArray(rawEntries) || rawEntries.length < 1 || rawEntries.length > MAX_MONTHS) {
    return NextResponse.json(
      { error: `entries moet een array van 1..${MAX_MONTHS} items zijn` },
      { status: 400 },
    )
  }

  const nowOrdinal = currentMonthOrdinal()
  const minOrdinal = nowOrdinal - (MAX_MONTHS - 1) // laatste 24 maanden, inclusief nu

  // Valideer alle entries vóór enige DB-write (alles-of-niets aan de poort).
  const validated: HistoryEntry[] = []
  const seen = new Set<string>()
  for (const item of rawEntries) {
    const month = (item as { month?: unknown })?.month
    const netWorth = (item as { netWorth?: unknown })?.netWorth

    if (typeof month !== 'string') {
      return NextResponse.json({ error: 'month moet een string zijn (YYYY-MM)' }, { status: 400 })
    }
    const ord = parseMonthOrdinal(month)
    if (ord === null) {
      return NextResponse.json({ error: `Ongeldige maand: ${month}` }, { status: 400 })
    }
    if (ord > nowOrdinal) {
      return NextResponse.json({ error: `Maand ligt in de toekomst: ${month}` }, { status: 400 })
    }
    if (ord < minOrdinal) {
      return NextResponse.json(
        { error: `Maand valt buiten de laatste ${MAX_MONTHS} maanden: ${month}` },
        { status: 400 },
      )
    }
    if (typeof netWorth !== 'number' || !Number.isFinite(netWorth)) {
      // Negatief mag (netto vermogen kan negatief zijn); alleen finite vereist.
      return NextResponse.json(
        { error: `netWorth moet een eindig getal zijn voor ${month}` },
        { status: 400 },
      )
    }
    if (seen.has(month)) {
      return NextResponse.json({ error: `Dubbele maand in invoer: ${month}` }, { status: 400 })
    }
    seen.add(month)
    validated.push({ month, netWorth })
  }

  // Per maand: verwijder bestaande rijen in die kalendermaand, upsert dan één
  // rij op '<month>-01'. RLS + expliciete user_id-filter houden dit own-row.
  for (const { month, netWorth } of validated) {
    const monthStart = `${month}-01`
    // Exclusieve bovengrens = eerste dag van de volgende maand.
    const ord = parseMonthOrdinal(month)! // al gevalideerd
    const nextYear = Math.floor((ord + 1) / 12)
    const nextMonth0 = (ord + 1) % 12
    const nextStart = `${nextYear}-${String(nextMonth0 + 1).padStart(2, '0')}-01`

    const { error: delError } = await supabase
      .from('net_worth_snapshots')
      .delete()
      .eq('user_id', user.id)
      .gte('snapshot_date', monthStart)
      .lt('snapshot_date', nextStart)

    if (delError) {
      return serverError(delError, 'snapshots-history:POST')
    }

    const { error: upsertError } = await supabase
      .from('net_worth_snapshots')
      .upsert(
        {
          user_id: user.id,
          snapshot_date: monthStart,
          net_worth: netWorth,
          total_assets: netWorth,
          total_debts: 0,
        },
        { onConflict: 'user_id,snapshot_date' },
      )

    if (upsertError) {
      return serverError(upsertError, 'snapshots-history:POST')
    }
  }

  return NextResponse.json({ ok: true, count: validated.length })
}
