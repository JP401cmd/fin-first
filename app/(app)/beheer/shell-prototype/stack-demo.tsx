'use client'

/**
 * SANDBOX / Fase 0 v3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §4
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Demonstratie van de tray-of-three mobile-stack-shell. Een lijst van mock-
 * rijen; tikken pusht een nieuwe entry op de stack. Elke gepushte view
 * gebruikt een ander BottomBar-type, zodat alle vier de kinds visueel
 * gevalideerd kunnen worden:
 *   - Holding 1 → action-bar (Opslaan / Annuleren)
 *   - Holding 2 → context-actions (Bewerken / Verwijderen / Delen)
 *   - Holding 3 → tabs (default — module-tabs)
 *   - Holding 4 → hidden (full-screen)
 *
 * `NavStackProvider` krijgt `overrideActiveTab="other"` in de wrapper-page,
 * zodat we pathname-driven auto-push UITZETTEN voor de demo (anders krijgen
 * we én een handmatige push én een auto-push voor elke route-change).
 *
 * Coordinatie-noot — SwipeBackTracker zit BUITEN MobileStackShell en schuift
 * een eigen wrapper-laag tijdens de swipe. Bij commit (≥50% / hoge velocity)
 * zetten we onze transform terug naar 0 en roepen we `pop()` aan; agent A's
 * keyframe in MobileStackShell neemt het visueel over voor de nieuwe top-
 * entry. Geen dubbele transform.
 */

import { useState } from 'react'
import { ChevronRight, Hourglass } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useNavStack, type BottomBarConfig } from '@/components/app/shell/nav-stack-provider'
import { MobileStackShell } from '@/components/app/shell/mobile-stack-shell'
import { SwipeBackTracker } from '@/components/app/shell/swipe-back-tracker'

/**
 * Mock-holdings voor de root-view. Elke entry definieert ZIJN EIGEN
 * bottomBar-config — dat is exact het pagina-attribuut-pattern uit plan §4.4
 * (de StackEntry-meta dragen de BottomBar-config).
 */
type HoldingMock = {
  id: string
  name: string
  subtitle: string
  bottomBar: BottomBarConfig
}

const MOCK_HOLDINGS: HoldingMock[] = [
  {
    id: 'demo-action-bar',
    name: 'ASML Holding',
    subtitle: '€ 12.450 · +2,3% — action-bar demo',
    bottomBar: {
      kind: 'action-bar',
      primary: {
        label: 'Opslaan',
        icon: 'Check',
        onClick: () => console.log('demo: opslaan'),
      },
      secondary: {
        label: 'Annuleren',
        icon: 'X',
        onClick: () => console.log('demo: annuleren'),
      },
    },
  },
  {
    id: 'demo-context-actions',
    name: 'Vanguard FTSE All-World',
    subtitle: '€ 28.910 · +0,8% — context-actions demo',
    bottomBar: {
      kind: 'context-actions',
      actions: [
        { label: 'Bewerken', icon: 'Pencil', onClick: () => console.log('demo: bewerken') },
        { label: 'Verwijderen', icon: 'Trash2', onClick: () => console.log('demo: verwijderen'), destructive: true },
        { label: 'Delen', icon: 'Share2', onClick: () => console.log('demo: delen') },
      ],
    },
  },
  {
    id: 'demo-tabs',
    name: 'iShares Core S&P 500',
    subtitle: '€ 45.220 · +1,1% — tabs demo (default)',
    bottomBar: { kind: 'tabs' },
  },
  {
    id: 'demo-hidden',
    name: 'Bitcoin (Bitvavo)',
    subtitle: '€ 6.180 · -1,4% — hidden demo (full-screen)',
    bottomBar: { kind: 'hidden' },
  },
]

/**
 * Sandbox content — beslist op basis van stack-diepte welke "view" er getoond
 * wordt. Niveau 1 (root): lijst met mock-rijen. Niveau 2+: detail-view.
 */
