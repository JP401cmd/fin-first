'use client'

/**
 * HefbomenNav — vier-hefbomen-rij op /overzicht hero. Klikbare tegels
 * naar /overzicht/{bezittingen,schulden,cashflow,belasting}.
 *
 * Per tegel: icoon + label + bedrag + contextuele status-substext.
 * Status-dot rechtsboven uit pillar.score. Chevron rechtsonder toggle
 * een drill-down met meer detail (zelfde status-kleur, relevante info).
 */

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { HealthScore, HealthPillar } from '@/lib/financial-health'
import { HEFBOOM_CONFIG, type Hefboom } from '@/lib/hefboom-config'
import { LeverageCard } from '@/components/overview/leverage-card'
import {
  pillarStatus,
  leverageStatusBgClass,
  leverageStatusTextClass,
  type LeverageStatus,
} from '@/lib/leverage-status'
import type { LeverScores, LeverStatus } from '@/components/app/shell/lever-scores'

/**
 * Map de kompas-status (`LeverStatus`: green/amber/red/neutral) naar het
 * `LeverageStatus`-vocabulaire (good/warn/bad/neutral) dat de hefboomkaarten
 * renderen. Zo lezen de overzicht-kaarten EXACT dezelfde status als de
 * sidebar-dots — beide komen uit `loadLeverScores` (gedeelde SSoT die ook de
 * status-duiding-banner voedt). Geen tweede scoringssysteem meer (BUG: kaart
 * groen, sidebar oranje voor dezelfde hefboom).
 */
function leverToLeverageStatus(status: LeverStatus): LeverageStatus {
  return status === 'green'
    ? 'good'
    : status === 'amber'
      ? 'warn'
      : status === 'red'
        ? 'bad'
        : 'neutral'
}

/** Hefboom-key → de bijbehorende LeverScores-entry. */
const LEVER_KEY_MAP: Record<Hefboom, keyof LeverScores> = {
  bezittingen: 'assets',
  schulden: 'debts',
  cashflow: 'cashflow',
  belasting: 'tax',
}

type HefboomKey = Hefboom
type StatusCode = LeverageStatus

export type HefbomenTotals = {
  /** Totale waarde bezittingen, in EUR. */
  bezittingen?: number | null
  /** Totale openstaande schulden, in EUR. */
  schulden?: number | null
  /** Spaarquote 6-maands gemiddelde (0–100 %). */
  cashflow?: number | null
  /** Jaarlijkse Box 3-belasting, in EUR. */
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
    tooltip: 'Box 1, Box 2 en Box 3 — verken je positie en hoe je het verdeelt.',
  },
] as const

