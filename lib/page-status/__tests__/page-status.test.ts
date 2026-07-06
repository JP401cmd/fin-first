// lib/page-status/__tests__/page-status.test.ts
//
// Unit-tests voor de status-duiding-banner (lib/page-status/).
// Laag: Vitest — puur, geen IO, geen Supabase.

import { describe, it, expect } from 'vitest'
import { fillFigure, PAGE_STATUS_COPY, getRouteCopy, getStatusCopy } from '../copy'
import { resolvePageStatusMap, leverToLeverageStatus } from '../resolve'
import type { LeverScoresResult } from '@/lib/lever-scores-loader'
import type { LeverScores, LeverEntry } from '@/components/app/shell/lever-scores'
import type { CashflowCard } from '@/lib/cashflow-cards'
import type { LeverStatus } from '@/components/app/shell/lever-scores'
import type { LeverageStatus } from '@/lib/leverage-status'

// ── Helpers voor fake data ────────────────────────────────────────────────────

function makeLeverEntry(status: LeverStatus, detail = ''): LeverEntry {
  return { score: 50, status, detail }
}

/** Bouw een LeverScoresResult met de vier hefbomen op de opgegeven statussen. */
function makeLeverScores(
  assets: LeverStatus = 'green',
  debts: LeverStatus = 'green',
  cashflow: LeverStatus = 'green',
  tax: LeverStatus = 'green',
  assetDetail = '',
  debtDetail = '',
  cashflowDetail = '',
  taxDetail = '',
): LeverScoresResult {
  const scores: LeverScores = {
    assets: makeLeverEntry(assets, assetDetail),
    debts: makeLeverEntry(debts, debtDetail),
    cashflow: makeLeverEntry(cashflow, cashflowDetail),
    tax: makeLeverEntry(tax, taxDetail),
  }
  return {
    scores,
    taxInput: { box3TaxableAboveThreshold: 0, hasBox3Assets: false },
    box3Status: 'neutral' as LeverageStatus,
    box1Status: 'neutral' as LeverageStatus,
    netWorth: 0,
    budgetsOver: 0,
  }
}

/** Bouw een LeverScoresResult met specifieke box1Status/box3Status. */
function makeLeverScoresWithBox(
  box1Status: LeverageStatus,
  box3Status: LeverageStatus,
): LeverScoresResult {
  return {
    ...makeLeverScores(),
    box1Status,
    box3Status,
  }
}

function makeCashflowCard(
  key: CashflowCard['key'],
  status: LeverageStatus,
  subText: string | null = null,
): CashflowCard {
  return {
    key,
    label: key,
    href: `/overzicht/cashflow/${key}`,
    tooltip: '',
    kpi: null,
    status,
    subText,
    detail: { label: '', value: '', tip: '', actionLabel: '' },
  }
}

// ── fillFigure ────────────────────────────────────────────────────────────────

describe('fillFigure', () => {
  it('replaces {figure} with the live value', () => {
    expect(fillFigure('Je ratio is {figure}.', '82%')).toBe('Je ratio is 82%.')
  })

  it('replaces multiple {figure} occurrences', () => {
    expect(fillFigure('{figure} en nog eens {figure}', '3x')).toBe('3x en nog eens 3x')
  })

  it('trims whitespace around the figure value', () => {
    expect(fillFigure('Waarde: {figure}.', '  €42k  ')).toBe('Waarde: €42k.')
  })

  it('removes " {figure}" cleanly when figure is null', () => {
    const result = fillFigure('Je ratio is hoog ({figure}).', null)
    // Should NOT leave "()" or trailing punctuation artefacts
    expect(result).not.toContain('{figure}')
    expect(result).not.toContain('()')
    // Should be clean Dutch sentence
    expect(result).toBe('Je ratio is hoog.')
  })

  it('removes " {figure}" cleanly when figure is empty string', () => {
    const result = fillFigure('Je ratio is hoog ({figure}).', '')
    expect(result).not.toContain('{figure}')
    expect(result).not.toContain('()')
    expect(result).toBe('Je ratio is hoog.')
  })

  it('removes " {figure}" cleanly when figure is whitespace only', () => {
    const result = fillFigure('Je ratio is hoog ({figure}).', '   ')
    expect(result).not.toContain('{figure}')
    expect(result).not.toContain('()')
    expect(result).toBe('Je ratio is hoog.')
  })

  it('removes "{figure}" at start of string without leaving double spaces', () => {
    const result = fillFigure('{figure} is de waarde.', null)
    expect(result).not.toContain('{figure}')
    // No leading double space
    expect(result).not.toMatch(/^\s{2,}/)
  })

  it('handles template with no {figure} placeholder gracefully', () => {
    expect(fillFigure('Gewoon tekst.', null)).toBe('Gewoon tekst.')
    expect(fillFigure('Gewoon tekst.', '€42k')).toBe('Gewoon tekst.')
  })
})

