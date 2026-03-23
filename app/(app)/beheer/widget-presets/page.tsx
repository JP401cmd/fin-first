import { WIDGET_PRESETS } from '@/lib/widget-presets'
import { WIDGET_CATALOG, type WidgetModule } from '@/lib/widget-catalog'

const MODULE_COLORS: Record<WidgetModule, { border: string; bg: string; text: string }> = {
  kern:    { border: 'border-amber-300', bg: 'bg-amber-50', text: 'text-amber-700' },
  wil:     { border: 'border-teal-300',  bg: 'bg-teal-50',  text: 'text-teal-700' },
  horizon: { border: 'border-purple-300', bg: 'bg-purple-50', text: 'text-purple-700' },
  cross:   { border: 'border-neutral-300', bg: 'bg-neutral-50', text: 'text-neutral-600' },
}

const SIZE_LABELS: Record<string, string> = {
  mini: 'S',
  quarter: 'M',
  half: 'L',
  full: 'XL',
}

export default function WidgetPresetsPage() {
  // Build a lookup for widget names
  const widgetNames = new Map(WIDGET_CATALOG.map(w => [w.id, w.name]))

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Widget Presets</h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Persona-presets voor het dashboard. Elke preset definieert een gecureerde widgetselectie.
        </p>
      </div>

      <div className="space-y-4">
        {WIDGET_PRESETS.map((preset) => {
          const colors = MODULE_COLORS[preset.module]
          return (
            <div
              key={preset.id}
              className={`rounded-xl border ${colors.border} bg-[var(--paper)] p-5`}
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}>
                  <span className={`text-sm font-bold ${colors.text}`}>
                    {preset.icon.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-[var(--ink)]">{preset.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
                      {preset.module}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--ink-3)]">{preset.description}</p>
                  <p className="mt-0.5 text-xs text-[var(--ink-4)]">
                    Icon: {preset.icon} &middot; ID: {preset.id}
                  </p>
                </div>
              </div>

              {/* Widgets */}
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">
                  Widgets ({preset.widgets.length})
                </p>
                {preset.widgets.length === 0 ? (
                  <p className="text-sm italic text-[var(--ink-4)]">
                    Nog geen widgets geconfigureerd &mdash; wordt in volgende features ingevuld.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {preset.widgets
                      .filter(w => w.enabled)
                      .sort((a, b) => a.order - b.order)
                      .map((w) => (
                        <span
                          key={w.id}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-1 text-xs text-[var(--ink-2)]"
                        >
                          {widgetNames.get(w.id) ?? w.id}
                          <span className="font-mono text-[var(--ink-4)]">
                            {SIZE_LABELS[w.size] ?? w.size}
                          </span>
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
