'use client'

/**
 * InstellingenRijen — katern Instellingen als checklist van je plan (ADR 0179 D4, fase 3;
 * herontwerp R1, eigenaarsbesluit 27 sep 2026). Eén rij per instelling.
 *
 *  I · Je plan          stopmoment, einde van je plan, onttrekking, uitgave na pensioen.
 *  II · Hoe je potten meebewegen  de tekort-lening en de drie pot-regels — in beide modi
 *                       ingeklapt (`DepthSection`), met een samenvatting ("4 regels · alle
 *                       standaard"). ADR 0026: bedieningsvlak → ingeklapt, nooit hard weg.
 *  III · Marktaannames  inflatie (hint: inflatie-koopkracht, besluit §11 #8), rendement
 *                       (hint: rendement per bezitting gaat vóór) en Box 3; in Eenvoudig
 *                       ingeklapt.
 *
 * De levensstrategieën (AOW, pensioen, werk, eigen woning) staan sinds 27 sep bij de
 * levensgebeurtenissen op Plan (`LevensstrategieenBlok`). Een oude deeplink hierheen
 * (`?rij=aow`, `?strategie=pensioen`) stuurt `next.config.ts` door; komt er toch één binnen
 * (client-navigatie buiten de redirect om), dan gaat hij hier door naar Plan.
 *
 * Bovenaan staat bij een plan dat niet (volledig) haalbaar is één duidingsregel: dezelfde
 * melding als in het Plan-slot (`wijsMeldingenToe` → "Plan nog niet haalbaar" /
 * "Plan dekt N%"), met de rij waar de keuze woont (✎ Stopmoment). Inzicht, geen advies: er
 * wordt niets berekend en geen rangorde bepaald.
 *
 * Elke ✎ opent de BESTAANDE body (één body, twee hosts): `RegelBewerkenPane` (regels, met
 * anker), `VoorkeurBewerkenSheet`/`Box3MethodeSheet`, `UitgavenRijPane`. De schermtitel is
 * gelijk aan het rijlabel. Elke editor krijgt de snapshot, zodat zijn footer de
 * verschilregel uit dezelfde override-run als de wizard draagt (§7.7). Eén `open`-state:
 * hoogstens één overlay tegelijk.
 *
 * Deeplink `?rij=` (aliassen `?regel=`, `?strategie=`) via `useInstellingenRijDeeplink`.
 * Leest de route verder niet (ADR 0179 D8).
 */

import { Fragment, useCallback, useId, useState, type MouseEvent, type ReactNode } from 'react'
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
import type { FreedomRateSource } from '@/lib/format'
import type { PlanReviewProgress } from '@/lib/plan-review/types'
import { LEVERAGE_STATUS_DOT } from '@/lib/leverage-status'
import { DepthSection } from '@/components/app/depth-section'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { RegelBewerkenPane } from '@/components/future/regel-bewerken-pane'
import { VoorkeurBewerkenSheet } from '@/components/future/voorkeur-bewerken-sheet'
import { VOORKEUR_UITLEG } from '@/components/future/voorkeur-bewerken-body'
import { Box3MethodeSheet } from '@/components/future/box3-methode-sheet'
import { useToekomstKaternMeldingen } from '@/components/toekomst/meldingen/toekomst-katern-meldingen'
import type { KaternMeldingActie } from '@/lib/horizon/katern-meldingen'
import {
  INSTELLINGEN_PAGINA,
  RIJ_META,
  type RijSectie,
  type RijSleutel,
} from '@/lib/toekomst/instellingen-rij'
import {
  DUIDING_KOPIJ,
  INFLATIE_LINK,
  duidingActieTekst,
  duidingTitel,
  INSTELLINGEN_SECTIE_DECK,
  INSTELLINGEN_SECTIE_KICKER,
  INSTELLINGEN_SECTIE_KOP,
  RENDEMENT_HINT,
  RIJ_LABEL,
  rijStaat,
  rijwaarde,
  rijwaardeTekst,
  sectieSamenvatting,
  type RijwaardenInput,
} from '@/lib/toekomst/instellingen-rijwaarden'
import { InstellingRij, RijWaarde } from './instelling-rij'
import { UitgavenRijPane } from './uitgaven-rij-pane'
import { useInstellingenRijDeeplink } from './use-instellingen-rij-deeplink'

/** Anker van sectie I — behoudt de oude `#voorkeuren`-bladwijzer. */
export const INSTELLINGEN_PLAN_ANKER = 'voorkeuren'

const PLAN_RIJEN: RijSleutel[] = ['stopmoment', 'eindleeftijd', 'onttrekking', 'uitgave-na-pensioen']
const POTTEN_RIJEN: RijSleutel[] = ['geen-tekort-lening', 'onttrekkingsvolgorde', 'verdeling-toename', 'onttrekking-afname']
const MARKT_RIJEN: RijSleutel[] = ['inflatie', 'rendement', 'box3']

