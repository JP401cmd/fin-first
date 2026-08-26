import { createElement } from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { Box3Peildatum } from '@/components/overview/belasting/box3-peildatum'
import { BOX3_TOOLTIPS } from './box3-data'
import { PATH_SUGGESTIONS } from './coach-suggestions'
import { TAX_DEADLINES } from './tax-calendar'
import { PAGE_STATUS_COPY, fillFigure } from './page-status/copy'
import { computeLeverScores } from './lever-scores'
import { PERSONAS } from './test-personas'
import { aandachtspuntToActionPayload, type Aandachtspunt } from './aandachtspunten'

/**
 * Wft-copy-grendel (bevinding H24).
 *
 * De vier passages uit het bevindingenregister waren met de hand geschreven,
 * gebruikersgerichte financiële copy die van "dit zijn je opties" naar "doe
 * dit" gleed. Ze vielen buiten alle drie de bestaande Wft-disciplines
 * (`lib/ai/dna/base.ts`, `lib/ai/dna/wil.ts`, `lib/tax-optimizer/compliance.ts`)
 * omdat die elk alleen hun eigen oppervlak bewaken — AI-chat resp. de
 * optimizer-katernen. Statische copy had geen enkele grendel.
 *
 * Deze suite is die grendel voor de vier herschreven plekken. Hij toetst twee
 * dingen per passage: dat de imperatieve formulering wég is, én dat de
 * beschrijvende vervanger er staat — anders zou "tekst helemaal weghalen" ook
 * groen zijn.
 *
 * De grens die we bewaken: inzicht tonen mag, een aansporing tot een concrete
 * geldhandeling niet. Zie `.claude/skills/compliance-check/SKILL.md`.
 */

/**
 * Formuleringen die op deze oppervlakken niet thuishoren. Bewust kort en
 * letterlijk: een breed "imperatief-detectie"-lexicon geeft vals alarm op
 * legitieme navigatietekst ("Bekijk je Box 3-overzicht") en verliest dan zijn
 * waarde als poort.
 */
const VERBODEN_FORMULERINGEN: { patroon: RegExp; waarom: string }[] = [
  { patroon: /\baanbevolen\b/i, waarom: 'een aanbeveling doen over een geldkeuze' },
  { patroon: /\bmeer belasting dan nodig\b/i, waarom: 'niet hard te maken bewering' },
  { patroon: /\bbenut hem vóór\b/i, waarom: 'aansporing met deadline tot een productstorting' },
  { patroon: /\btime je dividend\b/i, waarom: 'instructie over het moment van een geldhandeling' },
  { patroon: /\bIndepender\b|\bHypotheker\b|\bMeesman\b/i, waarom: 'noemt een specifieke aanbieder' },
  { patroon: /\bbreed gespreid indexfonds\b/i, waarom: 'noemt een specifiek productadvies' },
  { patroon: /\blevert dit significant meer op\b/i, waarom: 'rendementsbelofte' },
]

function toetsVrijVan(tekst: string, herkomst: string) {
  for (const { patroon, waarom } of VERBODEN_FORMULERINGEN) {
    expect(
      patroon.test(tekst),
      `${herkomst} bevat een Wft-gevoelige formulering (${waarom}): ${tekst}`,
    ).toBe(false)
  }
}

