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

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')
const source = readFileSync(SOURCE_PATH, 'utf8')

describe('tips-overlay sluiten (M38)', () => {
  it('verbergt de tips meteen en persistent bij het verlaten van de overlay', () => {
    const match = source.match(/const handleOverlayExit = useCallback\(\(\) => \{([\s\S]*?)\n {2}\}, \[/)
    expect(match, 'handleOverlayExit niet gevonden in horizon-client.tsx').not.toBeNull()
    const body = match![1]
    const firstStatement = body.split('\n').map((l) => l.trim()).filter(Boolean)[0]
    expect(firstStatement).toBe('persistOverlayVisible(false)')
  })

  it('opent geen tweede venster meer: de exit-modal is verdwenen', () => {
    // Alleen de historische toelichting in het codecommentaar mag de oude naam
    // nog noemen; een import of een gerenderd element niet.
    expect(source).not.toMatch(/import\s*\{[^}]*ToekomstExitNotice/)
    expect(source).not.toContain('<ToekomstExitNotice')
    expect(
      existsSync(join(process.cwd(), 'components', 'app', 'horizon', 'toekomst-exit-notice.tsx')),
    ).toBe(false)
  })

  it('navigeert niet ongevraagd weg bij de eerste sluiting', () => {
    expect(source).not.toContain('useTipsFirstCloseNavigation')
    expect(
      existsSync(join(process.cwd(), 'lib', 'hooks', 'use-tips-first-close-navigation.ts')),
    ).toBe(false)
  })

  it('biedt "niet meer melden" ter plekke aan, als toast-actie', () => {
    expect(source).toContain("label: 'Niet meer melden'")
    expect(source).toContain('dismissExitNoticeForever')
  })
})

/**
 * Bron-grendel op de bereikbaarheid van de Details-knop tijdens tips-modus (M9).
 *
 * De tips-scrim (`toekomst-overlay.tsx`) is een klik-vanger op `z-[45]` die als
 * portal-kind van `[data-scroll-container]` over de VOLLE paginahoogte ligt.
 * De Details-pill staat in dezelfde hero-kaart maar buiten de grafiek-wrapper
 * (`z-[50]`), dus zonder eigen stapelniveau ving de scrim de klik af: de eerste
 * klik sloot de tips i.p.v. de jaar-op-jaar-tabel te openen. Deze test pint dat
 * de knoprij één stap bóven de scrim staat en dat de knop zijn pointerdown
 * afschermt — dezelfde twee dingen die de bevinding veroorzaakten.
 */
describe('Details-knop boven de tips-scrim (M9)', () => {
  /** De scrim in toekomst-overlay.tsx moet op z-[45] blijven staan; anders klopt 46 niet. */
  it('staat precies één stap boven de tips-scrim', () => {
    const overlaySource = readFileSync(
      join(process.cwd(), 'components', 'app', 'horizon', 'toekomst-overlay.tsx'),
      'utf8',
    )
    expect(overlaySource).toContain('z-[45]')

    const lifted = source.indexOf('className="relative z-[46]')
    expect(lifted, 'de Details-knoprij draagt geen `relative z-[46]`').toBeGreaterThan(-1)
    // De Details-knop moet ín die opgetilde rij zitten, niet ergens anders.
    const rowRegion = source.slice(lifted, lifted + 2500)
    expect(rowRegion).toContain('setSimModalOpen(true)')
    expect(rowRegion).toContain('TableProperties')
  })

  it('schermt de pointerdown van de Details-knop af', () => {
    const lifted = source.indexOf('className="relative z-[46]')
    const rowRegion = source.slice(lifted, lifted + 2500)
    const buttonStart = rowRegion.indexOf('setSimModalOpen(true)')
    expect(
      rowRegion.slice(buttonStart, buttonStart + 600),
    ).toContain('onPointerDown={(e) => e.stopPropagation()}')
  })

  it('maakt de voetnoot onder de grafiek zelf een knop naar dezelfde tabel', () => {
    expect(source).toContain('Open de jaar-op-jaar-tabel')
    // Niet langer alleen een verwijzing naar een knop elders in de kaart.
    expect(source).not.toContain('Klik Details voor jaar-op-jaar tabel')
  })
})
