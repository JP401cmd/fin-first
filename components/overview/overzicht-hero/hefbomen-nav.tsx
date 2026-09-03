'use client'

/**
 * HefbomenNav — vier-hefbomen-rij op /overzicht hero. Klikbare tegels
 * naar /overzicht/{bezittingen,schulden,cashflow,belasting}.
 *
 * Per tegel: icoon + label + bedrag + het oordeel in gewone taal. Status-dot
 * rechtsboven uit de gedeelde lever-scores. Chevron rechtsonder toggelt een
 * drill-down met meer detail (zelfde status-kleur, relevante info).
 *
 * Weergavemodus (S1, richtingsbesluit R5 "duiding boven reductie"):
 *  - Volledig  → `LeverageCard` variant `full`: bedrag primair (serif),
 *                oordeel als kleine gekleurde regel eronder, chevron.
 *  - Eenvoudig → variant `verdict`: OORDEEL primair, bedrag gedempt eronder,
 *                geen chevron en geen "excl. eigen woning"-grondslagregel.
 * De oordeel-teksten komen uit `lib/hefboom-status-copy.ts` (canoniek).
 */

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { HealthScore, HealthPillar } from '@/lib/financial-health'
import { HEFBOOM_CONFIG, type Hefboom } from '@/lib/hefboom-config'
import {
  hefboomVerdict,
  HEFBOOM_VERDICT_NEUTRAL,
} from '@/lib/hefboom-status-copy'
import { LeverageCard } from '@/components/overview/leverage-card'
import {
  pillarStatus,
  leverageStatusBgClass,
  leverageStatusTextClass,
  type LeverageStatus,
} from '@/lib/leverage-status'
import {
  leverToLeverageStatus,
  type LeverScores,
} from '@/components/app/shell/lever-scores'

// `leverToLeverageStatus` mapt de kompas-status (`LeverStatus`:
// green/amber/red/neutral) naar het `LeverageStatus`-vocabulaire
// (good/warn/bad/neutral) dat de hefboomkaarten renderen. Zo lezen de
// overzicht-kaarten EXACT dezelfde status als de sidebar-dots — beide komen uit
// `loadLeverScores` (gedeelde SSoT die ook de status-duiding-banner voedt).
// Geen tweede scoringssysteem meer (BUG: kaart groen, sidebar oranje voor
// dezelfde hefboom). De functie stond hiér als lokale kopie naast een identieke
// omkering in `lib/lever-scores.ts`; sinds UR2-04 is er één vertaling, in dat
// bestand — samen met het statuswoord (`leverStatusLabel`).

/** Hefboom-key → de bijbehorende LeverScores-entry. */
const LEVER_KEY_MAP: Record<Hefboom, keyof LeverScores> = {
  bezittingen: 'assets',
  schulden: 'debts',
  cashflow: 'cashflow',
  belasting: 'tax',
}

type HefboomKey = Hefboom
type StatusCode = LeverageStatus

/**
 * Wát het bedrag op de belasting-tegel is. `totals.belasting` draagt
 * `horizonData.box3Tax` — uitsluitend de Box 3-vermogensheffing, niet de totale
 * belastingdruk die /overzicht/belasting toont (daar telt Box 1 mee, en die is
 * doorgaans een orde groter). Zonder deze regel las de tegel als "dit betaal ik
 * aan belasting" en week ze onverklaarbaar af van de hub (kaart UR2-12).
 *
 * Waarom labelen en niet convergeren op de totale druk: de STATUS van deze
 * hefboom is óók box3-exposure (`lib/lever-scores.ts`), en Box 1 zou een tweede,
 * zware loader (`loadTaxOpportunities`) in blok 1 van de hub trekken. Bedrag en
 * oordeel blijven dus dezelfde grootheid; alleen de eenheid staat er nu bij.
 *
 * Bewoording spiegelt de box-kaart op de hub ("Box 3 · Sparen + beleggen",
 * `app/(app)/overzicht/belasting/box-cards.ts`), zodat de doorklik herkenbaar is.
 */
const BELASTING_BASIS_LABEL = 'Box 3 · sparen en beleggen'

export type HefbomenTotals = {
  /** Totale waarde bezittingen, in EUR. */
  bezittingen?: number | null
  /** Totale openstaande schulden, in EUR. */
  schulden?: number | null
  /** Spaarquote 6-maands gemiddelde (0–100 %). */
  cashflow?: number | null
  /**
   * Jaarlijkse Box 3-belasting, in EUR — NIET de totale belastingdruk.
   * De tegel labelt dat zichtbaar; zie `BELASTING_BASIS_LABEL`.
   */
  belasting?: number | null
}

