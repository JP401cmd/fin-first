'use client'

import { useEffect, useState } from 'react'
import { Pencil, Check, X, Plus } from 'lucide-react'
import { WIDGET_CATALOG } from '@/lib/widget-catalog'
import { WidgetRenderer, type DashboardData } from '@/components/widgets/widget-renderer'
import { useFeatureAccess } from '@/components/app/feature-access-provider'

/**
 * HeroWidgetRail — power-user-feature op /overzicht hero. Vervangt de
 * Voortgang-doelen-card + Vrijheid-strip met 4 vrij-configureerbare
 * widget-slots (matcht visueel met de 4 hefboom-tegels qua breedte).
 *
 * Plan-context: §6.4 "Personalisatie (widgets-configurator voor
 * Overzicht-hero)". User-feedback (mei 19): verzoek om edit-toggle
 * naast de (i)-knop bovenaan zodat power-users hun eigen dashboard
 * kunnen samenstellen zonder naar /mijn/personalisatie te navigeren.
 *
 * Default (zonder config): render de bestaande `defaultContent` —
 * Voortgang-doelen + Vrijheidsstrip — zodat reguliere gebruikers niets
 * merken van de feature. Power-user activeert edit-mode → krijgt 4
 * slot-cards waarin hij widgets uit WIDGET_CATALOG kan plaatsen.
 *
 * Persistence: localStorage key `trifinity:hero-rail`. Geen DB-migratie
 * — bewust client-side voor MVP zodat we snel kunnen itereren. Bij
 * server-rendered gebruiker = geen config = default content (geen
 * hydration-mismatch).
 */

const STORAGE_KEY = 'trifinity:hero-rail'
const SLOT_COUNT = 4

type RailConfig = (string | null)[]

function emptyConfig(): RailConfig {
  return Array(SLOT_COUNT).fill(null)
}

function loadConfig(): RailConfig {
  if (typeof window === 'undefined') return emptyConfig()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyConfig()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return emptyConfig()
    // Normalize: vul tot SLOT_COUNT, accepteer alleen strings of null
    const normalized = Array.from({ length: SLOT_COUNT }, (_, i) => {
      const v = parsed[i]
      return typeof v === 'string' && WIDGET_CATALOG.some((w) => w.id === v)
        ? v
        : null
    })
    return normalized
  } catch {
    return emptyConfig()
  }
}

function saveConfig(config: RailConfig) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // localStorage full or disabled — silent fail. Power-user config is
    // niet-essentieel, dus geen toast-spam.
  }
}

/**
 * Quarter-size widgets die zinvol zijn in de hero. Filter op: bestaat
 * in catalog + ondersteunt quarter-size. We sluiten budget_fav:*-
 * varianten uit omdat die runtime-IDs hebben.
 */
const ELIGIBLE_WIDGETS = WIDGET_CATALOG.filter(
  (w) => w.sizes.includes('quarter') && !w.id.startsWith('budget_fav:'),
)

