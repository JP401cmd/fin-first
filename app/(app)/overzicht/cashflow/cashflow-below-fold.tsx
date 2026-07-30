'use client'

import dynamic from 'next/dynamic'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'
import type { CashBankLink } from '@/lib/bank-connection-status'

/**
 * cashflow-below-fold.tsx — dun client-eiland voor perf Task 3.2.
 *
 * `page.tsx` is een server-component; `next/dynamic(..., { ssr: false })` mag
 * daar niet direct in (Next.js-restrictie voor Server Components). Dit eiland
 * doet de dynamic-imports voor de twee zware below-the-fold-blokken zodat ze
 * uit het first-load JS-chunk van /overzicht/cashflow blijven:
 *
 * - `CashOverview` (components/app/cash-overview.tsx, 1696 r) — fetcht zelf
 *   client-side (self-fetch, bewust ongewijzigd — zie brief) en staat onder de
 *   vouw, dus `ssr:false` verliest geen SSR-content.
 * - `CashflowInstellingenBlok` (components/overview/cashflow-instellingen-blok.tsx,
 *   281 r) — consumeert props, klein, zelfde behandeling.
 *
 * Gedrag/props 1:1 identiek aan de vroegere statische import — alleen de
 * laad-vorm verandert. Skeletons benaderen de kaart-hoogte (token-based:
 * --subtle/--border-ed/--paper, animate-pulse) om CLS te vermijden, conform
 * het bestaande loading.tsx-patroon op cashflow-niveau.
 *
 * `CashOverviewSkeleton` spiegelt structureel de drie secties die de pagina
 * hier daadwerkelijk laat renderen (embedded, showAllCashAccounts,
 * showMonthLinks — dus VermogenAssetCard-kaarten, geen simple-mode):
 * "Rekeningen" (card-editorial-grid, cash-overview.tsx ~808-905), "Geldstroom"
 * (maand-banner + KPI-strip + dagchart, ~907-1104) en "Snelle acties"
 * (~1130-1157). Zie de per-sectie comments hieronder voor de nagetelde
 * hoogtes/paddings. Noot: `--paper-2` uit de reviewopdracht bestaat niet in
 * app/globals.css (alleen gescopeerd in app/check/rapport/rapport.css) — dit
 * bestand gebruikt daarom `--paper` (kaart-bg) + `--subtle` (skeleton-blok),
 * de tokens die het bestaande `components/app/shell/page-skeleton.tsx` ook
 * gebruikt.
 */

const DynCashOverview = dynamic(
  () => import('@/components/app/cash-overview').then(m => ({ default: m.CashOverview })),
  {
    ssr: false,
    loading: () => <CashOverviewSkeleton />,
  },
)

const DynCashflowInstellingenBlok = dynamic(
  () =>
    import('@/components/overview/cashflow-instellingen-blok').then(m => ({
      default: m.CashflowInstellingenBlok,
    })),
  {
    ssr: false,
    loading: () => <CashflowInstellingenBlokSkeleton />,
  },
)

/**
 * Eén rekening-kaart-placeholder — spiegelt `VermogenAssetCard`
 * (components/core/vermogen-asset-card.tsx), de kaart die hier écht rendert
 * (showAllCashAccounts=true → cashAssets.map). Nageteld:
 * 3px accentbalk + hoofdregel (p-3 sm:p-4, icon h-7 w-7 + naam/sub-regel +
 * bedrag rechts) + actie-rij (border-t, px-3 py-2 sm:px-4, 2 knop-placeholders)
 * ≈ 95-105px — de kaart heeft GEEN eigen vaste hoogte, laat 'm organisch
 * groeien uit dezelfde spacing-tokens als het origineel.
 */
function RekeningenCardSkeleton() {
  return (
    <div className="card-editorial w-full">
      <div className="h-[3px] w-full bg-[var(--subtle)]" />
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <div className="h-7 w-7 shrink-0 bg-[var(--subtle)]" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3.5 w-2/3 bg-[var(--subtle)]" />
          <div className="h-2.5 w-1/3 bg-[var(--subtle)]" />
        </div>
        <div className="h-4 w-14 shrink-0 bg-[var(--subtle)]" />
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[var(--border-ed)] px-3 py-2 sm:px-4">
        <div className="h-6 w-20 bg-[var(--subtle)]" />
        <div className="h-6 w-16 bg-[var(--subtle)]" />
      </div>
    </div>
  )
}