/**
 * Nav-specifieke metadata per hefboom — `href`, `pillarKey`, `tooltip`.
 * Visuele velden (label/Icon/accent) komen uit `HEFBOOM_CONFIG` zodat de
 * navigatie 1-op-1 matcht met BriefingPanel- en TipsLijst-tags.
 */
const HEFBOMEN: ReadonlyArray<{
  key: Hefboom
  href: string
  pillarKey: string | null
  tooltip: string
}> = [
  {
    key: 'bezittingen',
    href: '/overzicht/bezittingen',
    pillarKey: 'asset_concentration',
    tooltip: 'Cash, beleggingen, eigen huis en pensioen — wat groeit voor je.',
  },
  {
    key: 'schulden',
    href: '/overzicht/schulden',
    pillarKey: 'debt_ratio',
    tooltip: 'Hypotheek, leningen, studieschuld — wat je terugbetaalt.',
  },
  {
    key: 'cashflow',
    href: '/overzicht/cashflow',
    pillarKey: 'savings_rate',
    tooltip: 'In en uit per maand — het deel dat je opzij zet bepaalt je tempo.',
  },
  {
    key: 'belasting',
    href: '/overzicht/belasting',
    pillarKey: null,
    // De tooltip beloofde "Box 1, Box 2 en Box 3" naast een bedrag dat ALLEEN
    // Box 3 is (`totals.belasting` = `horizonData.box3Tax`). Wie doorklikte zag
    // op de hub een totale druk van een heel andere orde en kon nergens lezen
    // wat het kaartbedrag dan wél was (kaart UR2-12). De tooltip zegt nu wat de
    // tegel toont en waar de rest staat.
    tooltip: 'Box 3-heffing per jaar over sparen en beleggen. Box 1 en Box 2 staan op de belastingpagina.',
  },
] as const

/*
 * De domeinspecifieke oordelen ("Goed gespreid", "Hoge schuldenlast") stonden
 * hier als lokale `statusSubText()`. Ze zijn verhuisd naar de canonieke
 * copy-module `lib/hefboom-status-copy.ts` (S1), zodat de tegel, de
 * toegankelijke naam van de status en toekomstige consumenten dezelfde zin
 * lezen. Eén inhoudelijke wijziging bij die verhuizing: de warn-variant van
 * schulden was `Schuldratio {rawValue}` — het enige jargon in de lijst — en is
 * nu gewone taal; het rátiogetal blijft in de drill-down staan (`pillar.rawValue`
 * in `HefboomDetailCard`, alleen Volledig).
 */

/**
 * Dubbele-grondslag-context (incl./excl. eigen woning) voor de bezittingen-
 * en schulden-hefboom. Bron = `horizonData` (perspectief-correct), NIET
 * `dashboardData` (persoonlijke grondslag → drift in huishoud/partner). De
 * bedragen zijn al inclusion-gewogen in `housingContext`, dus de excl.-som is
 * meteen de gefilterde gewogen waarde. Null → geen splitsing (byte-identiek).
 */
export type HefbomenHousingSplit = {
  /** Inclusion-gewogen waarde van de eigen woning(en), uit housingContext. */
  eigenHuisValue: number
  /** Inclusion-gewogen openstaand hypotheeksaldo, uit housingContext. */
  mortgageBalance: number
}