export function HeroEditToggle({
  isEditing,
  onToggle,
  className,
}: {
  isEditing: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isEditing ? 'Bewerken stoppen' : 'Hero bewerken'}
      title={isEditing ? 'Klaar met bewerken' : 'Widget-slots bewerken'}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${
        isEditing
          ? 'border-violet-500 bg-violet-50 text-violet-700'
          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--ink-3)] hover:text-[var(--ink-2)]'
      } ${className ?? ''}`}
    >
      {isEditing ? (
        <Check className="w-4 h-4" aria-hidden="true" />
      ) : (
        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
      )}
    </button>
  )
}

export function useHeroRailState() {
  const [isEditing, setIsEditing] = useState(false)
  const [config, setConfigState] = useState<RailConfig>(emptyConfig)
  const [mounted, setMounted] = useState(false)

  // Hydratatie: localStorage op de client lezen ná mount. Voorkomt
  // SSR-mismatch want server kent geen localStorage.
  useEffect(() => {
    setConfigState(loadConfig())
    setMounted(true)
  }, [])

  function setConfig(next: RailConfig) {
    setConfigState(next)
    saveConfig(next)
  }

  function setSlot(index: number, widgetId: string | null) {
    if (index < 0 || index >= SLOT_COUNT) return
    const next = [...config]
    next[index] = widgetId
    setConfig(next)
  }

  function resetConfig() {
    setConfig(emptyConfig())
  }

  // Heeft user ten minste één slot ingesteld?
  const hasConfig = mounted && config.some((id) => id != null)

  return {
    isEditing,
    setIsEditing,
    config,
    setSlot,
    resetConfig,
    hasConfig,
    mounted,
  }
}

export function HeroWidgetRail({
  config,
  isEditing,
  onSlotChange,
  onReset,
  dashboardData,
  defaultContent,
}: {
  config: RailConfig
  isEditing: boolean
  onSlotChange: (index: number, widgetId: string | null) => void
  onReset: () => void
  dashboardData: DashboardData
  /** Default-render (Voortgang + Vrijheidsstrip) wanneer geen config en niet in edit-mode. */
  defaultContent: React.ReactNode
}) {
  const hasConfig = config.some((id) => id != null)

  // View-mode zonder config: render gewone Voortgang/Vrijheid.
  // Edit-mode of met config: render 4-slot-grid.
  if (!isEditing && !hasConfig) {
    return <>{defaultContent}</>
  }

  return (
    <div className="space-y-2">
      {isEditing && (
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-[11px] text-[var(--ink-3)] italic">
            Kies een widget per slot. Wijzigingen worden lokaal opgeslagen.
          </p>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink)]"
          >
            <X className="w-3 h-3" aria-hidden="true" />
            Reset slots
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        {Array.from({ length: SLOT_COUNT }).map((_, i) => (
          <HeroSlot
            key={i}
            index={i}
            widgetId={config[i] ?? null}
            isEditing={isEditing}
            onChange={(id) => onSlotChange(i, id)}
            dashboardData={dashboardData}
          />
        ))}
      </div>
    </div>
  )
}

function HeroSlot({
  index,
  widgetId,
  isEditing,
  onChange,
  dashboardData,
}: {
  index: number
  widgetId: string | null
  isEditing: boolean
  onChange: (id: string | null) => void
  dashboardData: DashboardData
}) {
  const { features } = useFeatureAccess()
  const widget = widgetId ? WIDGET_CATALOG.find((w) => w.id === widgetId) : null

  if (isEditing) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[var(--border-md)] bg-[var(--paper)] p-3 min-h-[120px] flex flex-col">
        <div className="text-[9px] uppercase tracking-[0.12em] font-mono text-[var(--ink-4)] mb-2">
          Slot {index + 1}
        </div>
        <select
          value={widgetId ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
          className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink-3)]"
          aria-label={`Slot ${index + 1} widget`}
        >
          <option value="">— Leeg —</option>
          {ELIGIBLE_WIDGETS.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        {widget && (
          <p className="mt-2 text-[10px] text-[var(--ink-3)] leading-snug">
            {widget.description}
          </p>
        )}
      </div>
    )
  }

  if (!widget) {
    // View-mode met config maar lege slot — toon subtiele placeholder.
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border-ed)] bg-[var(--paper)]/50 p-3 min-h-[120px] flex items-center justify-center">
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--ink-4)]">
          <Plus className="w-3 h-3" aria-hidden="true" />
          Leeg
        </span>
      </div>
    )
  }

  // View-mode met gevulde slot — render echte widget via WidgetRenderer.
  // Gebruik 'quarter'-size zodat hij past in 4-koloms-rij.
  return (
    <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 min-h-[120px] overflow-hidden">
      <WidgetRenderer
        id={widget.id}
        size="quarter"
        data={dashboardData}
        features={features}
      />
    </div>
  )
}
