'use client'

/**
 * CashflowLandingCards — de hefboom-stijl kaarten op /overzicht/cashflow.
 * Zelfde shell als de vier-hefbomen-rij op /overzicht (gedeelde LeverageCard):
 * status-dot + KPI + uitklapbare chevron met een 1-regel inzicht en een
 * deeplink naar de bijbehorende sub-pagina.
 *
 * De kaart-data (status/KPI/detail) wordt server-side berekend in
 * `buildCashflowCards` en hier alleen gerenderd. Het icoon + de tint per
 * onderdeel zitten client-side (kunnen niet geserialiseerd worden).
 *
 * ── EENVOUDIG (CF-1 · CF-2 uit docs/eenvoudige-weergave-audit.md) ───────────
 * Dit spiegelt `ToekomstNavCards` (components/future/toekomst-nav-cards.tsx)
 * één op één — /toekomst is in de audit het voorbeeld dat de rest hoort te
 * volgen, dus hier geen tweede variant:
 *
 *  · CF-1 — de kaarten renderen COMPACT (`compact`-prop van LeverageCard):
 *    één regel met icoon + label, géén KPI/venster/substext/status-dot. Tot nu
 *    toe verdween in Eenvoudig alleen de chevron, waardoor de "rustige" modus
 *    even veel cijfers toonde als de volledige.
 *  · CF-2 — de Forecast-kaart verdwijnt (4 → 3). Forecast is geen landings-
 *    belofte; de toekomst leeft op /toekomst. De ROUTE blijft bereikbaar
 *    (/overzicht/cashflow/forecast) en de sidebar-status-dot blijft staan: de
 *    server-seed in cashflow-cards-loader.tsx projecteert nog steeds ALLE vier
 *    de kaarten, dus dit is puur een landings-reductie.
 *
 * De MODUS-AFHANKELIJKE reducties raken Volledig niet: `simple` is false, dus
 * `compact`/de CF-2-filter/het afwijkende raster doen daar niets.
 *
 * Volledig is echter NIET onveranderd, en die nuance hoort hier te staan i.p.v.
 * een te ruime "byte-identiek"-claim: CF-3 geeft `subAmount={card.kpiWindow}`
 * ONVOORWAARDELIJK door, dus de Transacties-kaart krijgt in Volledig een extra
 * regel onder de KPI ("in augustus tot nu toe"). Sterker nog, dat venster-label
 * is op dit moment ALLEEN in Volledig zichtbaar: de compacte kaart (CF-1) rendert
 * `subAmount` niet. Zie het besluitpunt op de Fase 2-kaart.
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  PiggyBank,
  ArrowLeftRight,
  Repeat,
  LineChart,
  type LucideIcon,
} from 'lucide-react'
import { LeverageCard } from './leverage-card'
import { leverageStatusBgClass, leverageStatusTextClass } from '@/lib/leverage-status'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import type { CashflowCard, CashflowCardKey } from '@/lib/cashflow-cards'

const VISUAL: Record<CashflowCardKey, { Icon: LucideIcon; tint: string }> = {
  budget: { Icon: PiggyBank, tint: 'text-amber-700 bg-amber-50' },
  transacties: { Icon: ArrowLeftRight, tint: 'text-sky-700 bg-sky-50' },
  'vaste-lasten': { Icon: Repeat, tint: 'text-violet-700 bg-violet-50' },
  forecast: { Icon: LineChart, tint: 'text-emerald-700 bg-emerald-50' },
}

/**
 * Rasters per weergave. Eenvoudig stapelt op mobiel (een one-liner-kaart met
 * label "Vaste lasten" moet één regel blijven) en zet de drie kaarten vanaf
 * `sm` naast elkaar — exact het raster dat ToekomstNavCards in Eenvoudig
 * gebruikt. Gedeeld met de skeleton hieronder zodat fallback en inhoud niet uit
 * elkaar kunnen lopen.
 */
const SIMPLE_GRID = 'grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3'
const FULL_GRID = 'grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3'

/** De kaart die in Eenvoudig van de landing verdwijnt (CF-2). */
const SIMPLE_HIDDEN_CARD: CashflowCardKey = 'forecast'

export function CashflowLandingCards({ cards }: { cards: CashflowCard[] }) {
  // Eén kaart open per keer — accordeon, identiek aan HefbomenNav.
  const [expandedKey, setExpandedKey] = useState<CashflowCardKey | null>(null)
  // In Eenvoudig: compacte one-liners, geen Forecast-kaart, geen uitklap-chevron.
  const simple = useDisplayMode().mode === 'simple'

  const visibleCards = simple
    ? cards.filter((card) => card.key !== SIMPLE_HIDDEN_CARD)
    : cards

  return (
    <nav
      aria-label="Cashflow-onderdelen"
      className={simple ? SIMPLE_GRID : FULL_GRID}
    >
      {visibleCards.map((card) => {
        const { Icon, tint } = VISUAL[card.key]
        const expanded = expandedKey === card.key
        return (
          <LeverageCard
            key={card.key}
            Icon={Icon}
            tint={tint}
            label={card.label}
            kpi={card.kpi}
            status={card.status}
            subText={card.subText}
            /* CF-3 — venster-label ("in augustus tot nu toe"), in Volledig onder
               de KPI en in Eenvoudig onder het label. Bewust in BEIDE modi: de
               verwarring die CF-3 moet wegnemen (maandcijfer vs. de 30-dagen-
               cijfers op de transactiepagina) speelt juist in Eenvoudig. */
            subAmount={card.kpiWindow}
            href={card.href}
            tooltip={card.tooltip}
            compact={simple}
            expandable={!simple}
            expanded={expanded}
            onToggleExpand={() => setExpandedKey(expanded ? null : card.key)}
          >
            <CashflowCardDetail card={card} />
          </LeverageCard>
        )
      })}
    </nav>
  )
}

