import { describe, it, expect } from 'vitest'
import { PAGE_INFO, getPageInfo, hasPageInfo } from './page-info-content'
import { GLOSSARY_ENTRIES } from './glossary-data'

/**
 * Contract rond de verdiepte info-knop-inhoud (werking / terms / related).
 *
 * De inhoud zélf heeft bewust geen downstream-contract — de poort daarop is
 * `npm run page-info:check` plus review. Maar de VORM van de drie nieuwe velden
 * heeft er wel één, en die is met de hand niet vol te houden over ~55 entries
 * die in fasen worden bijgeschreven:
 *
 *  1. `terms` verwijst naar `GLOSSARY_ENTRIES`; een typefout in een key rendert
 *     stil een chip zonder uitleg (`PageInfoButton` filtert onbekende keys weg).
 *  2. `related.href` moet naar een bestaand oppervlak wijzen; een dode link in
 *     een uitlegsheet is erger dan geen link.
 *  3. `werking` moet een ARRAY van objecten blijven, nooit een object-map met
 *     quoted keys — `scripts/page-info/check-coverage.mjs` haalt PAGE_INFO-keys
 *     op met `^\s*'([^']+)':\s*\{` op élke inspringing en zou geneste keys als
 *     valse wees melden.
 */

const ENTRIES = Object.entries(PAGE_INFO)

