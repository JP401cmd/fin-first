/**
 * Bron-grendel op de gegevensmelding van de /toekomst-KPI-rij (bevinding UR2-05).
 *
 * WAT ER MISGING: op een profiel zonder inkomen, bezit of schuld toonde de
 * "Doelbedrag"-tegel eerlijk "We missen gegevens — We kunnen je doelbedrag nog
 * niet berekenen", terwijl de tegels pal ernaast met exact hetzelfde
 * typografische gewicht een vrijheidsleeftijd van 83 en een uitgave ná pensioen
 * van € 25.200 neerzetten. Eén ontbrekende grondslag, drie verschillende
 * beloftes op één rij — en de twee getallen waren terugvallen, geen metingen.
 *
 * WAAROM EEN BRON-TEST EN GEEN RENDER-TEST: `horizon-client.tsx` is >9000
 * regels; een render-test bewijst één opgestelde situatie, niet dat er nérgens
 * een vierde tegel bijkomt die de melding weer met de hand uitschrijft of
 * helemaal overslaat. Precies dát was de fout: de melding bestond al, maar
 * alleen als gekopieerde markup op één tegel. Dus lezen we de bron en eisen we
 * (a) dat elke tegel een guard toetst en (b) dat er precies één vorm is.
 * (Precedent: `horizon-client.hero-fire-age.test.ts` en
 * `horizon-client.euro-view.test.ts` lezen de bron óók letterlijk.)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')
const source = readFileSync(SOURCE_PATH, 'utf8')

/** Desktop-strip + mobiele 2×2-strip, dus elke tegel telt twee keer. */
const LAYOUTS = 2

describe('horizon-client — elke hero-KPI toetst zijn eigen brondata', () => {
  it('consumeert de gedeelde guards uit outcome-guard.ts', () => {
    expect(source).toContain("from '@/lib/horizon/outcome-guard'")
    for (const guard of ['guardFireTarget(', 'guardFreedomMoment(', 'guardRetirementExpense(']) {
      expect(source, `${guard} hoort de bron van zijn tegel te toetsen`).toContain(guard)
    }
  })

  it('heeft voor alle drie de tegels een melding-conditie', () => {
    for (const flag of [
      'const showFireTargetNotice =',
      'const showFireAgeNotice =',
      'const showRetirementExpenseNotice =',
    ]) {
      expect(source).toContain(flag)
    }
  })

  it('rendert de melding op elke tegel in beide layouts', () => {
    const treffers = source.match(/<HeroKpiNotice\b/g) ?? []
    expect(
      treffers,
      'drie tegels × desktop/mobiel — een tegel die de melding overslaat verlaagt dit getal',
    ).toHaveLength(3 * LAYOUTS)
    // De mobiele strip draagt de compacte variant: 3 van de 6.
    const compact = source.match(/<HeroKpiNotice[^/>]*\bcompact\b/g) ?? []
    expect(compact).toHaveLength(3)
  })

  it('kent precies één vorm — geen tegel schrijft de melding zelf uit', () => {
    // De KOP hoort uitsluitend ín HeroKpiNotice (of als gedeelde constante in de
    // kassabons) te staan; een tegel die 'm zelf uitschrijft is de kopie-de-markup
    // -route die de bevinding veroorzaakte.
    for (const g of ['fireTargetGuard', 'retirementExpenseGuard', 'fireAgeNoticeGuard']) {
      expect(source.match(new RegExp(`\\b${g}\\.label\\b`, 'g')) ?? [], g).toHaveLength(0)
    }
    // De twee kassabons tonen de UITLEG wél los (andere vorm: een blok bovenaan
    // de bon) — precies één keer elk, en nooit met een eigen tekst.
    expect(source.match(/\bfireAgeNoticeGuard\.hint\b/g) ?? []).toHaveLength(1)
    expect(source.match(/\bfireTargetGuard\.hint\b/g) ?? []).toHaveLength(1)
    expect(source.match(/\bretirementExpenseGuard\.hint\b/g) ?? []).toHaveLength(0)
  })

  it('haalt de woorden uit outcome-guard, nooit uit een lokale string', () => {
    // De kop staat exact één keer in het bestand: als import-naam. Een letterlijke
    // "We missen gegevens" in de markup zou de app-brede formulering laten driften.
    expect(source).not.toMatch(/['"`]We missen gegevens/)
    expect(source).toContain('HORIZON_MISSENDE_GEGEVENS_LABEL')
  })
})

describe('horizon-client — de melding verdringt geen geldig antwoord', () => {
  it('laat de rekenende kernel met rust ("···" blijft, geen gegevensmelding)', () => {
    // Zolang de kernel rekent is er geen gegevensprobleem maar een lege hand.
    expect(source).toMatch(/showFireAgeNotice =[\s\S]{0,400}heroFireAge\.status !== 'berekenen'/)
  })

  it('houdt de duidingszin stil zodra de tegel een melding draagt', () => {
    // Anders staat er "rond je 83e" pal onder "We missen gegevens".
    expect(source).toMatch(/pending:[\s\S]{0,200}showFireAgeNotice/)
  })
})