// ── leverToLeverageStatus ─────────────────────────────────────────────────────

describe('leverToLeverageStatus', () => {
  it('maps green → good', () => {
    expect(leverToLeverageStatus('green')).toBe('good')
  })

  it('maps amber → warn', () => {
    expect(leverToLeverageStatus('amber')).toBe('warn')
  })

  it('maps red → bad', () => {
    expect(leverToLeverageStatus('red')).toBe('bad')
  })

  it('maps neutral → neutral', () => {
    expect(leverToLeverageStatus('neutral')).toBe('neutral')
  })
})

// ── resolvePageStatusMap — lever routes ──────────────────────────────────────

describe('resolvePageStatusMap — lever/box routes', () => {
  it('green levers produce NO entries in the map', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores('green', 'green', 'green', 'green'),
    })
    expect(Object.keys(map)).toHaveLength(0)
  })

  it('neutral levers produce NO entries', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores('neutral', 'neutral', 'neutral', 'neutral'),
    })
    expect(Object.keys(map)).toHaveLength(0)
  })

  it('amber assets lever → /overzicht/bezittingen with status warn', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores('amber', 'green', 'green', 'green', '2 typen · € 50k'),
    })
    expect(map['/overzicht/bezittingen']).toBeDefined()
    expect(map['/overzicht/bezittingen'].status).toBe('warn')
    expect(map['/overzicht/bezittingen'].route).toBe('/overzicht/bezittingen')
  })

  it('red assets lever → /overzicht/bezittingen with status bad', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores('red', 'green', 'green', 'green', '1 type · € 50k'),
    })
    expect(map['/overzicht/bezittingen']).toBeDefined()
    expect(map['/overzicht/bezittingen'].status).toBe('bad')
  })

  it('amber debts lever → /overzicht/schulden with status warn', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores('green', 'amber', 'green', 'green', '', '60% van vermogen'),
    })
    expect(map['/overzicht/schulden']).toBeDefined()
    expect(map['/overzicht/schulden'].status).toBe('warn')
  })

  it('red debts lever → /overzicht/schulden with status bad', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores('green', 'red', 'green', 'green', '', '110% van vermogen'),
    })
    expect(map['/overzicht/schulden']).toBeDefined()
    expect(map['/overzicht/schulden'].status).toBe('bad')
  })

  it('amber cashflow lever → /overzicht/cashflow with status warn', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores('green', 'green', 'amber', 'green', '', '', 'Spaarquote 8%'),
    })
    expect(map['/overzicht/cashflow']).toBeDefined()
    expect(map['/overzicht/cashflow'].status).toBe('warn')
  })

  it('red tax lever → /overzicht/belasting with status bad', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores('green', 'green', 'green', 'red', '', '', '', '€ 600k boven vrijstelling'),
    })
    expect(map['/overzicht/belasting']).toBeDefined()
    expect(map['/overzicht/belasting'].status).toBe('bad')
  })

  it('all four levers amber → four lever routes emitted', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores('amber', 'amber', 'amber', 'amber'),
    })
    expect(map['/overzicht/bezittingen']).toBeDefined()
    expect(map['/overzicht/schulden']).toBeDefined()
    expect(map['/overzicht/cashflow']).toBeDefined()
    expect(map['/overzicht/belasting']).toBeDefined()
  })

  it('good/neutral box1 → no /overzicht/belasting/box1 entry', () => {
    const levers = makeLeverScoresWithBox('good', 'neutral')
    const map = resolvePageStatusMap({ levers })
    expect(map['/overzicht/belasting/box1']).toBeUndefined()
  })

  it('warn box1 → /overzicht/belasting/box1 with status warn', () => {
    const levers = makeLeverScoresWithBox('warn', 'neutral')
    const map = resolvePageStatusMap({ levers })
    expect(map['/overzicht/belasting/box1']).toBeDefined()
    expect(map['/overzicht/belasting/box1'].status).toBe('warn')
  })

  it('bad box3 → /overzicht/belasting/box3 with status bad', () => {
    const levers = makeLeverScoresWithBox('neutral', 'bad')
    const map = resolvePageStatusMap({ levers })
    expect(map['/overzicht/belasting/box3']).toBeDefined()
    expect(map['/overzicht/belasting/box3'].status).toBe('bad')
  })
})

