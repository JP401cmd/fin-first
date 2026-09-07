import { describe, it, expect } from 'vitest'
import { HEFBOOM_CONFIG, type Hefboom } from './hefboom-config'

/**
 * Vangrail voor de kleurconventie uit CLAUDE.md: module-identiteit loopt via
 * `kern-*` / `wil-*` / `horizon-*` / `fin-*`, nooit via Tailwind-standaard-
 * kleuren of losse hexen.
 *
 * Aanleiding (UR3-32): de vier hefbomen droegen jarenlang emerald / amber /
 * sky / violet als identiteitstint. Gemeten in OKLCH stond Bezittingen daarmee
 * op 3,1 graden van het "op koers"-groen uit `lib/leverage-status.ts` — op
 * dezelfde tegel als de statusdot — had Schulden exact de hex van
 * `--color-box1-700`, en zat Belasting 0,4 graad van box2. Identiteit en
 * status waren dus niet meer uit elkaar te houden.
 *
 * Deze test is er om te voorkomen dat dat terugglijdt.
 */

const TAILWIND_FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
]

const HEFBOMEN = Object.keys(HEFBOOM_CONFIG) as Hefboom[]

describe('HEFBOOM_CONFIG.tint — geen Tailwind-standaardkleuren voor identiteit', () => {
  it.each(HEFBOMEN)('%s draagt geen Tailwind-kleurfamilie', (hefboom) => {
    const tint = HEFBOOM_CONFIG[hefboom].tint
    for (const familie of TAILWIND_FAMILIES) {
      expect(
        tint,
        `hefboom "${hefboom}" gebruikt de Tailwind-familie "${familie}" voor module-identiteit`,
      ).not.toMatch(new RegExp(`-${familie}-\\d`))
    }
  })

  it.each(HEFBOMEN)('%s draagt geen losse hex', (hefboom) => {
    expect(HEFBOOM_CONFIG[hefboom].tint).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })

  it('de drie hefbomen met een eigen accent wijzen naar hun accenttoken', () => {
    // Vaste toewijzing (UR3-32): Bezittingen = kern, Schulden = wil,
    // Budget = horizon. Diezelfde drie slots kleuren Fins gezicht —
    // linkeroog, rechteroog en onderste stip (components/app/fin-dots.tsx).
    expect(HEFBOOM_CONFIG.bezittingen.tint).toContain('kern-')
    expect(HEFBOOM_CONFIG.schulden.tint).toContain('wil-')
    expect(HEFBOOM_CONFIG.cashflow.tint).toContain('horizon-')
  })

  it('Belasting is bewust neutraal — daar draagt de box-triade de kleur', () => {
    expect(HEFBOOM_CONFIG.belasting.tint).toContain('var(--ink)')
    expect(HEFBOOM_CONFIG.belasting.tint).not.toMatch(/box[123]/)
  })
})