describe('H24 — passage 1: Box 3 peildatum-katern', () => {
  // Dit is de passage die de bevinding letterlijk citeert. We renderen het
  // katern echt, want de zin die niet terug mag komen staat in de JSX — niet
  // in een exporteerbare copy-tabel.
  function katernTekst(): string {
    const { container } = render(createElement(Box3Peildatum, { year: 2026 }))
    return container.textContent ?? ''
  }

  it('spoort niet meer aan om rond de jaarwisseling tussen spaargeld en beleggen te schuiven', () => {
    const tekst = katernTekst()
    // De kern van de bevinding: een instructie over WANNEER te schuiven raakt
    // beleggingsdienstverlening, niet fiscale voorlichting.
    expect(tekst).not.toMatch(/spaargeld aanhouden in plaats van beleggen/i)
    expect(tekst).not.toMatch(/verlaagt tijdelijk je heffing/i)
    toetsVrijVan(tekst, 'Box3Peildatum (gerenderd)')
  })

  it('legt in plaats daarvan uit hoe de meting werkt en waarom de regel bestaat', () => {
    const tekst = katernTekst()
    expect(tekst).toMatch(/gemeten op/i)
    expect(tekst).toMatch(/bepaalt je grondslag voor het hele jaar/i)
    expect(tekst).toMatch(/daarom bestaat er een antimisbruikregel/i)
  })

  it('de bijbehorende tooltip-bron blijft eveneens beschrijvend', () => {
    toetsVrijVan(BOX3_TOOLTIPS.peildatum, 'BOX3_TOOLTIPS.peildatum')
    expect(BOX3_TOOLTIPS.peildatum).toMatch(/bepaalt je belasting/i)
  })

  it('de fiscale kalender spoort niet aan geldhandelingen op de peildatum te timen', () => {
    // Vijfde vindplaats van dezelfde grensovergang, buiten de vier uit de PDF:
    // deze deadline-tekst zei "Plan grote aankopen of stortingen rondom deze
    // datum".
    const peildatum = TAX_DEADLINES.find((d) => d.id === 'box3-peildatum')
    expect(peildatum, 'de peildatum-deadline bestaat nog').toBeDefined()
    expect(peildatum!.description).not.toMatch(/plan grote aankopen|stortingen rondom/i)
    expect(peildatum!.description).toMatch(/antimisbruikregel/i)
    toetsVrijVan(peildatum!.description, 'TAX_DEADLINES#box3-peildatum')
  })
})

describe('H24 — passage 2: zwevende tips (CoachBubble)', () => {
  const belastingRegels = PATH_SUGGESTIONS.filter((r) =>
    r.pathPrefix.startsWith('/overzicht/belasting'),
  )

  it('dekt de belasting-paden die de bevinding noemt', () => {
    const keys = belastingRegels.map((r) => r.key)
    expect(keys).toContain('path_belasting_box1')
    expect(keys).toContain('path_belasting_box2')
  })

  it.each(belastingRegels.map((r) => [r.key, r.suggestion.message] as const))(
    '%s is beschrijvend, niet gebiedend',
    (key, message) => {
      toetsVrijVan(message, `PATH_SUGGESTIONS.${key}`)
    },
  )

  it('de Box 1-bubble legt uit wat jaarruimte is in plaats van te sporen', () => {
    const box1 = belastingRegels.find((r) => r.key === 'path_belasting_box1')!
    expect(box1.suggestion.message).toMatch(/pensioenruimte/i)
    expect(box1.suggestion.message).toMatch(/vervalt na 31 december/i)
  })

  it('de Box 2-bubble noemt geen los bedrag als fiscale constante', () => {
    const box2 = belastingRegels.find((r) => r.key === 'path_belasting_box2')!
    // Fiscale grenzen horen uit lib/constants.ts te komen, niet uit copy.
    expect(box2.suggestion.message).not.toMatch(/€\s?\d/)
    expect(box2.suggestion.message).toMatch(/leengrens/i)
  })
})

describe('H24 — passage 3: status-banner op de belasting-hub', () => {
  const route = PAGE_STATUS_COPY['/overzicht/belasting']

  it('bestaat nog op dit pad', () => {
    expect(route).toBeDefined()
  })

  it.each(['warn', 'bad'] as const)('%s-copy is beschrijvend', (status) => {
    const sc = route[status]!
    toetsVrijVan(sc.reason, `PAGE_STATUS_COPY['/overzicht/belasting'].${status}.reason`)
    toetsVrijVan(sc.remedy, `PAGE_STATUS_COPY['/overzicht/belasting'].${status}.remedy`)
  })

  it('benoemt de grondslag in plaats van een oordeel te vellen', () => {
    expect(route.bad!.reason).toMatch(/heffingsvrije voet/i)
    expect(route.warn!.reason).toMatch(/Box 3-heffing/i)
  })

  it('de {figure} die de banner invult draagt geen aanbeveling', () => {
    // Dit is de naad waar de bevinding ontstond: reason + {figure} vormden
    // samen het letterlijke citaat uit de PDF. Beide helften toetsen, én de
    // samengestelde zin.
    const scores = computeLeverScores({
      totalAssets: 800_000,
      totalDebts: 0,
      assetTypeCount: 3,
      savingsRate: 20,
      box3TaxableAboveThreshold: 250_000,
      householdType: 'samen', // partner + boven €100k = de tak uit de bevinding
    })
    toetsVrijVan(scores.tax.detail, 'computeLeverScores().tax.detail')

    const samengesteld = fillFigure(route.bad!.reason, scores.tax.detail)
    toetsVrijVan(samengesteld, 'banner-zin (reason + figure)')
    expect(samengesteld).toContain(scores.tax.detail)
  })
})