/**
 * Suspense-skeleton voor het kaartenraster — CLIENT, omdat de vorm van de
 * fallback van de weergavemodus afhangt. Zou de fallback altijd vier hoge
 * kaarten reserveren, dan krijgt iedereen in Eenvoudig sinds CF-1/CF-2 een
 * layout-shift van vier hoge tegels naar drie one-liners; precies de CLS die de
 * gereserveerde hoogtes moesten voorkomen. De provider zit in de app-layout en
 * wordt server-side geseed, dus ook de SSR-pass van deze fallback kent de modus
 * al — geen flash.
 *
 * De hoogtes zijn NAGETELD uit `components/overview/leverage-card.tsx`, niet
 * geschat — elk blok komt overeen met de line-height van de regel die het
 * vervangt (Tailwind-defaults):
 *
 *   icon-chip    w-8 h-8 / sm:w-9 sm:h-9              → h-8 w-8 / sm:h-9 sm:w-9
 *   label        text-sm (20px) / sm:text-base (24px) → h-5 / sm:h-6
 *   kpi          text-base (24px) / sm:text-lg (28px) → h-6 / sm:h-7
 *   subAmount    text-[11px] leading-tight            → h-3
 *   substext-rij min-h-[16px]                         → h-4
 *
 * plus de kaart-padding (`p-3 sm:p-4` vol, `p-3` compact) en dezelfde
 * `rounded-2xl border`-shell.
 *
 * De KPI- én venster-regel worden bewust WÉL gereserveerd, terwijl
 * `LeverageCard` ze bij `kpi === null` / `kpiWindow === null` weglaat: dat is de
 * lege-account-staat (nog geen budget, geen transacties). Reserveren kiest de
 * veelvoorkomende kant; de lege staat krijgt één keer een krimp i.p.v.
 * iedereen-met-data een groei. Het raster rekt tegels in dezelfde rij toch al
 * gelijk, dus één venster-regel per tegel reserveren klopt ook al draagt alleen
 * de Transacties-kaart er een.
 */
export function CashflowLandingCardsSkeleton() {
  const simple = useDisplayMode().mode === 'simple'

  if (simple) {
    return (
      <div className={`${SIMPLE_GRID} animate-pulse`}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 shrink-0 rounded-lg bg-[var(--subtle)]" />
              {/* Label + de venster-regel die de compacte kaart sinds CF-3 kan
                  dragen. Zelfde afweging als in de volledige tak: het raster
                  rekt de drie tegels toch al gelijk, dus reserveren kost niets
                  en voorkomt de krimp zodra de Transacties-kaart zijn label
                  meebrengt. */}
              <div className="min-w-0 flex-1">
                <div className="h-5 w-24 bg-[var(--subtle)] sm:h-6" />
                <div className="mt-0.5 h-3 w-32 bg-[var(--subtle)]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`${FULL_GRID} animate-pulse`}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4"
        >
          <div className="h-8 w-8 rounded-lg bg-[var(--subtle)] sm:h-9 sm:w-9" />
          <div className="mt-2 h-5 w-20 bg-[var(--subtle)] sm:h-6" />
          <div className="mt-0.5 h-6 w-24 bg-[var(--subtle)] sm:h-7" />
          <div className="mt-0.5 h-3 w-28 bg-[var(--subtle)]" />
          <div className="mt-1 h-4 w-16 bg-[var(--subtle)]" />
        </div>
      ))}
    </div>
  )
}

/**
 * Uitklap-detail per kaart — zelfde opmaak als HefboomDetailCard: status-
 * getinte achtergrond, secundaire waarde rechtsboven, 1-regel inzicht en een
 * deeplink naar de sub-pagina.
 */
function CashflowCardDetail({ card }: { card: CashflowCard }) {
  return (
    <div
      className={`mt-2 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 border-t border-[var(--border-ed)] ${leverageStatusBgClass(card.status)}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--ink-3)]">
          {card.detail.label}
        </span>
        <span className={`text-[11px] font-mono tabular-nums font-semibold ${leverageStatusTextClass(card.status)}`}>
          {card.detail.value}
        </span>
      </div>
      <p className={`text-xs leading-snug ${leverageStatusTextClass(card.status)}`}>
        {card.detail.tip}
      </p>
      <Link
        href={card.href}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline"
      >
        {card.detail.actionLabel}
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>
    </div>
  )
}
