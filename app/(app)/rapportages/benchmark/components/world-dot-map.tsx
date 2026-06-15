'use client'

/**
 * WorldDotMap — een stippen-wereldkaart waarin de stippen op het land een kleur
 * krijgen naar welvaartsklasse, en de zee onbekleurde stippen houdt.
 *
 * Kleurlegenda = de drie module-accenten (gevraagd door de gebruiker):
 *   rijk   → Overzicht (kern)   · midden → Toekomst (horizon)   · arm → Mijn (wil)
 *
 * Module-hexen via `useModuleHex` (canoniek voor canvas/SVG — niet hardcoden).
 * Pure presentatie; geen data-afhankelijkheid.
 */

import { useMemo } from 'react'
import { useModuleHex } from '@/components/app/module-color-provider'
import { tierAt, type WealthTier } from '@/lib/benchmark/world-regions'
import { VIZ } from './viz-palette'

// Verdubbeld raster (4× zoveel stippen) → vloeiendere continentgrenzen.
const COLS = 144
const ROWS = 68
const VIEW_W = 1000
// 30% minder hoog dan een vierkant raster zou geven; breedte blijft 1000.
const VIEW_H = Math.round((VIEW_W / COLS) * ROWS * 0.7)

export function WorldDotMap() {
  // Donkerder (shade 700) → gedempte, minder felle accenten; volgt de gebruiker.
  const tierHex: Record<WealthTier, string> = {
    rich: useModuleHex('kern', 700),
    middle: useModuleHex('horizon', 700),
    poor: useModuleHex('wil', 700),
  }

  // ~9.8k stippen → memoïseren zodat ze niet bij elke render herbouwd worden.
  const dots = useMemo(() => {
    const cellW = VIEW_W / COLS
    const cellH = VIEW_H / ROWS
    const out: React.ReactNode[] = []
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const nx = col / (COLS - 1)
        const ny = row / (ROWS - 1)
        const tier = tierAt(nx, ny)
        const cx = (col + 0.5) * cellW
        const cy = (row + 0.5) * cellH
        if (tier) {
          out.push(<circle key={`${row}-${col}`} cx={cx} cy={cy} r={1.5} fill={tierHex[tier]} />)
        } else if (col % 2 === 0 && row % 2 === 0) {
          // Zee dunner bezaaien: slechts een kwart van de zee-cellen krijgt een stip.
          out.push(<circle key={`${row}-${col}`} cx={cx} cy={cy} r={0.85} fill={VIZ.line} opacity={0.4} />)
        }
      }
    }
    return out
  }, [tierHex.rich, tierHex.middle, tierHex.poor])

  // "Jij staat hier" — klein accent-baken boven Nederland (≈ 52°N, 5°O).
  const youX = 0.514 * VIEW_W
  const youY = 0.217 * VIEW_H

  return (
    <div className="my-5">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="block h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Wereldkaart in stippen, gekleurd naar welvaartsklasse"
      >
        {dots}
        {/* jij-baken */}
        <circle cx={youX} cy={youY} r={16} fill={VIZ.accent} opacity={0.14} />
        <circle cx={youX} cy={youY} r={4} fill={VIZ.accent} stroke={VIZ.card} strokeWidth={1.5} />
      </svg>

      {/* legenda */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-dm-mono text-[11px] text-[var(--ink-4)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: tierHex.rich }} />
          rijk
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: tierHex.middle }} />
          midden vermogen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: tierHex.poor }} />
          arm
        </span>
        <span style={{ color: VIZ.line }}>|</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: VIZ.accent }} />
          jij
        </span>
      </div>
    </div>
  )
}
