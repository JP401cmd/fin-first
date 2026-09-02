import { describe, it, expect } from 'vitest'
import {
  buildSindsVorigBezoek,
  formatSinceLabel,
  sindsVorigBezoekZin,
} from './sinds-vorig-bezoek'
import { FREEDOM_DELTA_MIN_DAYS } from '@/lib/briefing/overview-briefing'

/**
 * H11 — de delta-regel onder de begroeting. De waarde van deze regel zit in
 * wanneer hij ZWIJGT: een zin die elke dag iets roept is binnen een week
 * behang, en precies de ruis die de kaart moest wegnemen.
 *
 * GRONDSLAG SINDS ADR 0126 PR C: de regel is MARGINAAL — Δ netto vermogen ÷ het
 * dagtarief van vandaag. De bezoekmarker bewaart daarom het vermogenspeil en
 * geen dagenaantal; het tarief komt als parameter binnen zodat de test de
 * wisselkoers €→tijd expliciet kan vastpinnen.
 */

const now = new Date('2026-08-24T09:00:00Z') // maandag
/** €100/dag — één vrijheidsdag kost hier precies €100, zodat elk verwacht
 *  dagental direct uit het eurobedrag af te lezen is. */
const DAGTARIEF = 100

describe('buildSindsVorigBezoek — zwijgregels', () => {
  it('zonder basis (eerste bezoek, of een marker in de oude vorm) geen regel', () => {
    expect(buildSindsVorigBezoek({ netWorth: 100_000 }, null, DAGTARIEF, now)).toBeNull()
  })

  it('twee bezoeken op dezelfde dag geven geen regel', () => {
    const view = buildSindsVorigBezoek(
      { netWorth: 104_000 },
      { at: '2026-08-24T02:00:00.000Z', netWorth: 100_000 },
      DAGTARIEF,
      now,
    )
    expect(view).toBeNull()
  })

  it('0 dagen verschil geeft geen regel', () => {
    expect(
      buildSindsVorigBezoek(
        { netWorth: 100_040 },
        { at: '2026-08-23T09:00:00.000Z', netWorth: 100_000 },
        DAGTARIEF,
        now,
      ),
    ).toBeNull()
  })

  it('zonder geloofwaardig dagtarief is er geen wisselkoers €→tijd, dus geen regel', () => {
    // Vervangt de oude "oneindige vrijheidstijd"-zwijgregel: die kwam uit
    // computeFreedomTotal (isInfinite bij een uitgavenbasis van 0). De grondslag
    // is nu het dagtarief zelf, dat door de geloofwaardigheidsvloer op 0 valt.
    expect(
      buildSindsVorigBezoek(
        { netWorth: 110_000 },
        { at: '2026-08-23T09:00:00.000Z', netWorth: 100_000 },
        0,
        now,
      ),
    ).toBeNull()
  })

  it('een niet-eindig vermogenspeil breekt de pagina niet', () => {
    expect(
      buildSindsVorigBezoek(
        { netWorth: Infinity },
        { at: '2026-08-23T09:00:00.000Z', netWorth: 100_000 },
        DAGTARIEF,
        now,
      ),
    ).toBeNull()
  })

  it('een implausibele sprong wordt onderdrukt (eenmalige vermogenscorrectie, geen dagbeweging)', () => {
    // Van 0 naar 4× de absolute ondergrens: |delta| ≥ 365 dagen ÉN het hele
    // huidige bedrag — ruim boven een kwart van de referentieschaal.
    const currentNetWorth = FREEDOM_DELTA_MIN_DAYS * 4 * DAGTARIEF
    expect(
      buildSindsVorigBezoek(
        { netWorth: currentNetWorth },
        { at: '2026-08-23T09:00:00.000Z', netWorth: 0 },
        DAGTARIEF,
        now,
      ),
    ).toBeNull()
  })

  it('een kapotte tijdstempel breekt de pagina niet', () => {
    expect(
      buildSindsVorigBezoek(
        { netWorth: 100_000 },
        { at: 'geen-datum', netWorth: 90_000 },
        DAGTARIEF,
        now,
      ),
    ).toBeNull()
  })
})

