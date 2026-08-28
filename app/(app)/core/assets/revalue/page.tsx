'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RefreshCw, Loader2, AlertCircle, Lock, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { safeRelativePath } from '@/lib/safe-redirect'
import { BudgetIcon } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString, formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { Kicker, EditorialHeadline, EditorialDeck } from '@/components/editorial'
import { captureBalanceSnapshots } from '@/lib/balance-snapshot'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import {
  type Asset,
  type AssetType,
  ASSET_CLIENT_COLUMNS,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_ICONS,
  ASSET_TYPE_COLORS,
} from '@/lib/asset-data'
import { VALUATIONS_CONFLICT_KEY } from '@/lib/valuations'

type HoldingsMap = Record<string, boolean>
type LinkedBankMap = Set<string>

/** Legacy bezittingen-route — de terugval wanneer geen (geldige) `returnTo` meekomt. */
const DEFAULT_REVALUE_RETURN = '/core/assets'

/**
 * Resolveer de veilige terug-bestemming na een bulk-herwaardering. De
 * `returnTo`-queryparam (bv. `/overzicht/bezittingen`, meegegeven door de
 * Herwaarderen-knop) mag uitsluitend een relatief in-app pad zijn —
 * `safeRelativePath` weert open-redirects (`//evil.com`, `https://…`, `\`, …).
 * Zonder geldige param val je terug op de legacy bezittingen-route, zodat wie
 * vanaf /overzicht/bezittingen herwaardeert daar ook weer terugkomt.
 */
export function resolveRevalueReturnTo(param: string | null | undefined): string {
  return safeRelativePath(param, DEFAULT_REVALUE_RETURN)
}

