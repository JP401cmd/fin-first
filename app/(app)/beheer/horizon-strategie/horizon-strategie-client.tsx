'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Play, Loader2, CheckCircle2, XCircle, ChevronRight, ChevronDown,
  Database, FlaskConical,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { formatFireAge } from '@/lib/horizon-data'
import {
  runHorizonStrategyMatrix,
  type MatrixResult,
  type ComboResult,
  FIRE_AGE_MARGIN_YEARS,
  DOELBEDRAG_REL_MARGIN,
} from '@/lib/regression-tests/horizon-strategie/matrix'
import { buildCompleetHorizonFixture } from '@/lib/regression-tests/horizon-strategie/persona-fixture'

function fireLabel(age: number | null): string {
  if (age === null) return 'onbereikbaar'
  return formatFireAge(age)
}

function fireDelta(actual: number | null, expected: number | null): string {
  if (actual === null || expected === null) return '—'
  const d = actual - expected
  if (Math.abs(d) < 1e-6) return '0'
  return `${d > 0 ? '+' : ''}${d.toFixed(2)} jr`
}

function doelDelta(actual: number, expected: number): string {
  if (expected === 0) return '—'
  const pct = ((actual - expected) / expected) * 100
  if (Math.abs(pct) < 0.005) return '0%'
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
}

