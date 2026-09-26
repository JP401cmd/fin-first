/**
 * Bron-grendel op "sluiten sluit direct" voor de tips-overlay (M38).
 *
 * WAAROM EEN BRON-TEST: `horizon-client.tsx` is >8000 regels en hangt aan de
 * volledige kernel-bundel; renderen in vitest is niet realistisch. Precedent in
 * deze map: `horizon-client.euro-view.test.ts` leest de bron óók letterlijk.
 *
 * Wat we vastpinnen — precies de drie dingen die de bevinding veroorzaakten:
 *  1. het verlaten van de overlay verbergt de tips METEEN en persistent
 *     (`persistOverlayVisible(false)` als eerste regel van `handleOverlayExit`),
 *     niet pas nadat een tweede venster is weggeklikt;
 *  2. er is geen tussen-modal meer — `ToekomstExitNotice` bestaat niet meer en
 *     wordt nergens meer geïmporteerd;
 *  3. sluiten navigeert niet ongevraagd naar /overzicht — de
 *     eerste-sluiting-navigatiehook is weg.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { leesToekomstAlles } from '@/lib/test-utils/toekomst-bronnen'

/**
 * De exit-handler van de tips-overlay woont sinds ADR 0179 fase 1 stap 14 in de lagen-hook
 * van de state-provider; de "mag nergens"-toetsen lezen de host en alle state-hooks.
 */
const SOURCE_PATH = join(process.cwd(), 'components', 'toekomst', 'state', 'use-toekomst-lagen.ts')
const source = readFileSync(SOURCE_PATH, 'utf8')
const alles = leesToekomstAlles()

describe('tips-overlay sluiten (M38)', () => {
  it('verbergt de tips meteen en persistent bij het verlaten van de overlay', () => {
    const match = source.match(/const handleOverlayExit = useCallback\(\(\) => \{([\s\S]*?)\n {2}\}, \[/)
    expect(match, 'handleOverlayExit niet gevonden in use-toekomst-lagen.ts').not.toBeNull()
    const body = match![1]
    const firstStatement = body.split('\n').map((l) => l.trim()).filter(Boolean)[0]
    expect(firstStatement).toBe('persistOverlayVisible(false)')
  })

  it('opent geen tweede venster meer: de exit-modal is verdwenen', () => {
    // Alleen de historische toelichting in het codecommentaar mag de oude naam
    // nog noemen; een import of een gerenderd element niet.
    expect(alles).not.toMatch(/import\s*\{[^}]*ToekomstExitNotice/)
    expect(alles).not.toContain('<ToekomstExitNotice')
    expect(
      existsSync(join(process.cwd(), 'components', 'app', 'horizon', 'toekomst-exit-notice.tsx')),
    ).toBe(false)
  })

  it('navigeert niet ongevraagd weg bij de eerste sluiting', () => {
    expect(alles).not.toContain('useTipsFirstCloseNavigation')
    expect(
      existsSync(join(process.cwd(), 'lib', 'hooks', 'use-tips-first-close-navigation.ts')),
    ).toBe(false)
  })

  it('biedt "niet meer melden" ter plekke aan, als toast-actie', () => {
    expect(source).toContain("label: 'Niet meer melden'")
    expect(source).toContain('dismissExitNoticeForever')
  })
})