function StackContent() {
  const { currentStack, push } = useNavStack()
  const router = useRouter()
  const top = currentStack[currentStack.length - 1]
  const depth = currentStack.length

  // Counter voor extra dieptes (>= 2). Toont dat pushen écht verder de stack
  // ingaat tot de FIFO-limiet (5).
  const [pushCounter, setPushCounter] = useState(0)

  /**
   * Navigeer naar de loading-demo-route. We pushen ÉÉRST de stack-entry met
   * synchrone meta (titel + bottomBar) zodat MobileStackShell direct de juiste
   * tray-of-three rendert; daarna roepen we router.push() aan zodat Next.js de
   * server-component laadt en in de tussentijd loading.tsx als Suspense-
   * fallback toont. Resultaat (plan §4.6):
   *  t=0   tray verschijnt instant met "Loading-test" + tabs-BottomBar
   *  t=0   loading.tsx rendert PageSkeletonDetail in content-area
   *  t=240 dual-render-animatie klaar (incoming staat op zijn plek)
   *  t=1500 server-data binnen → Suspense vervangt skeleton met echte content
   * Geen layout-shift, want skeleton-dimensies matchen final layout.
   */
  const navigateToLoadingDemo = () => {
    push({
      pathname: '/beheer/shell-prototype/loading-demo',
      title: 'Loading-test',
      bottomBar: { kind: 'tabs' },
    })
    router.push('/beheer/shell-prototype/loading-demo')
  }

  // Niveau 1 — lijst met mock-holdings. Tik op een rij = push naar detail.
  if (depth <= 1) {
    return (
      <div className="px-4 py-6 space-y-4">
        <p className="text-sm text-[var(--ink-2)]">
          Tik op een rij om een sub-pagina te <em>pushen</em>. Iedere mock-
          holding heeft een ander BottomBar-type — let op hoe de hele tray
          (TopBar + Content + BottomBar) samen schuift.
        </p>

        <ul className="border-t border-[var(--border-ed)]">
          {MOCK_HOLDINGS.map((h, i) => (
            <li key={h.id} className="border-b border-[var(--border-ed)]">
              <button
                type="button"
                onClick={() =>
                  push({
                    pathname: `/core/assets/holdings/${h.id}`,
                    title: `Holding demo ${i + 1}`,
                    bottomBar: h.bottomBar,
                  })
                }
                className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-[var(--subtle)] tap-highlight"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--ink)] truncate">
                    {h.name}
                  </div>
                  <div className="text-xs text-[var(--ink-3)] font-mono tabular-nums">
                    {h.subtitle}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--ink-4)] shrink-0" />
              </button>
            </li>
          ))}
        </ul>

        {/* Loading-strategie demo (plan §4.6). Anders dan de mock-rijen
            hierboven (puur stack-state-mutatie zonder route-navigatie) gaat
            deze knop ÉCHT navigeren naar een route met server-component +
            loading.tsx — zodat we het Suspense-pattern in actie kunnen zien:
            tray-of-three verschijnt instant, content-area toont skeleton,
            na 1,5 s vervangt Next.js de skeleton met echte content. */}
        <div className="mt-6 border-2 border-[var(--ink)] bg-[var(--paper)] p-4">
          <div className="flex items-start gap-3">
            <Hourglass className="h-5 w-5 shrink-0 text-[var(--module-active-700)] mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--ink)]">
                Loading-strategie testen
              </div>
              <p className="mt-1 text-xs text-[var(--ink-2)] leading-relaxed">
                Push naar een route die 1,5 s wacht in zijn server-component.
                Tray-of-three verschijnt direct; content-area toont skeleton tot
                de data binnen is.
              </p>
              <button
                type="button"
                onClick={navigateToLoadingDemo}
                className="mt-3 inline-flex items-center gap-2 border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--paper)] hover:bg-[var(--ink-2)] tap-highlight"
              >
                Open loading-demo →
              </button>
            </div>
          </div>
        </div>

        <DebugStrip />
      </div>
    )
  }

  // Niveau 2+ — detail-view. Toont push-counter, en knop voor verder pushen.
  return (
    <div className="px-4 py-6 space-y-5">
      <div className="border-l-2 border-[var(--module-active-500)] pl-3">
        <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
          Stack-niveau {depth}
        </div>
        <div className="text-sm text-[var(--ink)] mt-1">
          {top?.title ?? 'Geen titel'}
        </div>
        <div className="text-xs text-[var(--ink-3)] font-mono mt-0.5 truncate">
          {top?.pathname}
        </div>
      </div>

      {/* UI-hint: alleen op (pointer: coarse) zichtbaar. Wijst gebruiker op
          de iOS-stijl edge-swipe als alternatieve pop-trigger. Toont enkel
          op stack-diepte > 1 — dat is hier automatisch waar omdat we in de
          else-tak van `depth <= 1` zitten. */}
      <p className="hidden coarse-pointer-only text-[12px] italic text-[var(--ink-3)] border-l-2 border-dashed border-[var(--module-active-300,var(--border-md))] pl-3">
        ← swipe vanaf linkerrand om terug
      </p>
      <style jsx>{`
        @media (pointer: coarse) {
          .coarse-pointer-only {
            display: block;
          }
        }
      `}</style>

      <p className="text-sm text-[var(--ink-2)]">
        Gebruik de ←-knop linksboven (of de back-knop van je browser) om
        terug te keren. Of push nog dieper om de FIFO-limiet (5) te zien:
      </p>

      <button
        type="button"
        onClick={() => {
          const next = pushCounter + 1
          setPushCounter(next)
          // Diepere pushes erven de bottomBar-config van hun parent (zelfde
          // kind). In een echte app komt dat uit de pagina-meta-declaratie.
          push({
            pathname: `/core/assets/holdings/demo-deep-${depth}-${next}`,
            title: `Diepte ${depth + 1}`,
            bottomBar: top?.bottomBar,
          })
        }}
        className="border border-[var(--ink)] bg-[var(--paper)] px-4 py-2 text-xs uppercase tracking-[0.15em] font-mono text-[var(--ink)] hover:bg-[var(--subtle)] tap-highlight"
      >
        Push diepere view →
      </button>

      <DebugStrip />
    </div>
  )
}

