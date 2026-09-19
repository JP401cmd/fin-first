'use client'

/**
 * VasteLastenClient — orchestrator voor het Vaste-lasten-scherm
 * (/overzicht/budget/vaste-lasten). Twee lagen die meebewegen met de
 * weergavemodus:
 *
 *   Eenvoudig → hoofdcijfer €/mnd + vrijheidstijd-onderschrift + OORDEELREGEL
 *               (deck, één regel) + de volle lijst (abonnementen + vaste
 *               kosten) DIRECT + quote-meter + abonnementen-sluipverbruik.
 *   Volledig  → compacte aandeel-meter, de volle lijst direct, quote-meter +
 *               sluipverbruik, en daaronder de samenstelling (VasteLastenInsights)
 *               onder <HideInSimple>.
 *
 * ── W-017 · de lijst bovenaan, óók in Eenvoudig (19-09-2026) ───────────────
 * HERZIET het S2-besluit VL-1 ("duiding boven reductie", audit 28-08-2026,
 * docs/eenvoudige-weergave-audit.md). S2 zette in Eenvoudig eerst drie
 * duidingsblokken en daarna een top-5, met de volle lijst achter een
 * <DepthSection>. Eigenaarsbesluit: de posten zelf zijn wat je hier komt
 * bekijken — de lijst staat nu in beide modi direct onder het cijfer, de top-5
 * is daarmee een duplicaat en vervalt, en de ene oordeelregel ervóór bewaart de
 * S2-les zonder de lijst weg te drukken. Beide modi delen zo dezelfde
 * ruggengraat (cijfer → lijst → quote → sluipverbruik); Eenvoudig mist alleen
 * de compacte meter en de samenstelling. Tegelijk verwijderd (in beide modi):
 * "In vrijheidstijd" (dubbelde het onderschrift van het hoofdcijfer), "Wat als
 * ik opzeg" en de cashflow-kalender ("wanneer komt het" blijft via de
 * Agenda-widget).
 *
 * ── S2 · de oordeelregel (release R5) ───────────────────────────────────────
 * Wat van S2 blijft: het oordeel staat vóór de lijst, als één regel.
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

/**
 * GRONDSLAG-REGEL (V-001) — één regel die zegt waaróp de detectie is gebaseerd.
 *
 * De melding die hierachter zit was niet "dit bedrag klopt niet" maar "ik
 * verwacht er méér". Zonder zichtbare grondslag is dat niet te beoordelen: een
 * ontbrekend abonnement kan betekenen dat de rekening waarvan het afgaat niet
 * gekoppeld is, of dat het buiten het analysevenster viel. Deze regel maakt
 * beide controleerbaar in de taal van de gebruiker.
 *
 * Vorm = de bestaande grondslag-microcopy elders in de app (budgets-client:
 * "Gebaseerd op N maanden transactiedata"), dus geen nieuw patroon; tokens
 * `--ink-4` + `text-[10px]`, links uitgelijnd onder het cijferblok.
 */
function GrondslagRegel({ accountCount, months }: { accountCount: number; months: number }) {
  // Zonder gekoppelde rekening zegt "0 rekeningen" niets over de detectie maar
  // alles over de koppeling — dat is de boodschap van de lege staat, niet van
  // deze regel. Dan liever niets tonen dan een nul.
  if (accountCount <= 0) return null
  return (
    <p className="font-sans text-[10px] text-[var(--ink-4)]">
      Gebaseerd op {accountCount} {accountCount === 1 ? 'rekening' : 'rekeningen'} ·{' '}
      {months} maanden transacties
    </p>
  )
}

export function VasteLastenClient({
  insights,
  subscriptions,
  vasteKosten,
  terugkerendVariabel = [],
  fullName,
  detectionBasis,
}: {
  insights: Insights
  subscriptions: RecurringItem[]
  vasteKosten: RecurringItem[]
  /** Terugkerend maar variabel (H14) — buiten de quote, wél getoond. */
  terugkerendVariabel?: RecurringItem[]
  fullName: string | null
  /**
   * Waarop de detectie draaide: aantal zichtbare rekeningen + de breedte van
   * het analysevenster in maanden. Optioneel, zodat bestaande aanroepers
   * (tests, regressiesuites) niet hoeven mee te bewegen; ontbreekt hij, dan
   * blijft de regel weg in plaats van een verzonnen getal te tonen.
   */
  detectionBasis?: { accountCount: number; months: number }
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

  // Eén definitie van de volle lijst, in beide modi identiek en direct op de
  // pagina (W-017). Zo kan de lijst niet uiteenlopen tussen Eenvoudig en
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

        {/* Grondslag — in BEIDE modi, ook zonder detecties: juist wie niets ziet
            staan moet kunnen nagaan waar we naar keken. */}
        {detectionBasis && (
          <GrondslagRegel
            accountCount={detectionBasis.accountCount}
            months={detectionBasis.months}
          />
        )}
      </div>

      {/* ── De volledige lijst — beide modi, direct onder het cijfer (W-017) ──
             Bewust GEEN wikkel: DepthSection is zelf een bordered card en zou de
             analyse-kaart in een tweede kaart zetten. */}
      {lijst}

      {/* ── Duiding ná de lijst (beide modi) ──
             Quote-meter (het oordeel mét zones) en sluipverbruik (de enige
             directe handeling op deze pagina). In Eenvoudig zegt de QuoteMeter
             zonder inkomen alleen "vul je inkomen in" — dat staat daar al met een
             werkende link in de deck bovenaan, dus laten we 'm dan weg; in
             Volledig blijft hij staan zoals hij stond. */}
      {insights.hasData && (
        <div className="space-y-4">
          {(!isSimple || insights.ratioPct != null) && (
            <VasteLastenQuoteBlok insights={insights} />
          )}
          <VasteLastenAbonnementenBlok insights={insights} onOpzeg={handleOpzegFromBlock} />
        </div>
      )}

      {/* ── Verdieping (alleen Volledig): samenstelling per categorie ── */}
      <HideInSimple>
        <VasteLastenInsights insights={insights} />
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
