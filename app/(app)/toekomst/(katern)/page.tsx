import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { OrnamentColophon } from '@/components/editorial'
import { PlanPaneel } from '@/components/toekomst/plan/plan-paneel'
import { OudeLabBladwijzer } from '@/components/toekomst/layout/oude-lab-bladwijzer'
import { LevensstrategieEditorsHost } from '@/components/toekomst/plan/levensstrategie-editors-host'
import { getToekomstClient } from '@/lib/toekomst/load-toekomst-data'
import { computeHorizonFireSim } from '@/lib/fire-target-shared'
import { buildClientRegelSimSnapshot } from '@/lib/future/regel-sim-snapshot'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'

export const metadata: Metadata = {
  title: 'Toekomst — TriFinity',
  description: 'Tijdas, doelen, gebeurtenissen en toekomst-voorkeuren — keuzes maken voor later.',
}

/**
 * /toekomst — katern Plan (ADR 0179 D1/D4, fase 1 stap 15).
 *
 * De kop, het canvas, de katern-koppen en de overlays staan in
 * `(katern)/layout.tsx` en blijven gemonteerd bij een katernwissel; deze page levert
 * alleen het Plan-paneel eronder. De data komt uit de provider van die layout
 * (`loadToekomstData`, één lading per request), niet uit de route (D8).
 *
 * Backwards-compat: oude `?tab=<doelen|gebeurtenissen|voorkeuren|rekenhulp>`- en
 * `?modal=withdrawal`-deeplinks redirecten op de routing-laag (`has`-regels in
 * `next.config.ts`, ADR 0179 besluit Q2) — deze page ziet ze nooit.
 *
 * Levensstrategieën (eigenaarsbesluit 27 sep 2026): de rijen staan bij de gebeurtenissen
 * (`LevensstrategieenBlok`, kolom en pagina); hun editors host deze page één keer
 * (`LevensstrategieEditorsHost`), met de client-veilige snapshot van de canonieke run.
 */
export default function ToekomstPlanPage() {
  return (
    <>
      {/* Tab-root → 'rich' TopBar (utility-cluster) + tab-titel in de mobiele
          bovenbalk, gelijk aan /overzicht en /mijn. Zonder expliciete topBar
          valt NavStackMeta terug op 'simple' en verdwijnt de cluster. Geen
          `bottomBar`: de module-tabs zijn afgeschaft en `tabs` rendert niets
          (ADR 0179 fase 6, spec §2.5); de default `hidden` doet hetzelfde. */}
      <NavStackMeta title="Toekomst" topBar={{ kind: 'rich' }} />

      {/* `/toekomst#verken-je-aannames` (het lab stond hier tot stap 16) → katern Doelen. */}
      <OudeLabBladwijzer />
      <PlanPaneel />

      {/* De editors van de levensstrategieën. De host staat er meteen (klikken gaan nooit
          verloren); de snapshot komt als belofte binnen, zodat het Plan-paneel er niet op
          wacht en een open editor niet sluit als hij binnenkomt (review 27 sep). */}
      <LevensstrategieEditorsHost snapshot={laadStrategieSnapshot()} />

      {/* Krant-stijl colophon als voet van katern Plan. `print:hidden` blijft staan:
          de eigen printknop is weg (B-021), maar de browser-print van de
          gebruiker (Ctrl+P) hoort deze footer nog steeds niet mee te nemen. */}
      <div className="print:hidden">
        <OrnamentColophon text="Geld levert tijd op" module="De Toekomst" />
      </div>
    </>
  )
}

/**
 * De snapshot voor de verschilregel in de footers van de editors: dezelfde canonieke,
 * React-`cache()`'d run die de katern-layout (plan-oordeel) en de Instellingen-bundel
 * (`regelSimSnapshot` in de dashboard-loader) lezen, client-veilig gemaakt met dezelfde
 * builder. Op een volle lading kost hij niets extra; zonder run (geen geboortedatum) is de
 * snapshot `null` en tonen de editors geen verschilregel.
 */
async function laadStrategieSnapshot(): Promise<RegelSimSnapshot | null> {
  try {
    const supabase = await getToekomstClient()
    const shared = await computeHorizonFireSim(supabase)
    return shared ? buildClientRegelSimSnapshot(shared) : null
  } catch (e) {
    console.error('toekomst:plan-strategie-snapshot', e)
    return null
  }
}
