import { describe, expect, it } from 'vitest'
import {
  buildFreedomCardCopy,
  buildFreedomShareText,
  formatShareFreedomLabel,
  selectShareFreedom,
  type ShareFreedom,
} from '../share-freedom'
import { buildReport } from '../build-report'
import type { CheckIntake, CheckReportData } from '../types'
import { SAMPLE_REPORT } from '@/components/check/rapport/sample-report'
import { drawFreedomCard, type FreedomCardStyle } from '@/components/check/rapport/freedom-card-canvas'

/**
 * ADR 0067 — de gedeelde uitkomst bevat UITSLUITEND vrijheidstijd.
 *
 * Deze suite is de bijtende afdekking van die grens: hij voert het VOLLEDIGE
 * rapport in en eist dat er in de complete deel-payload (tekst, klembord-tekst,
 * link én elke string die op de deelbare afbeelding wordt getekend) geen `€`,
 * geen `%` en geen ander cijfer voorkomt dan de gedeelde jaren en maanden zelf.
 *
 * Zodra iemand een bedrag, percentage of ingevoerd gegeven het deelpad in trekt,
 * wordt deze suite rood — ook als de wijziging er onschuldig uitziet.
 */

const NOW = new Date('2026-06-17T12:00:00.000Z')

/** Realistische intake met grote, herkenbare bedragen (spiegel van build-report.test.ts). */
function sanne(): CheckIntake {
  return {
    firstName: 'Sanne',
    dateOfBirth: '1992-03-10',
    household: 'alleen',
    monthlyIncomeNet: 3250,
    yearlyIncomeGross: 52000,
    expenses: { wonen: 1180, vasteLasten: 1290, vrijBesteedbaar: 0, totaalMaand: 2470 },
    emergencyFund: 16640,
    assets: [
      { assetType: 'investment', name: 'ETF-portefeuille', value: 31600 },
      { assetType: 'retirement', name: 'Pensioenpot', value: 22000 },
      { assetType: 'cash', name: 'Spaarrekening', value: 16640 },
      { assetType: 'eigen_huis', name: 'Appartement', value: 320000 },
    ],
    debts: [
      { debtType: 'mortgage', name: 'Hypotheek', balance: 280000, interestRatePct: 3.5, monthlyPayment: 1180 },
      { debtType: 'credit_card', name: 'Creditcard', balance: 2000, interestRatePct: 14, monthlyPayment: 100 },
    ],
    pension: { aowExpectedMonthly: null, expectedReturnPct: 7, riskProfile: 'neutraal' },
    goal: { label: 'Eerder stoppen met werken' },
  }
}

// ── Canvas-stub: vangt élke string die de kaart-render tekent ────────────────

const STUB_STYLE: FreedomCardStyle = {
  paper: '#faf6ee',
  ink: '#1d1b16',
  inkSoft: '#4a4840',
  gold: '#b08432',
  rule: '#e3dac8',
  display: 'serif',
  serif: 'serif',
  mono: 'monospace',
}

function recordDrawnText(copy: Parameters<typeof drawFreedomCard>[1]): string[] {
  const drawn: string[] = []
  const ctx = {
    canvas: null,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    letterSpacing: '0px',
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    // Breed genoeg dat `fitFontSize` na één stap stopt, smal genoeg dat de
    // krimplus daadwerkelijk wordt doorlopen.
    measureText: (t: string) => ({ width: t.length * 20 }),
    fillText: (t: string) => {
      drawn.push(t)
    },
  } as unknown as CanvasRenderingContext2D

  drawFreedomCard(ctx, copy, STUB_STYLE)
  return drawn
}

/** Alle cijferreeksen in een tekst, bv. "€ 87.400" → ['87', '400']. */
function digitRuns(text: string): string[] {
  return text.match(/\d+/g) ?? []
}

/**
 * De kern-assertie: in de gedeelde strings mag geen `€` en geen `%` staan, en
 * elke cijferreeks moet exact de gedeelde jaren óf maanden zijn.
 */
function expectOnlyFreedomTime(strings: string[], freedom: ShareFreedom): void {
  const allowed = new Set([String(freedom.years), String(freedom.months)])
  for (const s of strings) {
    expect(s, `bevat een euroteken: ${s}`).not.toMatch(/[€]/)
    expect(s, `bevat een procentteken: ${s}`).not.toMatch(/%/)
    for (const run of digitRuns(s)) {
      expect(
        allowed.has(run),
        `cijferreeks "${run}" in "${s}" is geen gedeelde vrijheidstijd (${freedom.years}/${freedom.months})`,
      ).toBe(true)
    }
  }
}

/** De volledige deel-payload: tekst, klembord, link én alles op de afbeelding. */
function fullSharePayload(freedom: ShareFreedom): string[] {
  // Host/origin bewust cijferloos: de poort van een dev-server (`localhost:3000`)
  // is een adres, geen uitkomst, en zou de cijfer-assertie zinloos vertroebelen.
  const text = buildFreedomShareText(freedom, 'https://trifinity.nl')
  const copy = buildFreedomCardCopy(freedom, 'trifinity.nl')
  return [text.title, text.text, text.url, text.clipboard, ...recordDrawnText(copy)]
}

