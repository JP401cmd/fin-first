'use client'

/**
 * Horizon-kernel · cutover-vlaggen (FASE 5, stap 1).
 *
 * Per-oppervlak schakelaars die de nieuwe Excel-oracle-rekenkern voor het EIGEN
 * account inschakelen. Standaard uit; productie blijft op de huidige engine.
 * Stap 1 zet alléén de schakelaars neer — de oppervlakken lezen de vlaggen nog
 * niet uit; dat gebeurt in de volgende stap.
 *
 * API-contract (`app/api/horizon-kernel-flags/route.ts`, eigen-rij RLS):
 *   GET  /api/horizon-kernel-flags → { flags }
 *   PUT  /api/horizon-kernel-flags  { flag, enabled } → { flags }
 */

import { useCallback, useEffect, useState } from 'react'
import { SlidersHorizontal, AlertCircle } from 'lucide-react'
import { Kicker } from './ui'
import type { KernelFlagName, KernelFlags } from '@/lib/horizon-kernel/flag'

const FLAG_ROWS: ReadonlyArray<{
  id: KernelFlagName
  label: string
  hint: string
}> = [
  {
    id: 'convergentie',
    label: 'Convergentie-set (/overzicht + /toekomst + dashboard + AI)',
    hint: 'Deze set flipt als één geheel en is bewust niet apart te schakelen — dat voorkomt dat dezelfde FIRE-som per scherm uiteenloopt (anti-divergentie, ADR 0032).',
  },
  {
    id: 'whatif',
    label: 'What-if-scenario’s',
    hint: 'De doorreken-scenario’s waarin je losse aannames vergelijkt.',
  },
  {
    id: 'household',
    label: 'Huishouden/partner-projecties',
    hint: 'De gezamenlijke projectie over jou en je partner.',
  },
  {
    id: 'scalar',
    label: 'Scalar-helpers (o.a. mijlpalen, rapporten)',
    hint: 'Losse afgeleide getallen zoals vrijheidsmijlpalen en rapportwaarden.',
  },
]

function Switch({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-500)] disabled:opacity-50 after:absolute after:-inset-2.5 after:content-[''] ${
        checked ? 'bg-[var(--color-horizon-500)]' : 'bg-[var(--border-md)]'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}

export default function KernelFlagsCard() {
  const [flags, setFlags] = useState<KernelFlags | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<KernelFlagName | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/horizon-kernel-flags')
        if (!res.ok) throw new Error(String(res.status))
        const json: { flags: KernelFlags } = await res.json()
        if (!cancelled) setFlags(json.flags)
      } catch {
        if (!cancelled) setError('Kon de vlaggen niet ophalen.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = useCallback(
    async (id: KernelFlagName) => {
      if (!flags || pending) return
      const next = !flags[id]
      const previous = flags
      setError('')
      setPending(id)
      // Optimistic
      setFlags({ ...flags, [id]: next })
      try {
        const res = await fetch('/api/horizon-kernel-flags', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flag: id, enabled: next }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const json: { flags: KernelFlags } = await res.json()
        setFlags(json.flags)
      } catch {
        setFlags(previous) // rollback
        setError('Kon de vlag niet opslaan. Probeer het opnieuw.')
      } finally {
        setPending(null)
      }
    },
    [flags, pending],
  )

  return (
    <section className="space-y-4 border border-[var(--border-ed)] bg-[var(--paper)] p-5">
      <div>
        <Kicker>Cutover-vlaggen · jouw account</Kicker>
        <h2 className="mt-2 flex items-center gap-2 font-serif text-lg font-bold text-[var(--ink)]">
          <SlidersHorizontal className="h-5 w-5 text-[var(--color-horizon-600)]" />
          Cutover-vlaggen — jouw account
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ink-3)]">
          Schakelt de nieuwe Excel-oracle-rekenkern in voor jouw eigen account, per
          oppervlak. Standaard uit; productie blijft op de huidige engine.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3.5 py-3 text-sm text-[var(--ink-2)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--negative)]" />
          <span>{error}</span>
        </div>
      )}

      <ul className="divide-y divide-[var(--border-ed)] rounded-xl border border-[var(--border-ed)]">
        {FLAG_ROWS.map((row) => {
          const checked = flags?.[row.id] ?? false
          return (
            <li key={row.id} className="flex items-start justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--ink)]">{row.label}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">{row.hint}</p>
              </div>
              {loading || !flags ? (
                <span
                  aria-hidden="true"
                  className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-[var(--subtle)]"
                />
              ) : (
                <Switch
                  checked={checked}
                  disabled={pending !== null}
                  label={row.label}
                  onToggle={() => toggle(row.id)}
                />
              )}
            </li>
          )
        })}
      </ul>

      <p className="text-xs leading-relaxed text-[var(--ink-4)]">
        De oppervlakken zelf zijn nog niet omgezet — deze vlaggen worden in de volgende
        stap uitgelezen.
      </p>
    </section>
  )
}
