import { describe, it, expect } from 'vitest'
import {
  HOUSING_CHOICE_BASIS_SENTENCE,
  HOUSING_CHOICE_FALLBACK,
  HOUSING_CHOICE_OPTIONS,
  HOUSING_CHOICE_SELL_CONFIG,
  housingChoiceFromConfig,
  housingChoiceToConfig,
  isHousingChoice,
  type HousingChoice,
} from './housing-choice'
import {
  DEFAULT_DOWNSIZE_CONFIG,
  parseHousingStrategy,
  type HousingStrategyConfig,
} from './housing-strategy'

/**
 * De beginnersvraag over de eigen woning (ADR 0133) is een TWEEWEGS-FRONT op
 * het bestaande `profiles.housing_strategy_config`. Deze suite bewaakt precies
 * dat: de mapping heen, de mapping terug, en — het punt waar een front stil
 * kapot gaat — dat de heen-mapping door de DB-leeskant identiek terugkomt.
 *
 * Wat hier NIET in hoort: de rekengevolgen van de vier modi. Die staan in
 * `test/housing-strategy.test.ts` en de kernel-suites; deze module vertaalt
 * alleen een keuze naar een configuratie.
 */

const ALL_MODES: HousingStrategyConfig['mode'][] = [
  'include_full',
  'exclude_from_fire',
  'downsize',
  'reverse_mortgage',
]

describe('housingChoiceToConfig — keuze → configuratie', () => {
  it("'sell' wordt verkopen-wanneer-nodig op marktwaarde", () => {
    const config = housingChoiceToConfig('sell')
    expect(config.mode).toBe('downsize')
    // De drie velden die het gedrag bepalen; de rest zijn de kernel-defaults.
    expect(config).toMatchObject({
      mode: 'downsize',
      trigger: 'on_depletion',
      saleValuationBasis: 'market',
    })
  })

  it("'exclude' wordt exclude_from_fire (en niets anders)", () => {
    expect(housingChoiceToConfig('exclude')).toEqual({ mode: 'exclude_from_fire' })
  })

  it('is totaal: elke keuze levert een configuratie', () => {
    for (const opt of HOUSING_CHOICE_OPTIONS) {
      expect(ALL_MODES).toContain(housingChoiceToConfig(opt.choice).mode)
    }
  })
})

describe('housingChoiceFromConfig — configuratie → keuze', () => {
  it('leest downsize én reverse_mortgage terug als "ja, ik verkoop hem ooit"', () => {
    expect(housingChoiceFromConfig(HOUSING_CHOICE_SELL_CONFIG)).toBe('sell')
    expect(
      housingChoiceFromConfig({
        mode: 'reverse_mortgage',
        trigger: 'fixed_age',
        triggerAge: 67,
        depletionThresholdYears: 0,
        maxLoanPct: 0.5,
        interestRate: 0.05,
        monthlyPayout: null,
      }),
    ).toBe('sell')
  })

  it('leest exclude_from_fire terug als "nee, hij telt niet mee"', () => {
    expect(housingChoiceFromConfig({ mode: 'exclude_from_fire' })).toBe('exclude')
  })

  it('geeft bij include_full bewust `null` — de DB-default is geen antwoord', () => {
    expect(housingChoiceFromConfig({ mode: 'include_full' })).toBeNull()
  })
})

describe('round-trip — de keuze overleeft de configuratie', () => {
  it.each<HousingChoice>(['sell', 'exclude'])('%s → config → %s', (choice) => {
    expect(housingChoiceFromConfig(housingChoiceToConfig(choice))).toBe(choice)
  })

  /**
   * De écht stille breuk: de save-route schrijft de configuratie als JSONB weg
   * en élke lezer haalt 'm door `parseHousingStrategy`. Wijkt die parse ook maar
   * op één veld af van wat we wegschreven, dan draait de gebruiker op een andere
   * woonstrategie dan hij koos — zonder dat iets faalt.
   */
  it.each<HousingChoice>(['sell', 'exclude'])(
    'de weggeschreven configuratie komt bij %s identiek terug uit parseHousingStrategy',
    (choice) => {
      const written = housingChoiceToConfig(choice)
      const readBack = parseHousingStrategy(JSON.parse(JSON.stringify(written)))
      expect(readBack).toEqual(written)
      expect(housingChoiceFromConfig(readBack)).toBe(choice)
    },
  )

  /**
   * Regressie-anker bij ADR 0133: de onboarding-route schreef tot dan een KORTE
   * literal (`{ mode, trigger, saleValuationBasis }`) en liet `parseHousingStrategy`
   * de rest met `DEFAULT_DOWNSIZE_CONFIG` aanvullen. `HOUSING_CHOICE_SELL_CONFIG`
   * zet die velden nu expliciet — dat mag geen enkel getal verschuiven, dus moet
   * de expliciete waarde gelijk zijn aan wat de parse er destijds van maakte.
   */
  it('de expliciete sell-config verschuift geen getal t.o.v. de oude korte literal', () => {
    const oudeKorteLiteral = {
      mode: 'downsize',
      trigger: 'on_depletion',
      saleValuationBasis: 'market',
    }
    expect(parseHousingStrategy(oudeKorteLiteral)).toEqual(HOUSING_CHOICE_SELL_CONFIG)
    // ... en dat is óók precies de kernel-default, op de trigger na.
    expect(HOUSING_CHOICE_SELL_CONFIG).toEqual({
      ...DEFAULT_DOWNSIZE_CONFIG,
      trigger: 'on_depletion',
    })
  })
})

describe('terugval en type-guard', () => {
  /**
   * De terugval is 'sell' en mag dat blijven: dat is het gedrag dat nieuwe
   * gebruikers vóór ADR 0133 stilzwijgend kregen. 'exclude' afleiden uit
   * afwezigheid zou de FIRE-grondslag stil verschuiven (liquide i.p.v. incl.
   * verkoopopbrengst) — precies de drift die deze test moet vangen.
   */
  it("valt terug op 'sell', nooit op 'exclude'", () => {
    expect(HOUSING_CHOICE_FALLBACK).toBe('sell')
    expect(housingChoiceToConfig(HOUSING_CHOICE_FALLBACK).mode).toBe('downsize')
  })

  it('herkent alleen de twee echte keuzes', () => {
    expect(isHousingChoice('sell')).toBe(true)
    expect(isHousingChoice('exclude')).toBe(true)
    for (const bogus of ['downsize', 'exclude_from_fire', '', null, undefined, 0, {}]) {
      expect(isHousingChoice(bogus)).toBe(false)
    }
  })
})

describe('kopij — één bron voor de vraag en de grondslag-zin', () => {
  it('biedt exact de twee keuzes, elk met een eigen grondslag-zin', () => {
    expect(HOUSING_CHOICE_OPTIONS.map((o) => o.choice)).toEqual(['sell', 'exclude'])
    for (const opt of HOUSING_CHOICE_OPTIONS) {
      expect(HOUSING_CHOICE_BASIS_SENTENCE[opt.choice]).toBeTruthy()
      expect(opt.name.length).toBeGreaterThan(0)
      expect(opt.subtitle.length).toBeGreaterThan(0)
    }
    // De twee zinnen zeggen iets anders — anders volgt het eindscherm de keuze
    // niet echt, hoe correct de bedrading ook is.
    expect(HOUSING_CHOICE_BASIS_SENTENCE.sell).not.toBe(HOUSING_CHOICE_BASIS_SENTENCE.exclude)
  })
})
