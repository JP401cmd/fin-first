import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadAssetsData } from '@/lib/assets-data-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import type { Perspective } from '@/lib/household-data'
import { BezittingenView } from '@/components/overview/bezittingen-view'
import { loadHefboomPageVerdict } from '@/lib/hefboom-page-verdict'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { getPageInfo } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Bezittingen — TriFinity',
  description: 'Cash, beleggingen, huis en pensioen — de hefboom bezittingen.',
}

/**
 * /overzicht/bezittingen — eerste hefboom-verdieping.
 *
 * Layout:
 *  - Statuspunt + PageInfo rechtsboven.
 *  - AssetsPage met `BezittingenFilter` in de toolbar (naast Herwaarderen /
 *    Bezitting toevoegen).
 *
 * De drie wegklikbare inspiratiekaarten (samengestelde rente, beheerkosten,
 * inflatie) zijn op verzoek van de eigenaar verwijderd (melding B-047): ze
 * overweldigden de eerste kennismaking en waren na één klik op de ✕ praktisch
 * onvindbaar. Met hen verdween ook het `tf-insight-hidden`-mechanisme.
 *
 * De losse vierdeling-strook (cash / beleggen / eigen huis / pensioen) is
 * op verzoek verwijderd; de categorie-lijst in AssetsPage toont de
 * bezittingen weer in hun oorspronkelijke groepering.
 */
async function tryLoadAssetsData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  perspective: Perspective,
) {
  try {
    return await loadAssetsData(supabase, perspective)
  } catch {
    return undefined
  }
}

/*
 * GEEN runway-zin meer in de deck (melding B-035, 8 sep 2026).
 *
 * UR3-19 (optie C) zette hier één runway-zin neer — "Als je nu stopt, reikt je
 * liquide vermogen tot je Xe" — als vervanging van zes handgerolde "bruto
 * bezittingentotaal ÷ dagtarief"-sommen. Die vervanging blijft staan: de
 * verkeerde sommen zijn en blijven weg (zie ADR 0126 D1 en de grendel in
 * components/core/assets-client.bruto-vrijheidstijd.test.ts).
 *
 * Wat vervalt is alleen de PLAATSING op deze pagina. De eigenaar vroeg de zin
 * hier weg te halen; hij staat al op /overzicht zelf, in de vrijheid-strip van
 * de hero (`components/overview/overzicht-hero/vrijheid-strip.tsx`, ook via
 * `ankerZin`). Twee keer dezelfde uitspraak op twee schermen is geen extra
 * inzicht.
 *
 * Meegenomen winst: hiermee vervalt de extra kernel-run
 * (`computeHorizonRunway`) die deze route ervoor draaide en die bij het
 * UR3-19-besluit expliciet als kostenpost was geaccepteerd.
 */

export default async function OverzichtBezittingenPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  // Met de inspiratiekaarten verviel ook de enige reden dat deze route
  // `loadHorizonRaw` aanriep (drempel-data: liquide cash en belegd vermogen).
  // Die extra laadslag is dus mee verdwenen.
  const assetsData = await tryLoadAssetsData(supabase, perspective)
  // Oordeel in de paginatitel — uit DEZELFDE hefboom-score als het statuspunt
  // hierboven, zodat titel en stip niet uit elkaar kunnen lopen.
  // `loadLeverScores` is React-`cache()`-gewrapt en draait op deze route toch al.
  const verdict = await loadHefboomPageVerdict(supabase, perspective, 'bezittingen')

  return (
    <>
      <NavStackMeta title="Bezittingen" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          content={getPageInfo('/overzicht/bezittingen')}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <BezittingenView
        initialData={assetsData}
        verdict={verdict.label}
        verdictTone={verdict.status}
      />
    </>
  )
}
