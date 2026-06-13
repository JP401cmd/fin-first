'use client'

/**
 * Horizon-tabel-inspector (Beheer · werkdocument).
 *
 * Werkende FIRE-grafiek + tabellen A–H, aangedreven door de pure grootboek-engine
 * (`lib/horizon-engine`) op een representatieve persona. Eén
 * `result = runHorizonLedger(buildPersonaInput(params))` voedt de KPI's, de
 * gedeelde `<LedgerChart>` en de gedeelde `<LedgerTabs>`. De sidebar manipuleert
 * `InspectorParams`; alles herrekent via useMemo.
 *
 * De grafiek- en tabel-weergaves zelf wonen in `ledger-views.tsx` zodat de
 * "mijn data"-pagina exact dezelfde weergave kan tonen op echte gebruikersdata.
 *
 * Engine v2 · tabel-georiënteerd · reëel (koopkracht nu).
 */

import { useMemo, useState } from 'react'
import { LineChart, Sparkles, LayoutDashboard, GitCompareArrows } from 'lucide-react'

import {
  runHorizonLedger,
  compareEngines,
  type EngineDiff,
} from '@/lib/horizon-engine'
import {
  buildPersonaInput,
  DEFAULT_PARAMS,
  type InspectorParams,
} from './persona'
import {
  LedgerChart,
  LedgerTabs,
  CompareView,
  Kicker,
  eur,
  eurShort,
  DEFAULT_AOW_AGE,
} from './ledger-views'

// ── Formatters (sidebar-only) ────────────────────────────────────

function pct(n: number): string {
  return `${(n * 100).toFixed(1).replace('.', ',')}%`
}

// ── Sidebar UI ───────────────────────────────────────────────────

function SidebarGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)] font-mono">
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs text-[var(--ink-2)]">{label}</span>
        <span className="text-xs font-mono tabular-nums text-[var(--ink)]">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-horizon-600)]"
      />
    </label>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--ink-2)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--color-horizon-600)]"
      />
      {label}
    </label>
  )
}

// ── KPI cards ────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] font-mono">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[var(--ink)] leading-none">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--ink-3)]">{sub}</div>}
    </div>
  )
}

// ── Top-level tabs (dashboard / tabellen / vergelijk) ────────────

type TopTabId = 'dashboard' | 'tabellen' | 'compare'

const TOP_TABS: { id: TopTabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tabellen', label: 'Tabellen A–H', icon: LineChart },
  { id: 'compare', label: 'Vergelijk v1↔v2', icon: GitCompareArrows },
]

// ── Main component ───────────────────────────────────────────────

