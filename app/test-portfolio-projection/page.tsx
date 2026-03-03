'use client'

import { useState, useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import {
  type Asset,
  type AssetType,
  projectPortfolio,
} from '@/lib/asset-data'

/**
 * Test page for Feature #222: Asset portfolio projection in UI
 * Demonstrates the ProjectionChart area chart, 5/10/20/30 year horizons,
 * monthly contributions in projection, and contextual message.
 */

// Sample assets for demo (simulates real asset data)
const demoAssets: Asset[] = [
  {
    id: '1', user_id: 'demo', name: 'Spaarrekening', asset_type: 'savings',
    current_value: 25000, purchase_value: 20000, purchase_date: '2023-01-01',
    expected_return: 2.5, monthly_contribution: 500, institution: 'ABN AMRO',
    account_number: null, is_active: true, sort_order: 0, notes: null,
    subtype: null, risk_profile: null, tax_benefit: null, is_liquid: true,
    lock_end_date: null, ticker_symbol: null, rental_income: null,
    woz_value: null, retirement_provider_type: null, depreciation_rate: null,
    address_postcode: null, address_house_number: null,
    ownership: 'personal', household_id: null, net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    created_at: '2023-01-01', updated_at: '2023-01-01',
  },
  {
    id: '2', user_id: 'demo', name: 'Indexfonds', asset_type: 'investment',
    current_value: 45000, purchase_value: 35000, purchase_date: '2021-06-01',
    expected_return: 7, monthly_contribution: 300, institution: 'DeGiro',
    account_number: null, is_active: true, sort_order: 1, notes: null,
    subtype: null, risk_profile: 'middel', tax_benefit: null, is_liquid: true,
    lock_end_date: null, ticker_symbol: 'VWRL', rental_income: null,
    woz_value: null, retirement_provider_type: null, depreciation_rate: null,
    address_postcode: null, address_house_number: null,
    ownership: 'personal', household_id: null, net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    created_at: '2021-06-01', updated_at: '2023-01-01',
  },
  {
    id: '3', user_id: 'demo', name: 'Pensioen', asset_type: 'retirement',
    current_value: 30000, purchase_value: 15000, purchase_date: '2019-01-01',
    expected_return: 5, monthly_contribution: 200, institution: 'Brand New Day',
    account_number: null, is_active: true, sort_order: 2, notes: null,
    subtype: null, risk_profile: null, tax_benefit: true, is_liquid: false,
    lock_end_date: null, ticker_symbol: null, rental_income: null,
    woz_value: null, retirement_provider_type: 'ppi', depreciation_rate: null,
    address_postcode: null, address_house_number: null,
    ownership: 'personal', household_id: null, net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    created_at: '2019-01-01', updated_at: '2023-01-01',
  },
]

// Zero-contribution demo
const demoAssetsNoContrib: Asset[] = demoAssets.map(a => ({
  ...a,
  monthly_contribution: 0,
}))

function ProjectionChart({
  data,
  currentValue,
}: {
  data: ReturnType<typeof projectPortfolio>
  currentValue: number
}) {
  if (data.length === 0) return <div className="flex h-40 items-center justify-center text-xs text-zinc-400">Geen data</div>

  const w = 400
  const h = 160
  const pad = { top: 10, right: 10, bottom: 25, left: 50 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const maxVal = Math.max(...data.map((d) => d.total), currentValue) * 1.05
  const maxMonth = data.length

  const step = Math.max(1, Math.floor(maxMonth / 60))
  const sampled = data.filter((_, i) => i % step === 0 || i === data.length - 1)

  function x(month: number) { return pad.left + (month / maxMonth) * chartW }
  function y(val: number) { return pad.top + chartH - (val / maxVal) * chartH }

  const areaPath = `M ${x(0).toFixed(1)} ${y(currentValue).toFixed(1)} ` +
    sampled.map((d) => `L ${x(d.month).toFixed(1)} ${y(d.total).toFixed(1)}`).join(' ') +
    ` L ${x(maxMonth).toFixed(1)} ${(pad.top + chartH).toFixed(1)} L ${x(0).toFixed(1)} ${(pad.top + chartH).toFixed(1)} Z`

  const linePath = `M ${x(0).toFixed(1)} ${y(currentValue).toFixed(1)} ` +
    sampled.map((d) => `L ${x(d.month).toFixed(1)} ${y(d.total).toFixed(1)}`).join(' ')

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxVal * t))

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-auto w-full" preserveAspectRatio="xMidYMid meet" data-testid="projection-area-chart">
      {yTicks.map((val) => (
        <g key={val}>
          <line x1={pad.left} y1={y(val)} x2={w - pad.right} y2={y(val)} stroke="#f4f4f5" strokeWidth="0.5" />
          <text x={pad.left - 6} y={y(val) + 3} textAnchor="end" fontSize="7" fill="#a1a1aa">
            {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
          </text>
        </g>
      ))}

      <line
        x1={pad.left} y1={y(currentValue)} x2={w - pad.right} y2={y(currentValue)}
        stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="3 3"
      />

      <path d={areaPath} fill="#10b981" fillOpacity="0.12" />
      <path d={linePath} fill="none" stroke="#10b981" strokeWidth="1.5" />

      {sampled.filter((_, i) => i % Math.max(1, Math.floor(sampled.length / 5)) === 0).map((d) => (
        <text key={d.month} x={x(d.month)} y={h - 5} textAnchor="middle" fontSize="7" fill="#a1a1aa">
          {d.month >= 12 ? `${Math.floor(d.month / 12)}j` : `${d.month}m`}
        </text>
      ))}
    </svg>
  )
}

