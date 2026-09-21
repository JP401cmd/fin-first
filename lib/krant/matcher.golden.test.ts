// ── Golden tests: vijf persona's × één artikelfixture = vijf vastgelegde edities
//
// Zelfde profiel + artikelen + context + matcherversie = zelfde editie. De
// goldens in lib/krant/__golden__/ zijn de referentie voor de K1-meting
// ("geen fout getal"): elk gerenderd bedrag daarin is met de hand herleid
// uit band × engine (impact.test.ts legt dezelfde sommen vast). Wijkt een
// golden af, dan is dat óf een bewuste regelwijziging (bump MATCHER_VERSIE of
// SJABLOON_VERSIE en regenereer met `npx vitest run lib/krant/matcher.golden
// -u`), óf een regressie.

import { describe, expect, it } from 'vitest'
import { standaardImpactContext } from './impact'
import { matchEditie, type MatchContext } from './matcher'
import { AOW_RIJEN, ARTIKELEN, NU, PERSONA_PROFIELEN } from './editie.fixture'

/** Per persona de lezerscontext: Willem zei "minder" over pensioen, Marijke zag het inflatiecijfer al. */
const CONTEXT: Record<keyof typeof PERSONA_PROFIELEN, Pick<MatchContext, 'gezienArtikelIds' | 'gedemptRubrieken'>> = {
  daan: { gezienArtikelIds: new Set(), gedemptRubrieken: new Set() },
  lisa: { gezienArtikelIds: new Set(), gedemptRubrieken: new Set() },
  willem: { gezienArtikelIds: new Set(), gedemptRubrieken: new Set(['pensioen']) },
  marijke: { gezienArtikelIds: new Set(['a11-inflatie']), gedemptRubrieken: new Set() },
  tessa: { gezienArtikelIds: new Set(), gedemptRubrieken: new Set() },
}

function editieVoor(naam: keyof typeof PERSONA_PROFIELEN) {
  return matchEditie(PERSONA_PROFIELEN[naam], ARTIKELEN, {
    now: NU,
    impact: standaardImpactContext(AOW_RIJEN, NU.getUTCFullYear()),
    ...CONTEXT[naam],
  })
}

describe('matcher — golden edities per persona', () => {
  for (const naam of Object.keys(PERSONA_PROFIELEN) as (keyof typeof PERSONA_PROFIELEN)[]) {
    it(`${naam}: dezelfde invoer geeft byte-dezelfde editie, gelijk aan de golden`, async () => {
      const een = JSON.stringify(editieVoor(naam), null, 2)
      const twee = JSON.stringify(editieVoor(naam), null, 2)
      expect(een).toBe(twee)
      await expect(een).toMatchFileSnapshot(`./__golden__/${naam}.json`)
    })
  }

  it('de vijf profieltypes verschillen en minstens drie persona’s krijgen een gevulde editie', () => {
    const edities = (Object.keys(PERSONA_PROFIELEN) as (keyof typeof PERSONA_PROFIELEN)[]).map(editieVoor)
    expect(new Set(edities.map((e) => e.profielType)).size).toBe(5)
    expect(edities.filter((e) => !e.leeg).length).toBeGreaterThanOrEqual(3)
  })
})