describe('PAGE_INFO — vorm van de verdiepende velden', () => {
  it('elke `terms`-key bestaat in GLOSSARY_ENTRIES', () => {
    const onbekend: string[] = []
    for (const [key, content] of ENTRIES) {
      for (const term of content.terms ?? []) {
        if (!GLOSSARY_ENTRIES[term]) onbekend.push(`${key} → '${term}'`)
      }
    }
    expect(onbekend).toEqual([])
  })

  it('elke `related.href` verwijst naar een bestaande PAGE_INFO-sleutel', () => {
    // PAGE_INFO-sleutels zijn door de detector (page-info:check) bewezen
    // bereikbare oppervlakken. Wil je naar een route zónder info-entry linken,
    // schrijf die entry dan eerst — dat is de goedkoopste manier om dode
    // "Verder"-links uit de uitlegsheet te houden.
    const dood: string[] = []
    for (const [key, content] of ENTRIES) {
      for (const item of content.related ?? []) {
        if (!PAGE_INFO[item.href]) dood.push(`${key} → '${item.href}'`)
      }
    }
    expect(dood).toEqual([])
  })

  it('`werking` is een array van {title, text} met gevulde, plattetekst-velden', () => {
    for (const [key, content] of ENTRIES) {
      if (content.werking === undefined) continue
      expect(Array.isArray(content.werking), `${key}: werking moet een array zijn`).toBe(true)
      // Max 4: de sheet blijft anders een handleiding in plaats van een uitleg.
      expect(content.werking.length, `${key}: te veel werking-items`).toBeLessThanOrEqual(4)
      for (const item of content.werking) {
        expect(item.title.trim(), `${key}: leeg werking-item`).not.toBe('')
        expect(item.text.trim(), `${key}: lege werking-tekst`).not.toBe('')
        // Geen markdown: de sheet rendert platte tekst, geen parser.
        expect(item.text, `${key}: markdown in werking-tekst`).not.toMatch(/\*\*|^- |\[.+\]\(/)
      }
    }
  })

  it('geen entry linkt naar zichzelf in `related`', () => {
    const zelf = ENTRIES.filter(([key, c]) => (c.related ?? []).some((r) => r.href === key)).map(
      ([key]) => key,
    )
    expect(zelf).toEqual([])
  })
})

describe('hasPageInfo — render-guard', () => {
  it('is waar zodra één van de vijf velden gevuld is', () => {
    expect(hasPageInfo({ insight: 'x', grip: '' })).toBe(true)
    expect(hasPageInfo({ insight: '', grip: 'x' })).toBe(true)
    expect(hasPageInfo({ insight: '', grip: '', werking: [{ title: 'a', text: 'b' }] })).toBe(true)
    expect(hasPageInfo({ insight: '', grip: '', terms: ['fire'] })).toBe(true)
    expect(hasPageInfo({ insight: '', grip: '', related: [{ href: '/x', label: 'y' }] })).toBe(true)
  })

  it('is onwaar voor de lege entry uit getPageInfo', () => {
    expect(hasPageInfo(getPageInfo('/bestaat-niet'))).toBe(false)
  })
})

/**
 * De categoriepagina's (`CategoryHero`/`DebtCategoryHero`) bouwen hun sleutel
 * uit het TYPE — `/overzicht/bezittingen/${type}` — met de categorie-entry als
 * terugval. Dat is de plek waar besluit 9 stilletjes kan stukgaan: een
 * hernoemd type of een verwijderde entry laat de knop niet verdwijnen, hij gaat
 * alleen ineens de algemene tekst tonen. Deze test pint de resolutie zelf.
 */
describe('categorie-detail: sleutel uit het type, met terugval', () => {
  it('geeft een type met eigen entry zijn eigen tekst', () => {
    const hypotheek = getPageInfo('/overzicht/schulden/mortgage', '/overzicht/schulden')
    expect(hypotheek).toBe(PAGE_INFO['/overzicht/schulden/mortgage'])
    expect(hypotheek).not.toBe(PAGE_INFO['/overzicht/schulden'])

    const huis = getPageInfo('/overzicht/bezittingen/eigen_huis', '/overzicht/bezittingen')
    expect(huis).toBe(PAGE_INFO['/overzicht/bezittingen/eigen_huis'])
  })

  it('valt voor een type zonder eigen entry terug op de categorie', () => {
    expect(getPageInfo('/overzicht/schulden/personal_loan', '/overzicht/schulden')).toBe(
      PAGE_INFO['/overzicht/schulden'],
    )
    expect(getPageInfo('/overzicht/bezittingen/vehicle', '/overzicht/bezittingen')).toBe(
      PAGE_INFO['/overzicht/bezittingen'],
    )
  })

  it('levert altijd renderbare inhoud, dus de knop verdwijnt nooit', () => {
    for (const type of ['mortgage', 'personal_loan', 'student_loan', 'other']) {
      expect(hasPageInfo(getPageInfo(`/overzicht/schulden/${type}`, '/overzicht/schulden'))).toBe(true)
    }
    for (const type of ['cash', 'investment', 'eigen_huis', 'retirement', 'crypto', 'other']) {
      expect(hasPageInfo(getPageInfo(`/overzicht/bezittingen/${type}`, '/overzicht/bezittingen'))).toBe(
        true,
      )
    }
  })

  it('geeft de rekenhulp een eigen entry (was de derde route zonder knop)', () => {
    expect(hasPageInfo(getPageInfo('/toekomst/rekenhulp'))).toBe(true)
  })
})


/**
 * UR3-13 F2 — "koppelingen": elke begripsentry heeft een consument.
 *
 * F1 liet de begrippenlijst sluitend achter (64 entries), maar 26 daarvan
 * stonden zónder enige call site: de uitleg bestond, maar was vanaf het scherm
 * niet te bereiken. F2 hangt die entries aan de `i` van de pagina waar het
 * woord staat.
 *
 * Waarom dit hier als test staat en niet alleen in `npm run glossary:check`:
 * die scan meldt een wees-entry bewust als WAARSCHUWING (exit 0), zodat nieuw
 * jargon eerst als entry mag landen. Daardoor kan een latere bewerking deze 24
 * koppelingen stilletjes weer losknippen zonder dat één poort rood wordt. Deze
 * test pint precies de koppelingen die F2 legde — hij vervangt de scan niet,
 * hij houdt de uitkomst ervan vast.
 */
const F2_GEKOPPELD = [
  // Leenwoorden die aan de bron hernoemd zijn (optie C) — de entry blijft
  // bestaan voor wie het Engelse woord elders tegenkomt.
  'forecast',
  'optimizer',
  'YTD',
  // Grafiek- en tijdas-taal.
  'bandbreedte',
  'omslagpunt',
  'kassabon',
  // De plan-regel: stop-anker (4) + eind-vorm (3) + het overkoepelende begrip.
  'stopmoment',
  'stopanker_solved',
  'stopanker_aow',
  'stopanker_age',
  'stopanker_now',
  'eindstrategie_deplete',
  'eindstrategie_legacy',
  'eindstrategie_perpetual',
  // Beleggen, pensioen en fiscaal.
  'ETF',
  'ter',
  'ISIN',
  'rebalancing',
  'AOW',
  'SORR',
  'aanmerkelijk_belang',
  'inclusiepercentage',
  // App-eigen begrippen die alleen als dode entry bestonden.
  'soevereiniteit',
  'will',
] as const

describe('PAGE_INFO — UR3-13 F2: de gekoppelde begrippen blijven gekoppeld', () => {
  const gechipt = new Set(Object.values(PAGE_INFO).flatMap((c) => c.terms ?? []))

  it.each(F2_GEKOPPELD)('%s hangt aan minstens één BEGRIPPEN-chip', (term) => {
    expect(gechipt.has(term)).toBe(true)
  })

  it('koppelt alleen bestaande entries — een hernoemde key valt hier om', () => {
    for (const term of F2_GEKOPPELD) {
      expect(GLOSSARY_ENTRIES[term], `ontbrekende entry: ${term}`).toBeTruthy()
    }
  })
})
