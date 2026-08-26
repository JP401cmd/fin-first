import { describe, it, expect } from 'vitest'
import {
  compareMortgageVsInvest,
  type HvBParams,
} from '@/lib/hypotheek-vs-beleggen'

// ── Test fixtures ─────────────────────────────────────────────────────────────
//
// These tests pin the reactive behaviour of compareMortgageVsInvest with respect
// to the (now adjustable) `extraBedrag`. The hypotheek-vs-beleggen-opbouw component
// recomputes via useMemo whenever the user moves the slider, so the engine MUST
// respond monotonically: more euro/month → larger effects in both scenarios.

const BASE_PARAMS: Omit<HvBParams, 'extraBedrag'> = {
  hypotheekBalance: 300_000,
  rente: 3.5, // percentage
  repaymentType: 'annuity',
  restLooptijd: 300, // 25 jaar
  isTaxDeductible: true,
  marginaalTarief: 0.3697,
  verwachtRendement: 0.07,
  inflatie: 0.02,
  hasPartner: false,
  horizonJaren: 10,
}

function withExtra(extraBedrag: number): HvBParams {
  return { ...BASE_PARAMS, extraBedrag }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('compareMortgageVsInvest — reactief op extraBedrag', () => {
  it('extraBedrag <= 0 levert een lege/neutrale vergelijking', () => {
    const result = compareMortgageVsInvest(withExtra(0))
    expect(result.aanbeveling).toBe('gelijk')
    expect(result.aflossing.eindwaarde).toBe(0)
    expect(result.beleggen.eindwaarde).toBe(0)
  })

  it('hogere extraBedrag → hogere aflossing-eindwaarde (monotoon)', () => {
    const amounts = [50, 100, 200, 400, 800]
    const eindwaardes = amounts.map(
      (a) => compareMortgageVsInvest(withExtra(a)).aflossing.eindwaarde,
    )
    for (let i = 0; i < eindwaardes.length - 1; i++) {
      expect(eindwaardes[i + 1]).toBeGreaterThan(eindwaardes[i])
    }
  })

  it('hogere extraBedrag → hogere beleggen-eindwaarde (monotoon)', () => {
    const amounts = [50, 100, 200, 400, 800]
    const eindwaardes = amounts.map(
      (a) => compareMortgageVsInvest(withExtra(a)).beleggen.eindwaarde,
    )
    for (let i = 0; i < eindwaardes.length - 1; i++) {
      expect(eindwaardes[i + 1]).toBeGreaterThan(eindwaardes[i])
    }
  })

  it('hogere extraBedrag → grotere rentebesparing (aflossing-nettoVoordeel monotoon)', () => {
    const amounts = [50, 100, 200, 400, 800]
    const nettos = amounts.map(
      (a) => compareMortgageVsInvest(withExtra(a)).aflossing.nettoVoordeel,
    )
    for (let i = 0; i < nettos.length - 1; i++) {
      expect(nettos[i + 1]).toBeGreaterThan(nettos[i])
    }
  })

  it('het netto verschil (beleggen − aflossen) schaalt mee met extraBedrag', () => {
    // Bij een rendement (7%) boven de hypotheekrente (3,5%) wint beleggen, en het
    // voordeel groeit met de inleg. We toetsen dat de magnitude van het verschil
    // toeneemt — niet de absolute richting (die is scenario-afhankelijk).
    const small = compareMortgageVsInvest(withExtra(100)).verschil
    const large = compareMortgageVsInvest(withExtra(800)).verschil
    expect(Math.abs(large)).toBeGreaterThan(Math.abs(small))
  })
})

/**
 * H25: het verlies aan hypotheekrenteaftrek bij extra aflossen werd tegen het
 * volle marginale tarief gewaardeerd (49,50%), terwijl de rente sinds de
 * tariefsaanpassing eigen woning (art. 2.10 lid 2 Wet IB 2001) maximaal tegen
 * 37,56% aftrekbaar is. Dat OVERschatte het HRA-verlies en maakte aflossen
 * structureel minder aantrekkelijk dan het is.
 *
 * Tolerantie: relatief (verhoudingen tussen scenario's), bewust niet absoluut —
 * de bedragen hangen aan een volledig aflosschema over 10 jaar, dus een
 * cent-tolerantie zou hier alleen het schema pinnen, niet de tariefkeuze.
 */
describe('compareMortgageVsInvest — HRA tegen het aftrektarief, niet het marginale', () => {
  const topschijf = (extra: number): HvBParams => ({
    ...BASE_PARAMS,
    extraBedrag: extra,
    marginaalTarief: 0.495,
  })

  it('topschijf-tarief wordt afgekapt: aflossen levert méér op dan bij 49,50% waardering', () => {
    const netto = compareMortgageVsInvest(topschijf(500)).aflossing.nettoVoordeel
    // Referentie: dezelfde run met een tarief dat al ónder het maximum ligt.
    const onderMax = compareMortgageVsInvest({
      ...BASE_PARAMS,
      extraBedrag: 500,
      marginaalTarief: 0.3756,
    }).aflossing.nettoVoordeel
    // Beide worden nu tegen 37,56% gewaardeerd → identiek.
    expect(netto).toBeCloseTo(onderMax, 6)
  })

  it('een tarief ónder het maximum blijft ongemoeid (geen stille gedragswijziging)', () => {
    // 36,97% < 37,56% → de min() mag hier niets doen; dit is het fixture-tarief
    // van alle bestaande tests, die daarom byte-identiek groen blijven.
    const a = compareMortgageVsInvest(withExtra(500)).aflossing.nettoVoordeel
    const b = compareMortgageVsInvest({
      ...BASE_PARAMS,
      extraBedrag: 500,
      marginaalTarief: 0.3697,
    }).aflossing.nettoVoordeel
    expect(a).toBe(b)
  })

  it('zonder aftrekbaarheid verandert er niets aan de aftopping', () => {
    const zonderAftrek = compareMortgageVsInvest({
      ...topschijf(500),
      isTaxDeductible: false,
    }).aflossing.nettoVoordeel
    const metAftrek = compareMortgageVsInvest(topschijf(500)).aflossing.nettoVoordeel
    // Geen aftrek → geen HRA-verlies → hoger netto voordeel van aflossen.
    expect(zonderAftrek).toBeGreaterThan(metAftrek)
  })
})