// ── resolvePageStatusMap — {figure} interpolation via lever detail ────────────

describe('resolvePageStatusMap — no-data gate (M2)', () => {
  // Een lege/nieuwe gebruiker: de schulden-hefboom valt op de synthetische amber
  // (debtScore 50) maar de detailtekst draagt het "— Start"-sentinel. Dan mag er
  // GEEN "Je schulden wegen zwaar"-banner verschijnen (code-review M2).
  it('toont geen schulden-banner wanneer de hefboom geen echte data heeft', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores('green', 'amber', 'green', 'green', '', 'Geen data — Start'),
    })
    expect(map['/overzicht/schulden']).toBeUndefined()
  })

  it('toont wél een schulden-banner bij echte data (amber met cijfer)', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores('green', 'amber', 'green', 'green', '', '60% van vermogen'),
    })
    expect(map['/overzicht/schulden']?.status).toBe('warn')
  })

  it('onderdrukt elke hefboom met het "— Start"-sentinel, ook bij rode status', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores(
        'red',
        'red',
        'red',
        'red',
        'Geen bezittingen geregistreerd — Start',
        'Geen data — Start',
        'Onvoldoende transactiedata — Start',
        'Geen belastbare bezittingen — Start',
      ),
    })
    expect(map['/overzicht/bezittingen']).toBeUndefined()
    expect(map['/overzicht/schulden']).toBeUndefined()
    expect(map['/overzicht/cashflow']).toBeUndefined()
    expect(map['/overzicht/belasting']).toBeUndefined()
  })
})

describe('resolvePageStatusMap — {figure} interpolation', () => {
  it('assets warn: lever detail appears inside the reason', () => {
    const detail = '2 typen · € 50k'
    const map = resolvePageStatusMap({
      levers: makeLeverScores('amber', 'green', 'green', 'green', detail),
    })
    const info = map['/overzicht/bezittingen']
    expect(info).toBeDefined()
    expect(info.reason).toContain(detail)
  })

  it('debts bad: lever detail appears inside the reason', () => {
    const detail = '€ 80k · 90% van vermogen'
    const map = resolvePageStatusMap({
      levers: makeLeverScores('green', 'red', 'green', 'green', '', detail),
    })
    const info = map['/overzicht/schulden']
    expect(info).toBeDefined()
    expect(info.reason).toContain(detail)
  })

  it('box1 warn: null figure yields reason with no leftover "()" or {figure}', () => {
    const levers = makeLeverScoresWithBox('warn', 'neutral')
    const map = resolvePageStatusMap({ levers })
    const info = map['/overzicht/belasting/box1']
    expect(info).toBeDefined()
    // box1 always gets null figure — reason must be clean
    expect(info.reason).not.toContain('{figure}')
    expect(info.reason).not.toContain('()')
    expect(info.reason.trim()).toBe(info.reason)
  })

  it('box3 with null tax detail: reason has no leftover "()" or {figure}', () => {
    // When scores.tax.detail is empty string, fillFigure strips placeholder
    const levers: LeverScoresResult = {
      ...makeLeverScores('green', 'green', 'green', 'green', '', '', '', ''),
      box3Status: 'warn',
      box1Status: 'neutral',
    }
    const map = resolvePageStatusMap({ levers })
    const info = map['/overzicht/belasting/box3']
    expect(info).toBeDefined()
    expect(info.reason).not.toContain('{figure}')
    expect(info.reason).not.toContain('()')
  })
})

// ── resolvePageStatusMap — optional families ──────────────────────────────────

