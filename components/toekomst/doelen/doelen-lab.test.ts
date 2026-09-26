import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * Bron-grendels op het Doelen-lab (blok M + P, kaart §5.1) na de pure kopie uit
 * `components/app/horizon/horizon-client.tsx` @ c1b4849eb (fase 1, ADR 0179).
 *
 * Deze tests pinnen dezelfde invarianten als de horizon-client-tests, maar op het
 * NIEUWE bestand:
 *  - doel-loslaten-terugweg (props-deel, B-031)
 *  - lab-uitkomst (JSX-deel, ADR 0145/0170)
 *  - nu-stoppen (stop-knop + verwijzing naar de plan-keuzes, TPR-09/B-038)
 *  - ADR 0179 B10: de knoppen dragen `vraag={heroVraag}`
 *  - euro-view: het lab deflateert niets zelf (ADR 0090/0093)
 * De afleidingen zelf (`const verkenSectieZichtbaar =`, de promotie-gates, de
 * grenzen-batch) blijven tot de provider-stap in horizon-client en worden daar
 * gepind; de integrator schrapt de JSX-assertions daar bij het inpluggen.
 */

const LAB = join(process.cwd(), 'components', 'toekomst', 'doelen', 'doelen-lab.tsx')
const SHEETS = join(process.cwd(), 'components', 'toekomst', 'doelen', 'doelen-lab-sheets.tsx')

function codeOnly(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('{/*')
    })
    .join('\n')
}

describe('doelen-lab — herkomst', () => {
  it('draagt de verplaats-kop met bronbereik en commit', () => {
    expect(readSourceLF(LAB)).toContain(
      '// Verplaatst uit components/app/horizon/horizon-client.tsx r7562–7653 @ c1b4849eb (fase 1, ADR 0179).',
    )
    expect(readSourceLF(SHEETS)).toContain(
      '// Verplaatst uit components/app/horizon/horizon-client.tsx r7786–7831 @ c1b4849eb (fase 1, ADR 0179).',
    )
  })
})

describe('doelen-lab — terugweg na "Doel loslaten" (B-031, props-deel)', () => {
  it('de sectie hangt uitsluitend aan de ene afleiding `verkenSectieZichtbaar`', () => {
    const src = readSourceLF(LAB)
    expect(src).toContain('{verkenSectieZichtbaar && (')
    expect(src).toContain('verkenSectieZichtbaar: boolean')
    const code = codeOnly(src)
    // Geen eigen weergave-/doel-gate in het lab: loslaten mag de weg terug niet afsluiten.
    expect(code).not.toContain('doelActief')
    expect(code).not.toContain('displayMode')
    expect(code).not.toContain('doelLosgelatenDezeSessie')
  })

  it('de opslaan-balk krijgt de twee promotie-gates als props', () => {
    const src = readSourceLF(LAB)
    expect(src).toContain('vastleggenMogelijk={doelVastleggenMogelijk}')
    expect(src).toContain('bijwerkenMogelijk={doelBijwerkenMogelijk}')
    expect(src).toContain('onLoslaten={() => setDoelLoslatenOpen(true)}')
  })
})

describe('doelen-lab — één lab-uitkomst (JSX-deel)', () => {
  it('de balk hangt aan de toestand uit de parent, niet aan (hasScenario || hasStopKeuze)', () => {
    const code = codeOnly(readSourceLF(LAB))
    expect(code).toContain('<LabOpslaanBalk')
    expect(code).toContain('toestand={labOpslaanToestand}')
    expect(code).not.toContain('hasScenario')
    expect(code).not.toContain('hasStopKeuze')
  })

  it('pending gaat naar de knoppen en de knoppen berekenen niets zelf', () => {
    const code = codeOnly(readSourceLF(LAB))
    expect(code).toContain('pending={labGrenzenPending}')
    expect(code).toContain('knoppen={labKnoppen}')
    expect(code).toContain('uitkomst={labUitkomstRegel}')
    expect(code).not.toMatch(/computeRunwayCoveragePct|eindMaand|solveFire|bisect|Math\.pow/)
    expect(code).not.toMatch(/\/\s*12\b/)
  })

  it('ADR 0179 B10 — de knoppen dragen de hero-vraag', () => {
    expect(readSourceLF(LAB)).toContain('vraag={heroVraag}')
  })
})

describe('doelen-lab — stopkeuze (nu-stoppen, TPR-09)', () => {
  it('de stop-knop verschijnt alleen als de knop van het plan afwijkt, en opent de bevestiging', () => {
    const src = readSourceLF(LAB)
    expect(src).toContain('{!planIsDezeStop && (')
    expect(src).toContain('setStopPlanConfirmOpen(true)')
  })

  it('de verwijzing naar álle plan-keuzes opent de strategie-modal', () => {
    const src = readSourceLF(LAB)
    expect(src).toContain("onClick={() => setActiveModal('strategie')}")
    expect(src).toContain('Je plan-keuzes')
  })

  it('het lab schrijft zelf geen plan — het schrijfpad blijft in de parent-handler', () => {
    const code = codeOnly(readSourceLF(LAB) + '\n' + readSourceLF(SHEETS))
    expect(code).not.toContain('fetch(')
    expect(code).not.toMatch(/fire_stop_anchor/)
    expect(readSourceLF(SHEETS)).toContain('onConfirm={handleStopPlanBevestigen}')
  })
})

describe('doelen-lab-sheets — vastleggen en loslaten', () => {
  it('de sheet krijgt de weergave-previews en het promotie-soort', () => {
    const src = readSourceLF(SHEETS)
    expect(src).toContain('previews={viewDoelPreviews}')
    expect(src).toContain("labPromotie.kind === 'eindvermogen'")
    expect(src).toContain('onSubmit={handleDoelVastleggen}')
  })

  it('"Doel loslaten" loopt via de gedeelde confirm; fouten gaan via de toast (error="")', () => {
    const src = readSourceLF(SHEETS)
    expect(src).toContain('<DoelLoslatenConfirm')
    expect(src).toContain('error=""')
    expect(src).toContain('onConfirm={handleDoelLoslaten}')
  })
})

describe('doelen-lab — euro-weergave en overlay-standaard', () => {
  it('deflateert niets zelf en leest geen inflationFactor (ADR 0090/0093)', () => {
    for (const p of [LAB, SHEETS]) {
      const code = codeOnly(readSourceLF(p))
      expect(code, p).not.toMatch(/\b(deflate|deflateRowsByAge|deflatePoints|deflateSeriesByOffset)\(/)
      expect(code, p).not.toContain('inflationFactor')
      expect(code, p).not.toContain('useEuroView')
    }
  })

  it('draagt een euro-view-regel in de kop', () => {
    for (const p of [LAB, SHEETS]) expect(readSourceLF(p), p).toMatch(/^\/\/ euro-view: /m)
  })

  it('geen directe BottomSheet en geen hand-rolled fixed inset-0 (ADR 0039)', () => {
    for (const p of [LAB, SHEETS]) {
      const code = codeOnly(readSourceLF(p))
      expect(code, p).not.toContain('bottom-sheet')
      expect(code, p).not.toContain('fixed inset-0')
    }
  })
})
