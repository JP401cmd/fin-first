'use client'

/**
 * InstellingenRijen — katern Instellingen als lijst met één rij per instelling
 * (ADR 0179 D4, fase 3; spec §4.3 wireframe, §7.5). Vervangt de kaarten van de oude
 * Voorkeuren-view.
 *
 *  I · Je plan         stopmoment, eindleeftijd, onttrekking, uitgave na pensioen; in
 *                      Eenvoudig achter "Meer over je plan": geen tekort-lening en de drie
 *                      pot-regels (ADR 0026: bedieningsvlak → `DepthSection`, nooit hard weg).
 *  II · Levensstrategieën  AOW, pensioen, werk, eigen woning — in beide modi (UAT-TOEK-42).
 *  III · Marktaannames inflatie (+ link naar inflatie-koopkracht, besluit §11 #8), rendement,
 *                      de afgeleide opnamerate (leesrij) en Box 3; in Eenvoudig ingeklapt.
 *
 * Elke ✎ opent de BESTAANDE body (één body, twee hosts): `RegelBewerkenPane` (regels, met
 * anker), `VoorkeurBewerkenSheet`/`Box3MethodeSheet`, `StrategieEditors`, `UitgavenRijPane`.
 * Elke editor krijgt de snapshot, zodat zijn footer de verschilregel uit dezelfde
 * override-run als de wizard draagt (§7.7). Eén `open`-state: hoogstens één overlay tegelijk.
 *
 * Deeplink `?rij=` (aliassen `?regel=`, `?strategie=`) via `useInstellingenRijDeeplink`.
 * Leest de route verder niet (ADR 0179 D8).
 */

