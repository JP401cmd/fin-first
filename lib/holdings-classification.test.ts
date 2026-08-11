import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deriveAssetClass,
  deriveGeography,
  normalizeLegacyAssetClass,
  buildClassificationUpdate,
} from './holdings-classification'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * De afleiding van assetklasse/geografie uit Yahoo's chart-metadata.
 *
 * De kern-eis staat in het tweede blok: een ETF krijgt NOOIT een geografie op
 * basis van zijn noteringsbeurs. VWRL noteert in Amsterdam en belegt wereldwijd
 * — "nederland" zou daar een aantoonbaar fout getal in de donut zetten.
 */

describe('deriveAssetClass', () => {
  it('EQUITY → aandelen', () => {
    expect(deriveAssetClass('EQUITY')).toBe('aandelen')
  })

  it('ETF en MUTUALFUND → etf (verpakking, niet inhoud)', () => {
    expect(deriveAssetClass('ETF')).toBe('etf')
    expect(deriveAssetClass('MUTUALFUND')).toBe('etf')
    // Expliciet vastgelegd: een ETF mag NIET onder aandelen vallen — een
    // obligatie-ETF draagt hetzelfde instrumentType.
    expect(deriveAssetClass('ETF')).not.toBe('aandelen')
  })

  it('CRYPTOCURRENCY → crypto', () => {
    expect(deriveAssetClass('CRYPTOCURRENCY')).toBe('crypto')
  })

  it('onbekend of ontbrekend instrumentType → null (onbekend is geen categorie)', () => {
    expect(deriveAssetClass('FUTURE')).toBeNull()
    expect(deriveAssetClass('INDEX')).toBeNull()
    expect(deriveAssetClass('')).toBeNull()
    expect(deriveAssetClass('   ')).toBeNull()
    expect(deriveAssetClass(null)).toBeNull()
    // Nadrukkelijk NIET 'anders': dat zou een verzonnen classificatie zijn.
    expect(deriveAssetClass('FUTURE')).not.toBe('anders')
  })

  it('is hoofdletter-ongevoelig en trimt', () => {
    expect(deriveAssetClass('equity')).toBe('aandelen')
    expect(deriveAssetClass('  Etf  ')).toBe('etf')
    expect(deriveAssetClass('cryptocurrency')).toBe('crypto')
  })
})

describe('deriveGeography', () => {
  it('EQUITY + AMS → nederland', () => {
    expect(deriveGeography('EQUITY', 'AMS')).toBe('nederland')
  })

  it('KERN-EIS: ETF krijgt NOOIT een geografie uit zijn noteringsbeurs', () => {
    // VWRL.AS: instrumentType ETF, exchangeName AMS — wereldwijd belegd.
    expect(deriveGeography('ETF', 'AMS')).toBeNull()
    expect(deriveGeography('ETF', 'NMS')).toBeNull()
    expect(deriveGeography('MUTUALFUND', 'AMS')).toBeNull()
  })

  it('mapt de vier regio-emmers', () => {
    expect(deriveGeography('EQUITY', 'NMS')).toBe('noord_amerika')
    expect(deriveGeography('EQUITY', 'NYQ')).toBe('noord_amerika')
    expect(deriveGeography('EQUITY', 'GER')).toBe('europa')
    expect(deriveGeography('EQUITY', 'LSE')).toBe('europa')
    expect(deriveGeography('EQUITY', 'HKG')).toBe('azie')
    expect(deriveGeography('EQUITY', 'ASX')).toBe('azie')
    expect(deriveGeography('EQUITY', 'SAO')).toBe('opkomend')
    expect(deriveGeography('EQUITY', 'NSI')).toBe('opkomend')
  })

  it('onbekende beurs → null (niet raden)', () => {
    expect(deriveGeography('EQUITY', 'ZZZ')).toBeNull()
    expect(deriveGeography('EQUITY', '')).toBeNull()
    expect(deriveGeography('EQUITY', null)).toBeNull()
  })

  it('onbekend instrumentType → null, ongeacht de beurs', () => {
    expect(deriveGeography(null, 'AMS')).toBeNull()
    expect(deriveGeography('FUTURE', 'NMS')).toBeNull()
  })

  it('is hoofdletter-ongevoelig en trimt', () => {
    expect(deriveGeography('equity', 'ams')).toBe('nederland')
    expect(deriveGeography(' Equity ', ' nms ')).toBe('noord_amerika')
  })
})