describe('H24 — passage 4: open acties uit persona Lisa', () => {
  // Deze fixtures worden op /overzicht/tips verbatim gerenderd zodra de
  // persona via /beheer/testdata geladen is. Demo-copy is zichtbare copy.
  const lisa = PERSONAS.lisa
  const recs = lisa.recommendations ?? []

  it('heeft nog aanbevelingen om te toetsen', () => {
    expect(recs.length).toBeGreaterThan(0)
  })

  it('geen enkele aanbeveling, suggestie of actie noemt een product of aanbieder', () => {
    for (const rec of recs) {
      toetsVrijVan(rec.title, `lisa.recommendations[].title`)
      toetsVrijVan(rec.description, `lisa.recommendations[].description`)
      for (const sa of rec.suggested_actions ?? []) {
        toetsVrijVan(sa.title, `lisa…suggested_actions[].title`)
      }
      for (const a of rec.actions ?? []) {
        toetsVrijVan(a.title, `lisa…actions[].title`)
        if (a.description) toetsVrijVan(a.description, `lisa…actions[].description`)
      }
    }
  })

  it('de twee herschreven aanbevelingen framen een afweging, geen opdracht', () => {
    const hypotheek = recs.find((r) => /hypotheekrente/i.test(r.title))
    expect(hypotheek, 'de hypotheek-aanbeveling bestaat nog').toBeDefined()
    expect(hypotheek!.description).toMatch(/renteverschil/i)

    const studie = recs.find((r) => /studiefonds/i.test(r.title))
    expect(studie, 'de studiefonds-aanbeveling bestaat nog').toBeDefined()
    expect(studie!.description).toMatch(/risico/i)
  })
})

describe('H24 — de knop is de grensovergang', () => {
  /**
   * De bevinding wees terecht aan dat "Toevoegen als actie" een optie in een
   * aanbeveling-met-opvolging verandert. `aandachtspuntToActionPayload` stelt
   * de beschrijving daarom zélf samen uit besparing/vrijheidsdagen/deadline/
   * bron-link, en leest `a.description` NIET uit.
   *
   * Dat huidige gedrag is het veilige gedrag. Deze test legt het vast zodat een
   * toekomstige "fix" die de description alsnog doorkoppelt, opvalt — dat zou
   * de bug juist verergeren in plaats van oplossen.
   */
  it('negeert een meegegeven description volledig', () => {
    const punt: Aandachtspunt = {
      id: 'tax:box1-jaarruimte',
      domain: 'tax',
      title: 'Benut je jaarruimte (lijfrente-inleg)',
      description: 'Stort €12.000 in een lijfrente om in 2026 af te trekken van Box 1.',
      savings: 4800,
      freedomDays: 42,
      deadline: '31 dec',
      href: '/overzicht/belasting/box1',
    }

    const payload = aandachtspuntToActionPayload(punt)

    expect(payload.description).not.toContain('Stort')
    expect(payload.description).not.toContain('lijfrente')
    expect(payload.description).not.toBe(punt.description)
    // …en bouwt wél de deterministische, beschrijvende variant op.
    expect(payload.description).toContain('4.800')
    expect(payload.description).toContain('vrijheidsdagen')
    expect(payload.description).toContain('/overzicht/belasting/box1')
  })
})
