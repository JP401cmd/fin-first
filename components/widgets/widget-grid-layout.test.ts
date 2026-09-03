import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { widgetSpanClass } from './widget-grid-helpers'
import { WIDGET_PRESETS } from '@/lib/widget-presets'
import type { WidgetSize } from '@/lib/widget-catalog'

/**
 * Regressie op de RAILHOOGTE van de widget-grid op /overzicht.
 *
 * Achtergrond: de kolomsprong (2→4) stond op `lg` terwijl de rijhoogte-sprong
 * (64px→160px) op `sm` stond. Tussen 640 en 1023px kreeg de rail daardoor wél
 * hoge rijen maar niet de extra kolommen: hetzelfde widgetprofiel werd 1040px
 * hoog op sm tegen 512px op lg, waardoor de briefing onder de vouw viel.
 *
 * Deze suite pint de gerénderde uitkomst — niet "er staat een class" maar de
 * daadwerkelijke rijbezetting die de browser zou berekenen — door de
 * CSS-grid auto-placement (sparse, DOM-volgorde) na te rekenen op de echte
 * span-classes uit widgetSpanClass() en de echte WIDGET_PRESETS.
 */

type Breakpoint = 'base' | 'sm' | 'lg'

const BP_ORDER: Breakpoint[] = ['base', 'sm', 'lg']

/** Kolommen per breakpoint zoals de grid-containers ze zetten. */
const COLUMNS: Record<Breakpoint, number> = { base: 2, sm: 4, lg: 4 }
/** auto-rows-[64px] sm:auto-rows-[160px] */
const ROW_HEIGHT: Record<Breakpoint, number> = { base: 64, sm: 160, lg: 160 }
/** gap-3 sm:gap-4 */
const GAP: Record<Breakpoint, number> = { base: 12, sm: 16, lg: 16 }

/**
 * Lost de effectieve col/row-span op voor een breakpoint: ongeprefixte classes
 * gelden altijd, `sm:` vanaf sm, `lg:` vanaf lg (mobile-first cascade).
 */
function resolveSpan(size: WidgetSize, bp: Breakpoint): { cols: number; rows: number } {
  const active = BP_ORDER.slice(0, BP_ORDER.indexOf(bp) + 1)
  let cols = 1
  let rows = 1
  for (const token of widgetSpanClass(size).split(/\s+/).filter(Boolean)) {
    const idx = token.indexOf(':')
    const prefix = idx === -1 ? 'base' : token.slice(0, idx)
    const util = idx === -1 ? token : token.slice(idx + 1)
    if (!active.includes(prefix as Breakpoint)) continue
    const m = /^(col|row)-span-(\d+)$/.exec(util)
    if (!m) continue
    if (m[1] === 'col') cols = Number(m[2])
    else rows = Number(m[2])
  }
  return { cols, rows }
}

/**
 * CSS-grid sparse auto-placement (geen `grid-flow-dense`): een cursor die nooit
 * terugloopt, per item vooruit schuiven tot het blok past.
 */
function placedRowCount(items: { cols: number; rows: number }[], columns: number): number {
  const occupied = new Set<string>()
  const free = (r: number, c: number, w: number, h: number) => {
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++) if (occupied.has(`${r + dr}:${c + dc}`)) return false
    return true
  }
  let cursorRow = 0
  let cursorCol = 0
  let maxRow = 0
  for (const item of items) {
    const w = Math.min(item.cols, columns)
    const h = item.rows
    let r = cursorRow
    let c = cursorCol
    for (;;) {
      if (c + w > columns) {
        r++
        c = 0
        continue
      }
      if (free(r, c, w, h)) break
      c++
    }
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++) occupied.add(`${r + dr}:${c + dc}`)
    maxRow = Math.max(maxRow, r + h)
    cursorRow = r
    cursorCol = c + w
  }
  return maxRow
}

function railHeight(sizes: WidgetSize[], bp: Breakpoint): number {
  const rows = placedRowCount(sizes.map(s => resolveSpan(s, bp)), COLUMNS[bp])
  return rows * ROW_HEIGHT[bp] + Math.max(0, rows - 1) * GAP[bp]
}

describe('widgetSpanClass — span-contract per maat', () => {
  it('houdt de kolomsprong op sm, synchroon met de rijhoogte-sprong', () => {
    // `lg:`-prefixes zijn hier fout: de container schakelt op sm naar 4 kolommen.
    for (const size of ['mini', 'quarter', 'half', 'full', 'xl'] as WidgetSize[]) {
      expect(widgetSpanClass(size)).not.toContain('lg:')
    }
  })

  it('levert de verwachte cellen per maat op mobiel (2 kol) en vanaf sm (4 kol)', () => {
    expect(resolveSpan('quarter', 'base')).toEqual({ cols: 1, rows: 1 })
    expect(resolveSpan('half', 'base')).toEqual({ cols: 1, rows: 2 })
    expect(resolveSpan('full', 'base')).toEqual({ cols: 2, rows: 2 })
    expect(resolveSpan('xl', 'base')).toEqual({ cols: 2, rows: 2 })

    expect(resolveSpan('quarter', 'sm')).toEqual({ cols: 1, rows: 1 })
    expect(resolveSpan('half', 'sm')).toEqual({ cols: 2, rows: 1 })
    expect(resolveSpan('full', 'sm')).toEqual({ cols: 2, rows: 2 })
    // xl = "Double": volle breedte zodra er 4 kolommen zijn, niet halve.
    expect(resolveSpan('xl', 'sm')).toEqual({ cols: 4, rows: 2 })
  })
})

describe('railhoogte per WIDGET_PRESET', () => {
  for (const preset of WIDGET_PRESETS) {
    const sizes = preset.widgets.map(w => w.size)

    it(`${preset.id}: sm is niet hoger dan lg en past boven de vouw`, () => {
      const sm = railHeight(sizes, 'sm')
      const lg = railHeight(sizes, 'lg')
      // Kern van de bug: sm was 1040px tegen lg 512px.
      expect(sm).toBeLessThanOrEqual(lg)
      expect(sm).toBe(512)
      expect(lg).toBe(512)
    })

    it(`${preset.id}: mobiel blijft de compacte 6-rijen-indeling`, () => {
      expect(railHeight(sizes, 'base')).toBe(444)
    })
  }
})

describe('grid-containers gebruiken dezelfde kolomsprong', () => {
  const files = [
    'components/widgets/draggable-widget-grid.tsx',
    'components/widgets/widget-dnd-grid.tsx',
    'app/(app)/beheer/widget-galerij/widget-galerij-client.tsx',
  ]

  for (const file of files) {
    it(`${file} schakelt bij sm naar 4 kolommen`, () => {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src).toContain('grid-cols-2 sm:grid-cols-4 auto-rows-[64px] sm:auto-rows-[160px]')
      expect(src).not.toContain('grid-cols-2 lg:grid-cols-4')
    })
  }
})
