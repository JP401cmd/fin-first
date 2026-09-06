'use client'

/**
 * VasteLastenClient — orchestrator voor het Vaste-lasten-scherm
 * (/overzicht/budget/vaste-lasten). Twee lagen die meebewegen met de
 * weergavemodus:
 *
 *   Eenvoudig → hoofdcijfer €/mnd + vrijheidstijd-onderschrift + OORDEELREGEL
 *               (deck) + quote-meter + abonnementen-sluipverbruik + top-5
 *               grootste posten; de volle lijst zit achter "Alle {n} posten".
 *   Volledig  → ONGEWIJZIGD: compacte aandeel-meter, de volle lijst direct, en
 *               daaronder de uitgebreide inzicht-blokken (VasteLastenInsights)
 *               onder <HideInSimple>.
 *
 * ── S2 · duiding boven reductie (release R5) ────────────────────────────────
 * Eenvoudig hield hiervóór precies het verkeerde over: het lángste element (de
 * volle lijst met alle posten) bleef staan, terwijl de korte blokken die er
 * BETEKENIS aan gaven — de quote met Nibud-context en het abonnementen-
 * sluipverbruik mét opzegknop — achter <HideInSimple> verdwenen. De selectie is
 * omgedraaid: eerst het oordeel, dan de handeling, dan de vijf grootste posten;
 * de volledige lijst blijft één klik weg in een <DepthSection>.
 *
 * TWEE COPY-ROLLEN, BEWUST GESCHEIDEN (risico 1 uit de S2-analyse). Bij
 * warn/bad staat de `PageStatusBanner` (mount: app/(app)/overzicht/layout.tsx,
 * copy: lib/page-status/copy.ts) boven deze pagina met dezelfde quote. Om te
 * voorkomen dat er twee keer hetzelfde staat:
 *   · de DECK hier is FEIT + NORM ("je zit op X% — {oordeel}; het Nibud houdt
 *     aan …") en draagt géén imperatief;
 *   · de BANNER is de HANDELING ("loop je abonnementen langs").
 * De deck staat er ook bij `good` en blijft staan als de banner geminimaliseerd
 * is — dat was juist het gat: een Eenvoudig-gebruiker met een gezonde quote (of
 * wie de melding wegklikte) zag helemaal geen duiding.
 *
 * Wft: het oordeel is een constatering tegen een geciteerde Nibud-vuistregel,
 * geen advies. Imperatieve taal hoort in de melding of bij Fin, niet hier.
 *
 * Data komt server-side binnen als props (geen client-fetch/spinner meer);
 * refresh = router.refresh(). Module-chrome = kern (amber); Fin-teal alleen op
 * de Fin-knop. Bedragen via <MaskedAmount>. De opzeg-flow (OpzegModal) wordt
 * hier gehost zodat zowel de rij-opzegknoppen als de sluipverbruik-CTA werken.
 *
 * De pagina-aanhef (kicker + titel) staat NIET meer hier maar op de server-pagina
 * — zie perf Task 2.4 en de comment bij het cijferblok hieronder.
 */

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MaskedAmount } from '@/components/app/masked-amount'
import { EditorialDeck, PageOpeningFigure } from '@/components/editorial'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { DepthSection } from '@/components/app/depth-section'
import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-fin-button'
import { OpzegModal } from '@/components/app/opzeg-modal'
import {
  VasteKostenAnalyse,
  type RecurringItem,
} from '@/components/fin/vaste-kosten-analyse'
import {
  VasteLastenInsights,
  VasteLastenAbonnementenBlok,
  VasteLastenQuoteBlok,
  VasteLastenTopPostenBlok,
} from '@/components/overview/vaste-lasten-insights'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { formatCurrency } from '@/lib/format'
import {
  LEVERAGE_STATUS_DOT,
  LEVERAGE_STATUS_LABEL,
  leverageStatusTextClass,
} from '@/lib/leverage-status'
import { VASTE_LASTEN_BENCHMARK_COPY } from '@/lib/vaste-lasten-benchmarks'
import type { VasteLastenInsights as Insights } from '@/lib/vaste-lasten-insights'
import type { CancellationMetadata } from '@/lib/cancellation-types'

// ── Compacte aandeel-meter (kop, beide modi) ──────────────────
function CompactMeter({ insights }: { insights: Insights }) {
  const { ratioPct, status, meterValue } = insights
  if (ratioPct == null || meterValue == null) return null
  return (
    <div className="w-full max-w-xs">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-[var(--ink-3)]">Aandeel van je inkomen</span>
        <span className={`font-medium tabular-nums ${leverageStatusTextClass(status)}`}>
          {ratioPct}%
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]"
        role="img"
        aria-label={`Vaste lasten zijn ${ratioPct}% van je inkomen — ${LEVERAGE_STATUS_LABEL[status]}`}
      >
        <div
          className={`h-full rounded-full ${LEVERAGE_STATUS_DOT[status]} opacity-80 transition-[width] duration-500`}
          style={{ width: `${Math.min(100, ratioPct)}%` }}
        />
      </div>
    </div>
  )
}

