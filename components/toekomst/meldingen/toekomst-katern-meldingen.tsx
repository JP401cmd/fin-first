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
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { buildDeficitLoanCopy } from '@/lib/horizon/deficit-loan-copy'
import { buildEindsituatieCopy } from '@/lib/horizon/eindsituatie-copy'
import type { NominaalOpLeeftijd } from '@/lib/horizon/eindsituatie-duiding'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
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
  useToekomstBron,
  useToekomstMeldingenContext,
  useToekomstPerspectiefContext,
  useToekomstScenarioContext,
  useToekomstSimContext,
} from '@/components/toekomst/state/toekomst-state-provider'
import { useMeldingBedragenInView } from '@/components/toekomst/state/use-euro-view-feeds'
import { useActiefKatern } from '@/components/toekomst/layout/actief-katern'
import { KaternMelding } from './katern-melding'
import { ontbrekendeGegevensIssues, planOordeelBekend, vrijheidTekst } from './meldingen-bron'
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

/** Stabiele lege rijenlijst: een nieuwe `[]` per render zou de bedragen-memo breken. */
const GEEN_RIJEN: UnifiedProjectionRow[] = []

export function ToekomstKaternMeldingenProvider({
  bron,
  children,
}: {
  bron: ToekomstKaternMeldingenBron
  children: ReactNode
}) {
  const sim = useToekomstSimContext()
  const { initialData } = useToekomstBron()
  const { hasPerspectiveHero } = useToekomstPerspectiefContext()
  const signalen = useToekomstMeldingenContext()
  const { doelActief, effectiveStopAge, labZone } = useToekomstScenarioContext()
  const { masked } = useMaskedAmounts()

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
    unifiedRows,
  } = sim
  const {
    deficitLoanNotice,
    deficitLoanPiekLeeftijd,
    deficitLoanCopyBasis,
    eindsituatiePlan,
    eindsituatieDuiding,
    housingHeldNotice,
    aowNoticeVisible,
  } = signalen
  const { planStatusInput, doelen, labDoelenBuitenPlan, voorkeurenOpen } = bron

  // De toekomstige puntbedragen van de meldingen kruisen de euro-render-grens (ADR
  // 0090/0093) in `useMeldingBedragenInView`: exact één keer gedeflateerd met de
  // kernelfactor van hun leeftijd, vrijheidstijd via `freedomDaysAtAge`. Hier alleen nog
  // formatteren (masked-aware). Fixronde C1: huiswaarde en tekort-piek gingen eerder
  // nominaal door `formatWithFreedom(bedrag, dagtarief)`.
  const bedragen = useMeldingBedragenInView({
    rows: unifiedRows ?? GEEN_RIJEN,
    huis:
      housingHeldNotice && !isPensioenMode
        ? { bedrag: housingHeldNotice.houseValue, age: housingHeldNotice.endAge }
        : null,
    // De piekleeftijd komt uit dezelfde rijen als de detector en mist dus niet; de
    // terugval op de eerste leeftijd houdt het type eerlijk zonder een factor 1 te gokken.
    tekortPiek: deficitLoanNotice
      ? { bedrag: deficitLoanNotice.peak, age: deficitLoanPiekLeeftijd ?? deficitLoanNotice.firstAge }
      : null,
    canonicalDailyRate,
    dailyRateSource: initialData.dailyExpenseRateDetail?.source,
  })

  // Eindsituatie: zelfde copy als de vroegere EindsituatieNotice — nominaal in, de grens
  // deflateert, masked-aware.
  const eindsituatie = useMemo(() => {
    if (!eindsituatieDuiding || !eindsituatiePlan) return null
    const bedragTekst = (b: NominaalOpLeeftijd) => formatMaskedCurrency(bedragen.viewNominaalOpLeeftijd(b), masked)
    return buildEindsituatieCopy({ duiding: eindsituatieDuiding, endForm: eindsituatiePlan.endForm, bedragTekst })
  }, [eindsituatieDuiding, eindsituatiePlan, bedragen, masked])

  // Tekort-lening: de nominale basis uit de state-hook plus de piek in de actieve
  // weergave, met vrijheidstijd in euro's van vandaag.
  const deficitLoanCopy = useMemo(() => {
    if (!deficitLoanCopyBasis || bedragen.viewTekortPiek == null) return null
    return buildDeficitLoanCopy({
      ...deficitLoanCopyBasis,
      peakText: formatMaskedCurrency(bedragen.viewTekortPiek, masked),
      freedomText: vrijheidTekst(bedragen.tekortPiekVrijheidsdagen, masked),
    })
  }, [deficitLoanCopyBasis, bedragen, masked])

  // "Huis nooit verkocht": de huiswaarde op de eindleeftijd in de actieve weergave, met
  // de vrijheidstijd die hij in euro's van vandaag vertegenwoordigt.
  const huisNooitVerkocht = useMemo(() => {
    if (!housingHeldNotice || isPensioenMode || bedragen.viewHuisWaarde == null) return null
    const bedrag = formatMaskedCurrency(bedragen.viewHuisWaarde, masked)
    const vrijheid = vrijheidTekst(bedragen.huisVrijheidsdagen, masked)
    return {
      bedragTekst: vrijheid ? `${bedrag} (${vrijheid} vrijheid)` : bedrag,
      sharePct: housingHeldNotice.sharePct,
      endAge: housingHeldNotice.endAge,
    }
  }, [housingHeldNotice, isPensioenMode, masked, bedragen])

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
