import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PLAN_REVIEW_HREF, PLAN_REVIEW_PARAM } from './types'

/**
 * De review-deeplink wijst naar katern Instellingen (ADR 0179, fase 1 stroom R).
 *
 * Drie dingen moeten samen kloppen, anders is de link een stille dode ingang:
 *  1. de constante zelf;
 *  2. de ⌘K-ingang, die hem bewust als LITERAL draagt (de route-dekkingstest leest
 *     `navigation-index.ts` letterlijk) en dus stil kan achterlopen;
 *  3. de doelpagina montert een `PlanReviewProvider`, en die leest `?planreview=`.
 */
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('PLAN_REVIEW_HREF — de review-deeplink landt op Instellingen', () => {
  it('wijst naar /toekomst/instellingen?planreview=open', () => {
    expect(PLAN_REVIEW_HREF).toBe(`/toekomst/instellingen?${PLAN_REVIEW_PARAM}=open`)
  })

  it('de ⌘K-literal loopt in de pas met de constante', () => {
    expect(read('lib/command-palette/navigation-index.ts')).toContain(`href: '${PLAN_REVIEW_HREF}'`)
  })

  it('de doelroute montert de PlanReviewProvider, en die leest de deeplink', () => {
    const doel = PLAN_REVIEW_HREF.split('?')[0].replace(/^\/toekomst/, '')
    // Vandaag `toekomst/instellingen/page.tsx`; na stap 15/17 in de `(katern)`-groep,
    // waar de provider ook in de gedeelde layout kan wonen.
    const kandidaten = [
      `app/(app)/toekomst${doel}/page.tsx`,
      `app/(app)/toekomst/(katern)${doel}/page.tsx`,
      'app/(app)/toekomst/(katern)/layout.tsx',
    ]
    const bronnen = kandidaten.flatMap((rel) => {
      try {
        return [read(rel)]
      } catch {
        return []
      }
    })
    expect(bronnen.length, `geen page.tsx voor ${doel}`).toBeGreaterThan(0)
    expect(bronnen.some((code) => code.includes('<PlanReviewProvider'))).toBe(true)

    const provider = read('components/future/plan-review/plan-review-provider.tsx')
    expect(provider).toMatch(/searchParams\.get\(PLAN_REVIEW_PARAM\)/)
  })
})