describe('buildSindsVorigBezoek — wél een regel', () => {
  it('vooruitgang sinds gisteren, gerekend tegen het dagtarief van vandaag', () => {
    const view = buildSindsVorigBezoek(
      { netWorth: 100_300 },
      { at: '2026-08-23T09:00:00.000Z', netWorth: 100_000 },
      DAGTARIEF,
      now,
    )
    // €300 erbij ÷ €100/dag = 3 dagen.
    expect(view).toEqual({ deltaDays: 3, sinceLabel: 'gisteren' })
    expect(sindsVorigBezoekZin(view!)).toBe(
      'Tegen je huidige uitgaven kwam er sinds gisteren 3 dagen vrijheid bij.',
    )
  })

  it('achteruitgang klinkt feitelijk, niet alarmerend', () => {
    const view = buildSindsVorigBezoek(
      { netWorth: 99_700 },
      { at: '2026-08-23T09:00:00.000Z', netWorth: 100_000 },
      DAGTARIEF,
      now,
    )
    expect(view?.deltaDays).toBe(-3)
    expect(sindsVorigBezoekZin(view!)).toBe(
      'Tegen je huidige uitgaven ging er sinds gisteren 3 dagen vrijheid af.',
    )
  })

  it('één dag is enkelvoud', () => {
    const view = buildSindsVorigBezoek(
      { netWorth: 100_100 },
      { at: '2026-08-23T09:00:00.000Z', netWorth: 100_000 },
      DAGTARIEF,
      now,
    )
    expect(sindsVorigBezoekZin(view!)).toBe(
      'Tegen je huidige uitgaven kwam er sinds gisteren 1 dag vrijheid bij.',
    )
  })

  it('een duurder leven maakt dezelfde euro minder dagen waard (de wisselkoers telt)', () => {
    const goedkoop = buildSindsVorigBezoek(
      { netWorth: 101_000 },
      { at: '2026-08-23T09:00:00.000Z', netWorth: 100_000 },
      DAGTARIEF,
      now,
    )
    const duur = buildSindsVorigBezoek(
      { netWorth: 101_000 },
      { at: '2026-08-23T09:00:00.000Z', netWorth: 100_000 },
      DAGTARIEF * 2,
      now,
    )
    expect(goedkoop?.deltaDays).toBe(10)
    expect(duur?.deltaDays).toBe(5)
  })

  // De kopij benoemt de grondslag, zodat deze MARGINALE dagen nooit als de
  // TOTALE runway op de kop van dezelfde pagina gelezen worden (ADR 0126 D1).
  it('de zin benoemt de grondslag en doet geen totaal-uitspraak', () => {
    const view = buildSindsVorigBezoek(
      { netWorth: 100_300 },
      { at: '2026-08-23T09:00:00.000Z', netWorth: 100_000 },
      DAGTARIEF,
      now,
    )
    const zin = sindsVorigBezoekZin(view!)
    expect(zin).toMatch(/^Tegen je huidige uitgaven/)
    expect(zin).not.toMatch(/reikt je vermogen|als je nu zou stoppen/i)
  })
})

describe('formatSinceLabel', () => {
  it('binnen de week: de weekdagnaam', () => {
    expect(formatSinceLabel(new Date('2026-08-20T09:00:00Z'), now)).toBe('donderdag')
  })

  it('een week of langer geleden: de datum', () => {
    expect(formatSinceLabel(new Date('2026-08-12T09:00:00Z'), now)).toBe('12 augustus')
  })

  it('vandaag of in de toekomst: geen label', () => {
    expect(formatSinceLabel(new Date('2026-08-24T02:00:00Z'), now)).toBeNull()
    expect(formatSinceLabel(new Date('2026-08-25T02:00:00Z'), now)).toBeNull()
  })
})
