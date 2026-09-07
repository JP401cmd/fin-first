'use client'

/**
 * cashflow-instellingen-lazy.tsx — het grondslagblok (inkomen, uitgaven,
 * spaarquote) als client-eiland dat zijn data pas ophaalt wanneer het in beeld
 * komt. Daarmee blijven ~25 `loadCoreData`-queries buiten het paginarequest van
 * iedereen die niet naar beneden scrollt.
 *
 * Woonde als `cashflow-below-fold.tsx` in de route-map van de cashflow-hub, met
 * daarin ook het lazy-eiland en de skeleton van `CashOverview`. Die hub is
 * opgeheven (UR3-28) en `CashOverview` bestaat niet meer; wat overblijft is dit
 * ene blok, en dat is een component en geen route-bestand.
 *
 * ── VERHUISD 7 sep 2026 (W-002) ─────────────────────────────────────────────
 * Van /overzicht/budget/transacties naar /overzicht/budget/instellingen. Op de
 * transactiepagina was dit een voetnoot onder de vouw; het is een instelling, en
 * die hoort op het instellingenscherm. De transactiepagina rendert 'm niet meer
 * — verhuisd, niet gekopieerd.
 *
 * MET DE VERHUIZING VERVIEL DE DISCLOSURE. Hier hing het blok in Eenvoudig in
 * een `DepthSection` met de titel "Instellingen & toekomst" (CF-4). Die bestond
 * om rust te scheppen op een pagina die ergens ánders over ging — de transacties
 * — zonder de instellingen weg te nemen. Op een pagina die zélf "Instellingen"
 * heet is dat een tweede kop om hetzelfde blok, dus de verpakking is weg: het
 * blok rendert nu in béide weergaven onveranderd, mét zijn eigen kop
 * ("Je instellingen" / "Waar je cijfers op rusten"). Dat lost meteen de
 * verouderde titel op — "& toekomst" klopte al niet meer sinds de
 * FIRE-doorkijk naar /toekomst verhuisde.
 */

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'

/**
 * Voorlaad-marge van de IntersectionObserver: begin met ophalen zodra het blok
 * nog 300px onder de vouw zit, zodat de skeleton in de praktijk zelden in beeld
 * komt.
 */
const SETTINGS_PREFETCH_MARGIN = '300px 0px'

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
    // zichtbaar — bewust géén HideInSimple, en sinds de verhuizing (W-002) ook
    // geen disclosure meer: op het instellingenscherm zíjn dit de instellingen.
    <section ref={anchorRef} className="mx-auto max-w-6xl px-4 pb-8 pt-2 sm:px-6">
      {state.status === 'ready' ? (
        <DynCashflowInstellingenBlok data={state.data} />
      ) : (
        <CashflowInstellingenBlokSkeleton />
      )}
    </section>
  )
}