describe('resolvePageStatusMap — optional families', () => {
  it('calling with only levers skips all cashflow routes — no crash', () => {
    const map = resolvePageStatusMap({
      levers: makeLeverScores('amber', 'amber', 'amber', 'amber'),
    })
    // No cashflow-sub entries
    expect(map['/overzicht/cashflow/budget']).toBeUndefined()
    expect(map['/overzicht/cashflow/transacties']).toBeUndefined()
    expect(map['/overzicht/cashflow/vaste-lasten']).toBeUndefined()
    expect(map['/overzicht/cashflow/forecast']).toBeUndefined()
    // Lever routes ARE present
    expect(map['/overzicht/bezittingen']).toBeDefined()
  })

  it('calling with only cashflowCards skips lever routes — no crash', () => {
    const cards = [
      makeCashflowCard('budget', 'warn', 'Let op je budget'),
      makeCashflowCard('transacties', 'good', 'Goed gespaard'),
      makeCashflowCard('vaste-lasten', 'neutral', null),
      makeCashflowCard('forecast', 'bad', 'Saldo daalt'),
    ]
    const map = resolvePageStatusMap({ cashflowCards: cards })
    // No lever routes
    expect(map['/overzicht/bezittingen']).toBeUndefined()
    expect(map['/overzicht/schulden']).toBeUndefined()
    // Cashflow warn/bad present
    expect(map['/overzicht/cashflow/budget']).toBeDefined()
    expect(map['/overzicht/cashflow/forecast']).toBeDefined()
    // good/neutral absent
    expect(map['/overzicht/cashflow/transacties']).toBeUndefined()
    expect(map['/overzicht/cashflow/vaste-lasten']).toBeUndefined()
  })

  it('calling with empty input {} returns empty map — no crash', () => {
    const map = resolvePageStatusMap({})
    expect(Object.keys(map)).toHaveLength(0)
  })

  it('box2Relevant: undefined → no box2 entry', () => {
    const map = resolvePageStatusMap({ levers: makeLeverScores() })
    expect(map['/overzicht/belasting/box2']).toBeUndefined()
  })

  it('box2Relevant: false → no box2 entry (neutral status filtered)', () => {
    const map = resolvePageStatusMap({ box2Relevant: false })
    expect(map['/overzicht/belasting/box2']).toBeUndefined()
  })

  it('box2Relevant: true → box2 entry with warn status', () => {
    const map = resolvePageStatusMap({ box2Relevant: true })
    expect(map['/overzicht/belasting/box2']).toBeDefined()
    expect(map['/overzicht/belasting/box2'].status).toBe('warn')
  })
})

// ── resolvePageStatusMap — cashflow card routes ───────────────────────────────

describe('resolvePageStatusMap — cashflow cards', () => {
  it('warn budget card → /overzicht/cashflow/budget entry; reason is clean (no parenthetical/figure)', () => {
    // Budget reason is a qualitative situation — the card subText (a label like
    // "Boven budget") is intentionally NOT woven into a parenthetical.
    const subText = 'Boven budget'
    const cards = [makeCashflowCard('budget', 'warn', subText)]
    const map = resolvePageStatusMap({ cashflowCards: cards })
    const info = map['/overzicht/cashflow/budget']
    expect(info).toBeDefined()
    expect(info.status).toBe('warn')
    expect(info.reason.trim().length).toBeGreaterThan(0)
    expect(info.reason).not.toContain('{figure}')
    expect(info.reason).not.toContain('(')
    expect(info.reason).not.toContain(')')
  })

  it('bad transacties card → /overzicht/cashflow/transacties entry; reason is clean (no parenthetical/figure)', () => {
    const subText = 'Tekort deze maand'
    const cards = [makeCashflowCard('transacties', 'bad', subText)]
    const map = resolvePageStatusMap({ cashflowCards: cards })
    const info = map['/overzicht/cashflow/transacties']
    expect(info).toBeDefined()
    expect(info.status).toBe('bad')
    expect(info.reason.trim().length).toBeGreaterThan(0)
    expect(info.reason).not.toContain('{figure}')
    expect(info.reason).not.toContain('(')
    expect(info.reason).not.toContain(')')
  })

  it('bad vaste-lasten card → /overzicht/cashflow/vaste-lasten entry; ratio figure appears in reason', () => {
    // Vaste lasten keeps {figure}: the subText is a real ratio ("X% van inkomen").
    const ratio = '72% van inkomen'
    const cards = [makeCashflowCard('vaste-lasten', 'bad', ratio)]
    const map = resolvePageStatusMap({ cashflowCards: cards })
    const info = map['/overzicht/cashflow/vaste-lasten']
    expect(info).toBeDefined()
    expect(info.status).toBe('bad')
    expect(info.reason).toContain(ratio)
  })

  it('warn forecast card → /overzicht/cashflow/forecast entry; reason is clean (no parenthetical/figure)', () => {
    const cards = [makeCashflowCard('forecast', 'warn', 'Saldo daalt')]
    const map = resolvePageStatusMap({ cashflowCards: cards })
    const info = map['/overzicht/cashflow/forecast']
    expect(info).toBeDefined()
    expect(info.status).toBe('warn')
    expect(info.reason.trim().length).toBeGreaterThan(0)
    expect(info.reason).not.toContain('{figure}')
    expect(info.reason).not.toContain('(')
    expect(info.reason).not.toContain(')')
  })

  it('good card → no entry', () => {
    const cards = [makeCashflowCard('budget', 'good', 'Op schema')]
    const map = resolvePageStatusMap({ cashflowCards: cards })
    expect(map['/overzicht/cashflow/budget']).toBeUndefined()
  })

  it('neutral card → no entry', () => {
    const cards = [makeCashflowCard('transacties', 'neutral', null)]
    const map = resolvePageStatusMap({ cashflowCards: cards })
    expect(map['/overzicht/cashflow/transacties']).toBeUndefined()
  })

  it('cashflow card with null subText: reason has no leftover "()" or {figure}', () => {
    const cards = [makeCashflowCard('budget', 'warn', null)]
    const map = resolvePageStatusMap({ cashflowCards: cards })
    const info = map['/overzicht/cashflow/budget']
    expect(info).toBeDefined()
    expect(info.reason).not.toContain('{figure}')
    expect(info.reason).not.toContain('()')
  })
})

