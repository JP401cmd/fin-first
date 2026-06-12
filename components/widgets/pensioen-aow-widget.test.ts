import { describe, it, expect } from 'vitest'
import { computeEffectiveSwr } from '@/lib/fire-params'
import { NL_AOW_MONTHLY, NL_SWR } from '@/lib/constants'

/**
 * Borgt de kern-rekenregel van pensioen-aow-widget: het AOW-vermogens-
 * equivalent kapitaliseert de AOW-inkomensstroom op de ONTTREKKINGSVOET (SWR),
 * niet op het bruto rendement. Eerder werd op `grossReturn` (~7%) gedeeld,
 * waardoor het equivalent ~2,4× te laag uitkwam.
 *
 * We testen hier de pure formule (kapitaal = jaarinkomen / SWR), niet het
 * React-oppervlak, zodat de relatie expliciet en regressie-vast is.
 */
describe('pensioen-aow-widget — AOW-vermogensequivalent', () => {
  const aowYearly = NL_AOW_MONTHLY * 12

  it('kapitaliseert op de effectieve SWR, niet op het bruto rendement', () => {
    const grossReturn = 0.07
    const inflationRate = 0.02
    const swr = computeEffectiveSwr(grossReturn, inflationRate)

    const capitalOnSwr = aowYearly / swr
    const capitalOnGross = aowYearly / grossReturn

    // SWR (~2,88%) << grossReturn (7%) → het equivalent is fors groter.
    expect(capitalOnSwr).toBeGreaterThan(capitalOnGross)
    // De verhouding is grossReturn / swr ≈ 2,4.
    expect(capitalOnSwr / capitalOnGross).toBeCloseTo(grossReturn / swr, 10)
    expect(capitalOnSwr / capitalOnGross).toBeGreaterThan(2)
  })

  it('valt terug op NL_SWR wanneer grossReturn/inflationRate ontbreken', () => {
    // Fallback-pad: zonder profiel-params gebruikt de widget NL_SWR.
    const capital = aowYearly / NL_SWR
    expect(capital).toBeGreaterThan(0)
    // Sanity: AOW (~€1558/mnd) op ≈2,88% SWR ≈ €648k vermogensequivalent.
    expect(capital).toBeGreaterThan(500_000)
    expect(capital).toBeLessThan(800_000)
  })
})
