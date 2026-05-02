/**
 * CardKpiStrip — herbruikbare 2-KPI strip onder bezitting/schuld-kaarten en
 * onder de totaalbedragen op de Kern-categoriekaarten.
 *
 * Variants:
 *  - `item` — strip op individuele bezittings/schuld-kaart. Heeft een 1px
 *    divider bovenaan, eigen padding en `var(--ink-2)` als tekstkleur.
 *  - `category` — strip op categoriekaart op de Kern-landing. Geen divider,
 *    lichtere typografie (`var(--ink-3)`), past tussen bedrag en mini-bar.
 *
 * Lege strip: als beide KPI's `undefined` zijn, render het component niets
 * (en geen divider) — caller hoeft geen aparte conditional wrapper te bouwen.
 *
 * Krant-discipline:
 *  - Geen `rounded-*` (scherpe hoeken).
 *  - Tabular-nums voor alle getallen.
 *  - Tone-color via `text-positive`/`text-negative` tokens, nooit hardcoded.
 *  - Middenpunt-separator (`·`) tussen 2 KPI's, geen aparte border-divider.
 */
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { KpiValue, KpiPair } from '@/lib/asset-kpi'

interface CardKpiStripProps {
  pair: KpiPair
  variant?: 'item' | 'category'
}

const TONE_CLASS: Record<NonNullable<KpiValue['tone']>, string> = {
  pos: 'text-positive',
  neg: 'text-negative',
  neutral: 'text-[var(--ink-2)]',
}

function KpiCell({
  kpi,
  variant,
}: {
  kpi: KpiValue
  variant: 'item' | 'category'
}) {
  const toneClass = TONE_CLASS[kpi.tone ?? 'neutral']
  const Icon = kpi.icon === 'up' ? TrendingUp : kpi.icon === 'down' ? TrendingDown : null

  // Item-variant heeft iets meer ademruimte (11px). Category-variant blijft
  // identiek qua font-size — visuele rust ontstaat vooral door het ontbreken
  // van de divider en door de wat minder verzadigde tone-kleur op de
  // categorie-kaart (caller geeft daar passende `tone` waarden mee).
  const sizeClass = variant === 'item' ? 'text-[11px]' : 'text-[11px]'
  const labelClass = variant === 'item' ? 'text-[10px]' : 'text-[10px]'

  return (
    <span className="inline-flex items-center gap-1">
      {Icon && <Icon className={`h-2.5 w-2.5 ${toneClass}`} aria-hidden="true" />}
      <span className={`font-mono ${sizeClass} font-medium tabular-nums ${toneClass}`}>
        {kpi.value}
      </span>
      {kpi.label && (
        <span className={`${labelClass} text-[var(--ink-3)]`}>{kpi.label}</span>
      )}
    </span>
  )
}

export function CardKpiStrip({ pair, variant = 'item' }: CardKpiStripProps) {
  const { primary, secondary } = pair
  if (!primary && !secondary) return null

  // Layout-keuze: KPI 1 links uitgelijnd, KPI 2 rechts uitgelijnd, met een
  // discrete middenpunt-separator als visuele scheiding. Beide cellen
  // krijgen `flex-1` zodat de breedteverdeling onafhankelijk van de tekst
  // 50/50 blijft — anders wisselt de positie van het centrale punt per
  // kaart en oogt de rij onrustig over een grid heen.
  if (variant === 'item') {
    return (
      <>
        <div
          className="mx-3 h-px bg-[var(--border-md)]/40 sm:mx-4"
          aria-hidden="true"
        />
        <div className="flex items-center px-3 py-2 sm:px-4">
          <span className="flex-1 text-left">
            {primary && <KpiCell kpi={primary} variant="item" />}
          </span>
          {primary && secondary && (
            <span className="px-2 text-[10px] text-[var(--ink-4)]" aria-hidden="true">
              ·
            </span>
          )}
          <span className="flex-1 text-right">
            {secondary && <KpiCell kpi={secondary} variant="item" />}
          </span>
        </div>
      </>
    )
  }

  // Category-variant — inline regel zonder divider, ingebed door caller.
  return (
    <div className="flex items-center">
      <span className="flex-1 text-left">
        {primary && <KpiCell kpi={primary} variant="category" />}
      </span>
      {primary && secondary && (
        <span className="px-1.5 text-[10px] text-[var(--ink-4)]" aria-hidden="true">
          ·
        </span>
      )}
      <span className="flex-1 text-right">
        {secondary && <KpiCell kpi={secondary} variant="category" />}
      </span>
    </div>
  )
}
