import { describe, it, expect } from 'vitest'
import {
  resolveFireDoelWeergave,
  FIRE_DOEL_ONDERSCHRIFT,
  type FireDoelGrondslag,
} from './fire-doel-weergave'
import type { HousingStrategyMode } from '@/lib/housing-strategy'

/**
 * UR3-07 defect 3 — "het doelbedrag springt op /toekomst".
 *
 * DE BEVINDING: een gebruiker zag eerst `€ 140.000 · voorlopig` en ~15 seconden
 * later `ca. € 620.000`. Geen invoerverschil tussen de server- en de clientrun
 * (die krijgen dezelfde context) en geen tweede motor: een GRONDSLAG-WISSEL in
 * de weergavelaag. De tegel las vóór de worker-run Prognose!J (liquide, zónder
 * huis) en erna Prognose!I (netto vermogen, MÉT huis), en
 * `I = J + (niet-liquide bezit − niet-liquide schuld)`.
 *
 * WAT DEZE SUITE VASTLEGT: per woonstrategie moet de grondslag van de EERSTE
 * PAINT gelijk zijn aan die van de VERFIJNDE run. Niet "ongeveer hetzelfde
 * bedrag" — dezelfde GROOTHEID. Het bedrag mag daarna nog schuiven omdat de
 * clientrun verse rijen en actieve schuifjes meeneemt; de grootheid nooit.
 *
 * TOLERANTIE — bewust ABSOLUUT en zelfs EXACT (`toBe`, geen epsilon). Dit zijn
 * geen twee berekeningen die naar elkaar toe moeten convergeren maar twee
 * doorgiftes van hetzelfde kernelveld; elk verschil is per definitie een
 * bedradingsfout, niet een afrondingsverschil. Een relatieve tolerantie zou hier
 * juist de fout verbergen die de kaart beschrijft: op de huis-zware fixture
 * schelen J en I een factor 11, maar op `include_full` schelen ze niets — dán
 * zou een percentage-marge de wissel gewoon doorlaten.
 */

/**
 * De vier woonstrategieën met hun gemeten I/J-verhouding.
 *
 * `nietLiquide` staat aan zodra de modus ≠ `include_full`
 * (lib/horizon-kernel/adapter/prio-overgang.ts), dus alleen dáár geldt I ≡ J.
 * De `downsize`-rij is de gemelde situatie zelf: J € 54.429 → I € 620.050.
 */
const WOONMODI: {
  mode: HousingStrategyMode
  /** `hasEigenHuis && isHomeExcludedFromFire(config)` — alleen exclude_from_fire. */
  homeExcludedFromProgress: boolean
  doelExclHuis: number
  doelInclHuis: number
  /** Welke grootheid de tegel hoort te tonen — vóór én ná de worker-run. */
  verwachteGrondslag: FireDoelGrondslag
}[] = [
  {
    mode: 'include_full',
    homeExcludedFromProgress: false,
    doelExclHuis: 620_050,
    doelInclHuis: 620_050,
    verwachteGrondslag: 'incl-huis',
  },
  {
    mode: 'exclude_from_fire',
    homeExcludedFromProgress: true,
    doelExclHuis: 500_000,
    doelInclHuis: 655_000,
    verwachteGrondslag: 'excl-huis',
  },
  {
    mode: 'downsize',
    homeExcludedFromProgress: false,
    doelExclHuis: 54_429,
    doelInclHuis: 620_050,
    verwachteGrondslag: 'incl-huis',
  },
  {
    mode: 'reverse_mortgage',
    homeExcludedFromProgress: false,
    doelExclHuis: 500_000,
    doelInclHuis: 655_000,
    verwachteGrondslag: 'incl-huis',
  },
]

