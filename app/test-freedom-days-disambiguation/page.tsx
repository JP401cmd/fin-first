'use client'

import { useState, useEffect } from 'react'
import { Info } from 'lucide-react'

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

interface ApiResponse {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

// Demo tooltip component (same pattern as real KpiTooltip)
function DemoTooltip({ text, color = 'amber' }: { text: string; color?: 'amber' | 'teal' }) {
  const [open, setOpen] = useState(false)
  const hoverColor = color === 'amber' ? 'text-amber-500' : 'text-teal-500'
  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-label="Meer informatie"
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        className="ml-1"
      >
        <Info className={`h-4 w-4 cursor-help transition-colors ${open ? hoverColor : 'text-zinc-300'} group-hover:${hoverColor}`} />
      </button>
      <div role="tooltip" className={`absolute left-0 z-10 mt-5 w-64 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 shadow-lg transition-opacity ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}>
        {text}
      </div>
    </div>
  )
}

// Demo hero tooltip for dark backgrounds
function DemoHeroTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-label="Meer informatie"
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
      >
        <Info className={`h-4 w-4 cursor-help transition-colors ${open ? 'text-teal-300' : 'text-teal-400/50'} group-hover:text-teal-300`} />
      </button>
      <div role="tooltip" className={`absolute left-0 z-10 mt-1 w-64 rounded-lg border border-teal-700/50 bg-teal-900/95 p-3 text-xs leading-relaxed text-teal-100 shadow-lg backdrop-blur-sm transition-opacity ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}>
        {text}
      </div>
    </div>
  )
}

