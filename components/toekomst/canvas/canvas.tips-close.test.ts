/**
 * Tips-overlay "sluiten sluit direct" (M38) + voetnoot-knop naar de
 * jaar-op-jaar-tabel (M9) — canvas-deel, gepind op de verplaatste bestanden.
 *
 * De exit-handler zélf (`handleOverlayExit`, eerste statement
 * `persistOverlayVisible(false)`) blijft in de host; die assertion blijft in
 * `components/app/horizon/horizon-client.tips-close.test.ts` tot de provider hem
 * overneemt. Hier: dat élke canvas-ingang naar die ene handler loopt, dat er geen
 * tussen-modal terugsluipt, en dat de voetnoot zelf de knop is.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const DIR = join(process.cwd(), 'components', 'toekomst', 'canvas')
const lees = (naam: string) => readSourceLF(join(DIR, naam))

const CANVAS_BLADEREN = [
  'canvas-tips-toggle.tsx',
  'canvas-pills.tsx',
  'canvas-uitleg.tsx',
  'canvas-grafiek.tsx',
  'canvas-legenda.tsx',
]

describe('tips-overlay sluiten (M38) — canvas', () => {
  it('de Tips-toggle sluit via handleOverlayExit en zet aan via persistOverlayVisible(true)', () => {
    expect(lees('canvas-tips-toggle.tsx')).toContain(
      'onClick={() => { if (overlayVisible) handleOverlayExit(); else persistOverlayVisible(true) }}',
    )
  })

  it('de tips-laag rond de grafiek sluit via dezelfde handler', () => {
    const src = lees('canvas-grafiek.tsx')
    const overlay = src.slice(src.indexOf('<ToekomstOverlay'), src.indexOf('</ToekomstOverlay>'))
    expect(overlay).toContain('onClose={handleOverlayExit}')
    expect(overlay).toContain("visible={overlayVisible && chartMode === 'vermogenspad'}")
  })

  it.each(CANVAS_BLADEREN)('%s opent geen exit-modal en navigeert niet weg bij sluiten', (naam) => {
    const src = lees(naam)
    expect(src).not.toContain('ToekomstExitNotice')
    expect(src).not.toContain('useTipsFirstCloseNavigation')
  })
})

describe('voetnoot onder de grafiek (M9) — canvas-legenda', () => {
  const src = lees('canvas-legenda.tsx')

  it('is zelf een knop naar dezelfde tabel, met afgeschermde pointerdown', () => {
    const i = src.indexOf('Open de jaar-op-jaar-tabel')
    expect(i).toBeGreaterThan(-1)
    const knop = src.slice(src.lastIndexOf('<button', i), i)
    expect(knop).toContain('onClick={() => setSimModalOpen(true)}')
    expect(knop).toContain('onPointerDown={(e) => e.stopPropagation()}')
  })

  it('verwijst niet meer naar een knop elders in de kaart', () => {
    expect(src).not.toContain('Klik Details voor jaar-op-jaar tabel')
  })
})
