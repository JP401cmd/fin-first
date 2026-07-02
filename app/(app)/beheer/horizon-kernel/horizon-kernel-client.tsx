'use client'

/**
 * Horizon-kernel · beheer-transparantie — hoofdscherm.
 *
 * Vijf onderdelen die samen de héle berekening van ruwe invoer tot FIRE-leeftijd
 * navolgbaar maken (ook voor een leek): uitgangspunten → geselecteerde invoer →
 * alle stappen/tabellen → technisch rapport → verificatie. Alleen-lezen; draait de
 * rekenkern op de eigen data van de ingelogde superadmin.
 */

import { useEffect, useState } from 'react'
import { LineChart, UserCheck, AlertCircle } from 'lucide-react'
import { formatFireAge } from '@/lib/horizon-data'
import { Kicker, StatCard, Spinner, eurShort } from './ui'
import type { OverviewResponse, SolverResult, VerifReport } from './types'
import TabUitgangspunten from './tab-uitgangspunten'
import TabGeselecteerd from './tab-geselecteerd'
import TabStappen from './tab-stappen'
import TabTechnisch from './tab-technisch'
import TabVerificatie from './tab-verificatie'

type TabId = 'uitgangspunten' | 'geselecteerd' | 'stappen' | 'technisch' | 'verificatie'

const TABS: ReadonlyArray<{ id: TabId; nr: number; label: string }> = [
  { id: 'uitgangspunten', nr: 1, label: 'Uitgangspunten' },
  { id: 'geselecteerd', nr: 2, label: 'Geselecteerde invoer' },
  { id: 'stappen', nr: 3, label: 'Stappen & tabellen' },
  { id: 'technisch', nr: 4, label: 'Technisch rapport' },
  { id: 'verificatie', nr: 5, label: 'Verificatie' },
]

const STATUS_LABEL: Record<SolverResult['status'], string> = {
  reached_now: 'Nu al bereikt',
  reached_at: 'Bereikt op leeftijd',
  unreachable_within_horizon: 'Niet binnen horizon',
  pension_shortfall: 'Pensioen-tekort',
}

function SolverStrip({ solver, nettoLiquideBijFire, tekortPiek }: {
  solver: SolverResult
  nettoLiquideBijFire: number | null
  tekortPiek: number
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard label="FIRE-leeftijd" value={formatFireAge(solver.fireAge)} sub={STATUS_LABEL[solver.status]} />
      <StatCard label="Doelbedrag" value={eurShort(solver.doelbedrag)} sub="op eindleeftijd (nominaal)" />
      <StatCard label="Modelwaarde" value={eurShort(solver.modelwaarde)} sub="Prognose op eindleeftijd" />
      <StatCard label="Gap" value={eurShort(solver.gap)} sub={solver.gap >= 0 ? 'gehaald' : `hint ${eurShort(solver.maandHint)}/mnd`} />
      <StatCard label="Netto-liquide bij FIRE" value={nettoLiquideBijFire != null ? eurShort(nettoLiquideBijFire) : '—'} sub="Prognose!J op FIRE-maand" />
      <StatCard label="Tekort-lening-piek" value={eurShort(tekortPiek)} sub={`${solver.engineRuns} engine-runs`} />
    </div>
  )
}

export default function HorizonKernelClient() {
  const [tab, setTab] = useState<TabId>('uitgangspunten')
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
  const [err, setErr] = useState('')
  const [bron, setBron] = useState<VerifReport['bron'] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/horizon-kernel')
        if (!res.ok) {
          if (!cancelled) {
            setErr(res.status === 403 ? 'Geen toegang (superadmin vereist).' : `Serverfout (${res.status}).`)
            setState('error')
          }
          return
        }
        const json: OverviewResponse = await res.json()
        if (cancelled) return
        setData(json)
        setState(json.ok ? 'ready' : 'unavailable')
      } catch {
        if (!cancelled) {
          setErr('Kon de kern-data niet ophalen.')
          setState('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Kicker>De Horizon · rekenkern</Kicker>
          <h1 className="mt-2 flex items-center gap-2 font-serif text-2xl font-bold text-[var(--ink)]">
            <LineChart className="h-6 w-6 text-[var(--color-horizon-600)]" />
            Horizon-kernel — transparantie
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ink-3)]">
            De héle berekening van ruwe invoer tot FIRE-leeftijd, navolgbaar gemaakt — óók
            voor een leek. Alleen-lezen; draait de oracle-bewezen rekenkern op jouw eigen
            gegevens.
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-horizon-500)] bg-[color-mix(in_oklch,var(--color-horizon-500)_12%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-horizon-700)] font-mono">
          <UserCheck className="h-3.5 w-3.5" />
          Echte data · jouw account
        </span>
      </div>

      {state === 'loading' && <Spinner label="Rekenkern wordt gedraaid op je data…" />}

      {state === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-5 text-sm text-[var(--ink-2)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--negative)]" />
          <span>{err}</span>
        </div>
      )}

      {state === 'unavailable' && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-5 text-sm text-[var(--ink-2)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" />
          <div>
            <div className="font-semibold text-[var(--ink)]">Nog niet genoeg gegevens</div>
            <p className="mt-1 text-[var(--ink-3)]">{data?.reason ?? 'Onvoldoende data om de kern te draaien.'}</p>
          </div>
        </div>
      )}

      {state === 'ready' && data?.ok && data.solver && data.summary && data.raw && data.kernelInput && (
        <div className="space-y-6">
          <SolverStrip
            solver={data.solver}
            nettoLiquideBijFire={data.summary.nettoLiquideBijFire}
            tekortPiek={data.summary.tekortLeningPiek}
          />

          {/* Tab-navigatie */}
          <div
            role="tablist"
            aria-label="Onderdelen van de rekenkern-transparantie"
            className="flex flex-wrap gap-2 border-b border-[var(--border-ed)] pb-3"
          >
            {TABS.map((t) => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  role="tab"
                  id={`hk-tab-${t.id}`}
                  aria-selected={active}
                  aria-controls={`hk-panel-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className={`rounded-full px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-500)] ${
                    active
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
                  }`}
                >
                  <span className={active ? 'text-[var(--color-horizon-300)]' : 'text-[var(--ink-4)]'}>{t.nr}.</span> {t.label}
                </button>
              )
            })}
          </div>

          <div
            role="tabpanel"
            id={`hk-panel-${tab}`}
            aria-labelledby={`hk-tab-${tab}`}
            tabIndex={0}
            className="focus-visible:outline-none"
          >
            {tab === 'uitgangspunten' && <TabUitgangspunten raw={data.raw} />}
            {tab === 'geselecteerd' && (
              <TabGeselecteerd kernelInput={data.kernelInput} notices={data.notices ?? []} />
            )}
            {tab === 'stappen' && <TabStappen fireAge={data.solver.fireAge} />}
            {tab === 'technisch' && <TabTechnisch bron={bron} />}
            {tab === 'verificatie' && <TabVerificatie onBron={setBron} />}
          </div>
        </div>
      )}
    </div>
  )
}
