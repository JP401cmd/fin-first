'use client'

import { useEffect, useState } from 'react'

import type { Valuation } from './debt-types'
import { MaskedAmount } from '@/components/app/masked-amount'

export function ValuationHistory({
  entityId,
  valuations,
  onLoad,
}: {
  entityId: string
  valuations: Valuation[] | undefined
  onLoad: () => void
}) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!loaded) {
      setLoaded(true)
      onLoad()
    }
  }, [loaded, onLoad])

  if (!valuations || valuations.length === 0) return null

  return (
    <div className="mt-4 border-t border-[var(--border-ed)] pt-3">
      <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Saldohistorie</p>
      <div className="space-y-1">
        {valuations.map((v) => {
          const prev = valuations.find((vv) => vv.valuation_date < v.valuation_date)
          const diff = prev ? Number(v.value) - Number(prev.value) : null
          return (
            <div key={v.id} className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 text-[var(--ink-3)]">
                {new Date(v.valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className="font-medium text-[var(--ink-2)]">{<MaskedAmount value={Number(v.value)} tone="kern" />}</span>
              {diff !== null && (
                <span className={`text-[10px] font-medium ${diff <= 0 ? 'text-positive' : 'text-negative'}`}>
                  {diff >= 0 ? '+' : ''}{<MaskedAmount value={diff} tone="kern" />}
                </span>
              )}
              {v.notes && (
                <span className="truncate text-[var(--ink-3)]">{v.notes}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