describe('resolveFireDoelWeergave — first paint en verfijning delen één grondslag', () => {
  for (const modus of WOONMODI) {
    it(`${modus.mode}: de eerste paint toont dezelfde grootheid als de kernel-run erna`, () => {
      // Given de SERVER-kernelrun (bundel) heeft beide doelen geleverd en de
      // client-worker is nog niet geland.
      const eerstePaint = resolveFireDoelWeergave({
        homeExcludedFromProgress: modus.homeExcludedFromProgress,
        kernelRequiredNetWorthInclHome: null,
        kernelRequiredPortfolioExclHome: null,
        serverRequiredNetWorthInclHome: modus.doelInclHuis,
        serverRequiredPortfolioExclHome: modus.doelExclHuis,
      })
      // When de client-kernelrun met DEZELFDE cijfers landt.
      const verfijnd = resolveFireDoelWeergave({
        homeExcludedFromProgress: modus.homeExcludedFromProgress,
        kernelRequiredNetWorthInclHome: modus.doelInclHuis,
        kernelRequiredPortfolioExclHome: modus.doelExclHuis,
        serverRequiredNetWorthInclHome: null,
        serverRequiredPortfolioExclHome: null,
      })

      // Then is de grootheid identiek — en dus ook het bedrag.
      expect(eerstePaint.grondslag).toBe(modus.verwachteGrondslag)
      expect(verfijnd.grondslag).toBe(modus.verwachteGrondslag)
      expect(eerstePaint.bedrag).toBe(verfijnd.bedrag)
      // …en alleen de HARDHEID verschilt; dat is het enige dat mag verschillen.
      expect(eerstePaint.status).toBe('voorlopig')
      expect(eerstePaint.bron).toBe('server-kernel')
      expect(verfijnd.status).toBe('definitief')
      expect(verfijnd.bron).toBe('kernel')
    })
  }

  it('downsize: de eerste paint toont NIET het liquide doel — dat was de gemelde sprong', () => {
    // Given de huis-zware downsize-fixture uit de melding (J € 54.429, I € 620.050),
    // When alleen de server-kernelrun beschikbaar is,
    const eerstePaint = resolveFireDoelWeergave({
      homeExcludedFromProgress: false,
      serverRequiredNetWorthInclHome: 620_050,
      serverRequiredPortfolioExclHome: 54_429,
    })
    // Then staat er het incl.-huis-doel, niet het liquide doel dat 11× kleiner is.
    expect(eerstePaint.bedrag).toBe(620_050)
    expect(eerstePaint.bedrag).not.toBe(54_429)
    expect(eerstePaint.grondslag).toBe('incl-huis')
  })

  it('exclude_from_fire: de excl.-tak wijkt NOOIT uit naar het incl.-huis-doel', () => {
    // Given de woning staat buiten de FIRE-grondslag en alleen Prognose!I is er,
    const zonderLiquideDoel = resolveFireDoelWeergave({
      homeExcludedFromProgress: true,
      kernelRequiredNetWorthInclHome: 655_000,
      kernelRequiredPortfolioExclHome: null,
      serverRequiredNetWorthInclHome: 655_000,
      serverRequiredPortfolioExclHome: null,
    })
    // Then komt er geen bedrag in beeld dat het huis wél bevat: een groter getal
    // onder het label "zonder je huis" is precies de tegenspraak die we uitsluiten.
    expect(zonderLiquideDoel.bedrag).toBe(0)
    expect(zonderLiquideDoel.grondslag).toBe('excl-huis')
    expect(zonderLiquideDoel.status).toBe('onbekend')
    expect(zonderLiquideDoel.bron).toBeNull()
  })

  it('het onderschrift benoemt de grootheid die er WERKELIJK staat', () => {
    // Given geen enkele Prognose!I (bv. een oudere run zonder dat veld) bij een
    // strategie die normaal het incl.-huis-doel toont,
    const terugval = resolveFireDoelWeergave({
      homeExcludedFromProgress: false,
      kernelRequiredNetWorthInclHome: null,
      kernelRequiredPortfolioExclHome: 54_429,
    })
    // Then verhuist het ONDERSCHRIFT mee naar het liquide doel — het label mag
    // het getal nooit tegenspreken (het verzwarende deel van de bevinding).
    expect(terugval.bedrag).toBe(54_429)
    expect(terugval.grondslag).toBe('excl-huis')
    expect(FIRE_DOEL_ONDERSCHRIFT[terugval.grondslag]).toBe('benodigd — zonder je huis')
    expect(FIRE_DOEL_ONDERSCHRIFT['incl-huis']).toBe('benodigd — met je huis')
  })

  it('geen enkel doel (vast anker, ADR 0129 D4) ⇒ 0 + "onbekend", geen stil bedrag', () => {
    // De loader zet beide velden op null onder een vast anker; de tegel toont dan
    // de geprojecteerde stand op het stopmoment, en de guard maakt van 0 een
    // gegevensmelding. Deze module mag daar géén bedrag verzinnen.
    const geenDoel = resolveFireDoelWeergave({ homeExcludedFromProgress: false })
    expect(geenDoel.bedrag).toBe(0)
    expect(geenDoel.status).toBe('onbekend')
    expect(geenDoel.inclHuis).toBeNull()
    expect(geenDoel.exclHuis).toBeNull()
  })

  it('levert het PAAR mee, zodat de dubbele weergave niet van vorm hoeft te verspringen', () => {
    // De dual-tegel (downsize/opeethypotheek/uitsluiten) toont beide doelen naast
    // elkaar. Kreeg hij die pas ná de worker-run, dan sprong de tegel behalve van
    // getal ook van VORM — één bedrag, dan twee.
    const eerstePaint = resolveFireDoelWeergave({
      homeExcludedFromProgress: false,
      serverRequiredNetWorthInclHome: 620_050,
      serverRequiredPortfolioExclHome: 54_429,
    })
    expect(eerstePaint.inclHuis).toBe(620_050)
    expect(eerstePaint.exclHuis).toBe(54_429)
  })

  it('de client-kernelrun wint altijd van de server-run', () => {
    const beide = resolveFireDoelWeergave({
      homeExcludedFromProgress: false,
      kernelRequiredNetWorthInclHome: 700_000,
      kernelRequiredPortfolioExclHome: 60_000,
      serverRequiredNetWorthInclHome: 620_050,
      serverRequiredPortfolioExclHome: 54_429,
    })
    expect(beide.bedrag).toBe(700_000)
    expect(beide.inclHuis).toBe(700_000)
    expect(beide.exclHuis).toBe(60_000)
    expect(beide.bron).toBe('kernel')
    expect(beide.status).toBe('definitief')
  })
})
