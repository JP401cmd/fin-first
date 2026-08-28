'use client'

import { useRef } from 'react'
import { RotateCcw, AlertTriangle } from 'lucide-react'
import { generatePalette, SHADES, contrastRatio } from '@/lib/color-palette'
import { TapTarget } from '@/components/editorial/tap-target'

export interface ColorPreset {
  hex: string
  name: string
}

interface ColorPickerCardProps {
  label: string
  sublabel?: string
  value: string
  defaultValue: string
  presets?: ColorPreset[]
  onChange: (hex: string) => void
  size?: 'large' | 'compact'
  /** Optional badge shown on the card (e.g. "Jij zit hier →") */
  activeBadge?: string
  /**
   * When true, warns (does not block) if white text on the 700-shade of the
   * chosen color drops below WCAG AA (4.5:1) — useful for accent colors that
   * carry white button-text / kickers.
   */
  contrastHint?: boolean
}

/**
 * Reusable color picker card with:
 * - Color swatch (click to open native color picker)
 * - 11-step palette strip (live preview)
 * - Preset swatches (up to 8)
 * - Hex value display
 * - Reset button (shown when value ≠ defaultValue)
 */
export function ColorPickerCard({
  label,
  sublabel,
  value,
  defaultValue,
  presets = [],
  onChange,
  activeBadge,
  contrastHint = false,
}: ColorPickerCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const palette = generatePalette(value)
  const isDefault = value.toLowerCase() === defaultValue.toLowerCase()
  const lowContrast =
    contrastHint && contrastRatio('#ffffff', palette[700].hex) < 4.5

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 transition-all hover:border-[var(--border-md)]">
      {/* Header row */}
      <div className="mb-2 flex items-center gap-2">
        {/* Color swatch / picker trigger */}
        <label
          className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-[var(--border-ed)] shadow-sm transition-all hover:shadow-md"
          style={{ backgroundColor: value }}
          title="Klik om kleur te kiezen"
        >
          <input
            ref={inputRef}
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label}: eigen kleur kiezen`}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-[var(--ink-2)] truncate">{label}</p>
            {activeBadge && (
              <span className="shrink-0 rounded-[var(--r-sm)] bg-[var(--subtle)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--ink-3)] border border-[var(--border-ed)]">
                {activeBadge}
              </span>
            )}
          </div>
          {sublabel && <p className="text-[10px] text-[var(--ink-3)] truncate">{sublabel}</p>}
        </div>

        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className="shrink-0 rounded p-1 text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
            title="Reset naar standaard"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Palette strip */}
      <div className="mb-2 flex gap-0.5 overflow-hidden rounded-[var(--r-sm)]">
        {SHADES.map((shade) => (
          <div
            key={shade}
            className="h-4 flex-1"
            style={{ backgroundColor: palette[shade].hex }}
            title={`${label}-${shade}`}
          />
        ))}
      </div>

      {/* Contrast-waarschuwing — alleen waarschuwen, nooit blokkeren */}
      {lowContrast && (
        <p className="mb-2 flex items-start gap-1 text-[10px] italic text-[var(--ink-3)]">
          <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          <span>Lichte kleur — tekst op deze tint kan slecht leesbaar worden.</span>
        </p>
      )}

      {/* Preset swatches. Raakgebied: de swatch blijft visueel 20×20, maar de
          knop eromheen reserveert 44×44 (M19). `reserve` i.p.v. `extend` omdat
          de swatches in een raster naast elkaar staan — een opgerekt raakgebied
          zou over de buurman heen vallen. Tussenruimte mee omhoog naar 8px. */}
      {presets.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-2">
          {presets.map((preset) => {
            const active = value.toLowerCase() === preset.hex.toLowerCase()
            return (
              <TapTarget
                key={preset.hex}
                label={`${label}: ${preset.name}`}
                title={preset.name}
                aria-pressed={active}
                onClick={() => onChange(preset.hex)}
                className="group"
              >
                <span
                  aria-hidden="true"
                  className={`block h-5 w-5 rounded-full border-2 transition-all group-hover:scale-110 ${
                    active ? 'border-[var(--ink)] scale-110' : 'border-[var(--border-ed)]'
                  }`}
                  style={{ backgroundColor: preset.hex }}
                />
              </TapTarget>
            )
          })}
        </div>
      )}

      {/* Hex value */}
      <p className="text-[10px] font-mono text-[var(--ink-3)]">{value}</p>
    </div>
  )
}
