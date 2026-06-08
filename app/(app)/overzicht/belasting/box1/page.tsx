import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { Clock, Users, EyeOff } from 'lucide-react'
import { JaarruimteCard } from '@/components/overview/jaarruimte-card'
import { BelastingBoxPageHeader } from '@/components/overview/belasting-box-page-header'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { computeBox1Tax, type Box1Result } from '@/lib/box1-tax'
import { Box1Waterfall } from '@/components/overview/belasting/box1-waterfall'
import { Box1MarginaleCurveCard } from '@/components/overview/belasting/box1-marginale-curve-card'
import { Box1Heffingskortingen } from '@/components/overview/belasting/box1-heffingskortingen'
import { Box1EigenWoning } from '@/components/overview/belasting/box1-eigen-woning'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { loadPerspectiveTransactions } from '@/lib/household/perspective-loader'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { Kicker, SectionLabel, FiguresStrip } from '@/components/editorial'
import { Reveal } from '@/components/landing/reveal'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

export const metadata: Metadata = {
  title: 'Box 1 · Werk + woning — TriFinity',
  description: 'Belasting over werk en woning — plus je onbenutte jaarruimte (pensioenaftrek).',
}

/** Netto-maandinkomen → geschat bruto-jaarinkomen via marginaal tarief. */
function netMonthlyToGrossYearly(netMonthly: number, marg: number): number {
  if (netMonthly <= 0 || marg <= 0 || marg >= 1) return 0
  return (netMonthly * 12) / (1 - marg)
}

/** Geschatte aftrekbare hypotheekrente per jaar uit een mortgage-debt. */
function estimateMortgageRente(
  balance: number | null | undefined,
  ratePct: number | null | undefined,
): number {
  const b = Number(balance) || 0
  const r = Number(ratePct) || 0
  if (b <= 0 || r <= 0) return 0
  return Math.round(b * (r / 100))
}

/**
 * /overzicht/belasting/box1 — Box 1-subpagina (werk + woning).
 *
 * Box 1 belast inkomen uit werk en woning. Deze pagina draait nu op de ECHTE
 * Box 1-rekenmotor (computeBox1Tax) i.p.v. de oude proxy-schatting:
 *  1.1 Box 1-druk via de motor (tax, effectief + marginaal tarief, vrijheidstijd)
 *  1.2 Bruto → netto besteedbaar waterfall
 *  1.3 Marginale-druk-curve over het inkomensbereik
 *  1.4 Heffingskortingen & afbouw
 *  1.5 Jaarruimte gauge + lijfrente-simulator (per persoon)
 *  1.6 Eigen woning: forfait vs aftrek + Wet Hillen (alleen bij eigen woning)
 *
 * Box 1 is per-persoon (jaarruimte heeft een eigen cap per persoon). In de
 * huishoud-view tonen we daarom TWEE JaarruimteCards naast elkaar — die van
 * jou en die van je partner — gevoed uit het privacy-gated partner-inkomen
 * van het fundament. Deelt de partner geen inkomen → graceful melding.
 */
