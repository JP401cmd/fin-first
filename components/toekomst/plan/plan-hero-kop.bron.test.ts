/**
 * Bron-grendel op de Details-rij van de hero-kaart (tips-close, M9) na de verhuizing
 * van blok B naar `plan-hero-kop.tsx` (fase 1, ADR 0179, kaart §5.1).
 *
 * De tips-scrim van ToekomstOverlay ligt op z-[45]; de Details-rij moet er precies één
 * stap boven liggen en zijn pointerdown afschermen, anders sluit de eerste klik de tips
 * in plaats van de jaar-op-jaar-tabel te openen. Het exit-deel van dezelfde test
 * (handleOverlayExit, voetnoot) verhuist naar het canvas (stroom X2).
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const source = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'plan', 'plan-hero-kop.tsx'))
const overlaySource = readSourceLF(join(process.cwd(), 'components', 'app', 'horizon', 'toekomst-overlay.tsx'))

describe('plan-hero-kop — Details-knop boven de tips-scrim (M9)', () => {
  it('staat precies één stap boven de tips-scrim', () => {
    expect(overlaySource).toContain('z-[45]')
    const lifted = source.indexOf('className="relative z-[46]')
    expect(lifted, 'de Details-knoprij draagt geen `relative z-[46]`').toBeGreaterThan(-1)
    const rowRegion = source.slice(lifted, lifted + 2500)
    expect(rowRegion).toContain('setSimModalOpen(true)')
    expect(rowRegion).toContain('TableProperties')
  })

  it('schermt de pointerdown van de Details-knop af', () => {
    const lifted = source.indexOf('className="relative z-[46]')
    const rowRegion = source.slice(lifted, lifted + 2500)
    const buttonStart = rowRegion.indexOf('setSimModalOpen(true)')
    expect(rowRegion.slice(buttonStart, buttonStart + 600)).toContain('onPointerDown={(e) => e.stopPropagation()}')
  })
})
