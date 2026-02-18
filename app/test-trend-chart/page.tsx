'use client'

import { useState } from 'react'
import { TrendChart, type TrendChartSeries, type TrendChartMode } from '@/components/app/trend-chart'
import type { DomainColor } from '@/lib/navigation'

// ── Sample data ────────────────────────────────────────────

const monthLabels = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

const netWorthSeries: TrendChartSeries[] = [
  {
    id: 'net-worth',
    name: 'Netto vermogen',
    data: monthLabels.map((label, i) => ({
      label,
      value: 45000 + i * 2500 + Math.sin(i * 0.5) * 3000,
      projected: i >= 8 ? 45000 + i * 3200 + Math.sin(i * 0.5) * 2000 : undefined,
    })),
  },
]

const multiSeries: TrendChartSeries[] = [
  {
    id: 'income',
    name: 'Inkomen',
    data: monthLabels.map((label, i) => ({
      label,
      value: 3500 + Math.sin(i * 0.8) * 500,
      projected: i >= 9 ? 3800 + Math.sin(i * 0.8) * 400 : undefined,
    })),
  },
  {
    id: 'expenses',
    name: 'Uitgaven',
    data: monthLabels.map((label, i) => ({
      label,
      value: 2200 + Math.cos(i * 0.6) * 600,
      projected: i >= 9 ? 2100 + Math.cos(i * 0.6) * 500 : undefined,
    })),
  },
  {
    id: 'savings',
    name: 'Besparingen',
    data: monthLabels.map((label, i) => ({
      label,
      value: 1300 + Math.sin(i * 0.4) * 300,
    })),
  },
]

const freedomDaysSeries: TrendChartSeries[] = [
  {
    id: 'freedom-days',
    name: 'Vrijheidsdagen',
    data: monthLabels.map((label, i) => ({
      label,
      value: Math.round(12 + i * 1.5 + Math.sin(i * 1.3) * 3),
      projected: i >= 7 ? Math.round(15 + i * 2 + Math.cos(i * 0.7) * 2) : undefined,
    })),
  },
]

const scenarioSeries: TrendChartSeries[] = [
  {
    id: 'base',
    name: 'Basis scenario',
    data: monthLabels.map((label, i) => ({
      label,
      value: 250000 + i * 15000,
      projected: i >= 6 ? 250000 + i * 18000 : undefined,
    })),
  },
  {
    id: 'optimistic',
    name: 'Optimistisch',
    data: monthLabels.map((label, i) => ({
      label,
      value: 250000 + i * 22000,
      projected: i >= 6 ? 250000 + i * 28000 : undefined,
    })),
    color: '#10b981',
  },
]

