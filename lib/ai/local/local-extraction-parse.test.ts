// ── Parser van de lokale vrije-tekst-extractie ───────────────────────────────
//
// Toetst de taak-specifieke helft: normalisatie van wat een klein model er
// werkelijk van maakt, enum-hardening, en het DROPPEN van onbruikbare items
// zonder de rest van de oogst te verliezen.

import { describe, it, expect } from 'vitest'
import {
  parseLocalAmount,
  parseLocalAssetsDebts,
  parseLocalIncomeExpenses,
  parseLocalLifeEvents,
  tidyLocalText,
} from './local-extraction-parse'

describe('parseLocalAmount', () => {
  it('leest de vormen die een klein model teruggeeft', () => {
    expect(parseLocalAmount(15000)).toBe(15000)
    expect(parseLocalAmount('15000')).toBe(15000)
    expect(parseLocalAmount('15.000')).toBe(15000)
    expect(parseLocalAmount('€ 12.345,67')).toBe(12345.67)
    expect(parseLocalAmount('280k')).toBe(280000)
  })

  it('weigert onzin en negatieve bedragen', () => {
    expect(parseLocalAmount('onbekend')).toBeNull()
    expect(parseLocalAmount(-100)).toBeNull()
    expect(parseLocalAmount(null)).toBeNull()
  })

  it('weigert een absurd bedrag (parse-artefact)', () => {
    expect(parseLocalAmount('999999999999')).toBeNull()
  })
})

describe('tidyLocalText', () => {
  it('trimt, ontdubbelt spaties en haalt omsluitende quotes weg', () => {
    expect(tidyLocalText('  "Eigen  woning" ', 60)).toBe('Eigen woning')
  })

  it('kapt af op een woordgrens', () => {
    expect(tidyLocalText('een tamelijk lange beschrijving van iets', 20).length).toBeLessThanOrEqual(20)
  })
})

describe('parseLocalAssetsDebts', () => {
  it('splitst bezittingen en schulden en vult de afgeleide velden deterministisch', () => {
    const out = parseLocalAssetsDebts(
      '[{"soort":"bezit","naam":"Spaarrekening","type":"savings","bedrag":15000},' +
        '{"soort":"schuld","naam":"Hypotheek","type":"mortgage","bedrag":280000}]',
    )
    expect(out.assets).toHaveLength(1)
    expect(out.assets[0]).toMatchObject({ expected_return: 2.5, is_liquid: true, subtype: 'savings_account' })
    expect(out.debts).toHaveLength(1)
    expect(out.debts[0]).toMatchObject({ interest_rate: 4.0, is_tax_deductible: true, monthly_payment: 1337 })
  })

  it('hardt een onbekend type naar "other" in plaats van de rij te droppen', () => {
    const out = parseLocalAssetsDebts('[{"soort":"bezit","naam":"Kunstcollectie","type":"schilderij","bedrag":8000}]')
    expect(out.assets[0]!.asset_type).toBe('other')
    expect(out.assets[0]!.is_liquid).toBe(false)
  })

  it('behandelt een ontbrekende "soort" als bezit', () => {
    const out = parseLocalAssetsDebts('[{"naam":"ETF-portefeuille","type":"investment","bedrag":8000}]')
    expect(out.assets).toHaveLength(1)
    expect(out.debts).toHaveLength(0)
  })

  it('DROPT één onbruikbaar object en behoudt de rest', () => {
    const out = parseLocalAssetsDebts(
      '[{"soort":"bezit","naam":"","type":"savings","bedrag":15000},' +
        '{"soort":"bezit","naam":"ETF","type":"investment","bedrag":8000}]',
    )
    expect(out.assets).toHaveLength(1)
    expect(out.dropped).toBe(1)
  })

  it('overleeft markdown-fences en een <think>-preamble', () => {
    const out = parseLocalAssetsDebts(
      '<think>hmm</think>\n```json\n[{"soort":"bezit","naam":"Spaargeld","type":"savings","bedrag":5000}]\n```',
    )
    expect(out.assets).toHaveLength(1)
  })

  it('bergt de complete objecten uit een AFGEKAPTE array', () => {
    const out = parseLocalAssetsDebts(
      '[{"soort":"bezit","naam":"Spaargeld","type":"savings","bedrag":5000},{"soort":"bezit","naam":"ET',
    )
    expect(out.assets).toHaveLength(1)
    expect(out.truncated).toBe(true)
  })

  it('geeft lege lijsten bij onbruikbare uitvoer', () => {
    const out = parseLocalAssetsDebts('Ik kan hier niets uithalen.')
    expect(out.assets).toEqual([])
    expect(out.debts).toEqual([])
  })
})

describe('parseLocalLifeEvents', () => {
  it('vult alle bedragen uit de catalogus en dedupliceert op soort', () => {
    const out = parseLocalLifeEvents('[{"soort":"kind","leeftijd":35},{"soort":"children","leeftijd":38}]')
    expect(out.life_events).toHaveLength(1)
    expect(out.life_events[0]).toMatchObject({ event_type: 'children', target_age: 35, icon: 'Baby' })
    expect(out.life_events[0]!.one_time_cost).toBeGreaterThan(0)
  })

  it('dropt een soort die niet in de catalogus staat', () => {
    const out = parseLocalLifeEvents('[{"soort":"emigratie","leeftijd":40}]')
    expect(out.life_events).toEqual([])
    expect(out.dropped).toBe(1)
  })

  it('negeert een onmogelijke leeftijd (parse-artefact) en pakt de catalogus-default', () => {
    const out = parseLocalLifeEvents('[{"soort":"aow","leeftijd":2024}]')
    expect(out.life_events[0]!.target_age).toBe(67)
  })
})

describe('parseLocalIncomeExpenses', () => {
  it('leest inkomen, uitgaven en de restcontext', () => {
    const out = parseLocalIncomeExpenses('{"inkomen":4200,"uitgaven":null,"context":"ZZP\'er"}')
    expect(out.monthly_income_estimate).toBe(4200)
    expect(out.monthly_expenses_estimate).toBeNull()
    expect(out.financial_context_remainder).toBe("ZZP'er")
  })

  it('behandelt 0 als "niet ingevuld", niet als inkomen van nul', () => {
    const out = parseLocalIncomeExpenses('{"inkomen":0,"uitgaven":2200,"context":""}')
    expect(out.monthly_income_estimate).toBeNull()
    expect(out.monthly_expenses_estimate).toBe(2200)
  })

  it('geeft een lege uitkomst bij onleesbare uitvoer — schat nooit iets', () => {
    expect(parseLocalIncomeExpenses('geen idee')).toEqual({
      monthly_income_estimate: null,
      monthly_expenses_estimate: null,
      financial_context_remainder: '',
    })
  })
})
