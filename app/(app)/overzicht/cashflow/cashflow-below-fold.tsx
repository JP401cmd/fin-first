'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { DepthSection } from '@/components/app/depth-section'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
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
 * Skeletons benaderen de kaart-hoogte (token-based: --subtle/--border-ed/--paper,
 * animate-pulse) om CLS te vermijden, conform het bestaande loading.tsx-patroon
 * op cashflow-niveau.
 *
 * SINDS TASK 2.2 is `CashflowInstellingenBlokLazy` niet langer een pure drop-in:
 * hij haalt zijn eigen data op bij in-view i.p.v. 'm als prop te krijgen (zie de
 * doc-comment daar voor de ruil). `CashOverviewLazy` blijft props-identiek.
 *
 * `CashOverviewSkeleton` doet dubbel dienst (perf Task 2.2): behalve als
 * `next/dynamic`-loading-state is hij óók de Suspense-fallback van
 * `CashOverviewLoader` (cash-overview-loader.tsx), zodat de overgang
 * server-boundary → chunk-load geen tweede skeleton-vorm oplevert. Hij spiegelt
 * structureel de drie secties die de pagina
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
export function CashOverviewSkeleton() {
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

/**
 * `CashflowInstellingenBlok`-skeleton — spiegelt de echte sectie
 * (components/overview/cashflow-instellingen-blok.tsx r96-108) i.p.v. één vlak
 * `h-56`-blok. Dat was een geschatte hoogte die op mobiel te laag en op desktop
 * te hoog uitviel; sinds de data lazy binnenkomt (perf Task 2.2, stap 5) staat de
 * skeleton bovendien langer in beeld, dus telt die mismatch als echte CLS.
 *
 * Nageteld tegen `SettingCard` (r247-260): `card-editorial p-4` + label-rij
 * (icon h-4 naast `text-xs`, line-height 1rem → h-4) + `text-xl`-waarde
 * (line-height 1.75rem → h-7) + `mt-1` substext. Buitenmaten `mt-5 sm:mt-8` en
 * het `grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4`-raster zijn 1:1 overgenomen.
 */
function CashflowInstellingenBlokSkeleton() {
  return (
    <section aria-hidden="true" className="mt-5 animate-pulse sm:mt-8">
      <div className="mb-4 h-3 w-40 bg-[var(--subtle)]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-editorial p-4">
            <div className="mb-1 flex items-center gap-1.5">
              <div className="h-4 w-4 bg-[var(--subtle)]" />
              <div className="h-4 w-28 bg-[var(--subtle)]" />
            </div>
            <div className="h-7 w-24 bg-[var(--subtle)]" />
            <div className="mt-1 h-4 w-20 bg-[var(--subtle)]" />
          </div>
        ))}
      </div>
    </section>
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

/**
 * Marge waarbinnen het blok al als "in beeld" telt. 300px onder de viewport, dus
 * de fetch start terwijl de gebruiker er nog naartoe scrollt — niet pas als het
 * blok de rand raakt.
 */
const SETTINGS_PREFETCH_MARGIN = '300px 0px'

/**
 * Het instellingen-blok, met zijn EIGEN data — opgehaald ná hydratatie en pas
 * wanneer het blok in beeld scrollt (perf Task 2.2, stap 5).
 *
 * ## De ruil, expliciet
 *
 * Dit herintroduceert bewust een netwerkverzoek ná hydratatie; dat is precies
 * wat de datapad-conventie normaal gesproken naar de loader duwt. Wat het
 * verdedigbaar maakt: het blok is `ssr:false` en staat onder de vouw, dus zijn
 * data — `loadCashflowSettingsData` → `loadCoreData`, ~25 queries in twee
 * seriële golven — werd server-side berekend, in de RSC-payload geserialiseerd,
 * en pas gebruikt door een component die daarna nog een chunk moest laden. Voor
 * iedereen die niet naar beneden scrolt was dat volledig weggegooid werk dat
 * niettemin de hele pagina ophield.
 *
 * ADR 0058 kent hier de uitzondering "on-demand/lazy client-read die écht niet in
 * de bundel past": dan via een API-route, niet via de browser-client. Dat is
 * `GET /api/overzicht/cashflow-settings`. Het is een ruil, geen gratis winst: wie
 * wél naar beneden scrolt betaalt nu een extra roundtrip, élke keer — die route
 * heeft bewust geen cache, want hij levert precies de velden die dít blok ook
 * wegschrijft (zie de kop van de route).
 *
 * Bij een mislukte fetch rendert dit component NIETS — geen eeuwige skeleton en
 * geen blok met nullen (dat zou als "je verdient €0" lezen). Daarom draagt het
 * component zijn eigen `<section>`-wrapper in plaats van er een op de pagina
 * omheen te laten zetten: die zou met zijn `pb-8 pt-2` anders als lege ruimte
 * blijven staan waar niets meer komt.
 */
