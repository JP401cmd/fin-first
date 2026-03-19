import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  computeDrift,
  suggestTrades,
  getUnclassifiedHoldings,
  isBox3Window,
  type RebalancingReport,
} from '@/lib/rebalancing'
import type { AllocationViewMode, HoldingForAllocation } from '@/lib/portfolio-allocation'

/**
 * GET /api/rebalancing/check — Drift check endpoint
 *
 * Fetches holdings + target allocations, returns a full RebalancingReport
 * with drift analysis and trade suggestions.
 *
 * Query params:
 *   ?view_mode=asset_class|sector|geography  (default: asset_class)
 *   ?threshold=5                              (drift threshold %, default: 5)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const viewMode = (searchParams.get('view_mode') || 'asset_class') as AllocationViewMode

  if (!['asset_class', 'sector', 'geography'].includes(viewMode)) {
    return NextResponse.json({ error: 'Ongeldig view_mode' }, { status: 400 })
  }

  // Read user's drift threshold preference (fallback to query param, then 5%)
  let threshold = Number(searchParams.get('threshold') || '0')
  if (!threshold) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('rebalance_threshold')
      .eq('id', user.id)
      .single()
    threshold = profile?.rebalance_threshold ?? 5
  }

  if (isNaN(threshold) || threshold < 0 || threshold > 100) {
    return NextResponse.json({ error: 'Ongeldige threshold (0-100)' }, { status: 400 })
  }

  try {
    // ── Fetch holdings ──────────────────────────────────────
    const { data: holdingsData, error: holdingsError } = await supabase
      .from('holdings')
      .select(
        'id, name, ticker, units, avg_purchase_price, current_price, is_active, asset_class, sector, geography',
      )
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (holdingsError) {
      return NextResponse.json({ error: 'Kon holdings niet laden' }, { status: 500 })
    }

    const holdings: HoldingForAllocation[] = (holdingsData || [])
      .map((h) => {
        const price = h.current_price ?? h.avg_purchase_price
        const value = price * Math.max(0, h.units)
        return {
          id: h.id,
          name: h.name,
          ticker: h.ticker,
          value,
          asset_class: h.asset_class || null,
          sector: h.sector || null,
          geography: h.geography || null,
        }
      })
      .filter((h) => h.value > 0)

    const totalValue = holdings.reduce((s, h) => s + h.value, 0)

    // ── Fetch target allocations ────────────────────────────
    let targets: Array<{ category: string; target_pct: number }> = []
    let hasTargets = false

    try {
      const { data } = await supabase
        .from('target_allocations')
        .select('category, target_pct')
        .eq('user_id', user.id)
        .eq('view_mode', viewMode)

      targets = (data || []).map((t) => ({
        category: t.category,
        target_pct: Number(t.target_pct),
      }))
      hasTargets = targets.length > 0
    } catch {
      // Table might not exist yet — return empty targets
    }

    // ── Progressive disclosure: no targets → minimal response ──
    if (!hasTargets) {
      return NextResponse.json({
        viewMode,
        totalValue,
        drifts: [],
        trades: [],
        unclassifiedHoldings: getUnclassifiedHoldings(holdings, viewMode),
        isBox3Window: isBox3Window(),
        hasTargets: false,
        unclassifiedCount: getUnclassifiedHoldings(holdings, viewMode).length,
        lastCheckedAt: new Date().toISOString(),
      })
    }

    // ── Compute drift and trade suggestions ─────────────────
    const drifts = computeDrift(holdings, targets, viewMode)
    const trades = suggestTrades(drifts, holdings, viewMode, { threshold })
    const unclassified = getUnclassifiedHoldings(holdings, viewMode)

    const report: RebalancingReport & {
      hasTargets: boolean
      unclassifiedCount: number
      lastCheckedAt: string
    } = {
      viewMode,
      totalValue,
      drifts,
      trades,
      unclassifiedHoldings: unclassified,
      isBox3Window: isBox3Window(),
      generatedAt: new Date().toISOString(),
      // Additional metadata
      hasTargets: true,
      unclassifiedCount: unclassified.length,
      lastCheckedAt: new Date().toISOString(),
    }

    return NextResponse.json(report)
  } catch (err) {
    console.error('Rebalancing check error:', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