export default function TestFreedomDaysDisambiguation() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-freedom-days-disambiguation')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">
          Feature #191: Freedom Days Disambiguation
        </h1>
        <p className="mb-8 text-sm text-zinc-500">
          Verify that freedom days terminology is disambiguated with info tooltips across pages.
        </p>

        {/* === Verification Results === */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-zinc-800">
            Verification Results
          </h2>
          {loading ? (
            <p className="text-zinc-400">Loading...</p>
          ) : data ? (
            <div className="space-y-2">
              <div className={`mb-4 rounded-lg p-3 text-sm font-medium ${data.allPassing ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {data.summary} — {data.allPassing ? 'ALL PASSING' : 'SOME FAILING'}
              </div>
              {data.results.map((r, i) => (
                <div key={i} className={`rounded-lg border p-3 ${r.pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{r.pass ? '✅' : '❌'}</span>
                    <span className="text-sm font-medium text-zinc-800">{r.name}</span>
                  </div>
                  <p className="mt-1 pl-7 text-xs text-zinc-500">{r.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-red-500">Failed to load verification results</p>
          )}
        </section>

        {/* === Demo: De Wil Hero Tooltips === */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-zinc-800">
            Demo: De Wil Hero (dark background)
          </h2>
          <div className="rounded-2xl bg-gradient-to-br from-teal-950 via-teal-900 to-teal-950 p-8 text-white">
            <div className="mb-6 flex items-baseline gap-2">
              <span className="text-5xl font-bold">+12</span>
              <span className="ml-3 text-lg text-teal-200/70">
                vrijheidsdagen gewonnen
              </span>
              <DemoHeroTooltip text="Gewonnen vrijheidsdagen komen uitsluitend van voltooide acties in De Wil. Elke afgeronde actie levert concrete vrijheidsdagen op." />
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-medium uppercase text-teal-300/60">Acties voltooid</p>
                <p className="mt-1 text-2xl font-bold">5 van 8</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium uppercase text-teal-300/60">Open potentieel</p>
                  <DemoHeroTooltip text="Open potentieel toont vrijheidsdagen die je kunt winnen door openstaande acties en aanbevelingen in De Wil af te ronden." />
                </div>
                <p className="mt-1 text-2xl font-bold">+24 dagen</p>
                <p className="text-sm text-teal-200/50">nog te winnen</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-teal-300/60">Beslissnelheid</p>
                <p className="mt-1 text-2xl font-bold">3 dagen</p>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Click the (i) icons to see disambiguation tooltips on dark background.
          </p>
        </section>

        {/* === Demo: De Kern KPI Tooltips === */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-zinc-800">
            Demo: De Kern KPI Cards (light background)
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
                  <span className="text-amber-600">📅</span>
                </div>
                <DemoTooltip
                  text="Dagen gewonnen deze maand — exclusief De Kern. Berekend als maandelijkse besparing gedeeld door dagelijkse uitgaven. Dit verschilt van 'vrijheidsdagen gewonnen' in De Wil, dat gebaseerd is op voltooide acties."
                  color="amber"
                />
              </div>
              <p className="text-sm font-medium text-zinc-500">Dagen Gewonnen</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900">+5</p>
              <p className="mt-1 text-xs text-emerald-600">deze maand</p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
                  <span className="text-amber-600">☀️</span>
                </div>
                <DemoTooltip
                  text="Vrije dagen per jaar — exclusief De Kern. Hoeveel dagen per jaar je passief inkomen je kosten dekt. Berekening: (netto vermogen × 4% / jaarlijkse uitgaven) × 365. Dit verschilt van 'Open potentieel' in De Wil, dat gebaseerd is op openstaande acties."
                  color="amber"
                />
              </div>
              <p className="text-sm font-medium text-zinc-500">Vrije Dagen per Jaar</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900">42</p>
              <p className="mt-1 text-xs text-zinc-400">gedekt door passief inkomen</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Click the (i) icons to see disambiguation tooltips on light background.
          </p>
        </section>

        {/* === Demo: De Wil KPI Tooltip === */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-zinc-800">
            Demo: De Wil KPI Card (Open Potentieel)
          </h2>
          <div className="max-w-xs">
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50">
                  <span className="text-teal-600">✨</span>
                </div>
                <DemoTooltip
                  text="Open potentieel — exclusief De Wil. Vrijheidsdagen die je kunt winnen door openstaande acties en aanbevelingen af te ronden. Dit verschilt van 'Vrije Dagen per Jaar' in De Kern, dat gebaseerd is op passief inkomen."
                  color="teal"
                />
              </div>
              <p className="text-sm font-medium text-zinc-500">Open Potentieel</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900">+24 dagen</p>
              <p className="mt-1 text-xs text-zinc-400">wachtend op actie</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Click the (i) icon to see disambiguation tooltip.
          </p>
        </section>

        {/* === Disambiguation Summary === */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-zinc-800">
            Disambiguation Summary
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="py-2 text-left font-medium text-zinc-600">Term</th>
                <th className="py-2 text-left font-medium text-zinc-600">Page</th>
                <th className="py-2 text-left font-medium text-zinc-600">Source</th>
                <th className="py-2 text-left font-medium text-zinc-600">Has Tooltip</th>
              </tr>
            </thead>
            <tbody className="text-zinc-700">
              <tr className="border-b border-zinc-100">
                <td className="py-2 font-medium">Gewonnen (vrijheidsdagen)</td>
                <td className="py-2">De Wil (hero)</td>
                <td className="py-2">Voltooide acties</td>
                <td className="py-2">✅ HeroTooltip</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 font-medium">Open potentieel</td>
                <td className="py-2">De Wil (hero + KPI)</td>
                <td className="py-2">Openstaande acties & aanbevelingen</td>
                <td className="py-2">✅ HeroTooltip + KpiTooltip</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 font-medium">Dagen Gewonnen (maand)</td>
                <td className="py-2">De Kern (KPI)</td>
                <td className="py-2">Maandelijkse besparing / dagelijkse uitgaven</td>
                <td className="py-2">✅ KpiTooltip (disambiguated)</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 font-medium">Vrije Dagen per Jaar</td>
                <td className="py-2">De Kern (KPI)</td>
                <td className="py-2">Passief inkomen</td>
                <td className="py-2">✅ KpiTooltip (disambiguated)</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
