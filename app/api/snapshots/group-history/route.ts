import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { loadWealthGroupHistory } from '@/lib/load-category-history'
import { dedupeNetWorthByMonth, isManualMonthStand } from '../month-dedupe'

/**
 * GET /api/snapshots/group-history?months=24 — "Netto vermogen — verloop" (brok B2a).
 *
 * Combineert twee canonieke bronnen tot één as-uitgelijnde reeks:
 *   1. De gewogen vermogens- en schuldgroepen uit `loadWealthGroupHistory`
 *      (brok B1) — die bepaalt ook de maand-as (`months`, oud→nieuw).
 *   2. De netto-vermogen-lijn uit `net_worth_snapshots` (dé canonieke stand),
 *      per kalendermaand ge-dedupe'd met exact hetzelfde idioom als
 *      /api/snapshots/history (gedeelde helper `dedupeNetWorthByMonth`).
 *
 * De RESTBAND is het verschil tussen de canonieke netto-stand en de som van de
 * gewogen groepen (`net − (Σassets − Σdebts)`) — op precies deze ene plek
 * berekend, nooit in een groep verstopt. Hij kan positief én negatief zijn
 * (bv. door inclusion-weging, losse cash of afronding).
 *
 * Consume, don't recompute: er wordt hier NIETS herberekend — de groepen komen
 * uit de B1-loader en `net` uit de opgeslagen snapshots.
 *
 * Toegang: own-row via de gebruiker-gebonden server-client (RLS + expliciete
 * user_id-filter op `net_worth_snapshots`); NOOIT service-role. De B1-loader
 * scoped `balance_snapshots` zelf via RLS.
 */

const MAX_MONTHS = 24

type NetProvKind = 'measured' | 'locf' | 'manual'

export async function GET(request: Request) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return unauthorized()
  }

  // months clampen 1..24 (default 24) — identiek idioom aan /api/snapshots/history:
  // Number(null)===0 is finite, dus expliciet op >= 1 testen i.p.v. alleen
  // Number.isFinite, anders klemt afwezig/0 stil naar de ondergrens.
  const monthsRaw = Number(new URL(request.url).searchParams.get('months'))
  const months = Number.isFinite(monthsRaw) && monthsRaw >= 1
    ? Math.min(MAX_MONTHS, Math.floor(monthsRaw))
    : MAX_MONTHS

  try {
    // Groepsbanden (B1). Levert tevens de CANONIEKE maand-as waarop `net`/`rest`
    // exact uitgelijnd worden.
    const groups = await loadWealthGroupHistory(supabase, { months })
    const monthKeys = groups.months
    // Ondergrens = 1e van de oudste maand-as-maand. Hergebruikt de loader-as als
    // venster zodat de net-query gegarandeerd hetzelfde venster deelt (geen
    // tweede, mogelijk driftende maandgrens-berekening).
    const fromIso = `${monthKeys[0]}-01`

    // Netto-lijn uit net_worth_snapshots — zelfde per-maand-dedupe als history.
    const { data: snapRows, error: snapError } = await supabase
      .from('net_worth_snapshots')
      .select('snapshot_date, net_worth')
      .eq('user_id', claims.sub)
      .gte('snapshot_date', fromIso)
      .order('snapshot_date', { ascending: true })

    if (snapError) {
      return serverError(snapError, 'snapshots-group-history:GET')
    }

    const byMonth = dedupeNetWorthByMonth(snapRows ?? [])

    // hasData — contract: 'false ⇔ geen balance_snapshots voor deze user in het
    // venster'. Bewust een LICHTE head-count op `balance_snapshots` i.p.v. afleiden
    // uit de loader-output: die output kan 'geen rijen' niet betrouwbaar
    // onderscheiden van 'wel rijen, alle saldi 0' (beide → alle groepen 0 +
    // provenance 'measured'). Eén goedkope index-hit (idx user_id, snapshot_date)
    // geeft het juiste antwoord. Zelfde venster als de loader (`fromIso`).
    const { count: balanceCount, error: countError } = await supabase
      .from('balance_snapshots')
      .select('snapshot_date', { count: 'exact', head: true })
      .eq('user_id', claims.sub)
      .gte('snapshot_date', fromIso)

    if (countError) {
      return serverError(countError, 'snapshots-group-history:GET')
    }

    const hasData = (balanceCount ?? 0) > 0

    // net[] + provenance['net'] uitgelijnd op de loader-maand-as. Maand zonder
    // stand → net = null, provenance = 'measured' (er is geen handmatige rij en
    // LOCF bestaat niet voor de net-lijn).
    const net: (number | null)[] = []
    const netProvenance: NetProvKind[] = []
    for (const month of monthKeys) {
      const winner = byMonth.get(month)
      if (!winner) {
        net.push(null)
        netProvenance.push('measured')
      } else {
        net.push(winner.netWorth)
        netProvenance.push(isManualMonthStand(winner.snapshotDate) ? 'manual' : 'measured')
      }
    }

    // Restband — op precies deze ene plek berekend:
    //   rest[m] = net[m] − (Σ assetGroups[m] − Σ debtGroups[m])
    // null waar net[m] null is. Kan positief én negatief zijn; nooit weggelaten.
    const assetSeries = Object.values(groups.assetGroups)
    const debtSeries = Object.values(groups.debtGroups)
    const rest: (number | null)[] = monthKeys.map((_, i) => {
      const n = net[i]
      if (n === null) return null
      const assetSum = assetSeries.reduce((s, arr) => s + (arr[i] ?? 0), 0)
      const debtSum = debtSeries.reduce((s, arr) => s + (arr[i] ?? 0), 0)
      return n - (assetSum - debtSum)
    })

    // Provenance van de loader (asset:<groep>/debt:<groep>) + de net-lijn.
    const provenance: Record<string, NetProvKind[]> = {
      ...groups.provenance,
      net: netProvenance,
    }

    return NextResponse.json({
      months: monthKeys,
      assetGroups: groups.assetGroups,
      debtGroups: groups.debtGroups,
      rest,
      net,
      hasData,
      provenance,
    })
  } catch (err) {
    return serverError(err, 'snapshots-group-history:GET')
  }
}