export default function TestTrendChartPage() {
  const [activeMode, setActiveMode] = useState<TrendChartMode>('line')
  const [activeColor, setActiveColor] = useState<DomainColor>('amber')

  const modes: TrendChartMode[] = ['line', 'area', 'bar']
  const colors: DomainColor[] = ['amber', 'teal', 'purple']

  return (
    <div className="min-h-screen bg-zinc-50 p-4 sm:p-8" data-testid="test-trend-chart-page">
      <div className="mx-auto max-w-4xl space-y-8">
        <h1 className="text-2xl font-bold text-zinc-800">TrendChart — Component Test</h1>
        <p className="text-sm text-zinc-500">
          Reusable chart component met lijn-, vlak- en staafmodus. Ondersteunt actual vs. projected data overlay
          en consistente kleurstijlen per module (De Kern, De Wil, De Horizon).
        </p>

        {/* ── Interactive mode & color switcher ───────────── */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm" data-testid="interactive-section">
          <h2 className="mb-4 text-lg font-semibold text-zinc-700">Interactieve demo</h2>

          <div className="mb-4 flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Modus:</span>
              {modes.map((m) => (
                <button
                  key={m}
                  onClick={() => setActiveMode(m)}
                  data-testid={`mode-btn-${m}`}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    activeMode === m
                      ? 'bg-zinc-800 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {m === 'line' ? 'Lijn' : m === 'area' ? 'Vlak' : 'Staaf'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Module kleur:</span>
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveColor(c)}
                  data-testid={`color-btn-${c}`}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    activeColor === c
                      ? c === 'amber' ? 'bg-amber-500 text-white'
                      : c === 'teal' ? 'bg-teal-500 text-white'
                      : 'bg-purple-500 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {c === 'amber' ? 'De Kern' : c === 'teal' ? 'De Wil' : 'De Horizon'}
                </button>
              ))}
            </div>
          </div>

          <TrendChart
            series={netWorthSeries}
            mode={activeMode}
            moduleColor={activeColor}
            title="Netto vermogen over tijd"
            yAxisLabel="€"
            showProjected={true}
            showLegend={true}
            testId="interactive-trend-chart"
          />
        </section>

        {/* ── Line chart ─────────────────────────────────── */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm" data-testid="line-chart-section">
          <h2 className="mb-2 text-lg font-semibold text-zinc-700">Lijnmodus — De Kern (amber)</h2>
          <p className="mb-4 text-xs text-zinc-400">Historische trend met projected overlay (gestreepte lijn)</p>
          <TrendChart
            series={netWorthSeries}
            mode="line"
            moduleColor="amber"
            title="Netto vermogen groei"
            yAxisLabel="€"
            showProjected={true}
            testId="line-chart"
          />
        </section>

        {/* ── Area chart ─────────────────────────────────── */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm" data-testid="area-chart-section">
          <h2 className="mb-2 text-lg font-semibold text-zinc-700">Vlakmodus — De Horizon (purple)</h2>
          <p className="mb-4 text-xs text-zinc-400">Projecties met area fill voor actueel en prognose</p>
          <TrendChart
            series={scenarioSeries}
            mode="area"
            moduleColor="purple"
            title="FIRE projectie scenario's"
            yAxisLabel="€"
            showProjected={true}
            testId="area-chart"
          />
        </section>

        {/* ── Bar chart ──────────────────────────────────── */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm" data-testid="bar-chart-section">
          <h2 className="mb-2 text-lg font-semibold text-zinc-700">Staafmodus — De Wil (teal)</h2>
          <p className="mb-4 text-xs text-zinc-400">Maandelijkse vergelijking met meerdere series</p>
          <TrendChart
            series={multiSeries}
            mode="bar"
            moduleColor="teal"
            title="Maandelijks cashflow overzicht"
            yAxisLabel="€"
            showProjected={true}
            testId="bar-chart"
          />
        </section>

        {/* ── Multi-series line chart ────────────────────── */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm" data-testid="multi-series-section">
          <h2 className="mb-2 text-lg font-semibold text-zinc-700">Multi-series lijn — De Wil (teal)</h2>
          <p className="mb-4 text-xs text-zinc-400">Meerdere datareeksen met automatische kleurtoewijzing en interactieve hover</p>
          <TrendChart
            series={multiSeries}
            mode="line"
            moduleColor="teal"
            title="Inkomen vs Uitgaven vs Besparingen"
            yAxisLabel="€"
            showProjected={true}
            testId="multi-series-chart"
          />
        </section>

        {/* ── Freedom days (custom format) ────────────────── */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm" data-testid="freedom-days-section">
          <h2 className="mb-2 text-lg font-semibold text-zinc-700">Aangepaste opmaak — Vrijheidsdagen</h2>
          <p className="mb-4 text-xs text-zinc-400">Niet-EUR waarden met aangepaste formatteerfunctie</p>
          <TrendChart
            series={freedomDaysSeries}
            mode="area"
            moduleColor="teal"
            title="Verdiende vrijheidsdagen per maand"
            yAxisLabel="dagen"
            formatValue={(v) => `${Math.round(v)} d`}
            formatTooltip={(v) => `${Math.round(v)} dagen`}
            showProjected={true}
            testId="freedom-days-chart"
          />
        </section>

        {/* ── All three colors side by side ────────────── */}
        <section data-testid="color-comparison-section">
          <h2 className="mb-4 text-lg font-semibold text-zinc-700">Kleurconsistentie per module</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {colors.map((c) => (
              <div key={c} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <TrendChart
                  series={[{
                    id: `sample-${c}`,
                    name: c === 'amber' ? 'De Kern' : c === 'teal' ? 'De Wil' : 'De Horizon',
                    data: monthLabels.slice(0, 6).map((label, i) => ({
                      label,
                      value: 100 + i * 20 + Math.sin(i) * 15,
                      projected: i >= 4 ? 100 + i * 25 : undefined,
                    })),
                  }]}
                  mode="area"
                  moduleColor={c}
                  title={c === 'amber' ? 'De Kern' : c === 'teal' ? 'De Wil' : 'De Horizon'}
                  height={180}
                  showLegend={false}
                  testId={`color-${c}-chart`}
                />
              </div>
            ))}
          </div>
        </section>

        {/* ── Empty state ────────────────────────────────── */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm" data-testid="empty-state-section">
          <h2 className="mb-2 text-lg font-semibold text-zinc-700">Lege staat</h2>
          <p className="mb-4 text-xs text-zinc-400">TrendChart toont een vriendelijk bericht bij ontbrekende data</p>
          <TrendChart
            series={[]}
            mode="line"
            moduleColor="amber"
            testId="empty-chart"
          />
        </section>

        {/* ── Responsive test ────────────────────────────── */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm" data-testid="responsive-section">
          <h2 className="mb-2 text-lg font-semibold text-zinc-700">Responsief ontwerp</h2>
          <p className="mb-4 text-xs text-zinc-400">De grafiek past zich automatisch aan de breedte aan (viewBox-based SVG)</p>
          <div className="space-y-4">
            <div className="max-w-xs border border-dashed border-zinc-300 p-2 rounded-lg">
              <p className="text-[10px] text-zinc-400 mb-1">max-w-xs (mobiel)</p>
              <TrendChart
                series={netWorthSeries}
                mode="line"
                moduleColor="amber"
                height={160}
                showLegend={false}
                testId="responsive-small-chart"
              />
            </div>
            <div className="max-w-md border border-dashed border-zinc-300 p-2 rounded-lg">
              <p className="text-[10px] text-zinc-400 mb-1">max-w-md (tablet)</p>
              <TrendChart
                series={netWorthSeries}
                mode="line"
                moduleColor="amber"
                height={200}
                showLegend={true}
                testId="responsive-medium-chart"
              />
            </div>
          </div>
        </section>

        {/* ── Verification checklist ─────────────────────── */}
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm" data-testid="checklist-section">
          <h2 className="mb-3 text-lg font-semibold text-emerald-800">Verificatie checklist</h2>
          <ul className="space-y-2 text-sm text-emerald-700">
            <li data-testid="check-reusable">✅ TrendChart is een herbruikbaar component (geïmporteerd uit components/app/trend-chart)</li>
            <li data-testid="check-line">✅ Lijnmodus ondersteund (mode=&quot;line&quot;)</li>
            <li data-testid="check-area">✅ Vlakmodus ondersteund (mode=&quot;area&quot;)</li>
            <li data-testid="check-bar">✅ Staafmodus ondersteund (mode=&quot;bar&quot;)</li>
            <li data-testid="check-projected">✅ Actual vs projected data overlay (gestreepte lijn + lichtere vulling)</li>
            <li data-testid="check-colors">✅ Consistente module kleurstijlen (amber/De Kern, teal/De Wil, purple/De Horizon)</li>
            <li data-testid="check-responsive">✅ Responsief ontwerp (viewBox-based SVG schaalt mee)</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
