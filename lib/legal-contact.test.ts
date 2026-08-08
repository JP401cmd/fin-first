/**
 * Bewaakt de belofte-kant van de juridische teksten: ze mogen geen e-mailadres
 * als bereikbaar presenteren dat niet bestaat.
 *
 * TriFinity heeft nog geen geregistreerd domein (besluit eigenaar, 5 aug 2026),
 * dus `LEGAL_CONTACT[*].address` is `null` en de pagina's tonen een placeholder.
 * Deze test faalt zodra iemand op een juridisch oppervlak weer een
 * `mailto:`-link neerzet naar een adres dat niet in LEGAL_CONTACT staat — de
 * exacte regressie die deze kaart moest wegnemen.
 *
 * De invariant blijft geldig ná domeinregistratie: dan is `address` gevuld en
 * zijn mailto-links naar precies dát adres toegestaan.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { LEGAL_CONTACT, hasLegalContactEmail } from './legal-contact'

/** Oppervlakken die een AVG-/voorwaarden-contactkanaal beloven. */
const JURIDISCHE_OPPERVLAKKEN = [
  'app/privacy/page.tsx',
  'app/voorwaarden/page.tsx',
  'app/contact/page.tsx',
  'components/mijn/ai-privacy-settings.tsx',
]

const TOEGESTANE_ADRESSEN = new Set(
  Object.values(LEGAL_CONTACT)
    .map((entry) => entry.address)
    .filter((address): address is string => address !== null),
)

describe('LEGAL_CONTACT', () => {
  it('geeft elke soort een zichtbare invulplek in [haakjes]-stijl', () => {
    for (const [kind, entry] of Object.entries(LEGAL_CONTACT)) {
      expect(entry.placeholder, kind).toMatch(/^\[.+\]$/)
    }
  })

  it('meldt eerlijk of er al een bereikbaar adres is', () => {
    expect(hasLegalContactEmail()).toBe(TOEGESTANE_ADRESSEN.size > 0)
  })
})

describe('juridische oppervlakken', () => {
  it.each(JURIDISCHE_OPPERVLAKKEN)(
    '%s linkt alleen naar een adres dat echt bestaat',
    (pad) => {
      const bron = readFileSync(pad, 'utf8')
      const gevonden = [...bron.matchAll(/mailto:([^"'`\s]+)/g)].map((m) => m[1])

      for (const adres of gevonden) {
        expect(
          TOEGESTANE_ADRESSEN.has(adres),
          `${pad} presenteert ${adres} als bereikbaar, maar dat adres staat niet ` +
            'in LEGAL_CONTACT (lib/legal-contact.ts). Zolang TriFinity geen ' +
            'geregistreerd domein heeft, hoort hier een placeholder te staan.',
        ).toBe(true)
      }
    },
  )
})
