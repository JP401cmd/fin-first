import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recurringPerMonth } from '@/lib/cashflow-forecast-math'

/**
 * GET /api/cashflow-forecast — één eigenaar van de frequentie→maand-omrekening.
 *
 * ## Wat hier bewaakt wordt, en waarom in twee soorten
 *
 * De route herimplementeerde de frequentie→maand-switch lokaal, terwijl
 * `recurringPerMonth` (lib/cashflow-forecast-math.ts) diezelfde formule al
 * bezit en al gebruikt wordt door `buildForecast` → de forecast-tabel en de
 * cashflow-landingskaarten. De twee kopieën waren tekenmatig identiek —
 * weekly `× 52/12`, quarterly `÷ 3`, yearly `÷ 12`, onbekende frequentie `0`,
 * geen afronding aan beide kanten.
 *
 * Dat "identiek" is precies waarom een puur GEDRAGS-test hier niet kan bijten:
 * twee identieke formules geven identieke getallen, dus geen enkele assertie op
 * de uitkomst wordt rood van het enkele feit dat de kopie bestaat. Het defect is
 * structureel — twee onafhankelijke eigenaren van één formule — en daar hoort
 * een structurele assertie bij. Vandaar de tweedeling:
 *
 *  1. **Broncontrole** (bijt): de route IMPORTEERT de gedeelde helper en draagt
 *     geen eigen `switch (r.frequency)` meer. Deze test is rood op de code van
 *     vóór de fix.
 *  2. **Gedrag** (pin): de route rekent voor elke frequentie exact hetzelfde uit
 *     als `recurringPerMonth`. Groen vóór én ná de fix — dat is het bewijs dat
 *     de samenvoeging gedragsbehoudend was, én de vangnet-assertie die alsnog
 *     rood wordt zodra iemand een AFWIJKENDE formule terugzet.
 *
 * De teken-splitsing (positief = inkomen, negatief = uitgave) blijft van de
 * route: `recurringPerMonth` levert signed, de route heeft beide kanten los
 * nodig voor de 70/30-menging met de gerealiseerde maandpatronen.
 */

const { mockCreateClient, mockGetAuthClaims } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetAuthClaims: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: mockGetAuthClaims,
}))

import { GET } from './route'

type Recurring = { amount: number; frequency: string; is_active: boolean }

/**
 * Minimale chainbare Supabase-stub. Alleen `recurring_transactions` levert
 * rijen; de andere drie tabellen blijven leeg, zodat de route het tak
 * "alleen recurrings" neemt (`estimatedMonthlyIncome = recurringMonthlyIncome`)
 * en de omrekening onvermengd in het antwoord terechtkomt.
 */
function buildClient(recurrings: Recurring[]) {
  function chain(table: string): Record<string, unknown> {
    const target: Record<string, unknown> = {
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: table === 'recurring_transactions' ? recurrings : [], error: null })),
    }
    return new Proxy(target, {
      get(t, prop: string) {
        if (prop in t) return (t as Record<string, unknown>)[prop]
        return () => chain(table)
      },
    })
  }
  return { from: (table: string) => chain(table) }
}

async function forecastFor(recurrings: Recurring[]) {
  mockCreateClient.mockResolvedValue(buildClient(recurrings))
  mockGetAuthClaims.mockResolvedValue({ sub: 'user-1' })
  const res = await GET()
  return (await res.json()) as {
    estimatedMonthlyIncome: number
    estimatedMonthlyExpenses: number
    hasData: boolean
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/cashflow-forecast — broncontrole: consumeert de gedeelde helper', () => {
  const src = readFileSync(path.resolve(__dirname, 'route.ts'), 'utf-8')

  it('importeert recurringPerMonth uit lib/cashflow-forecast-math', () => {
    expect(src).toMatch(/import\s*\{\s*recurringPerMonth\s*\}\s*from\s*'@\/lib\/cashflow-forecast-math'/)
  })

  it('draagt geen eigen frequentie-switch meer', () => {
    // De lokale kopie was een `switch (r.frequency)` met de vier cases. Elke
    // terugkeer daarvan — in welke vorm dan ook — is de drift die deze fix
    // wegnam.
    expect(src).not.toMatch(/switch\s*\(\s*\w+\.frequency\s*\)/)
    expect(src).not.toContain('52 / 12')
  })
})

describe('GET /api/cashflow-forecast — gedragspin op de frequentie-omrekening', () => {
  // Bedragen zo gekozen dat elke frequentie een ander maandequivalent geeft.
  const cases: Array<{ frequency: string; amount: number }> = [
    { frequency: 'weekly', amount: 100 },
    { frequency: 'monthly', amount: 250 },
    { frequency: 'quarterly', amount: 900 },
    { frequency: 'yearly', amount: 1200 },
  ]

  for (const { frequency, amount } of cases) {
    it(`rekent ${frequency} inkomen om zoals recurringPerMonth`, async () => {
      const data = await forecastFor([{ amount, frequency, is_active: true }])
      const expected = recurringPerMonth({ amount, frequency })
      expect(data.hasData).toBe(true)
      expect(data.estimatedMonthlyIncome).toBeCloseTo(Math.round(expected * 100) / 100, 2)
      expect(data.estimatedMonthlyExpenses).toBe(0)
    })

    it(`rekent ${frequency} uitgave om zoals recurringPerMonth`, async () => {
      const data = await forecastFor([{ amount: -amount, frequency, is_active: true }])
      const expected = Math.abs(recurringPerMonth({ amount: -amount, frequency }))
      expect(data.estimatedMonthlyExpenses).toBeCloseTo(Math.round(expected * 100) / 100, 2)
      expect(data.estimatedMonthlyIncome).toBe(0)
    })
  }

  it('behandelt een onbekende frequentie als 0 — niet als maandelijks', async () => {
    // Het randgeval waarop de twee kopieën hadden kunnen uiteenlopen: de lokale
    // switch liet `monthlyAmount` op zijn initiële 0 staan, `recurringPerMonth`
    // heeft een expliciete `default: return 0`. Beide dus 0 — maar de drie
    // `toMonthly`-varianten elders in de app (subscriptions/detect-ai,
    // subscriptions/analyse-ai, ai/context/recommendation-context) vallen juist
    // terug op "behandel als maandelijks". Die divergentie is bewust en hoort
    // hier NIET binnen te sluipen.
    expect(recurringPerMonth({ amount: 500, frequency: 'biweekly' })).toBe(0)
    const data = await forecastFor([{ amount: 500, frequency: 'biweekly', is_active: true }])
    expect(data.estimatedMonthlyIncome).toBe(0)
    expect(data.estimatedMonthlyExpenses).toBe(0)
  })

  it('telt inkomen en uitgaven van gemengde frequenties bij elkaar op', async () => {
    const rows: Recurring[] = [
      { amount: 3000, frequency: 'monthly', is_active: true },
      { amount: -1200, frequency: 'yearly', is_active: true },
      { amount: -70, frequency: 'weekly', is_active: true },
    ]
    const data = await forecastFor(rows)
    const income = rows
      .map((r) => recurringPerMonth(r))
      .filter((m) => m > 0)
      .reduce((s, m) => s + m, 0)
    const expenses = rows
      .map((r) => recurringPerMonth(r))
      .filter((m) => m <= 0)
      .reduce((s, m) => s + Math.abs(m), 0)
    expect(data.estimatedMonthlyIncome).toBeCloseTo(Math.round(income * 100) / 100, 2)
    expect(data.estimatedMonthlyExpenses).toBeCloseTo(Math.round(expenses * 100) / 100, 2)
  })
})