export function HefbomenNav({
  health,
  leverScores,
  totals,
  housingSplit = null,
  simple = false,
}: {
  health: HealthScore | null
  /**
   * De vier-hefbomen-kompas-scores uit `loadLeverScores` — de gedeelde SSoT die
   * óók de sidebar-dots en de status-duiding-banner voedt. De status-dot op
   * elke kaart komt hieruit (niet meer uit de gezondheidsscore-pijlers), zodat
   * kaart == sidebar-dot == banner per definitie gelijk zijn. Null → val terug
   * op de pijler-/proxy-status (legacy gedrag, bv. wanneer nog niet geladen).
   */
  leverScores?: LeverScores | null
  totals?: HefbomenTotals
  /**
   * Dubbele grondslag incl./excl. eigen woning. Aanwezig (non-null) ⇔
   * `horizonData.showDualHousingBasis` (eigen woning ÉN strategie ≠ volledig
   * meerekenen). Alleen de bezittingen- en schulden-tegel tonen dan een
   * subtiele "excl. eigen woning · €X"-regel; cashflow/belasting ongewijzigd.
   * Null → geen extra regel (byte-identiek aan voorheen).
   */
  housingSplit?: HefbomenHousingSplit | null
  /**
   * Eenvoudige weergave (display_mode === 'simple'). De tegels schakelen dan
   * naar de `verdict`-variant van `LeverageCard`: het OORDEEL in gewone taal
   * staat primair, het bedrag zakt naar een gedempte tweede regel.
   *
   * S1 / richtingsbesluit R5 ("duiding boven reductie") draait hiermee de helft
   * van OVZ-2 (9 aug 2026) terug: die haalde de status-duiding wég in Eenvoudig,
   * waardoor een beginner alleen "€ 368.270" + een gekleurd puntje overhield —
   * en een screenreader- of touch-gebruiker helemaal niets. De ándere helft van
   * OVZ-2 blijft staan: géén chevron/drill-down en géén "excl. eigen woning · €X"
   * in Eenvoudig. Dat is diepte respectievelijk grondslag-detail, geen oordeel.
   *
   * Default false → ongewijzigd (Volledig).
   */
  simple?: boolean
}) {
  // Eén tegel-expand per keer — open/dicht via chevron. Mobile: tap, desktop:
  // tap of hover (we gebruiken alleen state-based toggle voor consistente UX).
  const [expandedKey, setExpandedKey] = useState<HefboomKey | null>(null)

  // Euro-totalen (bezittingen/schulden/belasting) zijn saldi en honoreren de
  // privacy-toggle. Het cashflow-percentage is géén saldo en blijft zichtbaar.
  const { masked } = useMaskedAmounts()

  // Toont ten minste één tegel een grondslagregel onder de KPI? Dan krijgen ze
  // alle vier minstens de placeholder (zie de `subAmount`-blok hieronder).
  // Twee bronnen: de dubbele grondslag (incl./excl. eigen woning) en de
  // eenheid-regel onder het belastingbedrag.
  const showsBasisRow =
    housingSplit != null ||
    (typeof totals?.belasting === 'number' && totals.belasting > 0)

  return (
    <nav
      aria-label="Vier hefbomen"
      className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-3"
    >
      {HEFBOMEN.map(({ key, href, pillarKey, tooltip }) => {
        const cfg = HEFBOOM_CONFIG[key]
        const { label, Icon } = cfg
        const accent = cfg.tint
        const pillar =
          pillarKey && health ? health.pillars.find((p) => p.id === pillarKey) : undefined
        // Status-bron: leverScores (gedeelde SSoT, == sidebar-dot). Fallback op
        // de pijler-/proxy-status alleen wanneer leverScores (nog) ontbreekt.
        const leverEntry = leverScores ? leverScores[LEVER_KEY_MAP[key]] : null
        // Geen `health.total`-proxy meer als fallback: dat is een algemene
        // gezondheidsscore, geen Box 3-specifiek signaal, en `hefboomVerdict`
        // deed er hieronder wél een Box 3-specifieke uitspraak mee (kaart
        // "restpunt B2", release-review 31 aug). Ontbreekt de echte pijler
        // (alleen de belasting-tegel heeft `pillarKey: null`), dan is de
        // status 'neutral' — precies zoals `pillarStatus(null)` al levert.
        const status = leverEntry
          ? leverToLeverageStatus(leverEntry.status)
          : pillarStatus(pillar?.score)

        const totalValue = totals?.[key]
        const showTotal = typeof totalValue === 'number' && totalValue > 0
        const formattedTotal = showTotal
          ? key === 'cashflow'
            ? `${Math.round(totalValue)}%`
            : key === 'belasting'
              ? `${formatMaskedCurrency(totalValue, masked)}/jr`
              : formatMaskedCurrency(totalValue, masked)
          : ''
        // Het oordeel in gewone taal — in BEIDE weergaven zichtbaar (S1).
        // `hefboomVerdict` geeft null bij `neutral` (er valt niets te oordelen):
        //  - Volledig laat de regel dan leeg, precies zoals voorheen; de
        //    status-dot krijgt via de shell een sr-only-naam.
        //  - Eenvoudig toont "Nog geen gegevens", zodat élke tegel daar een
        //    woord draagt en het stoplicht nooit het enige signaal is.
        const verdict = hefboomVerdict(key, status)
        const subText = simple ? (verdict ?? HEFBOOM_VERDICT_NEUTRAL) : verdict
        const expanded = expandedKey === key

        const hasDrilldown = Boolean(pillar) || status !== 'neutral'

        // Dubbele grondslag: subtiele "excl. eigen woning · €X"-regel op ALLEEN
        // de bezittingen- en schulden-tegel wanneer horizonData.showDualHousingBasis
        // (housingSplit non-null). Weging-consistent: huis/hypotheek zijn al
        // inclusion-gewogen in housingContext, dus dit IS de gefilterde gewogen
        // som. GEEN vrijheidstijd-trailing hier — de tegel blijft compact.
        // OVZ-2 (het deel dat ná S1 blijft staan): in Eenvoudig valt de hele
        // dubbele-grondslag-regel weg. Grondslag-detail is geen oordeel, en de
        // `verdict`-variant rendert `subAmount` sowieso niet — de guard hier
        // houdt de intentie op de call-site zichtbaar.
        // De grondslagregel heeft sinds UR2-12 twee bronnen: de dubbele
        // grondslag hierboven, én de EENHEID van het belastingbedrag. Zodra één
        // van beide een regel oplevert, krijgen álle vier de tegels minstens de
        // placeholder — anders loopt de rij scheef.
        let subAmount: React.ReactNode = null
        if (showsBasisRow && !simple) {
          if (
            housingSplit &&
            showTotal &&
            typeof totalValue === 'number' &&
            (key === 'bezittingen' || key === 'schulden')
          ) {
            const exclValue =
              key === 'bezittingen'
                ? totalValue - housingSplit.eigenHuisValue
                : totalValue - housingSplit.mortgageBalance
            subAmount = (
              <>excl. eigen woning · {formatMaskedCurrency(exclValue, masked)}</>
            )
          } else if (key === 'belasting' && showTotal) {
            subAmount = BELASTING_BASIS_LABEL
          } else {
            // Deze tegel heeft geen grondslagregel → lege placeholder, zodat alle
            // vier tegels in de desktop-rij (align-items: stretch) gelijke
            // content-hoogte houden en de absolute chevron niet wegzweeft.
            // Spiegelt het subText-placeholder-patroon. Zonder enige bron:
            // geen enkele placeholder (byte-identiek aan voorheen).
            subAmount = <span aria-hidden="true">&nbsp;</span>
          }
        }

        return (
          <LeverageCard
            key={key}
            Icon={Icon}
            tint={accent}
            label={label}
            kpi={showTotal ? formattedTotal : null}
            // In Eenvoudig rendert `subAmount` bewust niet; de eenheid van het
            // belastingbedrag mag daar niet mee wegvallen, dus die reist via het
            // venster-label achter het gedempte bedrag mee.
            kpiWindow={key === 'belasting' && showTotal ? 'Box 3' : undefined}
            status={status}
            subText={subText}
            subAmount={subAmount}
            variant={simple ? 'verdict' : 'full'}
            href={href}
            tooltip={tooltip}
            expandable={hasDrilldown && !simple}
            expanded={expanded}
            onToggleExpand={() => setExpandedKey(expanded ? null : key)}
          >
            {pillar && (
              <HefboomDetailCard pillar={pillar} status={status} href={href} />
            )}
          </LeverageCard>
        )
      })}
    </nav>
  )
}