/** De titel van de ingeklapte `DepthSection` per sectie (de sectiekop zelf is de h2). */
const INGEKLAPT_TITEL: Partial<Record<RijSectie, string>> = {
  potten: 'De vier regels voor je potten',
  markt: 'Inflatie, rendement en Box 3',
}

/** De plan-meldingen die de duidingsregel bovenaan dragen (`wijsMeldingenToe`). */
const DUIDING_MELDINGEN = new Set(['plan-niet-haalbaar', 'plan-tekort'])

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
  housingStrategy: HousingStrategyConfig | null
  retirementMethod: string | null
  /** Dezelfde bron als KPI 4 op Plan (`effectiveInput.yearlyMustExpenses`). */
  uitgaveNaPensioen: number
  geenTekortLening: boolean
  /** De rente waar de kern mee rekent (`resolveDeficitLoanRate`, review Y2). */
  tekortLeningRente: number
  /** Het canonieke dagtarief uit de bundel (`HorizonPageData.dailyExpenseRate`). */
  dagtarief: number
  dagtariefBron?: FreedomRateSource
  /**
   * De afgeleide wizard-voortgang (`derivePlanReviewProgress`) — per rij de stille
   * markering "nog niet bevestigd". `null` = de review kan niets bewaren: geen markering.
   */
  planReviewProgress?: PlanReviewProgress | null
}

export function InstellingenRijen(props: InstellingenRijenProps) {
  const router = useRouter()
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'
  const [open, setOpen] = useState<RijSleutel | null>(null)

  // Een levensstrategie-deeplink stuurt de hook zelf door naar Plan; hier komen alleen
  // de rijen van dit katern binnen.
  useInstellingenRijDeeplink(useCallback((rij: RijSleutel) => setOpen(rij), []))
  const sluit = useCallback(() => setOpen(null), [])

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
    box3Method: props.fireParams.box3Method,
    dagtarief: props.dagtarief,
    dagtariefBron: props.dagtariefBron,
  }

  const openStappen = new Set(
    (props.planReviewProgress?.stappen ?? []).filter((s) => s.status === 'open').map((s) => s.stap),
  )

  const rij = (sleutel: RijSleutel, hint?: ReactNode) => {
    const stap = RIJ_META[sleutel].wizardStap
    return (
      <InstellingRij
        key={sleutel}
        rij={sleutel}
        label={RIJ_LABEL[sleutel]}
        waarde={<RijWaarde delen={rijwaarde(sleutel, invoer)} />}
        staat={rijStaat(sleutel, invoer)}
        nogNietBevestigd={stap != null && openStappen.has(stap)}
        hint={hint}
        onEdit={() => setOpen(sleutel)}
      />
    )
  }
  // Leesregel bij ingeklapt: de huidige waarden, zonder bedragen (die zijn niet te maskeren in een string).
  const leesregel = (rijen: RijSleutel[]) =>
    rijen.map((r) => `${RIJ_LABEL[r]}: ${rijwaardeTekst(rijwaarde(r, invoer), () => '…')}`).join(' · ')

  const hintLink =
    'underline decoration-[var(--border-ed)] underline-offset-2 hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'
  const marktRijen = (
    <>
      {rij(
        'inflatie',
        <Link href={INFLATIE_LINK.href} className={`inline-flex items-center gap-1 ${hintLink}`}>
          {INFLATIE_LINK.label}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>,
      )}
      {rij(
        'rendement',
        <>
          {RENDEMENT_HINT.voor}
          <Link href={RENDEMENT_HINT.link.href} className={hintLink}>
            {RENDEMENT_HINT.link.label}
          </Link>
          {RENDEMENT_HINT.na}
        </>,
      )}
      {rij('box3')}
    </>
  )

  const editor = open ? RIJ_META[open].editor : null
  const regelEditor = editor?.soort === 'regel' ? editor : null
  const voorkeurKolom = editor?.soort === 'voorkeur' ? editor.kolom : null

  return (
    <div className="space-y-12 pb-10">
      <PlanDuidingsregel onOpenRij={setOpen} />

      <Sectie sectie="plan" num="I" id={INSTELLINGEN_PLAN_ANKER}>
        {PLAN_RIJEN.map((r) => rij(r))}
      </Sectie>

      {/* II · altijd ingeklapt, ook in Volledig: vier regels die de meeste mensen op de
          standaard laten staan. De samenvatting zegt of er iets is aangepast. */}
      <Sectie sectie="potten" num="II">
        <DepthSection
          title={INGEKLAPT_TITEL.potten!}
          summary={sectieSamenvatting(POTTEN_RIJEN, invoer)}
          ingeklapt
        >
          {POTTEN_RIJEN.map((r) => rij(r))}
        </DepthSection>
      </Sectie>

      <Sectie sectie="markt" num="III">
        {simple ? (
          // Eenvoudig: ingeklapt (ADR 0026).
          <DepthSection title={INGEKLAPT_TITEL.markt!} summary={leesregel(MARKT_RIJEN)}>
            {marktRijen}
          </DepthSection>
        ) : (
          marktRijen
        )}
      </Sectie>

      {/* ── Editors: de bestaande bodies, één tegelijk ─────────────────────── */}
      <RegelBewerkenPane
        open={regelEditor != null}
        regelId={regelEditor?.regel ?? null}
        anker={regelEditor?.anker ?? null}
        // De schermtitel is het rijlabel (Stopmoment, Einde van je plan, …).
        title={open ? RIJ_LABEL[open] : undefined}
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
          title={RIJ_LABEL.box3}
          current={props.fireParams.box3Method}
          currentHeffingvrijInkomen={props.box3HeffingvrijInkomen}
          snapshot={props.simSnapshot}
          onClose={sluit}
        />
      )}
      <UitgavenRijPane
        open={editor?.soort === 'uitgaven'}
        title={RIJ_LABEL['uitgave-na-pensioen']}
        onClose={sluit}
        snapshot={props.simSnapshot}
      />
    </div>
  )
}

