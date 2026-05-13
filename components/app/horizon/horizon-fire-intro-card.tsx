'use client'

/**
 * HorizonFireIntroCard — placeholder die de hoofd-grafiek op /horizon
 * vervangt zolang de gebruiker de HorizonSetupPane niet heeft doorlopen.
 *
 * Trigger: server-loader leest user_feature_visits en zet
 * `hasCompletedHorizonSetup`. Zolang false → deze card. Na save in pane
 * markeert de parent component de state lokaal zodat de chart direct
 * verschijnt zonder reload.
 *
 * Layout-doel: zelfde min-height als de grafiek-container (320px),
 * voorkomt jump bij het in-place wisselen.
 */

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Compass, ArrowRight } from 'lucide-react'
import { CardEditorial, Kicker, EditorialHeadline, EditorialDeck } from '@/components/editorial'

export interface HorizonFireIntroCardProps {
  /** Of de Kern ook nog leeg is (assets.length === 0 && debts.length === 0).
   *  Bepaalt of de secondary link "Ga naar Kern voor data" zichtbaar is. */
  kernEmpty: boolean
}

export function HorizonFireIntroCard({ kernEmpty }: HorizonFireIntroCardProps) {
  const router = useRouter()

  const openSetup = () => {
    router.push('/horizon?horizonSetup=open', { scroll: false })
  }

  return (
    <CardEditorial accent className="px-6 py-10 sm:px-10 sm:py-14" >
      <div className="mx-auto max-w-2xl text-center" style={{ minHeight: 240 }}>
        <div className="flex justify-center">
          <Kicker>Horizon FIRE-prognose</Kicker>
        </div>

        <EditorialHeadline
          level="h2"
          size="sm"
          emphasis="prognose"
          className="mt-3"
        >
          {`Hier verschijnt straks je FIRE-prognose`}
        </EditorialHeadline>

        <div className="mt-5 flex justify-center">
          <EditorialDeck className="text-left">
            Stel eerst een paar basis-voorkeuren in zodat de berekening
            klopt met jouw situatie &mdash; spaartempo, eindstrategie en
            uitgaven na pensioen.
          </EditorialDeck>
        </div>

        <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={openSetup}
            className="inline-flex items-center gap-2 bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
            style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
          >
            <Compass className="h-4 w-4" aria-hidden />
            Stel je prognose-voorkeuren in
          </button>

          {kernEmpty && (
            <Link
              href="/core"
              className="inline-flex items-center gap-1 text-sm text-[var(--ink-2)] underline decoration-dotted underline-offset-4 hover:text-[var(--ink)]"
              style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
            >
              Ga naar Kern om bezittingen toe te voegen
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </CardEditorial>
  )
}
