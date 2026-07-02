'use client'

/**
 * Deel 5 — Verificatie: on-demand runner die per fixture de integrale engine draait
 * en per tabel cel-voor-cel (€0,01) tegen het Excel-oracle legt. Per tabel groen/rood,
 * max |Δ|, celtelling + de fixture-bron/hash.
 */

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Play, ChevronDown, ChevronRight } from 'lucide-react'
import { SectionCard, Kicker, StatCard, Spinner } from './ui'
import type { VerifReport, VerificationResponse } from './types'

function StatusDot({ ok, title }: { ok: boolean; title: string }) {
  return (
    <span
      title={title}
      className="inline-block h-3 w-3 rounded-full"
      style={{ backgroundColor: ok ? 'var(--positive)' : 'var(--negative)' }}
    />
  )
}

function FixtureRow({ fx }: { fx: VerifReport['fixtures'][number] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${fx.scenario} — details ${open ? 'inklappen' : 'uitklappen'}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
        className={`cursor-pointer border-t border-[var(--border-ed)] hover:bg-[var(--subtle)]/40 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-horizon-500)] ${fx.ok ? '' : 'bg-[color-mix(in_oklch,var(--negative)_7%,transparent)]'}`}
      >
        <td className="px-3 py-2 align-top">
          <div className="flex items-start gap-1.5">
            {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" />}
            <div>
              <div className="font-medium text-[var(--ink)]">{fx.scenario}</div>
              <div className="text-[11px] text-[var(--ink-4)]">{fx.description}</div>
            </div>
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {fx.tables.map((t) => (
              <StatusDot key={t.id} ok={t.ok} title={`${t.sheet}: ${t.mismatchCount} mismatch(es), max |Δ|=${t.maxAbsDiff}`} />
            ))}
          </div>
        </td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--ink-2)]">{fx.maxAbsDiff.toExponential(1)}</td>
        <td className="px-3 py-2 text-center">
          {fx.ok ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-[var(--positive)]">
              <CheckCircle2 className="h-3.5 w-3.5" /> gelijk
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-[var(--negative)]">
              <XCircle className="h-3.5 w-3.5" /> {fx.totalMismatches} afw.
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]/30">
          <td colSpan={4} className="px-3 py-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                    <th scope="col" className="px-2 py-1 text-left font-medium">Tabel</th>
                    <th scope="col" className="px-2 py-1 text-right font-medium">Cellen</th>
                    <th scope="col" className="px-2 py-1 text-right font-medium">Afwijkingen</th>
                    <th scope="col" className="px-2 py-1 text-right font-medium">Max |Δ|</th>
                    <th scope="col" className="px-2 py-1 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fx.tables.map((t) => (
                    <tr key={t.id} className="border-t border-[var(--border-ed)]">
                      <td className="px-2 py-1.5 font-mono text-[var(--ink)]">{t.sheet}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--ink-3)]">{t.cellCount.toLocaleString('nl-NL')}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">{t.mismatchCount}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">{t.maxAbsDiff}</td>
                      <td className="px-2 py-1.5 text-center">
                        <StatusDot ok={t.ok} title={t.ok ? 'gelijk' : 'afwijking'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {fx.tables.some((t) => t.voorbeelden.length > 0) && (
                <div className="mt-3 space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-4)] font-mono">Voorbeeld-afwijkingen</div>
                  {fx.tables.flatMap((t) => t.voorbeelden).slice(0, 12).map((mm, i) => (
                    <div key={i} className="font-mono text-[11px] text-[var(--ink-3)]">
                      {mm.cel} (maand {mm.maand}): verwacht {mm.verwacht} · actueel {mm.actueel}
                      {mm.delta !== null ? ` · Δ=${mm.delta}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function TabVerificatie({
  onBron,
}: {
  onBron?: (bron: VerifReport['bron']) => void
}) {
  const [report, setReport] = useState<VerifReport | null>(null)
  const [state, setState] = useState<'idle' | 'running' | 'error'>('idle')
  const [err, setErr] = useState('')

  const run = useCallback(async () => {
    setState('running')
    setErr('')
    try {
      const res = await fetch('/api/horizon-kernel/verificatie')
      const json: VerificationResponse = await res.json()
      if (!res.ok || !json.ok || !json.report) {
        setErr(json.reason ?? `Serverfout (${res.status}).`)
        setState('error')
        return
      }
      setReport(json.report)
      setState('idle')
      onBron?.(json.report.bron)
    } catch {
      setErr('Kon de verificatie niet draaien.')
      setState('error')
    }
  }, [onBron])

  useEffect(() => {
    run()
  }, [run])

  const ok = report?.ok ?? false

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl font-serif text-sm italic text-[var(--ink-3)]">
          De verificatie draait de integrale engine per Excel-fixture en legt elke maandtabel
          cel-voor-cel (tolerantie €0,01) tegen het oracle — dezelfde vergelijking als de
          bewaakte testsuite. Groen = de engine rekent aantoonbaar gelijk aan het Excel.
        </p>
        <button
          onClick={run}
          disabled={state === 'running'}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-500)] disabled:opacity-60"
        >
          <Play className="h-4 w-4 text-[var(--color-horizon-300)]" />
          {state === 'running' ? 'Bezig…' : 'Opnieuw verifiëren'}
        </button>
      </div>

      {state === 'running' && <Spinner label="Engine draait per fixture en vergelijkt cel-voor-cel…" />}
      {state === 'error' && (
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-5 text-sm text-[var(--negative)]">
          {err}
        </div>
      )}

      {report && state !== 'running' && (
        <>
          <div
            className={`flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3 ${
              ok
                ? 'border-[color-mix(in_oklch,var(--positive)_40%,transparent)] bg-[color-mix(in_oklch,var(--positive)_8%,transparent)]'
                : 'border-[color-mix(in_oklch,var(--negative)_40%,transparent)] bg-[color-mix(in_oklch,var(--negative)_8%,transparent)]'
            }`}
          >
            <span className={`flex items-center gap-2 text-sm font-semibold ${ok ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
              {ok ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              {ok
                ? 'De engine rekent aantoonbaar gelijk aan het Excel.'
                : `${report.totalMismatches} afwijkende cellen gevonden.`}
            </span>
            <span className="text-xs text-[var(--ink-4)]">
              {report.fixtureCount} fixtures · {report.tableCount} tabellen ·{' '}
              {report.totalCells.toLocaleString('nl-NL')} cellen vergeleken · {report.durationMs} ms
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Fixtures" value={String(report.fixtureCount)} sub="Excel-scenario's" />
            <StatCard label="Cellen" value={report.totalCells.toLocaleString('nl-NL')} sub="totaal vergeleken" />
            <StatCard label="Afwijkingen" value={String(report.totalMismatches)} sub="buiten €0,01" />
            <StatCard label="Max |Δ|" value={report.maxAbsDiff.toExponential(1)} sub="grootste verschil" />
          </div>

          {report.bron && (
            <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3 text-xs text-[var(--ink-3)]">
              Bron-Excel: <span className="font-mono text-[var(--ink-2)]">{report.bron.sourceFile}</span> ·
              gewijzigd <span className="font-mono">{report.bron.sourceLastWriteTime}</span> ·
              SHA-256 <span className="break-all font-mono">{report.bron.sourceSha256.slice(0, 24)}…</span>
            </div>
          )}

          <SectionCard>
            <Kicker>Per fixture · per tabel</Kicker>
            <p className="mt-1 mb-3 text-xs text-[var(--ink-3)]">
              Elke stip is één van de elf tabellen (volgorde: CF, Bel, Ont, Af, Toename/afname,
              Verdeling, Bez, S, Prognose, Werk, PT). Klik een rij open voor de details.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                    <th scope="col" className="px-3 py-2 text-left font-medium">Scenario</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Tabellen (11)</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Max |Δ|</th>
                    <th scope="col" className="px-3 py-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.fixtures.map((fx) => (
                    <FixtureRow key={fx.scenario} fx={fx} />
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  )
}