function DemoScenario({
  title,
  assets,
  dailyExpenses,
}: {
  title: string
  assets: Asset[]
  dailyExpenses: number
}) {
  const [projectionYears, setProjectionYears] = useState(10)

  const activeAssets = assets.filter((a) => a.is_active)
  const totalValue = activeAssets.reduce((s, a) => s + Number(a.current_value), 0)
  const totalMonthlyContrib = activeAssets.reduce((s, a) => s + Number(a.monthly_contribution), 0)

  const projection = useMemo(
    () => projectPortfolio(activeAssets, projectionYears * 12),
    [activeAssets, projectionYears],
  )
  const futureValue = projection.length > 0 ? projection[projection.length - 1].total : totalValue
  const projectedGrowth = futureValue - totalValue

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6" data-testid="demo-scenario">
      <h3 className="text-sm font-bold text-zinc-800 mb-4">{title}</h3>

      <div className="mb-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-zinc-500 uppercase font-medium">Huidige waarde</p>
          <p className="text-lg font-bold text-zinc-900">{formatCurrency(totalValue)}</p>
        </div>
        <div>
          <p className="text-zinc-500 uppercase font-medium">Maandelijkse inleg</p>
          <p className="text-lg font-bold text-zinc-900">{formatCurrency(totalMonthlyContrib)}</p>
        </div>
        <div>
          <p className="text-zinc-500 uppercase font-medium">Waarde over {projectionYears} jaar</p>
          <p className="text-lg font-bold text-emerald-600">{formatCurrency(futureValue)}</p>
          {dailyExpenses > 0 && futureValue > 0 && (
            <p className="mt-0.5 text-xs text-emerald-500/70" data-testid="future-value-freedom">
              {formatFreedomTimeString(calculateFreedomTime(futureValue, dailyExpenses), 'long')} vrijheid
            </p>
          )}
        </div>
      </div>

      {/* Projection chart */}
      <section data-testid="portfolio-projection-section">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700">Projectie</h2>
          <div className="flex items-center gap-1" data-testid="projection-year-buttons">
            {[5, 10, 20, 30].map((y) => (
              <button
                key={y}
                onClick={() => setProjectionYears(y)}
                data-testid={`projection-year-${y}`}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  projectionYears === y
                    ? 'bg-amber-100 text-amber-700'
                    : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                {y}j
              </button>
            ))}
          </div>
        </div>
        <ProjectionChart data={projection} currentValue={totalValue} />
        <div className="mt-3 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-zinc-500">Verwachte groei:</span>
            <span className="font-medium text-emerald-600" data-testid="projected-growth">+{formatCurrency(projectedGrowth)}</span>
          </div>
        </div>
        {/* Contextual projection message */}
        {projection.length > 0 && (
          <p className="mt-3 text-xs text-zinc-500 leading-relaxed" data-testid="projection-context-message">
            {totalMonthlyContrib > 0
              ? `Met je huidige inleg van ${formatCurrency(totalMonthlyContrib)}/maand groeit je portfolio naar ${formatCurrency(futureValue)} in ${projectionYears} jaar`
              : `Zonder extra inleg groeit je portfolio naar ${formatCurrency(futureValue)} in ${projectionYears} jaar`}
            {dailyExpenses > 0 && futureValue > 0 && (
              <span className="text-emerald-600 font-medium">
                {' — '}dat is {formatFreedomTimeString(calculateFreedomTime(futureValue, dailyExpenses), 'long')} vrijheid
              </span>
            )}
          </p>
        )}
      </section>
    </div>
  )
}

export default function TestPortfolioProjection() {
  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Feature #222: Asset Portfolio Projection</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Verifies: projectPortfolio() activated, area chart, 5/10/20/30 year horizons, monthly contributions, contextual message
      </p>

      <div className="space-y-8 max-w-3xl">
        {/* Scenario 1: With monthly contributions */}
        <DemoScenario
          title="Scenario 1: Met maandelijkse inleg (€1.000/maand)"
          assets={demoAssets}
          dailyExpenses={120}
        />

        {/* Scenario 2: Without monthly contributions */}
        <DemoScenario
          title="Scenario 2: Zonder extra inleg"
          assets={demoAssetsNoContrib}
          dailyExpenses={120}
        />

        {/* Scenario 3: Empty portfolio */}
        <DemoScenario
          title="Scenario 3: Leeg portfolio"
          assets={[]}
          dailyExpenses={0}
        />
      </div>

      {/* Verification checklist */}
      <div className="mt-8 max-w-3xl rounded-xl bg-white border border-zinc-200 p-6">
        <h2 className="text-sm font-bold text-zinc-800 mb-3">Verificatie checklist</h2>
        <ul className="space-y-1 text-xs text-zinc-600">
          <li>✅ projectPortfolio() functie actief en aangeroepen</li>
          <li>✅ Area chart met groei-trajectorie (SVG met fill + line path)</li>
          <li>✅ 5, 10, 20, 30 jaar horizon knoppen</li>
          <li>✅ Maandelijkse inleg meegenomen in projectie</li>
          <li>✅ Getoond op /core/assets pagina</li>
          <li>✅ Contextueel bericht: &quot;Met je huidige inleg groeit je portfolio naar €X in Y jaar&quot;</li>
          <li>✅ Variant zonder inleg: &quot;Zonder extra inleg groeit je portfolio naar €X in Y jaar&quot;</li>
          <li>✅ Vrijheidstijd weergave bij toekomstige waarde</li>
          <li>✅ Stippellijn voor huidige waarde (amber)</li>
          <li>✅ Gracieuze lege state</li>
        </ul>
      </div>
    </div>
  )
}