// ── Persona-samenvatting (collapsible) ──────────────────────────────────────
function PersonaPanel() {
  const [open, setOpen] = useState(false)
  const fx = useMemo(() => buildCompleetHorizonFixture(), [])

  const assetsByType = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of fx.assets) m.set(a.asset_type, (m.get(a.asset_type) ?? 0) + a.current_value)
    return Array.from(m.entries()).sort((x, y) => y[1] - x[1])
  }, [fx])

  const totalAssets = fx.assets.reduce((s, a) => s + a.current_value, 0)
  const totalDebts = fx.debts.reduce((s, d) => s + d.current_balance, 0)

  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Testpersona — Tessa Compleet ({fx.assets.length} bezittingen · {fx.debts.length} schulden · {fx.lifeEvents.length} life events)
        </span>
        <Link
          href="/beheer/testdata"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
        >
          <Database className="h-3.5 w-3.5" /> seeden op /beheer/testdata
        </Link>
      </button>

      {open && (
        <div className="grid gap-4 border-t border-[var(--border-ed)] px-4 py-4 text-xs text-[var(--ink-2)] sm:grid-cols-2">
          <div>
            <div className="mb-2 font-semibold uppercase tracking-wide text-[var(--ink-3)]">Parameters</div>
            <dl className="space-y-1">
              <div className="flex justify-between"><dt>Huidige leeftijd</dt><dd className="font-mono tabular-nums">{fx.currentAge}</dd></div>
              <div className="flex justify-between"><dt>Netto vermogen</dt><dd className="font-mono tabular-nums">{formatCurrency(totalAssets - totalDebts)}</dd></div>
              <div className="flex justify-between"><dt>Totaal bezittingen</dt><dd className="font-mono tabular-nums">{formatCurrency(totalAssets)}</dd></div>
              <div className="flex justify-between"><dt>Totaal schulden</dt><dd className="font-mono tabular-nums">{formatCurrency(totalDebts)}</dd></div>
              <div className="flex justify-between"><dt>Pensioen-uitgaven/jaar</dt><dd className="font-mono tabular-nums">{formatCurrency(fx.financialInput.yearlyMustExpenses)}</dd></div>
              <div className="flex justify-between"><dt>Sparen/jaar (cashflow)</dt><dd className="font-mono tabular-nums">{formatCurrency(fx.baseAnnualSavingsFromCashflow)}</dd></div>
              <div className="flex justify-between"><dt>Rendement / inflatie</dt><dd className="font-mono tabular-nums">{(fx.grossReturn * 100).toFixed(0)}% / {(fx.inflation * 100).toFixed(0)}%</dd></div>
            </dl>
          </div>
          <div>
            <div className="mb-2 font-semibold uppercase tracking-wide text-[var(--ink-3)]">Bezittingen per type</div>
            <dl className="space-y-1">
              {assetsByType.map(([type, value]) => (
                <div key={type} className="flex justify-between">
                  <dt>{type}</dt>
                  <dd className="font-mono tabular-nums">{formatCurrency(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Eén combinatie-rij met uitklapbare checks ───────────────────────────────
function ComboRow({ combo }: { combo: ComboResult }) {
  const [open, setOpen] = useState(false)
  const ok = combo.status === 'pass'
  const exp = combo.expected
  const act = combo.actual

  return (
    <>
      <tr
        onClick={() => setOpen((v) => !v)}
        className={`cursor-pointer border-t border-[var(--border-ed)] hover:bg-[var(--subtle)]/40 ${ok ? '' : 'bg-red-50/40'}`}
      >
        <td className="px-3 py-2 align-top">
          <div className="flex items-start gap-1.5">
            {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" />}
            <span className="text-[var(--ink)]">{combo.label}</span>
          </div>
        </td>
        {/* Vrijheidsleeftijd */}
        <td className="px-3 py-2 text-right align-top font-mono tabular-nums text-[var(--ink-3)]">{exp ? fireLabel(exp.fireAgeFractional) : '—'}</td>
        <td className="px-3 py-2 text-right align-top font-mono tabular-nums text-[var(--ink)]">{fireLabel(act.fireAgeFractional)}</td>
        <td className="px-3 py-2 text-right align-top font-mono tabular-nums text-[var(--ink-4)]">{exp ? fireDelta(act.fireAgeFractional, exp.fireAgeFractional) : '—'}</td>
        {/* Doelbedrag */}
        <td className="px-3 py-2 text-right align-top font-mono tabular-nums text-[var(--ink-3)]">{exp ? formatCurrency(exp.doelbedrag) : '—'}</td>
        <td className="px-3 py-2 text-right align-top font-mono tabular-nums text-[var(--ink)]">{formatCurrency(act.requiredFirePortfolio)}</td>
        <td className="px-3 py-2 text-right align-top font-mono tabular-nums text-[var(--ink-4)]">{exp ? doelDelta(act.requiredFirePortfolio, exp.doelbedrag) : '—'}</td>
        {/* Status */}
        <td className="px-3 py-2 text-center align-top">
          {ok ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> ok
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              <XCircle className="h-3 w-3" /> fout
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]/30">
          <td colSpan={8} className="px-3 py-3">
            <ul className="space-y-1.5">
              {combo.checks.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  {c.pass ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                  )}
                  <span className="text-[var(--ink-2)]">
                    <span className="font-medium text-[var(--ink)]">{c.name}</span>
                    <span className="text-[var(--ink-4)]"> — {c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Hoofdcomponent ──────────────────────────────────────────────────────────
export default function HorizonStrategieClient() {
  const [result, setResult] = useState<MatrixResult | null>(null)
  const [running, setRunning] = useState(false)

  const run = useCallback(() => {
    setRunning(true)
    // microtask zodat de spinner rendert vóór de synchrone berekening
    setTimeout(() => {
      setResult(runHorizonStrategyMatrix())
      setRunning(false)
    }, 0)
  }, [])

  useEffect(() => {
    run()
  }, [run])

  const allGreen = result ? result.summary.failed === 0 : false

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-ed)] pb-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Horizon-strategietest</h2>
          <p className="mt-1 max-w-2xl font-serif text-sm italic text-[var(--ink-3)]">
            Regressietest van de horizon-grafiek (productie-engine v2) over alle strategie-combinaties op
            de complete persona. Per combinatie worden de vrijheidsleeftijd (±{FIRE_AGE_MARGIN_YEARS} jr) en
            het doelbedrag (±{(DOELBEDRAG_REL_MARGIN * 100).toFixed(0)}%) tegen een vooraf opgezette verwachting
            gevalideerd, plus structurele invarianten.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Bezig…' : 'Test draaien'}
        </button>
      </div>

      {/* Statussamenvatting */}
      {result && (
        <div className={`flex flex-wrap items-center gap-4 border px-4 py-3 ${allGreen ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-200 bg-red-50/60'}`}>
          <span className={`flex items-center gap-2 text-sm font-semibold ${allGreen ? 'text-emerald-700' : 'text-red-700'}`}>
            {allGreen ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            {result.summary.passed}/{result.summary.total} combinaties geslaagd
          </span>
          {result.summary.failed > 0 && (
            <span className="text-sm text-red-700">{result.summary.failed} gefaald</span>
          )}
          <span className="text-xs text-[var(--ink-4)]">huidige leeftijd persona: {result.currentAge}</span>
        </div>
      )}

      <PersonaPanel />

      {/* Groepen */}
      {result?.groups.map((group) => (
        <section key={group.key} className="border border-[var(--border-ed)] bg-[var(--paper)]">
          <div className="border-b border-[var(--border-ed)] px-4 py-2.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
              <FlaskConical className="h-4 w-4 text-emerald-600" />
              {group.label}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                  <th rowSpan={2} className="px-3 py-2 text-left font-medium">Combinatie</th>
                  <th colSpan={3} className="border-b border-[var(--border-ed)] px-3 py-1.5 text-center font-medium">Vrijheidsleeftijd</th>
                  <th colSpan={3} className="border-b border-[var(--border-ed)] px-3 py-1.5 text-center font-medium">Doelbedrag</th>
                  <th rowSpan={2} className="px-3 py-2 text-center font-medium">Status</th>
                </tr>
                <tr className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                  <th className="px-3 py-1 text-right font-normal">verwacht</th>
                  <th className="px-3 py-1 text-right font-normal">werkelijk</th>
                  <th className="px-3 py-1 text-right font-normal">Δ</th>
                  <th className="px-3 py-1 text-right font-normal">verwacht</th>
                  <th className="px-3 py-1 text-right font-normal">werkelijk</th>
                  <th className="px-3 py-1 text-right font-normal">Δ</th>
                </tr>
              </thead>
              <tbody>
                {group.combos.map((combo) => (
                  <ComboRow key={combo.id} combo={combo} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {!result && !running && (
        <p className="text-sm text-[var(--ink-3)]">Klik op “Test draaien” om de matrix te berekenen.</p>
      )}
    </div>
  )
}
