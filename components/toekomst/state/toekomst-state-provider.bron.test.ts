/**
 * Bron-grendel op de vorm van de /toekomst-state-provider (ADR 0179 "Gevolgen", fase 1
 * stap 13).
 *
 * Het risico dat ADR 0179 benoemt: de provider erft de state van ±5.000 regels en wordt
 * de nieuwe god-component. Deze grendel houdt de afspraken vast die dat voorkomen:
 *  1. de provider rendert geen JSX-blokken, alleen de contexts en `children`;
 *  2. elk concern is een eigen hook in een eigen bestand, in de dataflow-volgorde;
 *  3. elke context-waarde is gememoïseerd per concern (`useStabielObject`);
 *  4. de minimaliseer-toestand per katern hangt aan de layout, niet aan een katern (GW3b);
 *  5. `useInViewOnce` hangt aan het paneel met de scenario-kaarten (sinds fase 4 in Doelen),
 *     niet aan de provider (GW3a, kaart V1);
 *  6. de deeplink-afhandeling opent de dode WithdrawalModal niet meer.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { leesToekomst } from '@/lib/test-utils/toekomst-bronnen'

const STATE_DIR = join(process.cwd(), 'components', 'toekomst', 'state')
const provider = leesToekomst('provider')

/** Alle bronbestanden (geen tests) in `components/toekomst/state/`. */
function stateBronnen(): { naam: string; src: string }[] {
  return readdirSync(STATE_DIR)
    .filter((n) => /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n))
    .map((naam) => ({ naam, src: readSourceLF(join(STATE_DIR, naam)) }))
}

describe('toekomst-state-provider — geen nieuwe god-component', () => {
  it('rendert alleen contexts en children, geen JSX-blokken', () => {
    // Alleen de render-return: de generieken (`createContext<…>`) zijn geen JSX.
    const jsx = provider.slice(provider.lastIndexOf('  return ('))
    expect(provider.match(/^ {2}return \(/gm) ?? [], 'één render-return in de provider').toHaveLength(1)
    const tags = [...jsx.matchAll(/<\/?([A-Za-z][\w.]*)/g)].map((m) => m[1])
    expect(tags.length).toBeGreaterThan(0)
    const vreemd = tags.filter((t) => !/^[A-Z]\w*Context\.Provider$/.test(t))
    expect(vreemd, 'de provider hoort alleen <XContext.Provider> te renderen').toEqual([])
    expect(provider).toContain('{children}')
  })

  it('roept de concern-hooks aan in de dataflow-volgorde', () => {
    const volgorde = [
      'useToekomstPerspectief(',
      'useToekomstOverlayState(',
      'useToekomstScenarioState(',
      'useToekomstSim(',
      'useToekomstMeldingen(',
      'useToekomstScenario(',
      'useToekomstLagen(',
      // De euro-grens als laatste: hij zet de nominale feeds van alle concerns om.
      'useToekomstEuro(',
    ].map((aanroep) => {
      const i = provider.indexOf(`= ${aanroep}`)
      expect(i, `${aanroep} ontbreekt in de provider`).toBeGreaterThan(-1)
      return i
    })
    expect([...volgorde].sort((a, b) => a - b)).toEqual(volgorde)
    // De compositie (Plan-paneel en canvas, stap 15) rekent de grens niet zelf aan: ze
    // leest alleen de euro-context.
    for (const deel of ['plan', 'canvas'] as const) {
      expect(leesToekomst(deel)).not.toMatch(/useEuroViewFeeds\s*\(|useToekomstEuro\s*\(/)
      expect(leesToekomst(deel)).toContain('useToekomstEuroContext()')
    }
  })

  it('elke concern-hook geeft een per concern gememoïseerde waarde terug', () => {
    for (const { naam, src } of stateBronnen().filter((b) => /^use-toekomst-.*\.ts$/.test(b.naam))) {
      expect(src, `${naam} hoort zijn waarde via useStabielObject te delen`).toMatch(
        /return useStabielObject\(\{/,
      )
    }
  })
})

describe('meldingen en grendels blijven gemount bij een katernwissel', () => {
  it('de minimaliseer-toestand per katern hangt aan de layout, niet aan een katern (GW3b, fase 2)', () => {
    // Sinds ADR 0179 fase 2 (D6) vervangen drie `useKaternMeldingMinimize`-aanroepen in
    // de meldingen-host de drie losse notice-providers. Die host staat in de layout, dus
    // slot en punten op de katern-koppen blijven bij een katernwissel.
    const host = readSourceLF(
      join(process.cwd(), 'components', 'toekomst', 'meldingen', 'toekomst-katern-meldingen.tsx'),
    )
    expect(host.match(/useKaternMeldingMinimize\(\{/g) ?? []).toHaveLength(3)
    const elders = (['plan', 'canvas', 'overlayHost', 'meldingen'] as const).map((d) => leesToekomst(d)).join('\n')
    for (const hook of ['useDeficitNotice(', 'useAowNotice(', 'useEindsituatieNotice(', 'useKaternMeldingMinimize(']) {
      expect(elders, `${hook} hoort niet in een katern of de state-laag`).not.toContain(hook)
    }
    const layout = readSourceLF(join(process.cwd(), 'app', '(app)', 'toekomst', '(katern)', 'layout.tsx'))
    expect(layout).toContain('<ToekomstKaternMeldingenProvider')
  })

  it('useInViewOnce hangt aan het paneel met de scenario-kaarten, niet aan de state-laag (GW3a)', () => {
    for (const { naam, src } of stateBronnen()) {
      expect(src, `${naam} mag useInViewOnce niet aanroepen`).not.toMatch(/useInViewOnce\s*\(/)
    }
    expect(readSourceLF(join(process.cwd(), 'components', 'toekomst', 'doelen', 'andere-paden.tsx'))).toMatch(
      /useInViewOnce\s*\(/,
    )
  })

  it('de duiding-grendel gaat alleen van false naar true', () => {
    const sim = leesToekomst('sim')
    expect(sim).toContain('const markeerDuidingInView = useCallback(() => setDuidingInView(true), [])')
    expect(sim.match(/setDuidingInView\(/g) ?? []).toHaveLength(1)
  })
})

describe('afwijkingen van stap 13', () => {
  it('de deeplink-afhandeling opent de dode WithdrawalModal niet meer', () => {
    const overlays = leesToekomst('overlays')
    const tak = overlays.slice(overlays.indexOf("if (modal === 'scenarios'"), overlays.indexOf('setActiveModal(modal)'))
    expect(tak).not.toContain("'withdrawal'")
  })

  it('de kerngetal-tegel rendert tijdens de hydratie de server-stand (geen aria-busy-mismatch)', () => {
    const sim = leesToekomst('sim')
    expect(sim).toMatch(/const naHydratie = useSyncExternalStore\(abonneerNiets, \(\) => true, \(\) => false\)/)
    expect(sim).toContain('isRefining: kernelIsRefining && naHydratie,')
  })
})