import { useCallback, useId, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import type { FireParams } from '@/lib/fire-params'
import type { FirePlan, FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalProfiel, WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { PotRulesConfig } from '@/lib/pot-rules'
import type { WealthGroup } from '@/lib/wealth-composition'
import type { LifeEvent } from '@/lib/horizon-data'
import type { HousingStrategyConfig } from '@/lib/housing-strategy'
import { SectionLabel } from '@/components/editorial'
import { DepthSection } from '@/components/app/depth-section'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { RegelBewerkenPane } from '@/components/future/regel-bewerken-pane'
import { VoorkeurBewerkenSheet } from '@/components/future/voorkeur-bewerken-sheet'
import { VOORKEUR_UITLEG } from '@/components/future/voorkeur-bewerken-body'
import { Box3MethodeSheet } from '@/components/future/box3-methode-sheet'
import { StrategieEditors, type StrategieEditorsData } from '@/components/future/strategie/strategie-editors'
import { RIJ_META, type RijSectie, type RijSleutel } from '@/lib/toekomst/instellingen-rij'
import {
  EFFECTIEF_SWR_HINT,
  EFFECTIEF_SWR_LABEL,
  INFLATIE_LINK,
  INSTELLINGEN_SECTIE_DECK,
  INSTELLINGEN_SECTIE_KOP,
  MEER_OVER_JE_PLAN,
  RIJ_LABEL,
  pct,
  rijwaarde,
  rijwaardeTekst,
  type RijwaardenInput,
} from '@/lib/toekomst/instellingen-rijwaarden'
import { InstellingRij, RijWaarde } from './instelling-rij'
import { UitgavenRijPane } from './uitgaven-rij-pane'
import { useInstellingenRijDeeplink } from './use-instellingen-rij-deeplink'

/** Anker van sectie I — behoudt de oude `#voorkeuren`-bladwijzer. */
export const INSTELLINGEN_PLAN_ANKER = 'voorkeuren'

const PLAN_KERN: RijSleutel[] = ['stopmoment', 'eindleeftijd', 'onttrekking', 'uitgave-na-pensioen']
const PLAN_MEER: RijSleutel[] = ['geen-tekort-lening', 'onttrekkingsvolgorde', 'verdeling-toename', 'onttrekking-afname']
const LEVEN: RijSleutel[] = ['aow', 'pensioen', 'werk', 'huis']

export interface InstellingenRijenProps {
  fireParams: FireParams
  fireStrategy: FireStrategyConfig
  firePlan: FirePlan | null
  withdrawalStrategy: WithdrawalStrategyConfig
  withdrawalProfiel: WithdrawalProfiel
  simSnapshot: RegelSimSnapshot | null
  regelVoorkeuren: PotRulesConfig
  potBalances: Record<WealthGroup, number>
  box3HeffingvrijInkomen: number | null
  events: LifeEvent[]
  strategieData: StrategieEditorsData
  housingStrategy: HousingStrategyConfig | null
  retirementMethod: string | null
  /** Dezelfde bron als KPI 4 op Plan (`effectiveInput.yearlyMustExpenses`). */
  uitgaveNaPensioen: number
  geenTekortLening: boolean
  tekortLeningRente: number | null
}

export function InstellingenRijen(props: InstellingenRijenProps) {
  const router = useRouter()
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'
  const [open, setOpen] = useState<RijSleutel | null>(null)
  // S6 — geopend via `?strategie=pensioen` (de verwijzing vanaf Box 1): dan staat de
  // factor-A-uitvraag in de pensioen-editor meteen open.
  const [pensioenViaDeeplink, setPensioenViaDeeplink] = useState(false)

  useInstellingenRijDeeplink(
    useCallback((rij: RijSleutel) => {
      setOpen(rij)
      // Elke deeplink naar de pensioenrij (ook de oude `?strategie=pensioen`) komt van een
      // opdracht "vul je factor A in"; een klik op de rij zelf niet.
      setPensioenViaDeeplink(rij === 'pensioen')
    }, []),
  )
  const sluit = useCallback(() => {
    setOpen(null)
    setPensioenViaDeeplink(false)
  }, [])

  const invoer: RijwaardenInput = {
    firePlan: props.firePlan,
    fireStrategy: props.fireStrategy,
    withdrawalProfiel: props.withdrawalProfiel,
    withdrawalStrategy: props.withdrawalStrategy,
    retirementMethod: props.retirementMethod,
    uitgaveNaPensioen: props.uitgaveNaPensioen,
    geenTekortLening: props.geenTekortLening,
    tekortLeningRente: props.tekortLeningRente,
    potRules: props.regelVoorkeuren,
    events: props.events,
    housingStrategy: props.housingStrategy,
    inflationRate: props.fireParams.inflationRate,
    grossReturn: props.fireParams.grossReturn,
    effectiveSwr: props.fireParams.effectiveSwr,
    box3Method: props.fireParams.box3Method,
  }
  const rij = (sleutel: RijSleutel) => (
    <InstellingRij
      key={sleutel}
      rij={sleutel}
      label={RIJ_LABEL[sleutel]}
      waarde={<RijWaarde delen={rijwaarde(sleutel, invoer)} />}
      onEdit={() => setOpen(sleutel)}
    />
  )
  // Leesregel bij ingeklapt: de huidige waarden, zonder bedragen (die zijn niet te maskeren in een string).
  const leesregel = (rijen: RijSleutel[]) =>
    rijen.map((r) => `${RIJ_LABEL[r]}: ${rijwaardeTekst(rijwaarde(r, invoer), () => '…')}`).join(' · ')

  const marktRijen = (
    <>
      {rij('inflatie')}
      <p className="py-2 pl-0.5">
        <Link
          href={INFLATIE_LINK.href}
          className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-[var(--module-active-700)] underline-offset-2 hover:underline"
        >
          {INFLATIE_LINK.label}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </p>
      {rij('rendement')}
      <InstellingRij
        rij="effectief-swr"
        label={EFFECTIEF_SWR_LABEL}
        waarde={pct(props.fireParams.effectiveSwr)}
        hint={EFFECTIEF_SWR_HINT}
      />
      {rij('box3')}
      <p className="mt-3 text-xs leading-snug text-[var(--ink-3)]">
        Het rendement per bezitting stel je in bij{' '}
        <Link href="/overzicht/bezittingen" className="underline hover:text-[var(--ink-2)]">
          je bezittingen
        </Link>{' '}
        en gaat vóór; het rendement hier geldt voor bezittingen zonder eigen rendement.
      </p>
    </>
  )

  const editor = open ? RIJ_META[open].editor : null
  const regelEditor = editor?.soort === 'regel' ? editor : null
  const voorkeurKolom = editor?.soort === 'voorkeur' ? editor.kolom : null

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 pb-10 sm:px-6">
      <Sectie sectie="plan" num="I" id={INSTELLINGEN_PLAN_ANKER}>
        {PLAN_KERN.map(rij)}
        {simple ? (
          <div className="mt-4">
            <DepthSection title={MEER_OVER_JE_PLAN} summary={leesregel(PLAN_MEER)}>
              {PLAN_MEER.map(rij)}
            </DepthSection>
          </div>
        ) : (
          PLAN_MEER.map(rij)
        )}
      </Sectie>

      <Sectie sectie="levensstrategieen" num="II">
        {LEVEN.map(rij)}
      </Sectie>

      {simple ? (
        // Eenvoudig: ingeklapt (ADR 0026); de DepthSection draagt de zichtbare titel.
        <Sectie sectie="markt" num="III" zonderLabel>
          <DepthSection title={INSTELLINGEN_SECTIE_KOP.markt} summary={leesregel(['inflatie', 'rendement', 'box3'])}>
            {marktRijen}
          </DepthSection>
        </Sectie>
      ) : (
        <Sectie sectie="markt" num="III">
          {marktRijen}
        </Sectie>
      )}

      {/* ── Editors: de bestaande bodies, één tegelijk ─────────────────────── */}
      <RegelBewerkenPane
        open={regelEditor != null}
        regelId={regelEditor?.regel ?? null}
        anker={regelEditor?.anker ?? null}
        onClose={sluit}
        // De body sluit zelf (onClose) en meldt daarna onSaved: dan herlaadt de bundel.
        onSaved={() => router.refresh()}
        simSnapshot={props.simSnapshot}
        fireStrategy={props.fireStrategy}
        firePlan={props.firePlan}
        withdrawalStrategy={props.withdrawalStrategy}
        potRules={props.regelVoorkeuren}
        potBalances={props.potBalances}
      />
      {voorkeurKolom && (
        <VoorkeurBewerkenSheet
          title={RIJ_LABEL[open!]}
          column={voorkeurKolom}
          currentValuePct={(voorkeurKolom === 'inflation_rate' ? props.fireParams.inflationRate : props.fireParams.grossReturn) * 100}
          helperText={VOORKEUR_UITLEG[voorkeurKolom]}
          snapshot={props.simSnapshot}
          onClose={sluit}
        />
      )}
      {editor?.soort === 'box3' && (
        <Box3MethodeSheet
          current={props.fireParams.box3Method}
          currentHeffingvrijInkomen={props.box3HeffingvrijInkomen}
          snapshot={props.simSnapshot}
          onClose={sluit}
        />
      )}
      <StrategieEditors
        open={editor?.soort === 'strategie' ? editor.strategie : null}
        onClose={sluit}
        events={props.events}
        data={props.strategieData}
        readOnly={false}
        autoOpenJaarruimte={pensioenViaDeeplink}
        snapshot={props.simSnapshot}
      />
      <UitgavenRijPane open={editor?.soort === 'uitgaven'} onClose={sluit} snapshot={props.simSnapshot} />
    </div>
  )
}

function Sectie({
  sectie,
  num,
  id,
  zonderLabel = false,
  children,
}: {
  sectie: RijSectie
  num: string
  id?: string
  /** Zonder zichtbare sectiekop en deck (de ingeklapte `DepthSection` draagt de titel). */
  zonderLabel?: boolean
  children: ReactNode
}) {
  const kopId = useId()
  return (
    <section id={id} aria-labelledby={kopId} className="scroll-mt-20">
      <h2 id={kopId} className="sr-only">
        {INSTELLINGEN_SECTIE_KOP[sectie]}
      </h2>
      {!zonderLabel && (
        <>
          <div aria-hidden="true">
            <SectionLabel num={num} className="mb-2">
              {INSTELLINGEN_SECTIE_KOP[sectie]}
            </SectionLabel>
          </div>
          <p className="mb-2 text-xs leading-snug text-[var(--ink-3)]">{INSTELLINGEN_SECTIE_DECK[sectie]}</p>
        </>
      )}
      {children}
    </section>
  )
}
