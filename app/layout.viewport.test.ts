import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Given de mobiele app-shell met vol-hoge, dvh-gebaseerde panelen (Fin-chat,
 *   BottomSheets) die onderaan het scherm verankerd zijn,
 * When het schermtoetsenbord opent op Android/Chrome (sinds v108 standaard
 *   'resizes-visual': het toetsenbord verkleint de layout-viewport NIET),
 * Then moet de app expliciet `interactive-widget=resizes-content` voeren zodat
 *   100dvh meekrimpt en de kop van het chatpaneel in beeld blijft (B-013).
 *
 * Bron-assertie op de root-layout (imports van app/layout.tsx zijn te zwaar
 * voor jsdom door next/font): de viewport-export moet de instelling dragen.
 */
describe('root-layout viewport — toetsenbordgedrag (B-013)', () => {
  it("voert interactiveWidget: 'resizes-content'", () => {
    const src = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf8')
    const viewportBlock = src.slice(src.indexOf('export const viewport'))
    expect(viewportBlock).toMatch(/interactiveWidget:\s*'resizes-content'/)
  })
})