describe('normalizeLegacyAssetClass', () => {
  it('mapt de legacy-sleutels naar het huidige vocabulaire', () => {
    expect(normalizeLegacyAssetClass('equity')).toBe('aandelen')
    expect(normalizeLegacyAssetClass('bonds')).toBe('obligaties')
    expect(normalizeLegacyAssetClass(' EQUITY ')).toBe('aandelen')
  })

  it('laat een hedendaagse of lege waarde met rust (null = niets doen)', () => {
    expect(normalizeLegacyAssetClass('aandelen')).toBeNull()
    expect(normalizeLegacyAssetClass('crypto')).toBeNull()
    expect(normalizeLegacyAssetClass('')).toBeNull()
    expect(normalizeLegacyAssetClass(null)).toBeNull()
    expect(normalizeLegacyAssetClass(undefined)).toBeNull()
  })
})

describe('canoniek vocabulaire', () => {
  /**
   * Bewust GEEN import uit `lib/portfolio-allocation.ts`: dat bestand wordt
   * parallel bewerkt (label 'etf' wordt daar toegevoegd) en een test die
   * meebeweegt met een bestand-in-verbouwing geeft ruis in plaats van bewijs.
   * De sleutels staan hier daarom letterlijk vast — dit is precies de lijst die
   * `ASSET_CLASS_LABELS`/`GEOGRAPHY_LABELS` moet kunnen labelen.
   */
  it('produceert uitsluitend sleutels uit het afgesproken vocabulaire (of null)', () => {
    const assetClassKeys = ['aandelen', 'obligaties', 'etf', 'crypto']
    const geographyKeys = ['nederland', 'europa', 'noord_amerika', 'azie', 'opkomend']

    for (const type of ['EQUITY', 'ETF', 'MUTUALFUND', 'CRYPTOCURRENCY', 'FUTURE', null]) {
      const key = deriveAssetClass(type)
      if (key !== null) expect(assetClassKeys).toContain(key)
    }
    for (const legacy of ['equity', 'bonds', 'aandelen', '']) {
      const key = normalizeLegacyAssetClass(legacy)
      if (key !== null) expect(assetClassKeys).toContain(key)
    }
    for (const exchange of ['AMS', 'GER', 'NMS', 'HKG', 'SAO', 'ZZZ']) {
      const key = deriveGeography('EQUITY', exchange)
      if (key !== null) expect(geographyKeys).toContain(key)
    }
  })
})

/**
 * BEIDE KOERSPADEN DELEN ÉÉN REGEL — anti-driftgrendel.
 *
 * Er zijn twee plekken waar koersen worden opgehaald: de handmatige
 * `POST /api/holdings/refresh-prices` en de nachtelijke cron ernaast. Ze deelden
 * geen regel code. Zat de classificatie in maar één van beide, dan hing het van
 * de toevallige route af óf een positie geclassificeerd werd — de verdeling
 * liep alleen vol voor wie zélf op verversen drukte. Beide paden "werken" dan,
 * en het verschil is aan de buitenkant onzichtbaar.
 */
describe('buildClassificationUpdate — de gedeelde beslissing', () => {
  const equityFeed = { instrumentType: 'EQUITY', exchangeName: 'AMS' }
  const etfFeed = { instrumentType: 'ETF', exchangeName: 'AMS' }

  it('vult alle drie de kolommen wanneer ze leeg zijn', () => {
    expect(buildClassificationUpdate(equityFeed, {})).toEqual({
      asset_class: 'aandelen',
      geography: 'nederland',
      exchange: 'AMS',
    })
  })

  it('laat een handmatige keuze van de gebruiker staan', () => {
    // De feed zegt aandelen/nederland; de gebruiker zei iets anders. Die wint.
    expect(
      buildClassificationUpdate(equityFeed, {
        asset_class: 'vastgoed',
        geography: 'wereld',
        exchange: 'EIGEN',
      }),
    ).toEqual({})
  })

  it('normaliseert alleen de verouderde sleutels', () => {
    expect(buildClassificationUpdate(equityFeed, { asset_class: 'equity' }).asset_class).toBe('aandelen')
    expect(buildClassificationUpdate(equityFeed, { asset_class: 'bonds' }).asset_class).toBe('obligaties')
  })

  it('geeft een ETF wél een assetklasse en beurs, maar GEEN geografie', () => {
    // De noteringsbeurs zegt niets over waar een fonds belegt — maar dát het op
    // AMS noteert is een feit en mag gewoon vastgelegd worden.
    expect(buildClassificationUpdate(etfFeed, {})).toEqual({ asset_class: 'etf', exchange: 'AMS' })
  })

  it('schrijft geen assetklasse/geografie bij een onbekend instrumenttype — de beurs wél', () => {
    // De beurscode is een feit uit de feed, geen interpretatie; hij hangt niet
    // af van of wij het instrumenttype herkennen.
    expect(
      buildClassificationUpdate({ instrumentType: 'FUTURE', exchangeName: 'CME' }, {}),
    ).toEqual({ exchange: 'CME' })
  })

  it('schrijft helemaal niets als de feed geen type én geen beurs levert', () => {
    expect(
      buildClassificationUpdate({ instrumentType: 'FUTURE', exchangeName: null }, {}),
    ).toEqual({})
  })

  it('is idempotent: een tweede ronde op de eigen uitkomst verandert niets', () => {
    const eerste = buildClassificationUpdate(equityFeed, {})
    expect(buildClassificationUpdate(equityFeed, eerste)).toEqual({})
  })

  it('behandelt witruimte als leeg', () => {
    expect(buildClassificationUpdate(equityFeed, { asset_class: '   ' }).asset_class).toBe('aandelen')
    expect(buildClassificationUpdate(equityFeed, { exchange: '   ' }).exchange).toBe('AMS')
  })
})

