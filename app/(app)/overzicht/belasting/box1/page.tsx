import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { Clock } from 'lucide-react'
import { JaarruimteCard } from '@/components/overview/jaarruimte-card'
import { BelastingBoxPageHeader } from '@/components/overview/belasting-box-page-header'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'

export const metadata: Metadata = {
  title: 'Box 1 · Werk + woning — TriFinity',
  description: 'Belasting over werk en woning — plus je onbenutte jaarruimte (pensioenaftrek).',
}

/**
 * /overzicht/belasting/box1 — Box 1-subpagina (werk + woning).
 *
 * Box 1 belast inkomen uit werk en woning. TriFinity doet hier geen
 * volledige aangifte-berekening, maar twee dingen die wél direct nut
 * hebben:
 *  1. Een snelle indicatie van de Box 1-druk (bruto-inkomen × marginaal).
 *  2. De jaarruimte-actie: onbenutte pensioen-aftrekruimte waarmee je Box
 *     1-belasting kunt verlagen via een lijfrente-inleg. Dit is de
 *     "inspiratie"/actie die voorheen op de belasting-landing stond.
 */
export default async function BelastingBox1Page() {
  const supabase = await createClient()
  const horizonData = await loadHorizonData(supabase)

  // Box 1-schatting (zelfde benadering als de landing-KPI): netto ≈ bruto ×
  // (1 − marginaal) → bruto ≈ netto / (1 − marginaal); druk ≈ bruto × marginaal.
  let box1Tax: number | null = null
  let grossYearly = 0
  const netMonthly = horizonData.effectiveInput?.monthlyIncome ?? 0
  const marg = horizonData.fireParams?.marginaalTarief ?? 0.3697
  if (netMonthly > 0 && marg > 0 && marg < 1) {
    grossYearly = (netMonthly * 12) / (1 - marg)
    box1Tax = Math.round(grossYearly * marg)
  }

  // Vrijheidstijd-equivalent ("Geld is opgeslagen tijd"): hoeveel dagen
  // vrijheid kost deze heffing? Dagelijkse uitgaven uit dezelfde bron als
  // de rest van de app; 0 → geen vertaling (we tonen de regel dan niet).
  const monthlyExpenses = horizonData.effectiveInput?.monthlyExpenses ?? 0
  const dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 0

  return (
    <>
      <NavStackMeta title="Box 1" bottomBar={{ kind: 'tabs' }} />
      <BelastingBoxPageHeader
        number="1"
        title="Werk + woning"
        subtitle="Inkomen uit loon, ondernemerswinst en je eigen woning. Je onbenutte jaarruimte is hier de belangrijkste besparingskans."
        infoKey="/overzicht/belasting/box1"
      />

      {box1Tax != null && (
        <section className="mx-auto max-w-6xl px-4 sm:px-6">
          <Box1EstimateCard
            box1Tax={box1Tax}
            grossYearly={grossYearly}
            marg={marg}
            dailyExpenses={dailyExpenses}
          />
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-4 pb-8">
        <JaarruimteCard
          grossYearlyIncome={grossYearly}
          pensioenAangroei={0}
          marginaalTarief={marg}
        />
      </section>
    </>
  )
}

/** Compacte indicatie-kaart voor de geschatte Box 1-druk. */
function Box1EstimateCard({
  box1Tax,
  grossYearly,
  marg,
  dailyExpenses,
}: {
  box1Tax: number
  grossYearly: number
  marg: number
  /** Dagelijkse uitgaven voor de vrijheidstijd-vertaling; 0 → geen regel. */
  dailyExpenses: number
}) {
  const freedom =
    dailyExpenses > 0
      ? formatFreedomTimeString(calculateFreedomTime(box1Tax, dailyExpenses))
      : null
  return (
    <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Geschatte Box 1-druk
      </div>
      <div className="mt-1 font-serif text-2xl font-semibold text-[var(--ink)] tabular-nums">
        {formatCurrency(box1Tax)}/jr
      </div>
      {freedom && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--ink-2)]">
          <Clock className="w-3.5 h-3.5 text-violet-600" aria-hidden="true" />
          kost je ≈ {freedom} aan vrijheid
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-[var(--ink-3)] text-xs">Geschat bruto-inkomen</div>
          <div className="font-mono tabular-nums text-[var(--ink-2)]">
            {formatCurrency(Math.round(grossYearly))}/jr
          </div>
        </div>
        <div>
          <div className="text-[var(--ink-3)] text-xs">Marginaal tarief</div>
          <div className="font-mono tabular-nums text-[var(--ink-2)]">
            {(marg * 100).toFixed(1)}%
          </div>
        </div>
      </div>
      <p className="mt-3 text-[10px] italic text-[var(--ink-4)] leading-snug">
        Geschat o.b.v. inkomen × marginaal tarief — een orde-grootte-indicatie,
        geen aangifte-berekening.
      </p>
    </div>
  )
}