// ── Oordeelregel (alleen Eenvoudig) ───────────────────────────
//
// FEIT + NORM, geen handeling — zie de rolverdeling in de kop van dit bestand.
// Het oordeelswoord komt uit `LEVERAGE_STATUS_LABEL`: dezelfde ENE lijst die de
// meters op deze pagina gebruiken (S2 consolideerde het lokale lijstje in
// QuoteMeter daarheen). De statuskleur is nooit de enige drager — het woord
// staat er als tekst.
function OordeelDeck({ insights }: { insights: Insights }) {
  const { hasData, ratioPct, status } = insights

  // Lege staat: zonder gedetecteerde posten valt er niets te oordelen. Zonder
  // deze tak stond er een kop met een meter-loze witruimte boven een lege lijst.
  if (!hasData) {
    return (
      <EditorialDeck>
        We hebben nog geen terugkerende kosten in je transacties herkend. Zodra er
        afschrijvingen binnenkomen die elke maand terugkomen, staat hier hoeveel er
        maandelijks vastligt.
      </EditorialDeck>
    )
  }

  // Geen maandinkomen ingevuld → status `neutral`, er is geen aandeel. Geen
  // doodlopende melding maar een werkende ingang naar de cashflow-instellingen.
  if (ratioPct == null) {
    return (
      <EditorialDeck>
        Je vaste lasten zijn in beeld, je maandinkomen nog niet — daarom staat er geen
        aandeel bij.{' '}
        <Link
          href="/overzicht/budget/transacties"
          className="not-italic font-medium text-[var(--module-active-700)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          Vul je inkomen in bij je transacties
        </Link>{' '}
        om te zien welk deel van je inkomen vastligt.
      </EditorialDeck>
    )
  }

  return (
    <EditorialDeck>
      Je vaste lasten zijn{' '}
      <span className="not-italic font-semibold tabular-nums text-[var(--ink)]">{ratioPct}%</span>{' '}
      van je inkomen —{' '}
      <span className={`not-italic font-semibold ${leverageStatusTextClass(status)}`}>
        {LEVERAGE_STATUS_LABEL[status]}
      </span>
      . {VASTE_LASTEN_BENCHMARK_COPY.nibudKort}
    </EditorialDeck>
  )
}