// ── De grens ────────────────────────────────────────────────────────────────

describe('selectShareFreedom — de privacy-naad (ADR 0067)', () => {
  it('reduceert het volledige rapport tot precies twee gehele getallen', () => {
    const freedom = selectShareFreedom(SAMPLE_REPORT)
    expect(freedom).not.toBeNull()
    // Élk extra veld hier is een nieuw lek-oppervlak richting de deel-payload.
    expect(Object.keys(freedom!).sort()).toEqual(['months', 'years'])
    expect(Number.isInteger(freedom!.years)).toBe(true)
    expect(Number.isInteger(freedom!.months)).toBe(true)
  })

  it('geeft null bij een tekort — "0 jaar vrijheid" is geen deelbare uitkomst', () => {
    const deficit: CheckReportData = {
      ...SAMPLE_REPORT,
      snapshot: {
        ...SAMPLE_REPORT.snapshot,
        netWorthFreedom: { years: 0, months: 0, totalDays: 0, isDeficit: true },
      },
    }
    expect(selectShareFreedom(deficit)).toBeNull()
  })

  it('geeft null bij oneindig (geen uitgaven bekend) en bij afgerond nul', () => {
    const infinite: CheckReportData = {
      ...SAMPLE_REPORT,
      snapshot: {
        ...SAMPLE_REPORT.snapshot,
        netWorthFreedom: { years: 0, months: 0, totalDays: 0, isInfinite: true },
      },
    }
    const zero: CheckReportData = {
      ...SAMPLE_REPORT,
      snapshot: {
        ...SAMPLE_REPORT.snapshot,
        netWorthFreedom: { years: 0, months: 0, totalDays: 4 },
      },
    }
    expect(selectShareFreedom(infinite)).toBeNull()
    expect(selectShareFreedom(zero)).toBeNull()
  })

  it('kapt onzin-invoer af op gehele, niet-negatieve waarden', () => {
    const messy: CheckReportData = {
      ...SAMPLE_REPORT,
      snapshot: {
        ...SAMPLE_REPORT.snapshot,
        netWorthFreedom: { years: 12.9, months: -3, totalDays: 0 },
      },
    }
    expect(selectShareFreedom(messy)).toEqual({ years: 12, months: 0 })
  })
})

describe('de gedeelde payload bevat uitsluitend vrijheidstijd', () => {
  it('sample-rapport: geen bedrag, geen percentage, geen ander cijfer', () => {
    const freedom = selectShareFreedom(SAMPLE_REPORT)!
    expectOnlyFreedomTime(fullSharePayload(freedom), freedom)
  })

  it('echt doorgerekend rapport (buildReport): idem', () => {
    const report = buildReport(sanne(), NOW)
    const freedom = selectShareFreedom(report)
    expect(freedom).not.toBeNull()
    expectOnlyFreedomTime(fullSharePayload(freedom!), freedom!)
  })

  it('de gedeelde link is parameterloos — geen querystring, geen token', () => {
    const { url } = buildFreedomShareText({ years: 3, months: 1 }, 'https://trifinity.nl')
    expect(url).toBe('https://trifinity.nl/check')
    expect(url).not.toContain('?')
    expect(url).not.toContain('#')
  })

  it('wekt geen opvolgverwachting (ADR 0068)', () => {
    const { clipboard } = buildFreedomShareText({ years: 3, months: 1 }, 'https://trifinity.nl')
    expect(clipboard.toLowerCase()).not.toMatch(/contact|bellen|nemen wij|adviseur/)
  })

  it('gebruikt de canonieke vrijheidstijd-formatter, niet een eigen som', () => {
    expect(formatShareFreedomLabel({ years: 3, months: 1 })).toBe('3 jaar en 1 maand')
    expect(formatShareFreedomLabel({ years: 12, months: 4 })).toBe('12 jaar en 4 maanden')
    expect(formatShareFreedomLabel({ years: 0, months: 7 })).toBe('7 maanden')
    expect(formatShareFreedomLabel({ years: 9, months: 0 })).toBe('9 jaar')
  })
})

describe('de deelbare afbeelding', () => {
  it('tekent alleen regels uit de kaart-copy — niets uit het rapport', () => {
    const freedom = selectShareFreedom(SAMPLE_REPORT)!
    const copy = buildFreedomCardCopy(freedom, 'trifinity.nl')
    const drawn = recordDrawnText(copy)

    const allowed = new Set(Object.values(copy).map((v) => v.toUpperCase()))
    for (const text of drawn) {
      expect(allowed.has(text.toUpperCase()), `onbekende regel op de kaart: "${text}"`).toBe(true)
    }
    // De uitkomst zelf staat er wél op — anders valt er niets te delen.
    expect(drawn).toContain(copy.headline)
  })
})