/**
 * De beurskolom volgt exact dezelfde regel als de rest: leeg = invullen,
 * ingevuld = met rust laten. Hij wordt alleen niet AFGELEID maar letterlijk
 * (genormaliseerd) overgenomen.
 */
describe('buildClassificationUpdate — exchange', () => {
  it('vult een lege kolom met de genormaliseerde beurscode', () => {
    expect(
      buildClassificationUpdate({ instrumentType: 'EQUITY', exchangeName: '  nms  ' }, {}).exchange,
    ).toBe('NMS')
  })

  it('laat een reeds ingevulde beurs staan — ook als de feed iets anders zegt', () => {
    const update = buildClassificationUpdate(
      { instrumentType: 'EQUITY', exchangeName: 'NMS' },
      { exchange: 'EURONEXT' },
    )
    expect('exchange' in update).toBe(false)
  })

  it('schrijft niets wanneer de feed geen beursnaam levert', () => {
    for (const exchangeName of [null, '', '   ']) {
      const update = buildClassificationUpdate({ instrumentType: 'EQUITY', exchangeName }, {})
      expect('exchange' in update).toBe(false)
    }
  })

  it('werkt onafhankelijk van de andere twee kolommen', () => {
    // Assetklasse en geografie al gezet, beurs nog niet → alleen beurs erbij.
    expect(
      buildClassificationUpdate(
        { instrumentType: 'EQUITY', exchangeName: 'AMS' },
        { asset_class: 'aandelen', geography: 'nederland' },
      ),
    ).toEqual({ exchange: 'AMS' })
  })
})

/**
 * Het 52-weeks bereik hoort NIET in deze helper. Het is een koersveld: het
 * schuift dagelijks op en moet dus élke ronde overschreven worden — precies het
 * tegenovergestelde van de "één keer invullen"-regel die deze helper bewaakt.
 * Zou het hier landen, dan zou de eerste refresh het bevriezen.
 */
describe('buildClassificationUpdate — geen koersvelden', () => {
  it('raakt fifty_two_week_high/low niet aan', () => {
    const update = buildClassificationUpdate(
      { instrumentType: 'EQUITY', exchangeName: 'AMS' },
      {},
    ) as Record<string, unknown>
    expect('fifty_two_week_high' in update).toBe(false)
    expect('fifty_two_week_low' in update).toBe(false)
    expect(Object.keys(update).sort()).toEqual(['asset_class', 'exchange', 'geography'])
  })
})

/**
 * Bronanker: beide koerspaden roepen de gedeelde helper aan. Een van de twee
 * die zijn eigen afleiding terugbouwt, valt hier om.
 */
describe('bronanker — geen tweede implementatie', () => {
  const strip = (p: string) =>
    readFileSync(join(REPO_ROOT, p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')

  for (const path of [
    'app/api/holdings/refresh-prices/route.ts',
    'app/api/holdings/refresh-prices/cron/route.ts',
  ]) {
    it(`${path} gebruikt buildClassificationUpdate`, () => {
      const code = strip(path)
      expect(code).toContain('buildClassificationUpdate')
      // Geen eigen afleiding ernaast: dat zou opnieuw twee waarheden geven.
      expect(code).not.toContain('deriveAssetClass(')
      expect(code).not.toContain('deriveGeography(')
    })
  }
})
