/**
 * Tips-overlay "sluiten sluit direct" (M38) — canvas-deel, gepind op de canvas-bladeren.
 *
 * De exit-handler zélf (`handleOverlayExit`, eerste statement `persistOverlayVisible(false)`)
 * woont in `use-toekomst-lagen.ts`. Hier: dat élke canvas-ingang naar die ene handler
 * loopt, dat er geen tussen-modal terugsluipt, en (fase 2, ADR 0179) dat de tips achter
 * de canvas-i zitten en niet standaard aan staan. De voetnoot met de knop naar de
 * jaar-op-jaar-tabel (M9) is in fase 2 vervallen; de link in Plan is de enige ingang.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const DIR = join(process.cwd(), 'components', 'toekomst', 'canvas')
const lees = (naam: string) => readSourceLF(join(DIR, naam))

const CANVAS_BLADEREN = [
  'toekomst-canvas.tsx',
  'canvas-kop.tsx',
  'canvas-tips-toggle.tsx',
  'canvas-uitleg.tsx',
  'canvas-grafiek.tsx',
  'canvas-legenda.tsx',
]

describe('tips-overlay sluiten (M38) — canvas', () => {
  it('de Tips-schakelaar sluit via handleOverlayExit en zet aan via persistOverlayVisible(true)', () => {
    expect(lees('canvas-tips-toggle.tsx')).toContain(
      'onClick={() => { if (overlayVisible) handleOverlayExit(); else persistOverlayVisible(true) }}',
    )
  })

  it('de tips-laag rond de grafiek sluit via dezelfde handler, alleen in Vermogen', () => {
    const src = lees('canvas-grafiek.tsx')
    const overlay = src.slice(src.indexOf('<ToekomstOverlay'), src.indexOf('</ToekomstOverlay>'))
    expect(overlay).toContain('onClose={handleOverlayExit}')
    expect(overlay).toContain("visible={overlayVisible && modus === 'vermogen'}")
  })

  it.each(CANVAS_BLADEREN)('%s opent geen exit-modal en navigeert niet weg bij sluiten', (naam) => {
    const src = lees(naam)
    expect(src).not.toContain('ToekomstExitNotice')
    expect(src).not.toContain('useTipsFirstCloseNavigation')
  })
})

describe('tips achter de canvas-i (ADR 0179 fase 2, spec §4.9)', () => {
  const canvas = lees('toekomst-canvas.tsx')

  it('de schakelaar staat in de footer van de canvas-i, niet als losse knop in de kop', () => {
    const i = canvas.indexOf('<ChartTips')
    expect(i).toBeGreaterThan(-1)
    const tips = canvas.slice(i, canvas.indexOf('/>\n              </>', i))
    expect(tips).toContain('title={CANVAS_UITLEG_TITEL}')
    expect(tips).toContain('<CanvasTipsToggle')
  })

  it('de tips staan niet standaard aan', () => {
    const lagen = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'state', 'use-toekomst-lagen.ts'))
    expect(lagen).toContain('const [overlayVisible, setOverlayVisible] = useState(false)')
  })

  it('de voetnoot en de stopmoment-hint zijn weg', () => {
    const legenda = lees('canvas-legenda.tsx')
    expect(legenda).not.toContain('Open de jaar-op-jaar-tabel')
    expect(legenda).not.toContain('Stopmoment wijzigen')
  })
})
