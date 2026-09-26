/**
 * Opgeruimd in fase 2 (ADR 0179 D6, stroom W2): de drie losse notice-providers met hun
 * statuspunten in de paginakop, de EindsituatieNotice en het meldingenblok boven de
 * grafiek (`plan-meldingen.tsx`) gingen op in het meldingenslot per katern. Deze grendel
 * bewaakt dat ze weg blijven en dat niets er nog naar verwijst (geen dode imports).
 *
 * De oude pref-sleutels (`/toekomst/tekort-lening|aow-ontbreekt|eindsituatie`) blijven
 * bewust in de schrijf-allowlist van `lib/page-status/compute.ts` en hun
 * `lib/horizon/*-minimize.ts`-modules bestaan nog (de UAT-checks lezen ze); de
 * JSONB-waarden mogen blijven staan. Alleen de React-kant is weg.
 */
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { codeOnly, reachableModules, readRel, routeEntryFiles } from '@/lib/test-utils/route-import-graph'

const WEG = [
  'components/app/horizon/deficit-notice-provider.tsx',
  'components/app/horizon/aow-notice-provider.tsx',
  'components/app/horizon/eindsituatie-notice-provider.tsx',
  'components/app/horizon/eindsituatie-notice.tsx',
  'components/toekomst/plan/plan-meldingen.tsx',
] as const

describe('fase 2 — de losse meldingen van /toekomst zijn opgeruimd', () => {
  it.each(WEG)('%s bestaat niet meer', (rel) => {
    expect(existsSync(path.join(process.cwd(), rel))).toBe(false)
  })

  it('geen module van de /toekomst-routes importeert ze nog', () => {
    const modules = reachableModules(routeEntryFiles('app/(app)/toekomst'))
    expect(modules.length).toBeGreaterThan(50)
    const namen = WEG.map((rel) => rel.replace(/\.tsx$/, '').split('/').pop()!)
    const treffers: string[] = []
    for (const mod of modules) {
      const src = codeOnly(readRel(mod))
      for (const naam of namen) {
        if (new RegExp(`from '[^']*/${naam}'`).test(src)) treffers.push(`${mod} → ${naam}`)
      }
    }
    expect(treffers).toEqual([])
  })

  it('de paginakop draagt geen statuspunten meer (ADR 0179 D2)', () => {
    const layout = codeOnly(readRel('app/(app)/toekomst/(katern)/layout.tsx'))
    expect(layout).not.toMatch(/NoticeDot|NoticeProvider/)
    expect(layout).toContain('<ToekomstKaternInfo')
  })
})
