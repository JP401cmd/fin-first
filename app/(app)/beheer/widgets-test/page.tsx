'use client'

import { Component, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { WIDGET_CATALOG, type WidgetSize, type WidgetModule } from '@/lib/widget-catalog'
import { WidgetRenderer } from '@/components/widgets/widget-renderer'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'

// ── Error Boundary ──────────────────────────────────────────────
interface EBProps { children: ReactNode; label: string }
interface EBState { hasError: boolean }

class WidgetErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-600">
          Widget crashed: {this.props.label}
        </div>
      )
    }
    return this.props.children
  }
}

// ── Module config ───────────────────────────────────────────────
const MODULE_GROUPS: { key: WidgetModule; label: string; dotClass: string; barClass: string }[] = [
  { key: 'kern',    label: 'De Kern',       dotClass: 'bg-amber-500',  barClass: 'bg-amber-500' },
  { key: 'wil',     label: 'De Wil',        dotClass: 'bg-teal-500',   barClass: 'bg-teal-500' },
  { key: 'horizon', label: 'De Horizon',    dotClass: 'bg-purple-500', barClass: 'bg-purple-500' },
  { key: 'cross',   label: 'Cross-Module',  dotClass: 'bg-neutral-400', barClass: 'bg-neutral-400' },
]

const SIZES: WidgetSize[] = ['mini', 'quarter', 'half', 'full']
const SIZE_LABELS: Record<WidgetSize, string> = {
  mini: 'Mini',
  quarter: 'Quarter',
  half: 'Half',
  full: 'Full',
}

// ── Dynamic budget_fav widgets ──────────────────────────────────
const DYNAMIC_WIDGETS = MOCK_DASHBOARD_DATA.favoriteBudgets.map(b => ({
  id: `budget_fav:${b.id}`,
  name: `Budget Favoriet: ${b.name}`,
  description: `Dynamische widget voor budget "${b.name}"`,
  sizes: ['mini', 'quarter', 'half', 'full'] as WidgetSize[],
  defaultSize: 'quarter' as WidgetSize,
  minLevel: -2,
  module: 'kern' as WidgetModule,
}))

export default function WidgetsTestPage() {
  const totalWidgets = WIDGET_CATALOG.length + DYNAMIC_WIDGETS.length

  return (
    <div className="-mx-4 sm:-mx-6 px-4 sm:px-6" style={{ maxWidth: 'calc(100vw - 2rem)' }}>
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-[var(--ink)]">Widget Test</h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            {totalWidgets} widgets &middot; {SIZES.length} formaten &middot; alle modules
          </p>
        </div>

        {/* Mock-data banner */}
        <div className="mb-8 flex items-start gap-2.5 border border-dashed border-[var(--border-md)] bg-[var(--subtle)] px-3.5 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--ink-3)]">
              Mock data
            </p>
            <p className="mt-0.5 text-sm text-[var(--ink-2)]">
              Alle widgets op deze pagina tonen test-data uit{' '}
              <code className="rounded-sm bg-[var(--paper)] px-1 py-0.5 font-mono text-[11px] text-[var(--ink)]">
                lib/mock-dashboard-data.ts
              </code>
              {' '}— niet je echte cijfers.
            </p>
          </div>
        </div>

        {/* Module groups */}
        {MODULE_GROUPS.map(group => {
          const widgets = WIDGET_CATALOG.filter(w => w.module === group.key)
          if (widgets.length === 0) return null

          return (
            <section key={group.key} className="mb-12">
              {/* Module header */}
              <div className="mb-6 flex items-center gap-3">
                <div className={`h-6 w-1 rounded-full ${group.barClass}`} />
                <div className={`h-2.5 w-2.5 rounded-full ${group.dotClass}`} />
                <h3 className="text-lg font-semibold text-[var(--ink)]">{group.label}</h3>
                <span className="text-sm text-[var(--ink-3)]">{widgets.length} widgets</span>
              </div>

              {/* Widgets */}
              <div className="space-y-10">
                {widgets.map(def => (
                  <WidgetTestRow key={def.id} def={def} />
                ))}
              </div>
            </section>
          )
        })}

        {/* Dynamic widgets */}
        {DYNAMIC_WIDGETS.length > 0 && (
          <section className="mb-12">
            <div className="mb-6 flex items-center gap-3">
              <div className="h-6 w-1 rounded-full bg-amber-500" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <h3 className="text-lg font-semibold text-[var(--ink)]">Dynamische Widgets</h3>
              <span className="text-sm text-[var(--ink-3)]">{DYNAMIC_WIDGETS.length} widgets</span>
            </div>

            <div className="space-y-10">
              {DYNAMIC_WIDGETS.map(def => (
                <WidgetTestRow key={def.id} def={def} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ── Per-widget row ──────────────────────────────────────────────
interface WidgetTestRowProps {
  def: {
    id: string
    name: string
    description: string
    sizes: WidgetSize[]
    defaultSize: WidgetSize
    minLevel: number
    module: WidgetModule
  }
}

function WidgetTestRow({ def }: WidgetTestRowProps) {
  return (
    <div>
      {/* Widget meta */}
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-[var(--ink)]">{def.name}</h4>
          <span className="rounded-sm border border-dashed border-[var(--border-md)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Mock
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--ink-3)]">{def.description}</p>
        <p className="mt-0.5 font-mono text-xs text-[var(--ink-4)]">
          id: {def.id} &middot; minLevel: {def.minLevel} &middot; default: {def.defaultSize}
        </p>
      </div>

      {/* Dashboard-style grid (same as /dashboard) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-[160px] gap-4">
        {SIZES.map(size => {
          const supported = size === 'mini' || def.sizes.includes(size)
          const spanClass = size === 'full' ? 'sm:col-span-2 row-span-2'
            : size === 'half' ? 'sm:col-span-2'
            : ''
          // Mini gets a fixed height override since the grid uses 160px rows
          const miniStyle = size === 'mini' ? { height: '64px' } : undefined
          return (
            <div key={size} className={`relative ${spanClass}`} style={miniStyle}>
              <span className="absolute top-1 left-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {SIZE_LABELS[size]}
              </span>
              {supported ? (
                <WidgetErrorBoundary label={`${def.id} @ ${size}`}>
                  <WidgetRenderer id={def.id} size={size} data={MOCK_DASHBOARD_DATA} features={{}} />
                </WidgetErrorBoundary>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[var(--border-ed)] text-xs text-[var(--ink-4)]">
                  Niet ondersteund
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
