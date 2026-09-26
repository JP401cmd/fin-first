'use client'

/**
 * Meldingen per katern op /toekomst (ADR 0179 D6, spec §4.8) — de host.
 *
 * Eén provider in de `(katern)`-layout, binnen de state-provider:
 *  1. vult de invoer van `wijsMeldingenToe` uit wat de pagina al heeft — de hoofdrun en
 *     de signalen van de state-provider (`useToekomst*Context`), en de server-lading
 *     (plan-oordeel, doelvoortgang, wizardstand). Niets wordt hier herberekend;
 *  2. houdt per katern de minimaliseer-toestand bij (`useKaternMeldingMinimize`, de
 *     own-row pref `status_banner_minimized` onder de katern-route, met een server-seed);
 *  3. deelt dat met het slot bovenaan het actieve katern (`ToekomstKaternMeldingSlot`)
 *     en met de katern-koppen (samenvatting + statuspunt).
 *
 * Eén fetch-pad: er wordt niets opgehaald; alleen minimaliseren schrijft (PUT).
 *
 * De plan-melding leest de plan-oordeelinvoer van de SERVER (`loadPlanStatusInput`,
 * met de geboortedatum-poort) — dezelfde als de oordeelzin in de kop. Zonder oordeel
 * (geen run, of geen geboortedatum) geen plan-melding.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { deflate } from '@/lib/euro-display'
import { formatMaskedCurrency, formatWithFreedom } from '@/lib/format'
import { useEuroView } from '@/lib/hooks/use-euro-view'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { buildEindsituatieCopy } from '@/lib/horizon/eindsituatie-copy'
import type { NominaalOpLeeftijd } from '@/lib/horizon/eindsituatie-duiding'
import {
  KATERN_VOLGORDE,
  doelenSamenvatting,
  instellingenSamenvatting,
  planSamenvatting,
  type KaternId,
} from '@/lib/horizon/katern-copy'
import {
  katernKopStatus,
  wijsMeldingenToe,
  type DoelSignaal,
  type KaternMeldingen,
  type KaternMeldingenInput,
  type KaternMinimizedSeed,
} from '@/lib/horizon/katern-meldingen'
import type { HorizonOutcomeIssue } from '@/lib/horizon/outcome-guard'
import type { PlanStatusInput } from '@/lib/horizon/plan-status'
import type { KaternKopStatus } from '@/components/editorial/katern-koppen'
import type { BannerDisplay } from '@/lib/page-status/display'
import {
  useToekomstMeldingenContext,
  useToekomstPerspectiefContext,
  useToekomstScenarioContext,
  useToekomstSimContext,
} from '@/components/toekomst/state/toekomst-state-provider'
import { useActiefKatern } from '@/components/toekomst/layout/actief-katern'
import { KaternMelding } from './katern-melding'
import { ontbrekendeGegevensIssues, planOordeelBekend } from './meldingen-bron'
import { useKaternMeldingMinimize, type KaternMeldingMinimize } from './use-katern-melding-minimize'

/** Wat de server-layout meegeeft (serialiseerbaar). */
export interface ToekomstKaternMeldingenBron {
  /** `loadToekomstData().planStatusInput` — `null` = geen oordeel. */
  planStatusInput: PlanStatusInput | null
  /** `loadToekomstData().katernMinimized` — het opgeslagen niveau per katern. */
  katernMinimized: KaternMinimizedSeed
  /** De doelen met hun canonieke voortgang (`FinPageData`), zonder lab-doelen. */
  doelen: readonly DoelSignaal[]
  /** Aantal lab-doelen dat niet meer bij het plan past (`selectLabDoelenBuitenPlan`). */
  labDoelenBuitenPlan: number
  /** Open stappen van de plan-review (`totaal − bevestigd`); 0 zonder review. */
  voorkeurenOpen: number
}

export interface KaternMeldingState extends KaternMeldingMinimize {
  readonly samenvatting: string | null
  readonly status: KaternKopStatus | null
}

export interface ToekomstKaternMeldingenWaarde {
  readonly meldingen: KaternMeldingen
  readonly perKatern: Readonly<Record<KaternId, KaternMeldingState>>
}

/** Geëxporteerd voor tests (slot en koppen renderen zonder de hele state-provider). */
export const ToekomstKaternMeldingenContext = createContext<ToekomstKaternMeldingenWaarde | null>(null)

/** `null` buiten de provider — de koppen tonen dan alleen hun labels. */
export function useToekomstKaternMeldingen(): ToekomstKaternMeldingenWaarde | null {
  return useContext(ToekomstKaternMeldingenContext)
}