export function CashflowInstellingenBlokLazy() {
  const anchorRef = useRef<HTMLElement | null>(null)
  const startedRef = useRef(false)
  const unmountedRef = useRef(false)
  const [state, setState] = useState<
    { status: 'pending' } | { status: 'ready'; data: CashflowSettingsData } | { status: 'failed' }
  >({ status: 'pending' })

  useEffect(() => {
    const el = anchorRef.current
    if (!el) return
    // Twee refs i.p.v. een lokale `cancelled`-vlag, om de dubbele effect-invocatie
    // van StrictMode te overleven: `startedRef` houdt het bij ÉÉN fetch, en
    // `unmountedRef` wordt bij elke nieuwe run weer op false gezet — anders zou de
    // opruiming van de eerste run het antwoord van zijn eigen fetch weggooien en
    // bleef de skeleton in dev voor eeuwig staan.
    unmountedRef.current = false

    const start = () => {
      if (startedRef.current) return
      startedRef.current = true
      void (async () => {
        try {
          const res = await fetch('/api/overzicht/cashflow-settings')
          if (!res.ok) {
            if (!unmountedRef.current) setState({ status: 'failed' })
            return
          }
          const data = (await res.json()) as CashflowSettingsData
          if (!unmountedRef.current) setState({ status: 'ready', data })
        } catch {
          if (!unmountedRef.current) setState({ status: 'failed' })
        }
      })()
    }

    // Geen IntersectionObserver (oude browser, jsdom zonder polyfill): meteen
    // laden. Het blok verschijnt dan zoals voorheen — alleen zonder de besparing.
    if (typeof IntersectionObserver !== 'function') {
      start()
      return () => {
        unmountedRef.current = true
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          start()
        }
      },
      { rootMargin: SETTINGS_PREFETCH_MARGIN },
    )
    observer.observe(el)
    return () => {
      unmountedRef.current = true
      observer.disconnect()
    }
  }, [])

  // Mislukt: helemaal weg, inclusief de sectie-padding. De observer is dan al
  // losgekoppeld, dus het verdwijnen van het anker maakt niets meer stuk.
  // Mislukt: helemaal weg, inclusief de sectie-padding. De observer is dan al
  // losgekoppeld, dus het verdwijnen van het anker maakt niets meer stuk.
  if (state.status === 'failed') return null

  return (
    // Instellingen (inkomen, spaarquote, uitgaven) zijn óók in Eenvoudig
    // zichtbaar — bewust géén HideInSimple. Het blok bevat alleen die drie
    // kern-instellingen, die de gebruiker in beide modi wil kunnen zien; in
    // Eenvoudig staan ze alleen achter een disclosure (CF-4, hieronder).
    <section ref={anchorRef} className="mx-auto max-w-6xl px-4 pb-8 pt-2 sm:px-6">
      {state.status === 'ready' ? (
        <CashflowInstellingenDisclosure data={state.data} />
      ) : (
        <CashflowInstellingenBlokSkeleton />
      )}
    </section>
  )
}

/**
 * CF-4 — het instellingenblok als disclosure, in Eenvoudig standaard DICHT.
 *
 * Waarom `DepthSection` en geen `HideInSimple`: instellingen zijn geen diepte
 * die je mag wegnemen, het zijn drie waarden die de gebruiker moet kúnnen
 * bijstellen. Hard verbergen zou de enige ingang naar zijn inkomen/uitgaven op
 * deze pagina dichtzetten. `DepthSection` is precies het inklappen-met-behoud
 * dat ADR 0026 bedoelde en dat volgens §9 van de audit ongebruikt lag: dicht in
 * 'simple', open in 'full', één klik ertussen.
 *
 * Waarom alleen in Eenvoudig gemónt en niet altijd: `DepthSection` zou in
 * Volledig weliswaar open staan, maar dan mét kop-knop en kaartrand om het blok
 * heen. "Volledig blijft ongewijzigd" is een acceptatiecriterium, dus daar
 * rendert exact de bestaande boom — `hideHeading` blijft ongezet, dus ook de
 * eigen kicker en sectie-marge van het blok blijven zoals ze waren.
 *
 * De lazy fetch hierboven blijft ongemoeid: het anker-`<section>` staat er ook
 * ingeklapt, dus in-view laadt de data zoals voorheen en de disclosure opent
 * meteen gevuld.
 */
function CashflowInstellingenDisclosure({ data }: { data: CashflowSettingsData }) {
  const simple = useDisplayMode().mode === 'simple'

  if (!simple) return <DynCashflowInstellingenBlok data={data} />

  return (
    <div className="mt-5 sm:mt-8">
      {/* NB: het blok draagt in Volledig sinds de samenvatting-herbouw zijn eigen
          kop "Je instellingen" / "Waar je cijfers op rusten"; "& toekomst" klopt
          niet meer (de FIRE-doorkijk woont op /toekomst). Deze twee regels lopen
          daar bewust nog niet mee: `cashflow-below-fold.test.tsx` pint de titel
          letterlijk, en dat testbestand is niet van deze wijziging. Hernoemen
          hoort in dezelfde change als die assertie. In de praktijk ziet een
          gebruiker nooit beide labels tegelijk — in Eenvoudig onderdrukt
          `hideHeading` de eigen kop van het blok. */}
      <DepthSection
        title="Instellingen & toekomst"
        summary="Je inkomen, spaarquote en geschatte uitgaven"
      >
        <DynCashflowInstellingenBlok data={data} hideHeading />
      </DepthSection>
    </div>
  )
}
