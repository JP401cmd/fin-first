import { describe, it, expect } from 'vitest'
import {
  planInitialFetch,
  INITIAL_FETCH_BLOCK_MONTHS,
  INITIAL_FETCH_MARGIN_DAYS,
  INITIAL_FETCH_MAX_LOOKBACK_MONTHS,
  toProviderRange,
} from './initial-fetch'

/**
 * Het startpunt-contract van de eerste ophaal (B8/B9).
 *
 * Wat hier vastligt is niet "de blokken zien er zo uit" maar de drie
 * eigenschappen waar de rest van de koppeling op leunt:
 * 1. een lege rekening haalt méér dan de TrueLayer-standaard van ~88 dagen;
 * 2. een gevulde rekening start op D−3 en doet géén blok-lus;
 * 3. er wordt nooit in de toekomst gevraagd.
 */

const TODAY = '2026-07-29'

describe('planInitialFetch — lege rekening (B8)', () => {
  it('dekt de volledige terugblik met aaneengesloten blokken, nieuwste eerst', () => {
    const plan = planInitialFetch({ today: TODAY })

    expect(plan.mode).toBe('historical')
    expect(plan.blocks.length).toBe(INITIAL_FETCH_MAX_LOOKBACK_MONTHS / INITIAL_FETCH_BLOCK_MONTHS)

    // Nieuwste eerst: het eerste blok loopt tot vandaag. Die volgorde is
    // functioneel — een provider-limiet halverwege laat dan de meest recente
    // historie staan.
    expect(plan.blocks[0].to).toBe(TODAY)
    expect(plan.blocks[0].from).toBe('2026-01-29')

    // Aaneengesloten: elk blok begint waar het volgende (oudere) eindigt. Een
    // dag overlap is gratis, een dag gat is stil verlies.
    for (let i = 0; i < plan.blocks.length - 1; i++) {
      expect(plan.blocks[i].from).toBe(plan.blocks[i + 1].to)
    }

    // Het oudste blok bepaalt het startpunt, en dat is de volle terugblik.
    expect(plan.blocks[plan.blocks.length - 1].from).toBe('2024-07-29')
    expect(plan.startDate).toBe('2024-07-29')
  })

  it('haalt aantoonbaar méér dan de TrueLayer-standaard van ~88 dagen', () => {
    const plan = planInitialFetch({ today: TODAY })
    const spanDays =
      (Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${plan.startDate}T00:00:00Z`)) / 86_400_000

    expect(spanDays).toBeGreaterThan(88)
  })

  it('respecteert een afwijkende blokgrootte en terugblik', () => {
    const plan = planInitialFetch({ today: TODAY, maxLookbackMonths: 12, blockMonths: 12 })

    expect(plan.blocks).toEqual([{ from: '2025-07-29', to: TODAY }])
  })
})

describe('planInitialFetch — rekening mét historie (B9)', () => {
  it('start op de nieuwste bestaande transactie −3 dagen, zonder blok-lus', () => {
    const plan = planInitialFetch({ today: TODAY, newestExistingDate: '2026-07-20' })

    expect(plan.mode).toBe('incremental')
    expect(plan.startDate).toBe('2026-07-17')
    expect(plan.blocks).toEqual([{ from: '2026-07-17', to: TODAY }])
  })

  it('gebruikt de marge uit de constante, niet een los getal in de aanroeper', () => {
    const plan = planInitialFetch({ today: TODAY, newestExistingDate: TODAY })
    const marginDays =
      (Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${plan.startDate}T00:00:00Z`)) / 86_400_000

    expect(marginDays).toBe(INITIAL_FETCH_MARGIN_DAYS)
  })

  it('wint van de maximale terugblik als de historie ouder is (geen gatvulling)', () => {
    // Bewust gedrag, geen tekortkoming: gaten vóór de bestaande historie worden
    // niet automatisch gevuld — CSV-import is daarvoor de route (B7/fase 3).
    const plan = planInitialFetch({ today: TODAY, newestExistingDate: '2021-03-10' })

    expect(plan.mode).toBe('incremental')
    expect(plan.blocks).toEqual([{ from: '2021-03-07', to: TODAY }])
  })
})

describe('planInitialFetch — grensgevallen', () => {
  it('vraagt niets in de toekomst bij historie van vandaag', () => {
    const plan = planInitialFetch({ today: TODAY, newestExistingDate: TODAY })

    expect(plan.blocks).toEqual([{ from: '2026-07-26', to: TODAY }])
    for (const block of plan.blocks) {
      expect(block.to <= TODAY).toBe(true)
      expect(block.from <= TODAY).toBe(true)
    }
  })

  it('klemt een transactiedatum in de toekomst op vandaag', () => {
    const plan = planInitialFetch({ today: TODAY, newestExistingDate: '2027-01-01' })

    expect(plan.blocks).toEqual([{ from: '2026-07-26', to: TODAY }])
  })

  it('behandelt een lege string als "geen historie"', () => {
    expect(planInitialFetch({ today: TODAY, newestExistingDate: '' }).mode).toBe('historical')
    expect(planInitialFetch({ today: TODAY, newestExistingDate: null }).mode).toBe('historical')
  })

  it('rolt niet door naar de volgende maand bij een maandeinde', () => {
    // 31 maart − 1 maand is 28 februari, niet 3 maart.
    const plan = planInitialFetch({ today: '2026-03-31', maxLookbackMonths: 1, blockMonths: 1 })

    expect(plan.blocks).toEqual([{ from: '2026-02-28', to: '2026-03-31' }])
  })

  it('levert altijd minstens één blok', () => {
    const plan = planInitialFetch({ today: TODAY, maxLookbackMonths: 0 })

    expect(plan.blocks).toEqual([{ from: TODAY, to: TODAY }])
  })
})

describe('toProviderRange', () => {
  it('stuurt ook voor het blok tot vandaag een `to` mee, tot het einde van de dag', () => {
    // Data API v1 past het venster alleen toe als `from` én `to` er zijn; met
    // alleen `from` valt de provider terug op zijn standaard van ~88 dagen en
    // levert hij rijen die VÓÓR het gevraagde startpunt liggen. Een kale
    // `to=<vandaag>` is middernacht en zou vandaag juist afkappen, dus loopt de
    // bovengrens tot het einde van de dag.
    expect(toProviderRange({ from: '2026-01-29', to: TODAY }, TODAY)).toEqual({
      from: '2026-01-29',
      to: `${TODAY}T23:59:59Z`,
    })
  })

  it('houdt `to` voor historische blokken', () => {
    expect(toProviderRange({ from: '2025-07-29', to: '2026-01-29' }, TODAY)).toEqual({
      from: '2025-07-29',
      to: '2026-01-29',
    })
  })

  it('geeft nooit een venster zonder bovengrens terug', () => {
    // De eigenschap achter beide gevallen hierboven: elk blok dat naar de
    // provider gaat draagt een volledig venster. Zonder `to` is `from` een
    // wens die de provider stilzwijgend negeert.
    for (const block of [
      { from: '2026-01-29', to: TODAY },
      { from: '2025-07-29', to: '2026-01-29' },
      { from: TODAY, to: TODAY },
    ]) {
      expect(toProviderRange(block, TODAY).to).toBeTruthy()
    }
  })
})