export default async function BelastingBox1Page() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const horizonData = await loadHorizonData(supabase)

  // Box 1-inkomen: netto ≈ bruto × (1 − marginaal) → bruto ≈ netto / (1 − marginaal).
  const netMonthly = horizonData.effectiveInput?.monthlyIncome ?? 0
  const marg = horizonData.fireParams?.marginaalTarief ?? 0.3697
  const grossYearly = netMonthlyToGrossYearly(netMonthly, marg)

  // Vrijheidstijd-equivalent ("Geld is opgeslagen tijd"). Dagelijkse uitgaven
  // uit dezelfde bron als de rest van de app; 0 → geen vertaling.
  const monthlyExpenses = horizonData.effectiveInput?.monthlyExpenses ?? 0
  const dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 0

  // ── Eigen woning + gekoppelde hypotheek (1.6) ──────────────────────────
  // RLS scoopt de queries al naar de ingelogde gebruiker. We pakken de eerste
  // eigen_huis-asset met een WOZ-waarde en de daaraan gekoppelde mortgage.
  const [eigenHuisRes, mortgageRes] = await Promise.all([
    supabase
      .from('assets')
      .select('id, woz_value')
      .eq('is_active', true)
      .eq('asset_type', 'eigen_huis')
      .order('woz_value', { ascending: false, nullsFirst: false })
      .limit(1),
    supabase
      .from('debts')
      .select('linked_asset_id, current_balance, interest_rate')
      .eq('is_active', true)
      .eq('debt_type', 'mortgage'),
  ])

  const eigenHuis = eigenHuisRes.data?.[0] ?? null
  const wozValue = eigenHuis ? Number(eigenHuis.woz_value) || 0 : 0
  // Som de rente over alle aan deze woning gekoppelde hypotheken.
  const hypotheekRente =
    eigenHuis != null
      ? (mortgageRes.data ?? [])
          .filter((d) => d.linked_asset_id === eigenHuis.id)
          .reduce(
            (sum, d) => sum + estimateMortgageRente(d.current_balance, d.interest_rate),
            0,
          )
      : 0
  const hasEigenWoning = wozValue > 0

  // ── Echte Box 1-berekening (1.1) ───────────────────────────────────────
  const box1Result: Box1Result | null =
    grossYearly > 0
      ? computeBox1Tax({
          grossYearlyIncome: grossYearly,
          year: 2026,
          wozValue: hasEigenWoning ? wozValue : undefined,
          hypotheekRente: hasEigenWoning ? hypotheekRente : undefined,
          dailyExpenses,
        })
      : null

  // Huishoud-view: partner-jaarruimte. Partner-inkomen is privacy-gated en
  // komt uit het fundament (income-RPC). null → partner deelt geen inkomen.
  let isHousehold = false
  let partnerName: string | null = null
  let partnerGrossYearly: number | null = null
  if (perspective === 'household' || perspective === 'partner') {
    const tx = await loadPerspectiveTransactions(supabase, 'household')
    isHousehold = tx.context.hasHousehold
    partnerName = tx.context.partnerName
    if (isHousehold) {
      partnerGrossYearly =
        tx.partnerMonthlyIncome != null
          ? netMonthlyToGrossYearly(tx.partnerMonthlyIncome, marg)
          : null
    }
  }
  const showTwoCards = isHousehold && perspective !== 'partner'

  return (
    <>
      <NavStackMeta title="Box 1" bottomBar={{ kind: 'tabs' }} />
      <BelastingBoxPageHeader
        number="1"
        title="Werk + woning"
        subtitle="Inkomen uit loon, ondernemerswinst en je eigen woning. Je onbenutte jaarruimte is hier de belangrijkste besparingskans."
        infoKey="/overzicht/belasting/box1"
      />

      {box1Result != null && (
        <Reveal>
          <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-2">
            <Box1DrukHero result={box1Result} dailyExpenses={dailyExpenses} />
          </section>
        </Reveal>
      )}

      {/* 1.2 + 1.4: waterfall + heffingskortingen naast elkaar op groot scherm */}
      {box1Result != null && (
        <Reveal>
          <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
            <SectionLabel num="I">De rekensom van je inkomen</SectionLabel>
            <div className="grid gap-4 lg:grid-cols-2">
              <Box1Waterfall result={box1Result} dailyExpenses={dailyExpenses} />
              <Box1Heffingskortingen result={box1Result} />
            </div>
          </section>
        </Reveal>
      )}

      {/* 1.3: marginale-druk-curve */}
      <Reveal>
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
          <SectionLabel num="II">Wat je extra euro waard is</SectionLabel>
          <Box1MarginaleCurveCard
            year={2026}
            grossYearlyIncome={grossYearly > 0 ? grossYearly : undefined}
          />
        </section>
      </Reveal>

      {/* 1.6: eigen woning — alleen wanneer er een eigen woning is */}
      {box1Result != null && hasEigenWoning && (
        <Reveal>
          <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
            <SectionLabel num="III">Je eigen woning</SectionLabel>
            <Box1EigenWoning result={box1Result} dailyExpenses={dailyExpenses} />
          </section>
        </Reveal>
      )}

      {/* 1.5: jaarruimte gauge + simulator (per persoon) */}
      {showTwoCards ? (
        <Reveal>
          <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-10">
            <SectionLabel num="IV">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3 w-3" aria-hidden="true" />
                Jaarruimte per persoon
                <PerspectiveContextLabel className="normal-case tracking-normal" />
              </span>
            </SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Kicker className="mb-2">Jij</Kicker>
              <JaarruimteCard
                grossYearlyIncome={grossYearly}
                pensioenAangroei={0}
                marginaalTarief={marg}
                year={2026}
                dailyExpenses={dailyExpenses}
              />
            </div>
            <div>
              <Kicker className="mb-2">{partnerName ?? 'Partner'}</Kicker>
              {partnerGrossYearly != null ? (
                <JaarruimteCard
                  grossYearlyIncome={partnerGrossYearly}
                  pensioenAangroei={0}
                  marginaalTarief={marg}
                  year={2026}
                  dailyExpenses={dailyExpenses}
                />
              ) : (
                <div className="flex items-start gap-2.5 border border-[var(--border-ed)] border-l-[3px] border-l-[var(--ink-3)] bg-[var(--paper)] p-4 sm:p-5 text-sm leading-snug text-[var(--ink-2)]">
                  <EyeOff className="h-4 w-4 shrink-0 mt-0.5 text-[var(--ink-3)]" aria-hidden="true" />
                  <span style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }} className="italic">
                    {partnerName ?? 'Je partner'} deelt geen inkomen, dus we
                    kunnen de jaarruimte niet berekenen. Vraag je partner om het
                    inkomen te delen voor een gezamenlijk Box 1-beeld.
                  </span>
                </div>
              )}
            </div>
            </div>
          </section>
        </Reveal>
      ) : (
        <Reveal>
          <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-10">
            <SectionLabel num="IV">Je jaarruimte benutten</SectionLabel>
            <JaarruimteCard
              grossYearlyIncome={grossYearly}
              pensioenAangroei={0}
              marginaalTarief={marg}
              year={2026}
              dailyExpenses={dailyExpenses}
            />
          </section>
        </Reveal>
      )}
    </>
  )
}

