import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  parseLocalWhatifSuggestions,
  resolveLocalWhatifSuggestion,
  resolveLocalWhatifSuggestions,
} from './parse-whatif-suggestions'
import type { EventPrefillContext } from '@/lib/horizon/event-prefill'
import type { FinancialInput } from '@/lib/horizon-data'

const input = (over: Partial<FinancialInput> = {}): FinancialInput =>
  ({
    totalAssets: 100000,
    totalDebts: 0,
    monthlyIncome: 4000,
    monthlyExpenses: 3000,
    monthlyContributions: 0,
    yearlyMustExpenses: 24000,
    dateOfBirth: '1985-01-01',
    ...over,
  }) as FinancialInput

const ctx = (over: Partial<EventPrefillContext> = {}): EventPrefillContext => ({
  userAowAge: { years: 67, months: 0, fractional: 67, isDefinitive: true },
  currentAge: 40,
  effectiveInput: input(),
  isHouseholdView: false,
  effectiveNetWorth: 100000,
  debts: [],
  ...over,
})

afterEach(() => vi.restoreAllMocks())

describe('parseLocalWhatifSuggestions', () => {
  it('parseert een schone JSON-array', () => {
    const raw = '[{"event_type":"sabbatical","name":"Half jaar pauze","explanation":"Minder werken past hierbij."}]'
    const res = parseLocalWhatifSuggestions(raw)
    expect(res.items).toHaveLength(1)
    expect(res.items[0].event_type).toBe('sabbatical')
  })

  it('overleeft fences en een <think>-preamble', () => {
    const raw = '<think>hmm</think>\n```json\n[{"event_type":"world_trip","name":"Wereldreis","explanation":"Je hebt tijd."}]\n```'
    expect(parseLocalWhatifSuggestions(raw).items[0].event_type).toBe('world_trip')
  })

  it('bergt complete objecten uit een AFGEKAPTE array (liever 1 dan 0)', () => {
    const raw = '[{"event_type":"study","name":"Master","explanation":"Investeren in jezelf."},{"event_type":"child'
    const res = parseLocalWhatifSuggestions(raw)
    expect(res.items).toHaveLength(1)
    expect(res.items[0].event_type).toBe('study')
    expect(res.truncated).toBe(true)
  })

  it('filtert soorten buiten de gesloten lijst weg', () => {
    const raw =
      '[{"event_type":"lottery_win","name":"Loterij","explanation":"x"},{"event_type":"renovation","name":"Keuken","explanation":"y"}]'
    const res = parseLocalWhatifSuggestions(raw)
    expect(res.items.map((i) => i.event_type)).toEqual(['renovation'])
  })

  it('filtert "custom" weg (geen catalogus-bedragen → kaart zonder effect)', () => {
    const raw = '[{"event_type":"custom","name":"Iets anders","explanation":"x"}]'
    expect(parseLocalWhatifSuggestions(raw).items).toHaveLength(0)
  })

  it('geeft een lege lijst bij onparsebare uitvoer', () => {
    expect(parseLocalWhatifSuggestions('Sorry, ik weet het niet.').items).toEqual([])
  })
})

describe('resolveLocalWhatifSuggestion — catalogus-resolutie', () => {
  it('haalt de bedragen uit de catalogus, niet uit het model', () => {
    const res = resolveLocalWhatifSuggestion(
      { event_type: 'renovation', name: 'Keuken vernieuwen', explanation: 'Past bij je plannen.' },
      ctx(),
    )
    expect(res).not.toBeNull()
    // Keuken-preset (VERBOUWING_TYPE_KOSTEN) als eenmalige uitgave.
    expect(res!.one_time_cost).toBeGreaterThan(0)
    expect(res!.monthly_cost_change).toBe(0)
    expect(res!.name).toBe('Keuken vernieuwen')
  })

  it('sabbatical is een inkomensVERLIES, geen extra inkomen', () => {
    const res = resolveLocalWhatifSuggestion(
      { event_type: 'sabbatical', name: 'Sabbatical', explanation: 'Even eruit.' },
      ctx(),
    )
    expect(res!.monthly_income_change).toBe(-4000) // profielinkomen, 0% doorbetaling
    expect(res!.duration_months).toBeGreaterThan(0)
  })

  it('part_time levert het inkomensverlies uit de uren-verhouding', () => {
    const res = resolveLocalWhatifSuggestion(
      { event_type: 'part_time', name: 'Vier dagen werken', explanation: 'Meer lucht.' },
      ctx(),
    )
    // 40 → 32 uur bij €4.000 netto = −€800/mnd
    expect(res!.monthly_income_change).toBe(-800)
  })

  it('GEEN catalogus-match → GEEN kaart', () => {
    expect(
      resolveLocalWhatifSuggestion(
        { event_type: '__bestaat_niet__', name: 'Iets', explanation: 'x' },
        ctx(),
      ),
    ).toBeNull()
  })

  it('geen enkel bedrag uit de catalogus → GEEN kaart', () => {
    expect(
      resolveLocalWhatifSuggestion({ event_type: 'custom', name: 'Anders', explanation: 'x' }, ctx()),
    ).toBeNull()
  })

  it('VERWERPT een suggestie die zelf een bedrag noemt dat niet klopt', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = resolveLocalWhatifSuggestion(
      { event_type: 'renovation', name: 'Keuken', explanation: 'Kost ongeveer €95.000.' },
      ctx(),
    )
    expect(res).toBeNull()
  })

  it('valt terug op catalogus-label/omschrijving bij lege modeltekst', () => {
    const res = resolveLocalWhatifSuggestion(
      { event_type: 'renovation', name: '', explanation: '' },
      ctx(),
    )
    expect(res!.name).toBe('Verbouwing')
    expect(res!.explanation.length).toBeGreaterThan(0)
  })
})

describe('resolveLocalWhatifSuggestions', () => {
  it('dedupliceert op soort, slaat actieve soorten over en kapt af op max', () => {
    const raws = [
      { event_type: 'renovation', name: 'Keuken', explanation: 'a' },
      { event_type: 'renovation', name: 'Badkamer', explanation: 'b' },
      { event_type: 'world_trip', name: 'Wereldreis', explanation: 'c' },
      { event_type: 'study', name: 'Master', explanation: 'd' },
    ]
    const out = resolveLocalWhatifSuggestions(raws, ctx(), {
      excludeTypes: ['world_trip'],
      max: 2,
    })
    expect(out.map((s) => s.event_type)).toEqual(['renovation', 'study'])
  })

  it('levert een lege lijst wanneer niets oplost (eerlijke lege staat)', () => {
    expect(resolveLocalWhatifSuggestions([{ event_type: 'custom', name: 'x', explanation: 'y' }], ctx())).toEqual([])
  })
})