/**
 * `CashOverview`-skeleton — spiegelt de drie secties structureel (zie
 * bestandskop). Buitenste `mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8` is
 * 1:1 overgenomen van de echte container (cash-overview.tsx r806) zodat ook
 * de breedte/uitlijning niet verspringt bij de chunk-swap, niet alleen de
 * hoogte.
 */
function CashOverviewSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto max-w-6xl animate-pulse px-4 py-5 sm:px-6 sm:py-8"
    >
      {/* === 1. Rekeningen — Kicker-regel + cards-grid (~808-905) === */}
      <section className="mt-5 sm:mt-8">
        <div className="mb-4 h-3 w-24 bg-[var(--subtle)]" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <RekeningenCardSkeleton />
          <RekeningenCardSkeleton />
          <RekeningenCardSkeleton />
        </div>
      </section>

      {/* === 2. Geldstroom — banner + KPI-strip + chart-blok (~907-1104) === */}
      <section className="mt-5 sm:mt-8">
        {/* Maand-banner: top-rij (py-3, ~44px) + 4-koloms KPI-strip (2x2 op
            mobiel, nageteld border-r/border-b matcht de echte
            `[&:nth-child(-n+2)]:border-b` regel op r977-1068). */}
        <div className="border border-[var(--border-ed)]">
          <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-4 py-3 sm:px-5">
            <div className="h-5 w-28 bg-[var(--subtle)]" />
            <div className="h-3 w-16 bg-[var(--subtle)]" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={[
                  'p-4',
                  i < 3 ? 'border-r border-[var(--border-ed)]' : '',
                  i < 2 ? 'border-b sm:border-b-0 border-[var(--border-ed)]' : '',
                ].join(' ')}
              >
                <div className="h-2.5 w-12 bg-[var(--subtle)]" />
                <div className="mt-1.5 h-6 w-20 bg-[var(--subtle)]" />
                <div className="mt-1.5 h-2.5 w-10 bg-[var(--subtle)]" />
              </div>
            ))}
          </div>
        </div>

        {/* Chart-blok: card-editorial (zelfde class als het echte blok,
            r1072) + header-rij (mb-3) + grafiek-placeholder. De echte
            `CashflowChart`-SVG is hardcoded `h-[200px]` (r1497) — exacte
            waarde overgenomen i.p.v. een afgeronde Tailwind-stap. */}
        <div className="mt-6 card-editorial p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="h-4 w-24 bg-[var(--subtle)]" />
            <div className="h-3 w-32 bg-[var(--subtle)]" />
          </div>
          <div className="h-[200px] w-full bg-[var(--subtle)]" />
        </div>
      </section>

      {/* === 3. Snelle acties — actions-rij (~1130-1157) === */}
      <section className="mt-5 sm:mt-8">
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 w-48 bg-[var(--subtle)]" />
          <div className="h-9 w-40 bg-[var(--subtle)]" />
          <div className="h-9 w-32 bg-[var(--subtle)]" />
        </div>
      </section>
    </div>
  )
}

function CashflowInstellingenBlokSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="h-56 rounded-2xl border border-[var(--border-ed)] bg-[var(--subtle)]" />
    </div>
  )
}

/**
 * Drop-in vervanger voor de statische `CashOverview`-import op de
 * cashflow-pagina. Géén `onNavigateToAccount` in dit props-type: `page.tsx`
 * is een Server Component en kan nooit een functie-prop doorgeven (RSC-regel),
 * en de enige echte gebruiker van die callback (`components/core/asset-category-page.tsx`)
 * importeert `CashOverview` direct, niet via dit lazy-eiland. Dempt ook de
 * serializable-props-waarschuwing van `next/dynamic`.
 */
export function CashOverviewLazy(props: {
  embedded?: boolean
  hideAccountsSection?: boolean
  hideQuickActions?: boolean
  showAllCashAccounts?: boolean
  showMonthLinks?: boolean
  /**
   * Koppelstatus per bankrekening uit `loadCashBankLinks()` op de server-pagina.
   * Serialiseerbare data (geen functie), dus mag wél door dit `dynamic()`-eiland
   * heen — anders dan `onNavigateToAccount` hierboven.
   */
  bankLinks?: CashBankLink[]
}) {
  return <DynCashOverview {...props} />
}

/** Drop-in vervanger voor de statische `CashflowInstellingenBlok`-import. */
export function CashflowInstellingenBlokLazy({ data }: { data: CashflowSettingsData }) {
  return <DynCashflowInstellingenBlok data={data} />
}
