/**
 * SANDBOX / Fase 0 v3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §4.6 (loading-strategie)
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * ─── README ──────────────────────────────────────────────────────────
 * Loading-pattern demonstratie.
 *
 * Bij navigatie naar deze route via push() in StackDemo:
 *   1. NavStackProvider auto-pusht een entry voor `/beheer/shell-prototype/loading-demo`.
 *   2. MobileStackShell rendert direct de tray-of-three:
 *        - TopBar (titel + ←-knop, uit stack-meta synchroon)
 *        - Content-area met PageSkeletonDetail (loading.tsx-fallback)
 *        - BottomBar (default 'tabs', tot NavStackMeta een override stuurt)
 *   3. Dual-content-animatie: outgoing (StackDemo-root) glijdt naar -30%/0.5,
 *      incoming (deze tray) glijdt van 100% naar 0. Animatie 240ms.
 *   4. Server-component (deze file) wacht 1.5s via Promise-timeout,
 *      rendert vervolgens de echte content.
 *   5. Suspense vervangt PageSkeletonDetail door deze content.
 *      → Geen layout-shift: skeleton-dimensies matchen header (h-8 + h-4),
 *      KPI-strip (4x ~96px), body-blokken (h-48 chart-placeholder).
 *
 * Resultaat: gebruiker ziet TopBar+BottomBar instant; alleen content-area
 * "verschijnt" 1.5s later. Geen flash of layout-jump.
 *
 * NavStackMeta-injectie: deze server-component kan zelf geen `<NavStackMeta>`
 * renderen (dat is een client-component met useEffect). We renderen het
 * client-bridge `<LoadingDemoMeta />` als child — die mount na content-arrival
 * en stuurt de definitieve titel naar de provider. Tijdens de skeleton-fase
 * draagt de TopBar de auto-push-default ('Loading-test' uit StackDemo's push).
 * ─────────────────────────────────────────────────────────────────────
 */

import { LoadingDemoMeta } from './loading-demo-meta'

/**
 * Server-component met expliciete data-fetch-simulatie. We vermijden
 * `unstable_noStore` of `cache: 'no-store'` — die zijn voor data-fetching, niet
 * voor demo-timing. Een simpele Promise-timeout is hier kosher: de server-render
 * suspended tot de promise resolves, en Next.js toont in die tijd loading.tsx.
 */
async function simulateServerWait(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 1500))
}

export default async function LoadingDemoPage() {
  // Wacht 1.5s om de Suspense-skeleton zichtbaar te maken in de tray-of-three.
  // In productie zou dit bv. een Supabase-query of een external-API-call zijn.
  await simulateServerWait()

  return (
    <article className="px-4 py-5 sm:px-6 sm:py-6">
      {/* Client-bridge: bevestigt de definitieve TopBar-titel + bottomBar-config
          aan de NavStackProvider. Plaatsen we VROEG in de tree zodat de meta-
          dispatch direct na hydration vuurt; geen sync-race met content-render. */}
      <LoadingDemoMeta />

      <header className="mb-5 border-b border-[var(--border-ed)] pb-4">
        <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1">
          Sandbox · loading-strategie
        </div>
        <h1 className="text-2xl font-bold text-[var(--ink)]">Loading-demo geladen</h1>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          Server-component wachtte 1,5 s; in die tijd toonde de tray-of-three
          de TopBar (uit stack-meta) en een skeleton in de content-area.
        </p>
      </header>

      {/* KPI-strip — matcht de PageSkeletonDetail figures-strip qua dimensies
          zodat de overgang skeleton -> content geen layout-shift veroorzaakt.
          Zelfde grid, zelfde p-3, zelfde h-3+h-6 binnen elke cell. */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Wachttijd', value: '1,5 s' },
          { label: 'Tray', value: 'Synchroon' },
          { label: 'Skeleton', value: 'Detail' },
          { label: 'Layout-shift', value: '0 px' },
        ].map(kpi => (
          <div
            key={kpi.label}
            className="border border-[var(--border-ed)] bg-[var(--paper)] p-3"
          >
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
              {kpi.label}
            </div>
            <div className="mt-1.5 text-base font-medium text-[var(--ink)] tabular-nums">
              {kpi.value}
            </div>
          </div>
        ))}
      </section>

      {/* Body — uitleg van wat er net gebeurd is. */}
      <section className="space-y-4 text-sm leading-relaxed text-[var(--ink-2)]">
        <p>
          Tijdens de wachttijd toonde de mobile-shell de TopBar met titel
          &ldquo;Loading-test&rdquo; en een PageSkeletonDetail-blok met
          krant-stijl scherpe blokken die pulseren (1,5 s ease-in-out). De
          BottomBar bleef tabs-modus omdat geen override-config werd
          meegegeven aan <code className="font-mono text-xs">push()</code>.
        </p>
        <p>
          De skeleton-dimensies komen overeen met deze content: header
          (h-8 + h-4), KPI-strip (4 × p-3), body-paragraphs. Dat voorkomt dat
          tekst &ldquo;springt&rdquo; bij data-aankomst — een veelvoorkomende
          UX-jank in poorly-architected loading-pages.
        </p>
        <p className="text-[var(--ink-3)] italic">
          Dit pad is sandbox; de echte productie-routes (Fase 1+) krijgen elk
          hun eigen loading.tsx met de juiste skeleton-variant.
        </p>
      </section>
    </article>
  )
}
