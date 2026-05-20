import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import {
  computeJaarruimte,
  JAARRUIMTE_FACTOR_A,
  JAARRUIMTE_FRANCHISE_2025,
  JAARRUIMTE_MAX_2025,
} from '@/lib/jaarruimte'

/**
 * JaarruimteCard — toont onbenutte pensioen-aftrekruimte (Box 1) plus
 * uitleg over hoe de gebruiker hem kan benutten.
 *
 * Plan-context: backlog "Belasting totaaloverzicht + jaarruimte-tracker".
 * Tweede stap na BelastingOverzichtStrip — niet-statisch maar action-
 * oriented: jaarruimte = belasting-besparings-mogelijkheid.
 *
 * Berekening via `lib/jaarruimte.ts`:
 *   onbenut = min(MAX, FACTOR_A × max(0, gross − FRANCHISE)) − aangroei
 *
 * Defaults 2025:
 *   FACTOR_A = 13.3% · FRANCHISE = €17.545 · MAX = €34.310
 *
 * Display:
 *  - hasData=false → CTA "Vul inkomen aan voor schatting"
 *  - jaarruimte=0 → "Geen onbenutte ruimte" met uitleg-link
 *  - jaarruimte>0 → bedrag + tip "Stort in lijfrente om Box 1-belasting
 *    te besparen"
 */
export function JaarruimteCard({
  grossYearlyIncome,
  pensioenAangroei = 0,
  marginaalTarief,
}: {
  /** Bruto-jaarinkomen voor Box 1 (loon + winst + eigen-woning-forfait). */
  grossYearlyIncome: number
  /** Pensioen-aangroei van werkgever (factor A × pensioengevend inkomen).
   *  Default 0 wanneer geen pensioenregeling. */
  pensioenAangroei?: number
  /** Marginaal Box 1-tarief (0.3697 of 0.495). Voor besparings-schatting. */
  marginaalTarief?: number
}) {
  const result = computeJaarruimte(grossYearlyIncome, pensioenAangroei)
  const besparing =
    marginaalTarief && marginaalTarief > 0
      ? Math.round(result.jaarruimte * marginaalTarief)
      : null

  if (!result.hasData) {
    return (
      <article className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-4 sm:p-5">
        <header className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-50 text-violet-700">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Jaarruimte 2025
          </div>
        </header>
        <p className="text-sm text-[var(--ink-3)] italic leading-relaxed">
          Vul je bruto-jaarinkomen aan in je profiel om je pensioen-
          aftrekruimte te berekenen.
        </p>
      </article>
    )
  }

  return (
    <article className="rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50/40 to-stone-50 p-4 sm:p-5">
      <header className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 text-violet-700">
          <Sparkles className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
          Jaarruimte 2025 · pensioen-aftrekruimte
        </div>
      </header>

      {result.jaarruimte > 0 ? (
        <>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-serif text-xl sm:text-2xl font-semibold text-[var(--ink)] tabular-nums">
              {formatCurrency(result.jaarruimte)}
            </span>
            <span className="text-xs text-[var(--ink-3)]">onbenut</span>
          </div>
          <p className="text-xs text-[var(--ink-2)] leading-relaxed mb-3">
            Door dit bedrag te storten in een lijfrente of bankspaar-
            product mag je het in 2025 aftrekken van je Box 1-inkomen.
            {besparing != null && besparing > 0 && (
              <>
                {' '}
                Bij je marginale tarief levert dat ongeveer{' '}
                <strong className="text-emerald-700">
                  {formatCurrency(besparing)} belasting-besparing
                </strong>{' '}
                op.
              </>
            )}
          </p>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-serif text-xl font-semibold text-[var(--ink-3)] tabular-nums">
              € 0
            </span>
            <span className="text-xs text-[var(--ink-3)]">onbenut</span>
          </div>
          <p className="text-xs text-[var(--ink-2)] leading-relaxed mb-3">
            Je werkgever vult je pensioenaangroei volledig — er is geen
            extra ruimte voor lijfrente-aftrek dit jaar.
          </p>
        </>
      )}

      <Link
        href="/core/belasting"
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline"
      >
        Volledige Box 1-berekening
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>

      <p className="mt-3 text-[10px] italic text-[var(--ink-4)] leading-snug">
        Berekening 2025: {(JAARRUIMTE_FACTOR_A * 100).toFixed(1)}% × (inkomen − {formatCurrency(JAARRUIMTE_FRANCHISE_2025)})
        − pensioenaangroei werkgever. Max {formatCurrency(JAARRUIMTE_MAX_2025)} per persoon.
      </p>
    </article>
  )
}
