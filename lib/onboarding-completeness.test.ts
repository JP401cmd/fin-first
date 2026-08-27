import { describe, it, expect } from 'vitest'
import {
  computeOnboardingCompleteness,
  formatOpenOnderdelen,
  ONBOARDING_ONDERDELEN,
  ONBOARDING_TOTAAL_ONDERDELEN,
  type OnboardingCompletenessInput,
} from './onboarding-completeness'

/**
 * Regressie-vangrail bij bevinding M11: het eindscherm toonde een
 * hardgecodeerde "100%" naast lege kernvelden. Deze suite legt de definitie
 * vast die dat vervangt — één test per Given/When/Then uit de module-docs.
 */

/** Volledig gevulde invoer; elke test zet precies één onderdeel leeg. */
function volledig(): OnboardingCompletenessInput {
  return {
    fullName: 'Jan Smit',
    dateOfBirth: '1985-04-12',
    netMonthlyIncome: 3200,
    monthlyExpenses: 2100,
    assetCount: 2,
    debtCount: 1,
    pensioenResultaat: { regelingen: [] },
    spaardoel: { label: 'Buffer', amount: 5000 },
    eindstrategieBeantwoord: true,
  }
}

/** Volledige skip-flow: alleen de verplichte naam/geboortedatum + gepasseerde eindstrategie. */
function volledigGeskipt(): OnboardingCompletenessInput {
  return {
    fullName: 'Jan Smit',
    dateOfBirth: '1985-04-12',
    netMonthlyIncome: 0,
    monthlyExpenses: 0,
    assetCount: 0,
    debtCount: 0,
    pensioenResultaat: null,
    spaardoel: null,
    eindstrategieBeantwoord: true,
  }
}

describe('computeOnboardingCompleteness', () => {
  it('telt acht onderdelen — het besluit van de eigenaar (incl. pensioen en eindstrategie)', () => {
    expect(ONBOARDING_TOTAAL_ONDERDELEN).toBe(8)
    expect(ONBOARDING_ONDERDELEN).toContain('pensioen')
    expect(ONBOARDING_ONDERDELEN).toContain('eindstrategie')
    expect(computeOnboardingCompleteness(volledig()).totaal).toBe(8)
  })

  it('geeft 8 van 8 en isCompleet bij een volledig ingevulde onboarding', () => {
    const result = computeOnboardingCompleteness(volledig())
    expect(result.gevuld).toBe(8)
    expect(result.open).toEqual([])
    expect(result.isCompleet).toBe(true)
  })

  it('toont NOOIT compleet bij de volledige skip-flow — de kern van bevinding M11', () => {
    const result = computeOnboardingCompleteness(volledigGeskipt())
    expect(result.isCompleet).toBe(false)
    // naam + eindstrategie zijn de enige twee die de skip-flow overleeft.
    expect(result.gevuld).toBe(2)
    expect(result.open).toEqual([
      'inkomen',
      'uitgaven',
      'bezittingen',
      'schulden',
      'pensioen',
      'spaardoel',
    ])
  })

  it('naam: leeg zonder naam of zonder geboortedatum, ook bij witruimte', () => {
    expect(
      computeOnboardingCompleteness({ ...volledig(), fullName: '   ' }).perOnderdeel.naam,
    ).toBe(false)
    expect(
      computeOnboardingCompleteness({ ...volledig(), dateOfBirth: '' }).perOnderdeel.naam,
    ).toBe(false)
  })

  it('inkomen/uitgaven: 0 telt als niet ingevuld, een positief bedrag wel', () => {
    const zonderInkomen = computeOnboardingCompleteness({ ...volledig(), netMonthlyIncome: 0 })
    expect(zonderInkomen.perOnderdeel.inkomen).toBe(false)
    expect(zonderInkomen.gevuld).toBe(7)

    const zonderUitgaven = computeOnboardingCompleteness({ ...volledig(), monthlyExpenses: 0 })
    expect(zonderUitgaven.perOnderdeel.uitgaven).toBe(false)
    expect(zonderUitgaven.open).toEqual(['uitgaven'])
  })

  it('inkomen: NaN uit een mislukte parse telt als niet ingevuld', () => {
    expect(
      computeOnboardingCompleteness({ ...volledig(), netMonthlyIncome: Number.NaN })
        .perOnderdeel.inkomen,
    ).toBe(false)
  })

  it('bezittingen/schulden: tellen op datapresentie, niet op "stap gezien"', () => {
    const geenPosten = computeOnboardingCompleteness({
      ...volledig(),
      assetCount: 0,
      debtCount: 0,
    })
    expect(geenPosten.perOnderdeel.bezittingen).toBe(false)
    expect(geenPosten.perOnderdeel.schulden).toBe(false)
    expect(geenPosten.gevuld).toBe(6)
  })

  it('pensioen: null (overgeslagen) telt niet, een parse-resultaat wel', () => {
    expect(
      computeOnboardingCompleteness({ ...volledig(), pensioenResultaat: null })
        .perOnderdeel.pensioen,
    ).toBe(false)
  })

  it('spaardoel: null (geskipt of onvolledig) telt niet', () => {
    expect(
      computeOnboardingCompleteness({ ...volledig(), spaardoel: null }).perOnderdeel.spaardoel,
    ).toBe(false)
  })

  it('eindstrategie: volgt de doorgegeven "gepasseerd"-vlag, niet de waarde met default', () => {
    expect(
      computeOnboardingCompleteness({ ...volledig(), eindstrategieBeantwoord: false })
        .perOnderdeel.eindstrategie,
    ).toBe(false)
    expect(
      computeOnboardingCompleteness({ ...volledigGeskipt(), eindstrategieBeantwoord: false })
        .gevuld,
    ).toBe(1)
  })

  it('open is altijd in flow-volgorde', () => {
    const result = computeOnboardingCompleteness({
      ...volledig(),
      spaardoel: null,
      netMonthlyIncome: 0,
      debtCount: 0,
    })
    expect(result.open).toEqual(['inkomen', 'schulden', 'spaardoel'])
  })
})

describe('formatOpenOnderdelen', () => {
  it('geeft een lege string als er niets open staat', () => {
    expect(formatOpenOnderdelen([])).toBe('')
  })

  it('noemt één onderdeel zonder voegwoord', () => {
    expect(formatOpenOnderdelen(['uitgaven'])).toBe('je uitgaven')
  })

  it('verbindt twee en drie onderdelen met "en"', () => {
    expect(formatOpenOnderdelen(['inkomen', 'uitgaven'])).toBe('je inkomen en je uitgaven')
    expect(formatOpenOnderdelen(['inkomen', 'uitgaven', 'pensioen'])).toBe(
      'je inkomen, je uitgaven en je pensioen',
    )
  })

  it('kapt af na drie zodat de zin geen waslijst wordt', () => {
    expect(
      formatOpenOnderdelen(['inkomen', 'uitgaven', 'bezittingen', 'schulden', 'pensioen']),
    ).toBe('je inkomen, je uitgaven, je bezittingen en 2 andere')
  })

  it('gebruikt enkelvoud bij precies één afgekapt onderdeel', () => {
    expect(formatOpenOnderdelen(['inkomen', 'uitgaven', 'bezittingen', 'schulden'])).toBe(
      'je inkomen, je uitgaven, je bezittingen en 1 ander onderdeel',
    )
  })
})