/**
 * Onderaan elk niveau: een mono-streep met stack-info voor QA. Toont nu ook
 * de huidige bottomBar.kind en transition.phase — handig om de animatie-
 * staat te debuggen tijdens push/pop.
 */
function DebugStrip() {
  const { activeTab, currentStack, transition } = useNavStack()
  const top = currentStack[currentStack.length - 1]
  const bottomBarKind = top?.bottomBar?.kind ?? 'tabs (default)'

  return (
    <div className="mt-8 pt-3 border-t border-dashed border-[var(--border-ed)]">
      <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1">
        Debug
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs font-mono text-[var(--ink-2)]">
        <dt className="text-[var(--ink-3)]">activeTab</dt>
        <dd>{activeTab}</dd>
        <dt className="text-[var(--ink-3)]">stack-diepte</dt>
        <dd>{currentStack.length}</dd>
        <dt className="text-[var(--ink-3)]">top-pathname</dt>
        <dd className="truncate">
          {top?.pathname ?? '-'}
        </dd>
        <dt className="text-[var(--ink-3)]">bottomBar.kind</dt>
        <dd>{bottomBarKind}</dd>
        <dt className="text-[var(--ink-3)]">phase</dt>
        <dd>
          <span
            className={
              transition.phase === 'idle'
                ? 'text-[var(--ink-3)]'
                : 'text-[var(--module-active-700)]'
            }
          >
            {transition.phase}
          </span>
        </dd>
      </dl>
    </div>
  )
}

/**
 * Demo-component dat in de wrapper-page geïmporteerd wordt. Wordt zelf
 * binnen `<NavStackProvider>` gewrapped, zodat de hook werkt en
 * sessionStorage hydratie correct verloopt.
 *
 * SwipeBackTracker zit BUITEN MobileStackShell. Onze tray-of-three
 * dual-render (push-keyframe in MobileStackShell) blijft inactief tot
 * we daadwerkelijk pop()-en. Bij commit (≥50% / hoge velocity) zetten
 * we onze transform terug naar 0 en roepen pop() aan; MobileStackShell's
 * keyframe neemt visueel over voor de nieuwe top-entry.
 */
export function StackDemo() {
  // `forceVisible` zodat de mobile-shell óók op desktop in de DeviceFrame zichtbaar
  // blijft (anders verbergt `lg:hidden` de TopBar + content op ≥1024px viewport).
  return (
    <SwipeBackTracker>
      <MobileStackShell forceVisible>
        <StackContent />
      </MobileStackShell>
    </SwipeBackTracker>
  )
}