// ── PAGE_STATUS_COPY — catalogue completeness ─────────────────────────────────

describe('PAGE_STATUS_COPY — catalogue completeness', () => {
  const routes = Object.keys(PAGE_STATUS_COPY)

  it('every in-scope route has a non-empty title', () => {
    for (const route of routes) {
      const copy = PAGE_STATUS_COPY[route]
      expect(copy.title, `title missing for ${route}`).toBeTruthy()
      expect(copy.title.trim().length, `title empty for ${route}`).toBeGreaterThan(0)
    }
  })

  it('every route has non-empty warn.reason and warn.remedy', () => {
    for (const route of routes) {
      const copy = PAGE_STATUS_COPY[route]
      expect(copy.warn.reason, `warn.reason missing for ${route}`).toBeTruthy()
      expect(copy.warn.reason.trim().length, `warn.reason empty for ${route}`).toBeGreaterThan(0)
      expect(copy.warn.remedy, `warn.remedy missing for ${route}`).toBeTruthy()
      expect(copy.warn.remedy.trim().length, `warn.remedy empty for ${route}`).toBeGreaterThan(0)
    }
  })

  it('every route has non-empty bad.reason and bad.remedy', () => {
    for (const route of routes) {
      const copy = PAGE_STATUS_COPY[route]
      expect(copy.bad.reason, `bad.reason missing for ${route}`).toBeTruthy()
      expect(copy.bad.reason.trim().length, `bad.reason empty for ${route}`).toBeGreaterThan(0)
      expect(copy.bad.remedy, `bad.remedy missing for ${route}`).toBeTruthy()
      expect(copy.bad.remedy.trim().length, `bad.remedy empty for ${route}`).toBeGreaterThan(0)
    }
  })

  it('every route has a will object with non-empty onderwerp', () => {
    for (const route of routes) {
      const copy = PAGE_STATUS_COPY[route]
      expect(copy.will, `will missing for ${route}`).toBeDefined()
      expect(copy.will.onderwerp, `will.onderwerp missing for ${route}`).toBeTruthy()
      expect(copy.will.onderwerp.trim().length, `will.onderwerp empty for ${route}`).toBeGreaterThan(0)
    }
  })

  it('every route action (if present) has non-empty label and href', () => {
    for (const route of routes) {
      const copy = PAGE_STATUS_COPY[route]
      if (copy.action) {
        expect(copy.action.label, `action.label missing for ${route}`).toBeTruthy()
        expect(copy.action.href, `action.href missing for ${route}`).toBeTruthy()
        expect(copy.action.href, `action.href should start with / for ${route}`).toMatch(/^\//)
      }
    }
  })
})

// ── PAGE_STATUS_COPY — fillFigure on every template ──────────────────────────

describe('PAGE_STATUS_COPY — fillFigure produces clean output for every template', () => {
  const routes = Object.keys(PAGE_STATUS_COPY)

  it('with a figure: no {figure} placeholder remains', () => {
    for (const route of routes) {
      const copy = PAGE_STATUS_COPY[route]
      const figure = '€ 42k'
      for (const status of ['warn', 'bad'] as const) {
        const sc = copy[status]
        const filled = fillFigure(sc.reason, figure)
        expect(filled, `{figure} remains in ${route} ${status}.reason`).not.toContain('{figure}')
      }
    }
  })

  it('without a figure: no {figure} placeholder and no "()" artefact remains', () => {
    for (const route of routes) {
      const copy = PAGE_STATUS_COPY[route]
      for (const status of ['warn', 'bad'] as const) {
        const sc = copy[status]
        const filled = fillFigure(sc.reason, null)
        expect(filled, `{figure} remains in ${route} ${status}.reason after null fill`).not.toContain('{figure}')
        expect(filled, `"()" artefact in ${route} ${status}.reason after null fill`).not.toContain('()')
        // No double spaces
        expect(filled, `double space in ${route} ${status}.reason after null fill`).not.toMatch(/  /)
      }
    }
  })
})

// ── getRouteCopy / getStatusCopy helpers ──────────────────────────────────────

describe('getRouteCopy / getStatusCopy', () => {
  it('getRouteCopy returns copy for a known route', () => {
    const copy = getRouteCopy('/overzicht/schulden')
    expect(copy).not.toBeNull()
    expect(copy!.title).toBe('Schulden')
  })

  it('getRouteCopy returns null for an unknown route', () => {
    expect(getRouteCopy('/overzicht/onbekend')).toBeNull()
  })

  it('getStatusCopy returns warn copy for warn status', () => {
    const sc = getStatusCopy('/overzicht/schulden', 'warn')
    expect(sc).not.toBeNull()
    expect(sc!.reason).toBeTruthy()
  })

  it('getStatusCopy returns bad copy for bad status', () => {
    const sc = getStatusCopy('/overzicht/schulden', 'bad')
    expect(sc).not.toBeNull()
    expect(sc!.reason).toBeTruthy()
  })

  it('getStatusCopy returns null for good status (no banner for good)', () => {
    expect(getStatusCopy('/overzicht/schulden', 'good')).toBeNull()
  })

  it('getStatusCopy returns null for neutral status', () => {
    expect(getStatusCopy('/overzicht/schulden', 'neutral')).toBeNull()
  })

  it('getStatusCopy returns null for unknown route', () => {
    expect(getStatusCopy('/onbekend', 'warn')).toBeNull()
  })
})

// ── ROUTE_FAMILY smoke (pure constant, inlined here to avoid heavy imports) ───

describe('route-family smoke — in-scope routes', () => {
  // The ROUTE_FAMILY map lives in app/api/overzicht/page-status/route.ts and
  // requires Next.js / Supabase infrastructure to import cleanly, so we test
  // the PURE side: every key in PAGE_STATUS_COPY must match an entry we know
  // belongs to the feature's scope. We don't import the route handler; we
  // simply assert that the copy catalogue and the well-known route list are
  // consistent.

  const KNOWN_IN_SCOPE = [
    '/overzicht/bezittingen',
    '/overzicht/schulden',
    '/overzicht/cashflow',
    '/overzicht/belasting',
    '/overzicht/belasting/box1',
    '/overzicht/belasting/box2',
    '/overzicht/belasting/box3',
    '/overzicht/cashflow/budget',
    '/overzicht/cashflow/transacties',
    '/overzicht/cashflow/vaste-lasten',
    '/overzicht/cashflow/forecast',
  ]

  it('PAGE_STATUS_COPY covers every known in-scope route', () => {
    for (const route of KNOWN_IN_SCOPE) {
      expect(
        PAGE_STATUS_COPY[route],
        `PAGE_STATUS_COPY is missing entry for ${route}`,
      ).toBeDefined()
    }
  })

  it('PAGE_STATUS_COPY has no entry for an out-of-scope route', () => {
    expect(PAGE_STATUS_COPY['/overzicht/onbekend']).toBeUndefined()
    expect(PAGE_STATUS_COPY['/dashboard']).toBeUndefined()
  })
})