/**
 * De duidingsregel bovenaan: alleen bij een plan dat niet (volledig) haalbaar is. Dezelfde
 * melding als in het Plan-slot — titel en de actie naar de rij Stopmoment — zonder eigen
 * rekenwerk. Buiten de meldingen-provider (tests, los gebruik): niets.
 */
function PlanDuidingsregel({ onOpenRij }: { onOpenRij: (rij: RijSleutel) => void }) {
  const ctx = useToekomstKaternMeldingen()
  const melding = ctx?.meldingen.plan.meldingen.find((m) => DUIDING_MELDINGEN.has(m.id))
  if (!melding) return null
  // Beide vervolgacties van de melding, in haar volgorde (geen rangorde); een gesprek met
  // Fin is geen plek en hoort niet in deze regel.
  const acties = [melding.actie, melding.tweedeActie].filter(
    (a): a is KaternMeldingActie => a != null && !('kind' in a),
  )
  // Een actie naar `?rij=` op deze pagina opent de rij meteen (geen server-ronde); een
  // nieuw tabblad volgt gewoon de link.
  const rijUitHref = (href: string): RijSleutel | null => {
    if (href.split(/[?#]/)[0] !== INSTELLINGEN_PAGINA) return null
    const q = href.split('#')[0].split('?')[1]
    const r = q ? new URLSearchParams(q).get('rij') : null
    return r && r in RIJ_META ? (r as RijSleutel) : null
  }
  const linkCls =
    'font-semibold text-[var(--module-active-700)] underline decoration-[var(--border-ed)] underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'
  return (
    <p className="flex items-start gap-2.5 font-serif text-[15px] leading-snug text-[var(--ink)]" data-testid="instellingen-duiding">
      <span
        aria-hidden="true"
        className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${LEVERAGE_STATUS_DOT[melding.ernst]}`}
      />
      <span>
        {duidingTitel(melding.titel)}.
        {acties.map((actie, i) => {
          const doelRij = rijUitHref(actie.href)
          const opKlik = (e: MouseEvent<HTMLAnchorElement>) => {
            if (!doelRij || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
            e.preventDefault()
            onOpenRij(doelRij)
          }
          return (
            <Fragment key={actie.href}>
              {i === 0 ? ' ' : DUIDING_KOPIJ.of}
              <Link href={actie.href} onClick={opKlik} className={linkCls}>
                {duidingActieTekst(actie, i === 0)}
                {doelRij && <span aria-hidden="true"> ✎</span>}
              </Link>
            </Fragment>
          )
        })}
        {acties.length > 0 && '.'}
      </span>
    </p>
  )
}

function Sectie({
  sectie,
  num,
  id,
  children,
}: {
  sectie: RijSectie
  num: string
  id?: string
  children: ReactNode
}) {
  const kopId = useId()
  return (
    <section id={id} aria-labelledby={kopId} className="scroll-mt-20">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--module-active-700)]">
        <span className="font-display text-[13px] normal-case italic tracking-normal">{num}</span>
        <span aria-hidden="true"> · </span>
        {INSTELLINGEN_SECTIE_KICKER[sectie]}
      </p>
      <h2 id={kopId} className="mt-1 font-display text-[18px] font-semibold leading-tight text-[var(--ink)] sm:text-[20px]">
        {INSTELLINGEN_SECTIE_KOP[sectie]}
      </h2>
      <p className="mt-1 font-serif text-[14px] italic leading-snug text-[var(--ink-2)]">{INSTELLINGEN_SECTIE_DECK[sectie]}</p>
      <div className="mt-3 border-t border-[var(--ink)]">{children}</div>
    </section>
  )
}
