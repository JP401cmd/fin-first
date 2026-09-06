import { describe, it, expect } from 'vitest'
import { buildBreadcrumbs } from './breadcrumb'
import { ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS, type DebtType } from '@/lib/debt-data'

/**
 * Bevinding L3 — het kruimelpad toonde de RUWE database-enum uit de URL
 * ("Mortgage", "Vehicle", "Personal_loan") in plaats van het Nederlandse label
 * dat al bestond en op dezelfde routes al de paginatitel voedt.
 *
 * De test loopt bewust ÉLKE sleutel uit beide enums langs (niet een steekproef):
 * de fix is een lookup, en een lookup faalt pas zichtbaar bij de sleutel die
 * niemand handmatig testte. Komt er een type bij, dan dekt deze test het meteen.
 */

const ASSET_ROUTES = ['/core/assets', '/overzicht/bezittingen'] as const
const DEBT_ROUTES = ['/core/debts', '/overzicht/schulden'] as const

/** Laatste crumb van een pad — dat is de categorie-crumb. */
function lastLabel(pathname: string): string {
  const crumbs = buildBreadcrumbs(pathname)
  return crumbs[crumbs.length - 1]!.label
}

describe('buildBreadcrumbs — bezittingstypen (L3)', () => {
  const assetTypes = Object.keys(ASSET_TYPE_LABELS) as AssetType[]

  it('dekt alle 13 bezittingstypen', () => {
    expect(assetTypes.length).toBe(13)
  })

  for (const route of ASSET_ROUTES) {
    for (const type of assetTypes) {
      it(`${route}/${type} → "${ASSET_TYPE_LABELS[type]}"`, () => {
        expect(lastLabel(`${route}/${type}`)).toBe(ASSET_TYPE_LABELS[type])
      })
    }
  }
})

describe('buildBreadcrumbs — schuldtypen (L3)', () => {
  const debtTypes = Object.keys(DEBT_TYPE_LABELS) as DebtType[]

  it('dekt alle 11 schuldtypen', () => {
    expect(debtTypes.length).toBe(11)
  })

  for (const route of DEBT_ROUTES) {
    for (const type of debtTypes) {
      it(`${route}/${type} → "${DEBT_TYPE_LABELS[type]}"`, () => {
        expect(lastLabel(`${route}/${type}`)).toBe(DEBT_TYPE_LABELS[type])
      })
    }
  }
})

describe('buildBreadcrumbs — de concrete PDF-voorbeelden', () => {
  it('toont "Overzicht › Schulden › Hypotheek" i.p.v. "Mortgage"', () => {
    expect(buildBreadcrumbs('/core/debts/mortgage').map((c) => c.label)).toEqual([
      'Overzicht',
      'Schulden',
      'Hypotheek',
    ])
  })

  it('toont "Overzicht › Vermogen › Voertuig" i.p.v. "Vehicle"', () => {
    expect(buildBreadcrumbs('/core/assets/vehicle').map((c) => c.label)).toEqual([
      'Overzicht',
      'Vermogen',
      'Voertuig',
    ])
  })

  it('lekt nergens meer een rauwe underscore-sleutel', () => {
    const paths = [
      ...Object.keys(ASSET_TYPE_LABELS).map((t) => `/overzicht/bezittingen/${t}`),
      ...Object.keys(DEBT_TYPE_LABELS).map((t) => `/overzicht/schulden/${t}`),
    ]
    for (const path of paths) {
      expect(lastLabel(path)).not.toContain('_')
    }
  })
})

describe('buildBreadcrumbs — grenzen van de type-lookup', () => {
  it('kijkt alleen in de type-positie: `mortgage` als losse route blijft ongemoeid', () => {
    // Zonder ouder-segment `debts`/`schulden` is dit geen schuldtype maar een
    // gewoon (onbekend) routewoord.
    expect(lastLabel('/beheer/mortgage')).toBe('Mortgage')
  })

  it('scheidt de twee enums: `other` onder schulden is het schuld-label', () => {
    expect(lastLabel('/overzicht/schulden/other')).toBe(DEBT_TYPE_LABELS.other)
    expect(lastLabel('/overzicht/bezittingen/other')).toBe(ASSET_TYPE_LABELS.other)
  })

  it('geeft `cash` in de type-positie hetzelfde label als de paginatitel', () => {
    // `cash` staat óók in de generieke segmentLabels; in de type-positie wint de
    // canonieke bezittingstabel, zodat crumb en titel niet uit elkaar lopen.
    expect(lastLabel('/overzicht/bezittingen/cash')).toBe(ASSET_TYPE_LABELS.cash)
  })

  it('laat een gewone route-crumb ongemoeid', () => {
    expect(buildBreadcrumbs('/overzicht/budget/vaste-lasten').map((c) => c.label)).toEqual([
      'Overzicht',
      'Budget',
      'Vaste lasten',
    ])
  })

  it('vervangt underscores in een onbekend segment door spaties', () => {
    expect(lastLabel('/beheer/iets_onbekends')).toBe('Iets onbekends')
  })

  it('houdt de canonieke import-trail intact en consistent met de type-lookup', () => {
    const crumbs = buildBreadcrumbs('/core/cash/import')
    expect(crumbs.map((c) => c.label)).toEqual([
      'Overzicht',
      'Bezittingen',
      ASSET_TYPE_LABELS.cash,
      'Importeren',
    ])
  })

  it('houdt de legacy /core-root op de canonieke /overzicht-href', () => {
    expect(buildBreadcrumbs('/core/debts/mortgage')[0]).toEqual({
      label: 'Overzicht',
      href: '/overzicht',
    })
  })
})
