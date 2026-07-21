'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  getOpenSettlements,
  settleEntry,
  settleAllBetween,
  computeNetBalance,
  type SettlementEntry,
} from '@/lib/settlement-data'
import { CheckCircle2, Users, ArrowRight, Loader2 } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'

interface HouseholdMember {
  userId: string
  name: string
}

interface SettlementOverviewProps {
  householdId: string
  currentUserId: string
  members: HouseholdMember[]
}

export function SettlementOverview({ householdId, currentUserId, members }: SettlementOverviewProps) {
  const { masked } = useMaskedAmounts()
  const [entries, setEntries] = useState<SettlementEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [settling, setSettling] = useState<string | null>(null)

  const getMemberName = (userId: string) =>
    members.find(m => m.userId === userId)?.name ?? userId.slice(0, 8) + '…'

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getOpenSettlements(householdId)
    setEntries(data)
    setLoading(false)
  }, [householdId])

  useEffect(() => { load() }, [load])

  async function handleSettleEntry(entryId: string) {
    setSettling(entryId)
    await settleEntry(entryId)
    setSettling(null)
    await load()
  }

  async function handleSettleAll(otherUserId: string) {
    setSettling(`all-${otherUserId}`)
    await settleAllBetween(householdId, currentUserId, otherUserId)
    setSettling(null)
    await load()
  }

  const { netAmount, owedBy, owedTo } = computeNetBalance(entries, currentUserId)

  // NULL-tegenpartijen (geanonimiseerd na accountverwijdering) worden uitgefilterd:
  // ze horen niet bij een echte partner-kaart.
  const otherUserIds = Array.from(new Set([
    ...entries.map(e => e.from_user_id),
    ...entries.map(e => e.to_user_id),
  ])).filter((id): id is string => id !== null && id !== currentUserId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-3)]" />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-positive" />
        <p className="mt-2 text-sm font-medium text-[var(--ink-2)]">Alles verrekend</p>
        <p className="mt-0.5 text-xs text-[var(--ink-3)]">Geen openstaande verrekenposten</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Net balance summary */}
      <div className={`rounded-[var(--r-lg)] border px-4 py-3 ${
        netAmount > 0
          ? 'border-positive/30 bg-positive-bg'
          : netAmount < 0
          ? 'border-negative/30 bg-negative-bg'
          : 'border-[var(--border-ed)] bg-[var(--subtle)]'
      }`}>
        <div className="flex items-center gap-2">
          <Users className={`h-4 w-4 ${netAmount > 0 ? 'text-positive' : netAmount < 0 ? 'text-negative' : 'text-[var(--ink-3)]'}`} />
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${
            netAmount > 0 ? 'text-positive' : netAmount < 0 ? 'text-negative' : 'text-[var(--ink-3)]'
          }`}>
            Netto saldo
          </p>
          <span className={`ml-auto font-mono text-base font-bold ${
            netAmount > 0 ? 'text-positive' : netAmount < 0 ? 'text-negative' : 'text-[var(--ink)]'
          }`}>
            {netAmount >= 0 ? '+' : ''}{<MaskedAmount value={netAmount} tone="wil" />}
          </span>
        </div>
        {netAmount > 0 && owedBy.length > 0 && (
          <p className="mt-1 text-xs text-positive">
            {owedBy.map(o => `${getMemberName(o.userId)} (${formatMaskedCurrency(o.amount, masked)})`).join(', ')} {owedBy.length === 1 ? 'is je' : 'zijn je'} nog iets verschuldigd
          </p>
        )}
        {netAmount < 0 && owedTo.length > 0 && (
          <p className="mt-1 text-xs text-negative">
            Je bent nog {owedTo.map(o => `${formatMaskedCurrency(o.amount, masked)} aan ${getMemberName(o.userId)}`).join(' en ')} verschuldigd
          </p>
        )}
      </div>

      {/* Bulk settle per partner */}
      {otherUserIds.length > 0 && (
        <div className="space-y-2">
          {otherUserIds.map(otherId => {
            const entriesWithOther = entries.filter(e =>
              (e.from_user_id === currentUserId && e.to_user_id === otherId) ||
              (e.from_user_id === otherId && e.to_user_id === currentUserId)
            )
            if (entriesWithOther.length === 0) return null

            const netWithOther = entriesWithOther.reduce((sum, e) => {
              if (e.to_user_id === currentUserId) return sum + Number(e.amount)
              return sum - Number(e.amount)
            }, 0)

            const isSettlingAll = settling === `all-${otherId}`

            return (
              <div key={otherId} className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--subtle)] text-xs font-semibold text-[var(--ink-2)]">
                      {getMemberName(otherId).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--ink)]">{getMemberName(otherId)}</p>
                      <p className={`text-xs ${netWithOther > 0 ? 'text-positive' : netWithOther < 0 ? 'text-negative' : 'text-[var(--ink-3)]'}`}>
                        {netWithOther > 0
                          ? `Je krijgt ${formatMaskedCurrency(netWithOther, masked)}`
                          : netWithOther < 0
                          ? `Je betaalt ${formatMaskedCurrency(Math.abs(netWithOther), masked)}`
                          : 'Gelijk'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSettleAll(otherId)}
                    disabled={isSettlingAll}
                    className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {isSettlingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Alles afrekenen
                  </button>
                </div>

                {/* Individual entries */}
                <div className="space-y-1 border-t border-[var(--border-ed)] pt-2">
                  {entriesWithOther.map(entry => {
                    const iOwe = entry.from_user_id === currentUserId
                    const isSettlingThis = settling === entry.id

                    return (
                      <div key={entry.id} className="flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 hover:bg-[var(--subtle)]">
                        <ArrowRight className={`h-3 w-3 shrink-0 ${iOwe ? 'text-negative' : 'text-positive'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-[var(--ink-2)]">
                            {entry.description ?? (iOwe ? `Aan ${getMemberName(otherId)}` : `Van ${getMemberName(otherId)}`)}
                          </p>
                          <p className="text-[10px] text-[var(--ink-3)]">
                            {new Date(entry.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                        <span className={`shrink-0 font-mono text-xs tabular-nums font-medium ${iOwe ? 'text-negative' : 'text-positive'}`}>
                          {iOwe ? '-' : '+'}{<MaskedAmount value={Number(entry.amount)} tone="wil" />}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSettleEntry(entry.id)}
                          disabled={!!settling}
                          className="shrink-0 rounded p-1 text-[var(--ink-4)] hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
                          title="Afrekenen"
                        >
                          {isSettlingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