export default function HorizonInspector() {
  const [params, setParams] = useState<InspectorParams>(DEFAULT_PARAMS)
  const [tab, setTab] = useState<TopTabId>('dashboard')

  const result = useMemo(() => runHorizonLedger(buildPersonaInput(params)), [params])
  const engineDiff = useMemo<EngineDiff>(
    () => compareEngines(buildPersonaInput(params), { yearlyExpenses: params.yearlyExpenses }),
    [params],
  )

  const lastRow = result.rows[result.rows.length - 1]

  const set = <K extends keyof InspectorParams>(key: K, value: InspectorParams[K]) =>
    setParams((p) => ({ ...p, [key]: value }))

  const fireAge = result.fireAge
  const jarenTotFire = fireAge != null ? fireAge - params.currentAge : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Kicker>De Horizon · werkdocument</Kicker>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-[var(--ink)]">
            <LineChart className="h-6 w-6 text-[var(--color-horizon-600)]" />
            Horizon-tabellen
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ink-3)]">
            Een werkende FIRE-grafiek en de onderliggende tabellen A–H, live aangedreven door de
            pure grootboek-engine op een representatieve persona. Schuif aan de parameters; alles
            herrekent.
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-horizon-500)] bg-[color-mix(in_oklch,var(--color-horizon-500)_12%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-horizon-700)] font-mono">
          Engine v2 · tabel-georiënteerd · reëel (koopkracht nu)
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <aside className="space-y-6 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 lg:sticky lg:top-4 lg:self-start">
          <SidebarGroup title="Tijd">
            <Slider label="Huidige leeftijd" value={params.currentAge} min={25} max={65} display={`${params.currentAge} jr`} onChange={(v) => set('currentAge', v)} />
            <Slider label="Eindleeftijd" value={params.endAge} min={75} max={100} display={`${params.endAge} jr`} onChange={(v) => set('endAge', v)} />
          </SidebarGroup>

          <SidebarGroup title="Rendement">
            <Slider label="Bruto rendement" value={Math.round(params.grossReturn * 1000) / 10} min={3} max={10} step={0.1} display={pct(params.grossReturn)} onChange={(v) => set('grossReturn', v / 100)} />
            <Slider label="Inflatie" value={Math.round(params.inflation * 1000) / 10} min={0} max={5} step={0.1} display={pct(params.inflation)} onChange={(v) => set('inflation', v / 100)} />
          </SidebarGroup>

          <SidebarGroup title="Cashflow">
            <Slider label="Jaaruitgaven" value={params.yearlyExpenses} min={10000} max={80000} step={1000} display={eurShort(params.yearlyExpenses)} onChange={(v) => set('yearlyExpenses', v)} />
            <Slider label="Maandinkomen (bruto)" value={params.monthlyIncome} min={3000} max={15000} step={100} display={eurShort(params.monthlyIncome)} onChange={(v) => set('monthlyIncome', v)} />
            <Slider label="Jaarlijks sparen" value={params.annualSavings} min={0} max={60000} step={1000} display={eurShort(params.annualSavings)} onChange={(v) => set('annualSavings', v)} />
          </SidebarGroup>

          <SidebarGroup title="Pensioen">
            <Slider label="AOW per jaar" value={params.aowPerYear} min={8000} max={25000} step={500} display={eurShort(params.aowPerYear)} onChange={(v) => set('aowPerYear', v)} />
            <Slider label="Aanvullend pensioen" value={params.pensionPerYear} min={0} max={50000} step={500} display={eurShort(params.pensionPerYear)} onChange={(v) => set('pensionPerYear', v)} />
          </SidebarGroup>

          <SidebarGroup title="Strategie">
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--ink-2)]">Eindstrategie</span>
              <select
                value={params.endStrategy}
                onChange={(e) => set('endStrategy', e.target.value as InspectorParams['endStrategy'])}
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--color-horizon-600)]"
              >
                <option value="deplete">Opmaken</option>
                <option value="perpetual">Behouden</option>
                <option value="legacy">Nalaten</option>
                <option value="pensioen">Pensioen</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--ink-2)]">Onttrekkingsstrategie</span>
              <select
                value={params.withdrawalStrategy}
                onChange={(e) => set('withdrawalStrategy', e.target.value as InspectorParams['withdrawalStrategy'])}
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--color-horizon-600)]"
              >
                <option value="static">Statisch (4%)</option>
                <option value="guardrails">Guardrails</option>
                <option value="vpw">VPW</option>
                <option value="bucket">Bucket</option>
              </select>
            </label>
            {params.endStrategy === 'legacy' && (
              <Slider label="Nalatenschap" value={params.legacyAmount} min={0} max={500000} step={5000} display={eurShort(params.legacyAmount)} onChange={(v) => set('legacyAmount', v)} />
            )}
          </SidebarGroup>

          <SidebarGroup title="Opties">
            <Toggle label="Gebeurtenissen meenemen" checked={params.eventsOn} onChange={(v) => set('eventsOn', v)} />
            <Toggle label="Met partner" checked={params.hasPartner} onChange={(v) => set('hasPartner', v)} />
          </SidebarGroup>
        </aside>

        {/* Main content */}
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label="FIRE-leeftijd"
              value={fireAge != null ? `${fireAge}` : '—'}
              sub={result.fireReachable ? 'volledige vrijheid' : 'niet bereikt binnen horizon'}
            />
            <KpiCard
              label="Jaren tot FIRE"
              value={jarenTotFire != null ? `${jarenTotFire}` : '—'}
              sub={jarenTotFire != null ? 'jaar opgeslagen tijd opbouwen' : undefined}
            />
            <KpiCard
              label="V_nodig op FIRE"
              value={eurShort(result.requiredFirePortfolioAtFire)}
              sub="benodigd liquide vermogen"
            />
            <KpiCard
              label="Netto eindwaarde"
              value={lastRow ? eurShort(lastRow.nettoVermogen) : '—'}
              sub={lastRow ? `op leeftijd ${lastRow.leeftijd}` : undefined}
            />
          </div>

          {/* Chart */}
          <LedgerChart result={result} />

          {/* Top tab strip */}
          <div className="flex flex-wrap gap-1.5 border-b border-[var(--border-ed)] pb-px">
            {TOP_TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[var(--paper)] text-[var(--color-horizon-700)] border border-b-0 border-[var(--border-ed)] -mb-px'
                      : 'text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div>
            {tab === 'dashboard' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
                  <Kicker>De rekenmotor in het kort</Kicker>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--ink-2)]">
                    Eén forward-pass bouwt het grootboek (je liquide vermogen, V_op), één
                    backward-pass bouwt de benodigd-lijn (V_nodig). Het snijpunt is FIRE — het moment
                    waarop je niet langer hoeft te werken. Geen vuistregel, maar een volledige
                    jaar-voor-jaar boekhouding van inkomen, belasting, woonlasten, gebeurtenissen en
                    onttrekkingen.
                  </p>
                  <blockquote className="mt-5 border-l-2 border-[var(--color-horizon-500)] pl-4">
                    <p className="flex items-start gap-2 text-lg font-semibold leading-snug text-[var(--ink)]">
                      <Sparkles className="mt-1 h-4 w-4 shrink-0 text-[var(--color-horizon-600)]" />
                      <span>&ldquo;Niet 25× je uitgaven — exact wat jouw pad nodig heeft.&rdquo;</span>
                    </p>
                  </blockquote>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] font-mono">Netto nu</div>
                    <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[var(--ink)]">
                      {result.rows[0] ? eur(result.rows[0].nettoVermogen) : '—'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] font-mono">Liquide nu</div>
                    <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[var(--ink)]">
                      {result.rows[0] ? eur(result.rows[0].liquideVermogen) : '—'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] font-mono">Liquide op FIRE</div>
                    <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[var(--ink)]">
                      {eur(result.liquideAtFire)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] font-mono">Projectiejaren</div>
                    <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[var(--ink)]">
                      {result.rows.length}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'tabellen' && <LedgerTabs result={result} aowAge={DEFAULT_AOW_AGE} />}
            {tab === 'compare' && <CompareView diff={engineDiff} />}
          </div>
        </div>
      </div>
    </div>
  )
}