/** Box 1-druk-hero via de echte motor: een Playfair-grootbedrag met
 *  vrijheidstijd-subregel, gevolgd door een FiguresStrip met de vier kerncijfers.
 *  Editorial-treatment van de oude Box1DrukCard — zelfde data, zelfde wiring. */
function Box1DrukHero({
  result,
  dailyExpenses,
}: {
  result: Box1Result
  /** Dagelijkse uitgaven voor de vrijheidstijd-vertaling; 0 → geen regel. */
  dailyExpenses: number
}) {
  const freedom =
    dailyExpenses > 0
      ? formatFreedomTimeString(calculateFreedomTime(result.tax, dailyExpenses))
      : null
  return (
    <div>
      <Kicker>Box 1-druk {result.year} · per jaar</Kicker>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="text-[44px] sm:text-[60px] font-black leading-[0.9] tracking-[-0.03em] tabular-nums text-[var(--ink)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          {formatCurrency(result.tax)}
        </span>
        <span className="text-sm text-[var(--ink-3)] pb-1">belasting op werk + woning</span>
      </div>
      {freedom && (
        <div className="mt-2 flex items-center gap-1.5 text-sm text-[var(--ink-2)]">
          <Clock className="w-4 h-4 shrink-0" style={{ color: 'var(--module-active-700)' }} aria-hidden="true" />
          <span>
            kost je ≈ <span className="font-medium text-[var(--ink)]">{freedom}</span> aan vrijheid
          </span>
        </div>
      )}

      <FiguresStrip
        figures={[
          {
            kicker: 'Geschat bruto',
            amount: formatCurrency(Math.round(result.grossYearlyIncome)),
            sub: 'per jaar',
          },
          {
            kicker: 'Effectief tarief',
            amount: `${(result.effectiveRate * 100).toFixed(1)}%`,
            sub: 'over je inkomen',
          },
          {
            kicker: 'Marginaal tarief',
            amount: `${(result.marginalRate * 100).toFixed(1)}%`,
            sub: 'op je laatste euro',
          },
          {
            kicker: 'Netto besteedbaar',
            amount: formatCurrency(Math.round(result.nettoBesteedbaar)),
            sub: 'wat je overhoudt',
            variant: 'winner',
          },
        ]}
      />

      <p
        className="text-[12px] italic text-[var(--ink-3)] leading-snug max-w-[60ch]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Indicatie, geen advies — berekend met de Box 1-schijven en
        heffingskortingen {result.year} over je geschatte bruto-inkomen.
      </p>
    </div>
  )
}