/**
 * Drill-down detail-content per hefboom. Toont rawValue + improvementTip
 * uit de pillar, plus deep-link naar de actie-pagina. Tekst-kleur volgt
 * status zodat groen=informatief, rood=urgent zichtbaar is.
 */
function HefboomDetailCard({
  pillar,
  status,
  href,
}: {
  pillar: HealthPillar
  status: StatusCode
  href: string
}) {
  return (
    <div
      className={`mt-2 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 border-t border-[var(--border-ed)] ${leverageStatusBgClass(status)}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--ink-3)]">
          {pillar.name}
        </span>
        <span className={`text-[11px] font-mono tabular-nums font-semibold ${leverageStatusTextClass(status)}`}>
          {pillar.rawValue}
        </span>
      </div>
      <p className={`text-xs leading-snug ${leverageStatusTextClass(status)}`}>
        {pillar.improvementTip}
      </p>
      <Link
        href={pillar.actionHref || href}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline"
      >
        {pillar.actionLabel || 'Bekijk details'}
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>
    </div>
  )
}

/*
 * OVZ-1 (eenvoudige weergave, fase 1): de losse `HefbomenLegenda` — drie
 * statuslabels onder de hefbomen-rij — is verwijderd. Hij werd nergens in de
 * productie-UI gerenderd (alleen in zijn eigen unit-test) en de uitleg van
 * groen/oranje/rood hoort volgens het audit-besluit éénmalig in de pagina-'i'
 * van /overzicht: zie `PAGE_INFO['/overzicht']` in lib/page-info-content.ts (nu een {insight, grip}-object).
 * De status-dot zelf houdt zijn `title` uit `LEVERAGE_STATUS_LABEL` — dat is
 * sinds S1 bewust een hover-affordance en NIET de toegankelijke naam: die komt
 * van het zichtbare oordeel, of van de sr-only-regel die `LeverageCard`
 * bijspringt wanneer er geen zichtbaar oordeel is.
 */
