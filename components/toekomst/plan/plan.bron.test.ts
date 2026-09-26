/**
 * Map-brede grendels voor de Plan-bladeren (fase 1, ADR 0179).
 *
 * - Euro-weergave (ADR 0090/0093, kaart §4): een Plan-blad krijgt al gedeflateerde
 *   `view*`-feeds en deflateert nooit zelf — geen `deflate*`-aanroep, geen
 *   `inflationFactor`, geen eigen `Math.pow`-machtsverheffing.
 * - Kernantwoord (hero-fire-age): geen `fire.fireAge` / `fire.fireTarget`.
 * - Overlays (ADR 0039): geen directe BottomSheet-import.
 * - Koppen (ADR 0110): nooit een `<h1>`.
 * - Herkomst: elk bestand noemt zijn bronbereik (horizon-client @ c1b4849eb; fase 3 de Voorkeuren-view).
 */
import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const DIR = join(process.cwd(), 'components', 'toekomst', 'plan')
const bestanden = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))

function code(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*'))
    })
    .join('\n')
}

describe('Plan-bladeren — map-brede grendels', () => {
  it('vindt de bladeren (de grendel mag niet leeg draaien)', () => {
    for (const f of [
      // Fase 2: plan-hero-kop.tsx verhuisde naar het canvas (W1), plan-meldingen.tsx ging
      // op in het meldingenslot (W2).
      'plan-helpers.tsx',
      'plan-kpi-strip.tsx',
      'plan-hero-duiding.tsx',
      'plan-gegevensmelding.tsx',
      'plan-verdieping.tsx',
      'plan-kassabons.tsx',
    ]) {
      expect(bestanden).toContain(f)
    }
  })

  it.each(bestanden)('%s begint met de herkomstregel', (f) => {
    const eerste = readSourceLF(join(DIR, f)).split('\n')[0]
    // Fase 1: uit horizon-client @ c1b4849eb. Fase 3: het afbouwoverzicht kwam uit de
    // opgeheven Voorkeuren-view (resultaat hoort in Plan, spec §5).
    expect(eerste).toMatch(
      /^\/\/ Verplaatst uit (components\/app\/horizon\/horizon-client\.tsx r\d+–\d+.* @ c1b4849eb \(fase 1|components\/future\/voorkeuren-view\.tsx r\d+–\d+ @ [0-9a-f]{9} \(fase 3|components\/toekomst\/instellingen\/[\w-]+\.tsx @ [0-9a-f]{9} \(fase 6), ADR 0179\)\.$/,
    )
  })

  it.each(bestanden)('%s deflateert niet zelf', (f) => {
    const src = code(readSourceLF(join(DIR, f)))
    expect(src).not.toMatch(/\b(deflate|deflateRowsByAge|deflatePoints|deflateSeriesByOffset|factorAtAge|buildFactorByAge|buildFactorByOffset)\(/)
    expect(src).not.toMatch(/\binflationFactor\b/)
    expect(src).not.toMatch(/Math\.pow\(/)
    expect(src).not.toContain("from '@/lib/euro-display'")
  })

  it.each(bestanden)('%s draagt de euro-view-regel als het bedragen toont', (f) => {
    const src = readSourceLF(join(DIR, f))
    if (!/<MaskedAmount\b|formatMasked\w*Currency\(|\bview[A-Z]\w*/.test(code(src))) return
    expect(src.split('\n').slice(0, 3)).toContain(
      '// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf',
    )
  })

  it.each(bestanden)('%s leest het kernantwoord niet uit fire.*', (f) => {
    const src = code(readSourceLF(join(DIR, f)))
    expect(src).not.toMatch(/\bfire[?!]?\.fireAge\b/)
    expect(src).not.toMatch(/\bfire[?!]?\.fireTarget\b/)
  })

  it('de jaartabel-link consumeert PLAN_JAARTABEL_LINK uit katern-copy, geen eigen tekst', () => {
    const src = code(readSourceLF(join(DIR, 'plan-paneel.tsx')))
    expect(src).toContain('{PLAN_JAARTABEL_LINK}')
    for (const f of bestanden) {
      expect(code(readSourceLF(join(DIR, f)))).not.toMatch(/Jaar-op-jaar-tabel/i)
    }
  })

  it.each(bestanden)('%s gebruikt geen directe BottomSheet en geen <h1>', (f) => {
    const src = readSourceLF(join(DIR, f))
    expect(src).not.toMatch(/from '@\/components\/app\/bottom-sheet'/)
    expect(src).not.toMatch(/<h1[\s>]/)
  })
})

describe('plan-paneel — Doelbedrag-onderschrift volgt het bestaan van een woning (C3 punt 6)', () => {
  it('consumeert housingContext.hasEigenHuis via doelbedragOnderschrift', () => {
    const paneel = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'plan', 'plan-paneel.tsx'))
    expect(paneel).toMatch(/doelbedragOnderschrift\(\{[\s\S]*?heeftEigenHuis: initialData\.housingContext\.hasEigenHuis/)
    expect(paneel).not.toContain('FIRE_DOEL_ONDERSCHRIFT[')
  })
})

describe('plan-paneel — de levensgebeurtenissen onder het plan (ADR 0179, addendum 26 sep)', () => {
  const paneel = code(readSourceLF(join(DIR, 'plan-paneel.tsx')))

  it('rendert de bestaande GebeurtenissenMetHoofdrun met het anker #gebeurtenissen', () => {
    expect(paneel).toContain('id={GEBEURTENISSEN_ANKER}')
    expect(paneel).toContain('<GebeurtenissenMetHoofdrun {...gebeurtenissen} />')
    expect(paneel).toContain('<AnkerScroll ankers={[GEBEURTENISSEN_ANKER]} />')
    // De props komen uit de provider (de layout bouwt ze), niet uit de route (D8).
    expect(paneel).toContain('const { initialData, gebeurtenissen } = useToekomstBron()')
    expect(paneel).not.toMatch(/useSearchParams|usePathname/)
  })

  it('staat onder de KPI-strip, de voortgang en de gegevensmelding, en boven "Wat het betekent"', () => {
    const posities = ['<PlanKpiStrip', '<PlanAnkerEnVoortgang', '<PlanGegevensmelding', '<GebeurtenissenMetHoofdrun', '<PlanVerdieping'].map(
      (t) => paneel.indexOf(t),
    )
    expect(posities.every((p) => p >= 0)).toBe(true)
    expect([...posities].sort((a, b) => a - b)).toEqual(posities)
  })

  it('verbergt de lijst niet in Eenvoudig (alleen het sectielabel is Volledig-only)', () => {
    expect(paneel).not.toMatch(/<HideInSimple>\s*<div className="-mx-4 sm:-mx-6">\s*<GebeurtenissenMetHoofdrun/)
  })

  it('het gezondheid-sheet is weg: het verloop-grid was zijn enige opener', () => {
    expect(paneel).not.toMatch(/PlanKassabonGezondheid|showResilienceReceipt|resilienceSnapshots|handleActionStatusChange/)
  })
})