export default function RevaluePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = resolveRevalueReturnTo(searchParams.get('returnTo'))
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [newValues, setNewValues] = useState<Record<string, string>>({})
  const [holdingsMap, setHoldingsMap] = useState<HoldingsMap>({})
  const [linkedBankAssets, setLinkedBankAssets] = useState<LinkedBankMap>(new Set())
  const [dailyExpenses, setDailyExpenses] = useState(0)

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load assets, bank links, and monthly expenses in parallel
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd = now.getMonth() === 11
        ? `${now.getFullYear() + 1}-01-01`
        : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`

      const [assetsResult, bankLinksResult, txResult] = await Promise.all([
        // Expliciete kolomlijst i.p.v. `select('*')`: `assets` heeft een
        // huishoud-gedeelde SELECT-policy, dus `*` levert bij een gedeelde
        // bezitting óók `account_number_hash`/`account_number_encrypted` van de
        // PARTNER in deze bundel. Zie ASSET_CLIENT_COLUMNS.
        supabase
          .from('assets')
          .select(ASSET_CLIENT_COLUMNS)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('bank_accounts')
          .select('id, linked_asset_id')
          .not('linked_asset_id', 'is', null)
          .eq('is_active', true),
        supabase
          .from('transactions')
          .select('amount')
          .gte('date', monthStart)
          .lt('date', monthEnd),
      ])

      if (assetsResult.error) throw assetsResult.error

      const loadedAssets = (assetsResult.data ?? []) as Asset[]
      setAssets(loadedAssets)

      // Initialize new values with current values
      const initial: Record<string, string> = {}
      for (const a of loadedAssets) {
        initial[a.id] = String(Number(a.current_value))
      }
      setNewValues(initial)

      // Build linked bank account set
      const bankLinked = new Set<string>(
        (bankLinksResult.data ?? []).map((ba: { linked_asset_id: string }) => ba.linked_asset_id)
      )
      setLinkedBankAssets(bankLinked)

      // Calculate daily expenses
      if (txResult.data) {
        const totalSpend = txResult.data.reduce((s: number, t: { amount: number }) => {
          const amt = Number(t.amount)
          return amt < 0 ? s + Math.abs(amt) : s
        }, 0)
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
        setDailyExpenses(totalSpend / daysInMonth)
      }

      // Check holdings for all assets in één batch-call (i.p.v. N calls)
      const hMap: HoldingsMap = {}
      if (loadedAssets.length > 0) {
        try {
          const ids = loadedAssets.map((a) => a.id).join(',')
          const res = await fetch(`/api/assets/has-holdings?asset_ids=${ids}`)
          const data = await res.json()
          const holdings = (data.holdings ?? {}) as Record<string, boolean>
          for (const a of loadedAssets) {
            hMap[a.id] = holdings[a.id] === true
          }
        } catch {
          // Bij een fout: geen assets als holdings-locked markeren
        }
      }
      setHoldingsMap(hMap)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon assets niet laden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Group assets by type (same order as main page)
  const byType = useMemo(() => {
    const map: Partial<Record<AssetType, Asset[]>> = {}
    for (const type of Object.keys(ASSET_TYPE_LABELS) as AssetType[]) {
      const typeAssets = assets.filter((a) => a.asset_type === type)
      if (typeAssets.length > 0) map[type] = typeAssets
    }
    return map
  }, [assets])

  // Determine if an asset is locked (only holdings-managed assets)
  const isLocked = useCallback((asset: Asset) => {
    return holdingsMap[asset.id]
  }, [holdingsMap])

  const lockReason = useCallback((asset: Asset) => {
    if (holdingsMap[asset.id]) return 'Waarde wordt beheerd via holdings'
    return null
  }, [holdingsMap])

  // Calculate totals and deltas
  const { totalCurrent, totalNew, changedCount } = useMemo(() => {
    let totalCurrent = 0
    let totalNew = 0
    let changedCount = 0
    for (const asset of assets) {
      const current = Number(asset.current_value)
      const newVal = Number(newValues[asset.id] || current)
      totalCurrent += current
      if (!isLocked(asset)) {
        totalNew += isNaN(newVal) ? current : newVal
        if (Math.abs(newVal - current) >= 0.01) changedCount++
      } else {
        totalNew += current
      }
    }
    return { totalCurrent, totalNew, changedCount }
  }, [assets, newValues, isLocked])

  const totalDelta = totalNew - totalCurrent

  function handleValueChange(assetId: string, value: string) {
    // Allow empty, numbers, and decimals
    if (value !== '' && !/^-?\d*\.?\d*$/.test(value)) return
    setNewValues(prev => ({ ...prev, [assetId]: value }))
  }

  async function handleSaveAll() {
    if (changedCount === 0 || saving) return
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Niet ingelogd')

      // Find changed assets
      const changes: { asset: Asset; newValue: number }[] = []
      for (const asset of assets) {
        if (isLocked(asset)) continue
        const current = Number(asset.current_value)
        const newVal = Number(newValues[asset.id])
        if (isNaN(newVal) || Math.abs(newVal - current) < 0.01) continue
        changes.push({ asset, newValue: newVal })
      }

      if (changes.length === 0) return

      // Upsert all valuations
      const valuationRows = changes.map(({ asset, newValue }) => ({
        user_id: user.id,
        entity_type: 'asset' as const,
        entity_id: asset.id,
        valuation_date: date,
        value: newValue,
        notes: notes || null,
      }))

      const { error: valError } = await supabase
        .from('valuations')
        .upsert(valuationRows, { onConflict: VALUATIONS_CONFLICT_KEY })

      if (valError) throw valError

      // Update all asset current_values
      await Promise.all(
        changes.map(({ asset, newValue }) =>
          supabase.from('assets').update({ current_value: newValue }).eq('id', asset.id)
        )
      )

      // Capture balance snapshot with updated values
      const updatedAssets = assets.map(a => {
        const change = changes.find(c => c.asset.id === a.id)
        return {
          id: a.id,
          name: a.name,
          asset_type: a.asset_type,
          current_value: change ? change.newValue : Number(a.current_value),
          net_worth_inclusion_pct: a.net_worth_inclusion_pct ?? 100,
        }
      })

      // Load debts for snapshot
      const { data: debts } = await supabase
        .from('debts')
        .select('id, name, debt_type, current_balance, net_worth_inclusion_pct')
        .eq('is_active', true)

      await captureBalanceSnapshots(
        supabase,
        user.id,
        date,
        updatedAssets,
        (debts ?? []).map(d => ({
          id: d.id,
          name: d.name,
          debt_type: d.debt_type,
          current_balance: Number(d.current_balance),
          net_worth_inclusion_pct: d.net_worth_inclusion_pct ?? 100,
        })),
      )

      setSaved(true)
      setTimeout(() => router.push(returnTo), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-kern-500" />
        <p className="mt-2 text-sm text-[var(--ink-3)]">Assets laden...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <NavStackMeta title="Herwaarderen" />
      {/* Header — editorial blueprint */}
      <header className="mb-6 space-y-2">
        <Kicker>Bezittingen · Herwaarderen</Kicker>
        <EditorialHeadline level="h2" emphasis="herwaarderen" size="lg">
          Assets herwaarderen
        </EditorialHeadline>
        <EditorialDeck>
          Werk alle waardes tegelijk bij — één netto-vermogenswijziging.
        </EditorialDeck>

      </header>

      {/* Date + Notes */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1">Peildatum</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1">Notitie (optioneel)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="bijv. Maandelijkse herwaardering maart"
            className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-[var(--r)] border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Asset groups */}
      <div className="space-y-1">
        {(Object.entries(byType) as [AssetType, Asset[]][]).map(([type, typeAssets]) => {
          const groupColor = ASSET_TYPE_COLORS[type]
          const groupIcon = ASSET_TYPE_ICONS[type]

          return (
            <div key={type}>
              {/* Group header */}
              <div className="flex items-center gap-2 pt-4 pb-1.5">
                <span style={{ color: groupColor }}>
                  <BudgetIcon name={groupIcon} className="h-4 w-4" />
                </span>
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  {ASSET_TYPE_LABELS[type]}
                </h3>
              </div>

              {/* Asset rows */}
              <div className="space-y-2">
                {typeAssets.map((asset) => {
                  const current = Number(asset.current_value)
                  const locked = isLocked(asset)
                  const reason = lockReason(asset)
                  const newVal = Number(newValues[asset.id] || 0)
                  const delta = locked ? 0 : (isNaN(newVal) ? 0 : newVal - current)
                  const hasChanged = Math.abs(delta) >= 0.01

                  return (
                    <div
                      key={asset.id}
                      className={`rounded-[var(--r-lg)] border bg-[var(--paper)] p-3 sm:p-4 ${
                        locked
                          ? 'border-[var(--border-ed)] opacity-60'
                          : hasChanged
                            ? 'border-kern-300'
                            : 'border-[var(--border-ed)]'
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                        {/* Asset info */}
                        <div className="flex items-center gap-3 sm:w-56 shrink-0">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)]"
                            style={{ backgroundColor: `color-mix(in oklch, ${ASSET_TYPE_COLORS[asset.asset_type]} 8%, transparent)` }}
                          >
                            <span style={{ color: ASSET_TYPE_COLORS[asset.asset_type] }}>
                              <BudgetIcon name={ASSET_TYPE_ICONS[asset.asset_type]} className="h-4 w-4" />
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--ink)]">{asset.name}</p>
                            <p className="text-xs text-[var(--ink-3)]">{ASSET_TYPE_LABELS[asset.asset_type]}</p>
                          </div>
                        </div>

                        {/* Current value */}
                        <div className="sm:w-32 shrink-0">
                          <p className="text-xs text-[var(--ink-3)] sm:hidden">Huidig</p>
                          <p className="text-sm font-mono tabular-nums text-[var(--ink-2)]">
                            {fc(current)}
                          </p>
                        </div>

                        {/* Arrow */}
                        <span className="hidden sm:block text-[var(--ink-4)]">→</span>

                        {/* New value input */}
                        <div className="flex-1">
                          {locked ? (
                            <div className="flex items-center gap-2 text-sm text-[var(--ink-3)]">
                              <Lock className="h-3.5 w-3.5" />
                              <span className="text-xs">{reason}</span>
                            </div>
                          ) : (
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-3)]">€</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={newValues[asset.id] ?? ''}
                                onChange={(e) => handleValueChange(asset.id, e.target.value)}
                                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] pl-7 pr-3 py-2 text-sm font-mono tabular-nums text-[var(--ink)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                              />
                            </div>
                          )}
                        </div>

                        {/* Delta */}
                        <div className="sm:w-28 shrink-0 text-right">
                          {!locked && hasChanged && (
                            <p className={`text-sm font-mono tabular-nums font-medium ${
                              delta > 0 ? 'text-positive' : 'text-negative'
                            }`}>
                              {delta > 0 ? '+' : ''}{fc(delta)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer summary */}
      {/* paddingBottom houdt ruimte vrij voor de zwevende mobiele nav-pill
          (FloatingNavButton) zodat de opslaan-actie er niet onder valt; de
          var is 0 boven 768px, dus desktop houdt de reguliere sm:p-6-bodem. */}
      <div
        className="mt-6 sticky bottom-0 rounded-[var(--r-lg)] border border-kern-200 bg-[var(--paper)] p-4 sm:p-6 shadow-lg"
        style={{ paddingBottom: 'calc(1.5rem + var(--mobile-nav-clearance))' }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {/* Current total */}
            <div>
              <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Huidig totaal</p>
              <p className="text-lg font-bold font-mono tabular-nums text-[var(--ink)]">
                {fc(totalCurrent)}
              </p>
            </div>

            {/* Arrow */}
            <div className="hidden sm:flex items-center text-[var(--ink-4)] text-lg">→</div>

            {/* New total */}
            <div>
              <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Nieuw totaal</p>
              <p className="text-lg font-bold font-mono tabular-nums text-[var(--ink)]">
                {fc(totalNew)}
              </p>
            </div>

            {/* Delta */}
            {Math.abs(totalDelta) >= 0.01 && (
              <div>
                <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Verschil</p>
                <p className={`text-lg font-bold font-mono tabular-nums ${
                  totalDelta > 0 ? 'text-positive' : 'text-negative'
                }`}>
                  {totalDelta > 0 ? '+' : ''}{fc(totalDelta)}
                </p>
                {dailyExpenses > 0 && (
                  <p className={`text-xs ${totalDelta > 0 ? 'text-positive/70' : 'text-negative/70'}`}>
                    {(() => {
                      const ft = calculateFreedomTime(Math.abs(totalDelta), dailyExpenses)
                      const str = formatFreedomTimeString(ft, 'short', true)
                      return totalDelta > 0 ? `+${str} vrijheid` : `-${str} vrijheid`
                    })()}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Save button */}
          <button
            onClick={handleSaveAll}
            disabled={changedCount === 0 || saving || saved}
            className={`inline-flex items-center gap-2 rounded-[var(--r)] px-6 py-2.5 text-sm font-medium transition-colors ${
              saved
                ? 'bg-positive text-[var(--paper)]'
                : changedCount === 0
                  ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                  : 'bg-kern-600 text-white hover:bg-kern-700'
            }`}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Opslaan...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4" />
                Opgeslagen
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                {changedCount > 0
                  ? `${changedCount} asset${changedCount !== 1 ? 's' : ''} opslaan`
                  : 'Alles opslaan'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
