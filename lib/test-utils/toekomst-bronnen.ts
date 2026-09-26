import { join } from 'node:path'
import { readSourceLF } from './read-source'

/**
 * De bronbestanden van /toekomst die de bron-scan-tests lezen (ADR 0179 fase 1).
 *
 * WAAROM: `horizon-client.tsx` was één bestand van 11.000 regels; zeventien bron-tests
 * lazen het letterlijk. Sinds de state-provider (stap 12–14) woont elke invariant in het
 * bestand van zijn concern — "één invariant, één bestand". Een test kiest hier dus het
 * concern waar zijn invariant woont, en een negatieve toets ("dit mag nergens") leest
 * `leesToekomstAlles()`, zodat een verboden patroon in een ándere state-hook niet stil
 * wegvalt doordat de test het verkeerde bestand leest.
 */
export const TOEKOMST_BRONNEN = {
  /** De host: de compositie van de pagina (JSX + Plan-lokale afleidingen). */
  host: 'components/app/horizon/horizon-client.tsx',
  /** De provider: contexts en de volgorde van de concern-hooks. */
  provider: 'components/toekomst/state/toekomst-state-provider.tsx',
  perspectief: 'components/toekomst/state/use-toekomst-perspectief.ts',
  overlays: 'components/toekomst/state/use-toekomst-overlay-state.ts',
  scenario: 'components/toekomst/state/use-toekomst-scenario.ts',
  sim: 'components/toekomst/state/use-toekomst-sim.ts',
  meldingen: 'components/toekomst/state/use-toekomst-meldingen.ts',
  /** De euro-render-grens (stap 12). */
  euro: 'components/toekomst/state/use-euro-view-feeds.ts',
} as const

export type ToekomstBron = keyof typeof TOEKOMST_BRONNEN

/** Het absolute pad van één concern-bestand. */
export function toekomstPad(deel: ToekomstBron): string {
  return join(process.cwd(), TOEKOMST_BRONNEN[deel])
}

/** De bron van één concern-bestand, met LF-regeleinden. */
export function leesToekomst(deel: ToekomstBron): string {
  return readSourceLF(toekomstPad(deel))
}

/** Alle /toekomst-state- en host-bronnen aan elkaar — voor "mag nergens"-toetsen. */
export function leesToekomstAlles(): string {
  return (Object.keys(TOEKOMST_BRONNEN) as ToekomstBron[]).map(leesToekomst).join('\n')
}
