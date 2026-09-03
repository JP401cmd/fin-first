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
