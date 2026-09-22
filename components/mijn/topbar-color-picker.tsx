'use client'

import type { CSSProperties } from 'react'
import { ChevronLeft } from 'lucide-react'
import { ColorPickerCard } from '@/components/app/color-picker-card'
import { useModuleColors } from '@/components/app/module-color-provider'
import {
  DEFAULT_TOPBAR_COLOR,
  TOPBAR_PRESETS,
  topbarColorVars,
  topbarLegibility,
} from '@/lib/color-palette'
import { LEVERAGE_STATUS_DOT } from '@/lib/leverage-status'

/**
 * TopbarColorPicker — de kleur van de mobiele TopBar (ADR 0174 D3).
 *
 * De balk is chrome: geen vijfde accent, geen status. Hij krijgt daarom geen
 * palet-strip maar een voorbeeld van de balk zelf, met de paginanaam en de
 * drie kompaspunten. Dat voorbeeld is ook de enige plek waar je de keuze op
 * een computer ziet, want daar is de TopBar verborgen (`lg:hidden`).
 *
 * De hint toetst voorgrond tegen balk, niet wit op shade 700 zoals
 * `contrastHint` bij de accenten. Hij waarschuwt en blokkeert nooit.
 *
 * Opslaan loopt via de ModuleColorProvider: direct zichtbaar, debounced naar
 * `profiles.topbar_color`. De standaard (en een reset) wordt `null`.
 */

export function topbarWarnings(hex: string): string[] {
  const { textLow, statusDotsLow } = topbarLegibility(hex)
  const warnings: string[] = []
  if (textLow) {
    warnings.push(
      'Bij deze middentoon is de paginanaam minder goed leesbaar. ' +
        'Een donkerdere of juist lichtere kleur leest beter.',
    )
  }
  if (statusDotsLow) {
    warnings.push(
      'Op deze lichte balk vallen de groene en oranje punten van het kompas weg. ' +
        'Een donkere balk houdt ze zichtbaar.',
    )
  }
  return warnings
}

function TopbarPreview({ hex }: { hex: string }) {
  return (
    <div
      aria-hidden="true"
      className="mb-2 flex h-9 items-center gap-1 rounded-[var(--r-sm)] bg-[var(--topbar-bg)] pl-1 pr-3 text-[var(--topbar-fg)]"
      style={topbarColorVars(hex) as CSSProperties}
    >
      <ChevronLeft className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-serif text-[15px] leading-tight">
        Weergave en uiterlijk
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className={`block h-[6px] w-[6px] rounded-full ${LEVERAGE_STATUS_DOT.good}`} />
        <span className={`block h-[6px] w-[6px] rounded-full ${LEVERAGE_STATUS_DOT.warn}`} />
        <span className={`block h-[6px] w-[6px] rounded-full ${LEVERAGE_STATUS_DOT.bad} ring-1 ring-[var(--topbar-fg)]`} />
      </span>
    </div>
  )
}

export function TopbarColorPicker() {
  const { topbarColor, setTopbarColor } = useModuleColors()

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Balkkleur
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
        De balk bovenaan op een smal scherm, zoals je telefoon, met de
        paginanaam en de terugknop. Je keuze kleurt ook de balk van je browser
        en geldt op elk apparaat waarop je inlogt. Op een breed scherm zie je
        hem alleen in het voorbeeld hieronder. Het is alleen uiterlijk: de balk
        hoort bij geen hefboom, en de statuskleuren blijven vast.
      </p>
      <ColorPickerCard
        label="Balk bovenaan"
        sublabel="Alleen op een smal scherm."
        value={topbarColor}
        defaultValue={DEFAULT_TOPBAR_COLOR}
        presets={[...TOPBAR_PRESETS]}
        onChange={setTopbarColor}
        preview={<TopbarPreview hex={topbarColor} />}
        warnings={topbarWarnings(topbarColor)}
      />
    </div>
  )
}
