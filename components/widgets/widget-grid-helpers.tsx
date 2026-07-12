'use client'

/**
 * Gedeelde, @dnd-kit-vrije helpers voor de widget-grid.
 *
 * Bundle ronde 2: de sleep-machinerie (@dnd-kit, ~18kB gz) is naar een
 * edit-only chunk (`widget-dnd-grid.tsx`) verhuisd zodat /overzicht in
 * kijk-modus geen drag-code laadt. Deze module bevat wat BEIDE render-paden
 * (statische kijk-grid én de dynamische edit-grid) nodig hebben — puur, zonder
 * @dnd-kit — zodat de parent en de kijk-grid de drag-chunk niet mee-importeren.
 */

import type { WidgetPref, WidgetSize } from '@/lib/widget-catalog'
import { useDisplaySize } from '@/lib/hooks/use-display-size'
import { WidgetRenderer, type DashboardData } from './widget-renderer'
import type { FeatureAccessMap } from '@/lib/compute-feature-access'

/** Human-readable size label */
export function sizeLabel(size: WidgetSize): string {
  switch (size) {
    case 'mini': return 'XS'
    case 'quarter': return '25%'
    case 'half': return '50%'
    case 'full': return '100%'
    case 'xl': return 'Double'
  }
}

/**
 * Responsive grid-span-classes op basis van de opgeslagen widget-grootte.
 * On mobile (<640px): quarter→mini(1col×1row), half→quarter(1col×2row),
 * full→half(2col×2row), xl→full(2col×2row). On desktop (sm+): quarter
 * (1col×1row), half(2col×1row), full(2col×2row), xl(4col×2row op lg).
 */
export function widgetSpanClass(size: WidgetSize): string {
  return size === 'xl'      ? 'col-span-2 lg:col-span-4 row-span-2'
    : size === 'full'       ? 'col-span-2 row-span-2'
    : size === 'half'       ? 'row-span-2 sm:row-span-1 col-span-1 sm:col-span-2'
    : size === 'quarter'    ? 'row-span-1'
    : ''
}

/**
 * Statisch grid-item voor KIJK-modus: rendert de widget zonder enige
 * sleep-machinerie (geen useSortable/DndContext). Byte-voor-byte gelijk aan
 * wat de sleepbare variant in niet-edit-modus toont (span-class + testid +
 * relative wrapper), maar zónder @dnd-kit te importeren.
 */
export function StaticWidgetItem({
  pref,
  data,
  features,
}: {
  pref: WidgetPref
  data: DashboardData
  features: FeatureAccessMap
}) {
  const displaySize = useDisplaySize(pref.size)
  return (
    <div className={widgetSpanClass(pref.size)} data-testid={`widget-item-${pref.id}`}>
      <div className="relative">
        <WidgetRenderer id={pref.id} size={displaySize} data={data} features={features} />
      </div>
    </div>
  )
}