function statusSubText(key: HefboomKey, status: StatusCode, pillar?: HealthPillar): string | null {
  if (status === 'neutral') return null
  if (key === 'bezittingen') {
    return status === 'good' ? 'Goed gespreid' : status === 'warn' ? 'Beperkt gespreid' : 'Sterk geconcentreerd'
  }
  if (key === 'schulden') {
    const ratio = pillar?.rawValue ?? ''
    return status === 'good' ? 'Aflossing op schema' : status === 'warn' ? `Schuldratio ${ratio}` : 'Hoge schuldenlast'
  }
  if (key === 'cashflow') {
    return status === 'good' ? 'Op koers met sparen' : status === 'warn' ? 'Lager dan doel' : 'Tekort op rekening'
  }
  if (key === 'belasting') {
    // Geen pijler meer (ADR 0010): valt terug op de totaal-score-proxy en is
    // bewust een richtingaanwijzer — geen handelingsadvies of besparingsbelofte.
    //
    // BEL-3 (eenvoudige-weergave-audit, categorie E): "Verken je Box 3-positie"
    // was jargon — precies het soort zin waar de doelgroep van Eenvoudig op
    // afhaakt. De vervanging blijft binnen de Wft-grens omdat elk van de drie
    // eigenschappen behouden is: de hedge "Mogelijk" (geen vaststelling over
    // déze gebruiker), géén bedrag of besparingsbelofte, en géén imperatief
    // ("stort", "verschuif"). Wat overblijft is een richtingaanwijzer naar de
    // eigen positie — dezelfde functie als de oude tekst, in gewone taal.
    return 'Mogelijk betaal je meer dan nodig'
  }
  return null
}

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
   * Eenvoudige weergave (display_mode === 'simple'): verberg de chevron /
   * uitklap-drill-down op de hefboomkaarten én de duidende regels eronder
   * (status-substext + "excl. eigen woning · €X") — er blijft dan per tegel
   * hoofdcijfer + statuspunt over (OVZ-2). Default false → ongewijzigd.
   */
  simple?: boolean
}) {
  // Eén tegel-expand per keer — open/dicht via chevron. Mobile: tap, desktop:
  // tap of hover (we gebruiken alleen state-based toggle voor consistente UX).
  const [expandedKey, setExpandedKey] = useState<HefboomKey | null>(null)

  // Euro-totalen (bezittingen/schulden/belasting) zijn saldi en honoreren de
  // privacy-toggle. Het cashflow-percentage is géén saldo en blijft zichtbaar.
  const { masked } = useMaskedAmounts()

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
        const proxyScore = !pillarKey && health ? health.total : null
        const status = leverEntry
          ? leverToLeverageStatus(leverEntry.status)
          : pillarStatus(pillar?.score ?? proxyScore)

        const totalValue = totals?.[key]
        const showTotal = typeof totalValue === 'number' && totalValue > 0
        const formattedTotal = showTotal
          ? key === 'cashflow'
            ? `${Math.round(totalValue)}%`
            : key === 'belasting'
              ? `${formatMaskedCurrency(totalValue, masked)}/jr`
              : formatMaskedCurrency(totalValue, masked)
          : ''
        // OVZ-2: in de eenvoudige weergave dragen de tegels alléén het
        // hoofdcijfer + het statuspunt. De status-duiding ("Beperkt gespreid",
        // "Mogelijk betaal je meer dan nodig") verhuist naar de duwpagina.
        const subText = simple ? null : statusSubText(key, status, pillar)
        const expanded = expandedKey === key

        const hasDrilldown = Boolean(pillar) || status !== 'neutral'

        // Dubbele grondslag: subtiele "excl. eigen woning · €X"-regel op ALLEEN
        // de bezittingen- en schulden-tegel wanneer horizonData.showDualHousingBasis
        // (housingSplit non-null). Weging-consistent: huis/hypotheek zijn al
        // inclusion-gewogen in housingContext, dus dit IS de gefilterde gewogen
        // som. GEEN vrijheidstijd-trailing hier — de tegel blijft compact.
        // OVZ-2: in Eenvoudig valt de hele dubbele-grondslag-regel weg (inclusief
        // de uitlijn-placeholder) — er is dan geen enkele extra regel meer om
        // tegen uit te lijnen, dus alle vier de tegels blijven vanzelf gelijk.
        let subAmount: React.ReactNode = null
        if (housingSplit && !simple) {
          if (
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
          } else {
            // Dual-modus actief, maar deze tegel (cashflow/belasting, of zonder
            // totaal) heeft geen excl.-regel → lege placeholder, zodat alle vier
            // tegels in de desktop-rij (align-items: stretch) gelijke content-
            // hoogte houden en de absolute chevron niet wegzweeft. Spiegelt het
            // subText-placeholder-patroon. Bij housingSplit == null: geen enkele
            // placeholder (byte-identiek aan voorheen).
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
            status={status}
            subText={subText}
            subAmount={subAmount}
            showSubRow={!simple}
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
 * van /overzicht: zie `PAGE_INFO['/overzicht']` in lib/page-info-content.ts.
 * De status-dot zelf houdt zijn `title` uit `LEVERAGE_STATUS_LABEL`.
 */