export function ToekomstKaternMeldingenProvider({
  bron,
  children,
}: {
  bron: ToekomstKaternMeldingenBron
  children: ReactNode
}) {
  const sim = useToekomstSimContext()
  const { hasPerspectiveHero } = useToekomstPerspectiefContext()
  const signalen = useToekomstMeldingenContext()
  const { doelActief, effectiveStopAge, labZone } = useToekomstScenarioContext()
  const { masked } = useMaskedAmounts()
  const { view: euroView } = useEuroView()

  const {
    simResult,
    kernelStatus,
    kernelMaandHint,
    currentAge,
    ankerReach,
    ankerStop,
    isFixedAnchorMode,
    isPensioenMode,
    canonicalDailyRate,
    effectiveFreedomPct,
    fireTargetGuard,
    showFireTargetNotice,
    heroFireAge,
    input,
  } = sim
  const {
    deficitLoanNotice,
    deficitLoanCopy,
    eindsituatiePlan,
    eindsituatieDuiding,
    housingHeldNotice,
    aowNoticeVisible,
  } = signalen
  const { planStatusInput, doelen, labDoelenBuitenPlan, voorkeurenOpen } = bron

  // Eindsituatie: zelfde copy en zelfde euro-weergave als de vroegere EindsituatieNotice —
  // nominaal in, exact één keer gedeflateerd (ADR 0090/0093), masked-aware.
  const eindsituatie = useMemo(() => {
    if (!eindsituatieDuiding || !eindsituatiePlan) return null
    const bedragTekst = (b: NominaalOpLeeftijd) =>
      formatMaskedCurrency(deflate(b.bedrag, b.inflationFactor, euroView), masked)
    return buildEindsituatieCopy({ duiding: eindsituatieDuiding, endForm: eindsituatiePlan.endForm, bedragTekst })
  }, [eindsituatieDuiding, eindsituatiePlan, euroView, masked])

  // "Huis nooit verkocht": dezelfde bedragtekst als het vroegere blok boven de grafiek
  // (huiswaarde op de eindleeftijd, masked-aware, vrijheidstijd op de bundel-dagbasis).
  const huisNooitVerkocht = useMemo(() => {
    if (!housingHeldNotice || isPensioenMode) return null
    const bedrag = formatMaskedCurrency(housingHeldNotice.houseValue, masked)
    const vrijheid =
      canonicalDailyRate > 0 && !masked
        ? formatWithFreedom(housingHeldNotice.houseValue, canonicalDailyRate, {
            includeCurrency: false,
            format: 'long',
            includeDays: false,
          })
        : null
    return {
      bedragTekst: vrijheid ? `${bedrag} (${vrijheid} vrijheid)` : bedrag,
      sharePct: housingHeldNotice.sharePct,
      endAge: housingHeldNotice.endAge,
    }
  }, [housingHeldNotice, isPensioenMode, masked, canonicalDailyRate])

  // Ontbrekende gegevens: de guards die de KPI-tegels al toetsen (outcome-guard), niet
  // opnieuw afgeleid (`ontbrekendeGegevensIssues`). Alleen in de eigen weergave, net als
  // de tegels; dit slot is de énige ingang naar /mijn/profiel (spec §4.8/§4.9).
  const ontbrekendeGegevens = useMemo<HorizonOutcomeIssue[]>(
    () =>
      ontbrekendeGegevensIssues({
        perspectief: hasPerspectiveHero,
        vastAnker: isFixedAnchorMode,
        doelbedrag: fireTargetGuard,
        vrijheidsleeftijd: heroFireAge,
        jaaruitgaveNaPensioen: input?.yearlyMustExpenses ?? null,
      }),
    [hasPerspectiveHero, isFixedAnchorMode, fireTargetGuard, heroFireAge, input?.yearlyMustExpenses],
  )

  const meldingen = useMemo(() => {
    const invoer: KaternMeldingenInput = {
      masked,
      plan: planOordeelBekend(planStatusInput)
        ? {
            status: planStatusInput,
            kernelStatus,
            fireAgeFractional: simResult?.fireAgeFractional ?? null,
            currentAge,
            ankerReach,
            ankerStop,
            kernelMaandHint,
          }
        : null,
      tekortLening:
        deficitLoanNotice && deficitLoanCopy ? { notice: deficitLoanNotice, copy: deficitLoanCopy } : null,
      eindsituatie,
      labDoelenBuitenPlan,
      doelen,
      aowOntbreekt: aowNoticeVisible,
      huisNooitVerkocht,
      ontbrekendeGegevens,
    }
    return wijsMeldingenToe(invoer)
  }, [
    masked,
    planStatusInput,
    kernelStatus,
    simResult?.fireAgeFractional,
    currentAge,
    ankerReach,
    ankerStop,
    kernelMaandHint,
    deficitLoanNotice,
    deficitLoanCopy,
    eindsituatie,
    labDoelenBuitenPlan,
    doelen,
    aowNoticeVisible,
    huisNooitVerkocht,
    ontbrekendeGegevens,
  ])

  // Samenvattingen op de inactieve koppen (kopij-toets §4). Geen eigen getal: het
  // vrijheids-% en het bereik uit de hoofdrun, de doelstand uit het lab.
  const planTekst = isFixedAnchorMode
    ? ankerReach != null
      ? planSamenvatting({ kind: 'vast', reach: ankerReach })
      : null
    : showFireTargetNotice
      ? null
      : planSamenvatting({ kind: 'solved', doelbedragPct: effectiveFreedomPct })
  const doelenTekst = doelenSamenvatting(
    doelActief && effectiveStopAge != null ? { stopAge: effectiveStopAge, zone: labZone } : null,
  )
  const instellingenTekst = instellingenSamenvatting({ voorkeurenOpen, aowOntbreekt: aowNoticeVisible })

  // Vaste volgorde van hook-aanroepen: één per katern.
  const plan = useKaternMeldingMinimize({
    katern: 'plan',
    hoogsteErnst: meldingen.plan.hoogsteErnst,
    initialLevel: bron.katernMinimized.plan,
  })
  const doelenMin = useKaternMeldingMinimize({
    katern: 'doelen',
    hoogsteErnst: meldingen.doelen.hoogsteErnst,
    initialLevel: bron.katernMinimized.doelen,
  })
  const instellingen = useKaternMeldingMinimize({
    katern: 'instellingen',
    hoogsteErnst: meldingen.instellingen.hoogsteErnst,
    initialLevel: bron.katernMinimized.instellingen,
  })

  // Op de velden van de hooks memoïseren, niet op hun (per render nieuwe) objecten: dan
  // rendert een kop of slot alleen mee als er voor hem iets verandert.
  const { display: planDisplay, minimize: planMinimize, restore: planRestore } = plan
  const { display: doelenDisplay, minimize: doelenMinimize, restore: doelenRestore } = doelenMin
  const {
    display: instellingenDisplay,
    minimize: instellingenMinimize,
    restore: instellingenRestore,
  } = instellingen

  const waarde = useMemo<ToekomstKaternMeldingenWaarde>(() => {
    const minimize: Record<KaternId, KaternMeldingMinimize> = {
      plan: { display: planDisplay, minimize: planMinimize, restore: planRestore },
      doelen: { display: doelenDisplay, minimize: doelenMinimize, restore: doelenRestore },
      instellingen: { display: instellingenDisplay, minimize: instellingenMinimize, restore: instellingenRestore },
    }
    const samenvatting: Record<KaternId, string | null> = {
      plan: planTekst,
      doelen: doelenTekst,
      instellingen: instellingenTekst,
    }
    const perKatern = {} as Record<KaternId, KaternMeldingState>
    for (const k of KATERN_VOLGORDE) {
      perKatern[k] = { ...minimize[k], samenvatting: samenvatting[k], status: katernKopStatus(meldingen, k) }
    }
    return { meldingen, perKatern }
  }, [
    meldingen,
    planDisplay,
    planMinimize,
    planRestore,
    doelenDisplay,
    doelenMinimize,
    doelenRestore,
    instellingenDisplay,
    instellingenMinimize,
    instellingenRestore,
    planTekst,
    doelenTekst,
    instellingenTekst,
  ])

  return <ToekomstKaternMeldingenContext.Provider value={waarde}>{children}</ToekomstKaternMeldingenContext.Provider>
}

/**
 * Het meldingenslot bovenaan het ACTIEVE katern. Staat in de layout, tussen de
 * katern-koppen en het katern: één plek, altijd gemount (de `aria-live`-regio van
 * `KaternMelding` blijft bestaan bij een katernwissel), en de katern-pages hoeven de
 * route niet te kennen (D8).
 */
export function ToekomstKaternMeldingSlot({ className = '' }: { className?: string }) {
  const katern = useActiefKatern()
  const ctx = useToekomstKaternMeldingen()
  if (!ctx) return null
  return <KaternMeldingSlotVoor katern={katern} waarde={ctx} className={className} />
}

/** Het slot voor één katern — los van de route, zodat tests en terugvaloptie C′ het kunnen gebruiken. */
export function KaternMeldingSlotVoor({
  katern,
  waarde,
  className = '',
}: {
  katern: KaternId
  waarde: ToekomstKaternMeldingenWaarde
  className?: string
}) {
  const staat = waarde.perKatern[katern]
  const display: BannerDisplay | 'none' = staat.display
  return (
    <KaternMelding
      meldingen={waarde.meldingen[katern].meldingen}
      display={display}
      onMinimize={staat.minimize}
      className={className}
    />
  )
}
