/**
 * Bron-grendel op de bedieningsrij van de canvaskop (tips-close, M9). Blok B verhuisde in
 * fase 1 naar `plan/plan-hero-kop.tsx` en in fase 2 (W1) als canvaskop naar
 * `canvas/canvas-kop.tsx` (ADR 0179).
 *
 * De tips-scrim van ToekomstOverlay ligt op z-[45]; de bedieningsrij (Lagen, de canvas-i)
 * moet er precies één stap boven liggen, anders sluit de eerste klik de tips in plaats van
 * het menu te openen. De Details-knop naar de jaar-op-jaar-tabel is uit de kop: die tabel
 * heeft één ingang, de link in Plan (spec §4.2 regel 10, wireframe §4.3 regel 7).
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const source = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'canvas', 'canvas-kop.tsx'))
const overlaySource = readSourceLF(join(process.cwd(), 'components', 'app', 'horizon', 'toekomst-overlay.tsx'))

describe('canvas-kop — bedieningsrij boven de tips-scrim (M9)', () => {
  it('staat precies één stap boven de tips-scrim', () => {
    expect(overlaySource).toContain('z-[45]')
    expect(source, 'de bedieningsrij draagt geen `relative z-[46]`').toContain('className="relative z-[46]')
  })

  it('opent de jaar-op-jaar-tabel niet: die ingang woont in Plan', () => {
    expect(source).not.toContain('setSimModalOpen')
    expect(source).not.toContain('TableProperties')
  })
})