export function VasteLastenClient({
  insights,
  subscriptions,
  vasteKosten,
  terugkerendVariabel = [],
  fullName,
}: {
  insights: Insights
  subscriptions: RecurringItem[]
  vasteKosten: RecurringItem[]
  /** Terugkerend maar variabel (H14) — buiten de quote, wél getoond. */
  terugkerendVariabel?: RecurringItem[]
  fullName: string | null
}) {
  const router = useRouter()
  const { mode } = useDisplayMode()
  const isSimple = mode === 'simple'
  const [opzegTarget, setOpzegTarget] = useState<CancellationMetadata | null>(null)

  const refresh = useCallback(async () => {
    router.refresh()
  }, [router])

  const handleCancellationOpen = useCallback((metadata: CancellationMetadata) => {
    setOpzegTarget(metadata)
  }, [])

  const handleOpzegFromBlock = useCallback(
    (item: { name: string; monthlyAmount: number }) => {
      setOpzegTarget({
        type: 'subscription_cancellation',
        subscription_name: item.name,
        monthly_amount: item.monthlyAmount,
        frequency: 'monthly',
        user_name: fullName ?? '',
        user_address: '',
        user_postcode: '',
        user_city: '',
      })
    },
    [fullName],
  )

  // Detail-context voor Fin: totaal, aandeel, grootste posten.
  const finDetail = insights.hasData
    ? `Mijn vaste lasten zijn ${formatCurrency(insights.totalMonthly)} per maand` +
      (insights.ratioPct != null ? ` (${insights.ratioPct}% van mijn inkomen)` : '') +
      `. Abonnementen ${formatCurrency(insights.subscriptionsMonthly)}/mnd, overige vaste kosten ${formatCurrency(insights.vasteKostenMonthly)}/mnd.` +
      (insights.largestItem ? ` Grootste post: ${insights.largestItem.name}.` : '')
    : 'Ik heb nog geen vaste lasten in beeld.'

  // Eén definitie van de volle lijst; alleen zijn OMHULSEL verschilt per modus
  // (zie hieronder). Zo kan de lijst niet uiteenlopen tussen Eenvoudig en
  // Volledig, en blijven de opzeg-/classificeer-flows in beide modi identiek.
  const lijst = (
    <VasteKostenAnalyse
      subscriptions={subscriptions}
      vasteKosten={vasteKosten}
      terugkerendVariabel={terugkerendVariabel}
      totalMonthlySubscriptions={insights.subscriptionsMonthly}
      totalMonthlyVasteKosten={insights.vasteKostenMonthly}
      totalMonthlyVariabel={insights.variabelMonthly}
      totalMonthly={insights.totalMonthly}
      userProfile={fullName ? { full_name: fullName } : null}
      onCancellationOpen={handleCancellationOpen}
      onRefresh={refresh}
      collapsible={false}
    />
  )

  return (
    <div className="space-y-6">
      {/* ── Cijferblok onder de pagina-aanhef: hairline-scheiding, groot
             mono-hoofdcijfer, vrijheidstijd-onderschrift, aandeel-stoplichtmeter
             + Fin. Geen gradient-kaart.

             De KICKER + TITEL horen bij dit blok maar staan sinds perf Task 2.4
             op de server-pagina (`<PageOpening>` in page.tsx): ze hebben geen
             data nodig en zijn de LCP-kandidaat, dus ze gaan mee in de eerste
             byte i.p.v. achter de Suspense-grens. De `space-y-3` hier is
             dezelfde afstand die de `<PageOpening>`-header intern gaf, zodat het
             ritme kop → hairline → cijfer ongewijzigd blijft. ── */}
      <div className="space-y-3">
        {/* Hoofdcijfer-blok — hairline-scheiding, groot mono-cijfer, Fin rechts */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-[var(--border-ed)] pt-4">
          <PageOpeningFigure
            kicker="Totaal per maand"
            amount={
              <MaskedAmount
                value={insights.totalMonthly}
                tone="kern"
                className="text-[32px] font-bold leading-none tracking-[-0.01em] text-[var(--ink)] sm:text-[40px]"
              />
            }
            unit="/mnd"
            sub={
              <>
                <MaskedAmount
                  value={insights.totalYearly}
                  tone="ink"
                  className="text-[var(--ink-2)]"
                />{' '}
                per jaar
                {insights.freedomDaysPerMonth > 0 && (
                  <>
                    {' · '}
                    <span className="not-italic text-[var(--module-active-700)]">
                      ± {insights.freedomDaysPerMonth}{' '}
                      {insights.freedomDaysPerMonth === 1 ? 'dag' : 'dagen'} vrijheid/mnd
                    </span>
                  </>
                )}
              </>
            }
          />
          <BesprekMetWillButton
            onderwerp="Mijn vaste lasten"
            detail={finDetail}
            vraag="Waar kan ik het meeste vrijheid terugwinnen op mijn vaste lasten?"
          />
        </div>

        {/* Eén meter per modus, nooit twee. In Eenvoudig neemt de oordeelregel
            de plaats van de compacte meter in (de volwaardige QuoteMeter mét
            zones en Nibud-context staat er direct onder); in Volledig blijft de
            compacte meter hier staan, precies zoals hij stond. */}
        {isSimple ? (
          <OordeelDeck insights={insights} />
        ) : (
          insights.hasData && <CompactMeter insights={insights} />
        )}
      </div>

      {/* ── Duiding vóór de lijst (alleen Eenvoudig) ──
             Quote-meter (het oordeel mét zones), sluipverbruik (de enige directe
             handeling op deze pagina) en de vijf grootste posten. Zonder inkomen
             zegt de QuoteMeter alleen "vul je inkomen in" — dat staat dan al met
             een werkende link in de deck hierboven, dus laten we 'm daar weg. */}
      {isSimple && insights.hasData && (
        <div className="space-y-4">
          {insights.ratioPct != null && <VasteLastenQuoteBlok insights={insights} />}
          <VasteLastenAbonnementenBlok insights={insights} onOpzeg={handleOpzegFromBlock} />
          <VasteLastenTopPostenBlok insights={insights} />
        </div>
      )}

      {/* ── De volledige lijst ──
             Volledig: ongewijzigd, direct op de pagina. Eenvoudig: achter
             "Alle {n} posten" (DepthSection — daar standaard ingeklapt). Bewust
             GEEN wikkel in Volledig: DepthSection is zelf een bordered card en
             zou de analyse-kaart in een tweede kaart zetten, terwijl "Volledig
             verandert niet" het acceptatiecriterium van deze release is. */}
      {isSimple ? (
        <DepthSection
          title={`Alle ${insights.count} posten`}
          summary={`${insights.subscriptionCount} abonnementen · ${insights.vasteKostenCount} vaste kosten`}
        >
          {lijst}
        </DepthSection>
      ) : (
        lijst
      )}

      {/* ── Uitgebreide inzichten (alleen Volledig) ── */}
      <HideInSimple>
        <VasteLastenInsights insights={insights} onOpzeg={handleOpzegFromBlock} />
      </HideInSimple>

      {/* ── Opzeg-flow ── */}
      <OpzegModal
        open={!!opzegTarget}
        onClose={() => setOpzegTarget(null)}
        subscription={
          opzegTarget
            ? {
                id: '',
                name: opzegTarget.subscription_name,
                averageAmount: opzegTarget.monthly_amount,
                monthlyAmount: opzegTarget.monthly_amount,
                frequency: opzegTarget.frequency as 'monthly' | 'weekly' | 'quarterly' | 'yearly',
                nextDate: null,
                confidence: 'high' as const,
                isVariableAmount: false,
                occurrences: 0,
                alreadyConfirmed: false,
              }
            : null
        }
        initialMetadata={opzegTarget ?? undefined}
        userProfile={{ full_name: fullName }}
        onSavedToActionList={() => setOpzegTarget(null)}
      />
    </div>
  )
}
