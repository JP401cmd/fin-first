'use client'

import { useEffect, useState } from 'react'
import { Pencil, Check } from 'lucide-react'
import { DraggableWidgetGrid } from '@/components/widgets/draggable-widget-grid'
import type { WidgetPref } from '@/lib/widget-catalog'
import type { DashboardData } from '@/components/widgets/widget-renderer'

/**
 * HeroWidgetRail — power-user-feature op /overzicht hero. Bij klikken op
 * de Bewerken-toggle (naast de (i)-knop) krijgt de plek van Voortgang-
 * doelen + Vrijheidsstrip de volle widget-configurator (drag · resize ·
 * toevoegen · presets) zoals het oude /will widgets-scherm.
 *
 * Onderdrukt twee elementen die in de host-context niet passen:
 *  - Categoriebalk (categoryAppLinks niet doorgegeven)
 *  - Intro-empty-state met "Handmatig / Automatisch / Presets" → vervangen
 *    door compacte "+ Widget toevoegen"-CTA (zie suppressIntroSheet in
 *    DraggableWidgetGrid)
 *
 * Plan-context: §6.4 "widgets-configurator voor Overzicht-hero". Power-
 * user-feature, default niet zichtbaar voor reguliere gebruikers. State
 * leeft in de bestaande widget-prefs (DB) zodat de configuratie ook op
 * andere dashboard-plekken zichtbaar wordt en niet alleen lokaal.
 */

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
      title={isEditing ? 'Klaar met bewerken' : 'Widgets bewerken'}
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

/**
 * Hook voor controlled edit-mode + activeWidgets-check. De rail toont:
 *  - defaultContent (Voortgang + Vrijheidsstrip) wanneer er geen widgets
 *    zijn EN niet in edit-mode → reguliere gebruikers merken niets
 *  - DraggableWidgetGrid in alle andere gevallen
 *
 * `hasActiveWidgets` checkt of de huidige user-prefs minimaal één enabled
 * widget bevatten — zo bepalen we of de hero-rail "live" is voor deze user.
 */
export function useHeroRailState(activeWidgets: WidgetPref[]) {
  const [isEditing, setIsEditing] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Een power-user "heeft widgets" wanneer er minimaal 1 enabled widget is.
  // Reguliere users met lege widget-prefs zien defaultContent.
  const hasActiveWidgets = mounted && activeWidgets.some((w) => w.enabled)

  return {
    isEditing,
    setIsEditing,
    hasActiveWidgets,
    mounted,
  }
}

export function HeroWidgetRail({
  isEditing,
  onEditModeChange,
  hasActiveWidgets,
  activeWidgets,
  allPrefs,
  dashboardData,
  defaultContent,
}: {
  isEditing: boolean
  onEditModeChange: (next: boolean) => void
  hasActiveWidgets: boolean
  activeWidgets: WidgetPref[]
  allPrefs: WidgetPref[]
  dashboardData: DashboardData
  /** Default-render (Voortgang + Vrijheidsstrip) wanneer geen widgets en niet in edit-mode. */
  defaultContent: React.ReactNode
}) {
  // View-mode zonder widgets: render Voortgang + Vrijheidsstrip.
  // Edit-mode OF met widgets: render de volle DraggableWidgetGrid (zonder
  // categorie-balk en zonder intro-sheet).
  if (!isEditing && !hasActiveWidgets) {
    return <>{defaultContent}</>
  }

  return (
    <DraggableWidgetGrid
      initialPrefs={activeWidgets}
      allPrefs={allPrefs}
      data={dashboardData}
      // Bewust niet:
      //  - categoryAppLinks (undefined → geen categorie-balk)
      suppressIntroSheet
      // hideRemoveButton blijft default false — user wil widgets kunnen
      // verwijderen in edit-mode (mei 2026 bug-rapport: "widgets op het
      // overzicht hebben geen verwijder-knop bij bewerken").
      editMode={isEditing}
      onEditModeChange={onEditModeChange}
    />
  )
}
