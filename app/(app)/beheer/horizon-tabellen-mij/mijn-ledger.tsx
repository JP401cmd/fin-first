'use client'

/**
 * MijnLedger — de grootboek-engine v2 op de ECHTE data van de ingelogde
 * gebruiker. Fetcht `GET /api/horizon-engine/ledger` (alleen-lezen) en rendert
 * exact dezelfde gedeelde weergaves als de persona-inspector: `<LedgerChart>` +
 * `<LedgerTabs>` (tabellen A–H). Bovenaan een v1↔v2-samenvatting zodat zichtbaar
 * is hoe de nieuwe engine zich verhoudt tot de productie-engine voor dit account.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LineChart, UserCheck, AlertCircle, GitCompareArrows, Info } from 'lucide-react'

import type { HorizonLedgerResult } from '@/lib/horizon-engine'
import { type FireEndStrategy, STRATEGY_LABELS } from '@/lib/fire-strategy'
import { LedgerChart, LedgerTabs, Kicker, eur, eurShort } from '../horizon-tabellen/ledger-views'

interface LedgerApiResponse {
  ok: boolean
  reason?: string
  strategy?: FireEndStrategy
  result?: HorizonLedgerResult
}

function strategyLabel(s?: FireEndStrategy): string {
  if (!s) return '—'
  return STRATEGY_LABELS[s]?.name ?? s
}

function SummaryStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] font-mono">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[var(--ink)] leading-tight">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-[var(--ink-3)]">{sub}</div>}
    </div>
  )
}

export default function MijnLedger() {
  const [state, setState] = useState<'loading' | 'error' | 'unavailable' | 'ready'>('loading')
  const [data, setData] = useState<LedgerApiResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/horizon-engine/ledger')
        if (!res.ok) {
          if (!cancelled) {
            setErrorMsg(res.status === 401 ? 'Je bent niet ingelogd.' : `Serverfout (${res.status}).`)
            setState('error')
          }
          return
        }
        const json: LedgerApiResponse = await res.json()
        if (cancelled) return
        setData(json)
        if (!json.ok) setState('unavailable')
        else setState('ready')
      } catch {
        if (!cancelled) {
          setErrorMsg('Kon de grootboek-data niet ophalen.')
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
      {/* STAP-5-banner: dit v2-grootboek-inzicht is vervangen door de horizon-kernel.
          De kernel-tabellen (maandbasis, oracle-bewezen) zijn de waarheid; deze pagina
          toont nog de oude v2-tabellen en verdwijnt in FASE 6, stap 5. */}
      <div className="rounded-xl border border-[var(--border-ed)] border-l-[3px] border-l-[var(--color-horizon-500)] bg-[var(--subtle)] p-4">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-horizon-600)]" />
          <div className="text-sm text-[var(--ink-2)]">
            <div className="font-semibold text-[var(--ink)]">Vervangen door de Horizon-kernel</div>
            <p className="mt-1 text-[var(--ink-3)]">
              Dit v2-grootboek-inzicht is vervangen door{' '}
              <Link
                href="/beheer/horizon-kernel"
                className="font-medium text-[var(--color-horizon-700)] underline decoration-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink)]"
              >
                /beheer/horizon-kernel
              </Link>{' '}
              — tab &ldquo;Stappen &amp; tabellen&rdquo;. Die maandbasis-, oracle-bewezen kernel-tabellen
              zijn de waarheid. Deze pagina toont nog de oude v2-grootboek-tabellen en verdwijnt in
              FASE 6, stap 5.
            </p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Kicker>De Horizon · jouw grootboek</Kicker>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-[var(--ink)]">
            <LineChart className="h-6 w-6 text-[var(--color-horizon-600)]" />
            Horizon-tabellen (mijn data)
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ink-3)]">
            Dezelfde FIRE-grafiek en tabellen A–H als de persona-inspector, maar nu volledig
            aangedreven door jouw eigen, ingevoerde gegevens. Alleen-lezen — er wordt niets gewijzigd.
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-horizon-500)] bg-[color-mix(in_oklch,var(--color-horizon-500)_12%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-horizon-700)] font-mono">
          <UserCheck className="h-3.5 w-3.5" />
          Echte data · jouw account
        </span>
      </div>

      {state === 'loading' && (
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-10 text-center text-sm text-[var(--ink-3)]">
          Je grootboek wordt berekend…
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-5 text-sm text-[var(--ink-2)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--negative)]" />
          <span>{errorMsg}</span>
        </div>
      )}

      {state === 'unavailable' && data && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-5 text-sm text-[var(--ink-2)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-kern-600)]" />
          <div>
            <div className="font-semibold text-[var(--ink)]">Nog niet genoeg gegevens</div>
            <p className="mt-1 text-[var(--ink-3)]">{data.reason ?? 'Onvoldoende data om de projectie te draaien.'}</p>
          </div>
        </div>
      )}

      {state === 'ready' && data?.result && (
        <div className="space-y-6">
          {/* Samenvatting — grootboek-engine op jouw account */}
          <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
            <div className="flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4 text-[var(--color-horizon-600)]" />
              <Kicker>Grootboek-engine · jouw account</Kicker>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SummaryStat
                label="FIRE-leeftijd"
                value={`${data.result.fireAge ?? '—'}`}
                sub={data.result.fireReachable ? 'FIRE haalbaar binnen horizon' : 'FIRE niet bereikt binnen horizon'}
              />
              <SummaryStat
                label="Benodigd vermogen"
                value={eurShort(data.result.requiredFirePortfolioAtFire)}
                sub="benodigd liquide vermogen op FIRE"
              />
              <SummaryStat
                label="Actieve strategie"
                value={strategyLabel(data.strategy)}
                sub="koopkracht van nu (reëel)"
              />
            </div>
            <p className="mt-3 text-xs italic text-[var(--ink-3)]">
              Grootboek-engine (reëel, koopkracht nu) — de enige FIRE-rekenmotor sinds de
              v1-uitfasering. Alleen-lezen rapportage op je eigen ingevoerde gegevens.
            </p>
          </div>

          {/* Volledige benodigd-getallen */}
          {data.result.fireAge != null && (
            <p className="text-sm text-[var(--ink-2)]">
              v2 benodigd liquide vermogen op FIRE: <span className="font-mono tabular-nums">{eur(data.result.requiredFirePortfolioAtFire)}</span>.
            </p>
          )}

          {/* Gedeelde grafiek + tabellen op de ECHTE data */}
          <LedgerChart result={data.result} />
          <LedgerTabs result={data.result} />
        </div>
      )}
    </div>
  )
}
